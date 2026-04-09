"""
main.py — FastAPI server for the Picnic recommendation demo.

Exposes all endpoints the frontend (picnic-frontend) expects:
  /auth/*         — customer auth
  /household/*    — household management (in-memory for demo)
  /products/*     — product search & browse
  /cart/*         — cart CRUD (in-memory for demo)
  /recommendations/*  — AI recommendation pipeline
  /ws/{hh_id}     — WebSocket for real-time cart updates
"""

import uuid
import sys
import os
import json
from decimal import Decimal
from datetime import datetime
from contextlib import asynccontextmanager
from dotenv import load_dotenv

load_dotenv()

OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "output")


def load_output_file(customer_id: str) -> dict | None:
    """Return pre-generated basket from output/{customer_id}.json, or None."""
    path = os.path.join(OUTPUT_DIR, f"{customer_id}.json")
    if os.path.exists(path):
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    return None

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.encoders import jsonable_encoder
from pydantic import BaseModel

sys.path.insert(0, os.path.dirname(__file__))

from db.connection import init_pool, fetchone, fetchall, execute
from engine.orchestrator import run_pipeline, get_latest_basket


# ── In-memory state (household + cart live only while server is running) ─────

households: dict = {}       # hh_id  -> { id, name, share_code, members[] }
carts: dict = {}            # hh_id  -> { cart_id, status, items[] }
customer_to_hh: dict = {}   # customer_id -> hh_id
ws_connections: dict = {}   # hh_id  -> [WebSocket, ...]

MEMBER_COLORS = ["#E1002A", "#2563EB", "#16A34A", "#D97706", "#7C3AED"]


# ── Serialisation helper ──────────────────────────────────────────────────────

def clean(obj):
    """Recursively convert non-JSON-serialisable types (Decimal, datetime)."""
    if isinstance(obj, dict):
        return {k: clean(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [clean(i) for i in obj]
    if isinstance(obj, Decimal):
        return float(obj)
    if isinstance(obj, datetime):
        return obj.isoformat()
    return obj


# ── App setup ─────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    init_pool()
    yield


app = FastAPI(title="Picnic API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Auth ──────────────────────────────────────────────────────────────────────

@app.get("/auth/customers")
def list_customers():
    rows = fetchall(
        "SELECT id, name, dietary_preference, preferred_categories "
        "FROM customer ORDER BY name"
    )
    return clean(rows)


class LoginRequest(BaseModel):
    customer_id: str
    name: str | None = None


@app.post("/auth/login")
def login(body: LoginRequest):
    customer = fetchone(
        "SELECT id, name, dietary_preference, preferred_categories "
        "FROM customer WHERE id = %s",
        (body.customer_id,),
    )
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")

    hh_id = customer_to_hh.get(body.customer_id)
    household_resp = None
    if hh_id and hh_id in households:
        hh = households[hh_id]
        member = next(
            (m for m in hh["members"] if m["customer_id"] == body.customer_id), None
        )
        household_resp = {
            "household_id": hh_id,
            "role": member["role"] if member else "member",
            "color": member["color"] if member else MEMBER_COLORS[0],
            "share_code": hh["share_code"],
            "household_name": hh["name"],
        }

    return clean({"customer": dict(customer), "household": household_resp})


# ── Household ─────────────────────────────────────────────────────────────────

@app.post("/household/create")
def create_household(customer_id: str, name: str):
    # Return existing household if the customer already has one
    if customer_id in customer_to_hh:
        hh_id = customer_to_hh[customer_id]
        hh = households[hh_id]
        return {"household_id": hh_id, "share_code": hh["share_code"], "cart_id": hh_id}

    customer = fetchone(
        "SELECT id, name FROM customer WHERE id = %s", (customer_id,)
    )
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")

    hh_id = str(uuid.uuid4())
    share_code = hh_id[:6].upper()
    member = {
        "customer_id": customer_id,
        "role": "owner",
        "color": MEMBER_COLORS[0],
        "name": customer["name"],
    }
    households[hh_id] = {
        "id": hh_id,
        "name": name,
        "share_code": share_code,
        "members": [member],
    }
    carts[hh_id] = {"cart_id": hh_id, "status": "open", "items": []}
    customer_to_hh[customer_id] = hh_id

    return {"household_id": hh_id, "share_code": share_code, "cart_id": hh_id}


class JoinHouseholdRequest(BaseModel):
    customer_id: str
    share_code: str


@app.post("/household/join")
def join_household(body: JoinHouseholdRequest):
    hh = next(
        (h for h in households.values() if h["share_code"] == body.share_code), None
    )
    if not hh:
        raise HTTPException(status_code=404, detail="Household not found")

    customer = fetchone(
        "SELECT id, name FROM customer WHERE id = %s", (body.customer_id,)
    )
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")

    hh_id = hh["id"]
    existing_ids = [m["customer_id"] for m in hh["members"]]
    if body.customer_id not in existing_ids:
        color = MEMBER_COLORS[len(hh["members"]) % len(MEMBER_COLORS)]
        hh["members"].append(
            {
                "customer_id": body.customer_id,
                "role": "member",
                "color": color,
                "name": customer["name"],
            }
        )
        customer_to_hh[body.customer_id] = hh_id

    return {"household_id": hh_id, "share_code": hh["share_code"]}


@app.get("/household/{household_id}")
def get_household(household_id: str):
    hh = households.get(household_id)
    if not hh:
        raise HTTPException(status_code=404, detail="Household not found")
    return hh


# ── Products ──────────────────────────────────────────────────────────────────

@app.get("/products/search")
def search_products(q: str, limit: int = 10):
    rows = fetchall(
        """
        SELECT sku, name, category, price, nutriscore, is_biological
        FROM article
        WHERE is_available = TRUE AND name ILIKE %s
        ORDER BY popularity_score DESC
        LIMIT %s
        """,
        (f"%{q}%", limit),
    )
    return clean(rows)


@app.get("/products/categories")
def get_categories():
    rows = fetchall(
        "SELECT DISTINCT category FROM article WHERE is_available = TRUE ORDER BY category"
    )
    return [r["category"] for r in rows]


@app.get("/products/by-category")
def get_by_category(category: str, limit: int = 30):
    rows = fetchall(
        """
        SELECT sku, name, category, price, nutriscore, is_biological
        FROM article
        WHERE is_available = TRUE AND category = %s
        ORDER BY popularity_score DESC
        LIMIT %s
        """,
        (category, limit),
    )
    return clean(rows)


@app.get("/products/smart-search")
def smart_search(q: str, customer_id: str):
    history_match = fetchone(
        """
        SELECT a.sku, a.name, a.category, a.price,
               COUNT(ol.order_id)::int AS total_orders,
               AVG(ol.quantity)::float AS quantity
        FROM orderline ol
        JOIN article a ON ol.sku = a.sku
        JOIN "Order" o ON ol.order_id = o.id
        WHERE o.customer_id = %s AND a.name ILIKE %s AND a.is_available = TRUE
        GROUP BY a.sku, a.name, a.category, a.price
        ORDER BY total_orders DESC
        LIMIT 1
        """,
        (customer_id, f"%{q}%"),
    )
    alternatives = fetchall(
        """
        SELECT sku, name, category, price, 1 AS quantity
        FROM article
        WHERE is_available = TRUE AND name ILIKE %s
        ORDER BY popularity_score DESC
        LIMIT 5
        """,
        (f"%{q}%",),
    )
    if history_match:
        return clean(
            {
                "type": "history_match",
                "match": {**dict(history_match), "reason": "You've ordered this before"},
                "alternatives": [
                    a for a in alternatives if a["sku"] != history_match["sku"]
                ][:4],
            }
        )
    return clean({"type": "search_results", "match": None, "alternatives": alternatives})


# ── Cart ──────────────────────────────────────────────────────────────────────

@app.get("/cart/{household_id}")
def get_cart(household_id: str):
    return carts.get(
        household_id, {"cart_id": household_id, "status": "open", "items": []}
    )


class AddCartItemRequest(BaseModel):
    sku: str
    quantity: int
    added_by: str


@app.post("/cart/{household_id}/items")
def add_cart_item(household_id: str, body: AddCartItemRequest):
    if household_id not in carts:
        carts[household_id] = {"cart_id": household_id, "status": "open", "items": []}

    article = fetchone(
        "SELECT sku, name, category, price FROM article WHERE sku = %s",
        (body.sku,),
    )
    if not article:
        raise HTTPException(status_code=404, detail="Product not found")

    hh = households.get(household_id)
    member = None
    if hh:
        member = next(
            (m for m in hh["members"] if m["customer_id"] == body.added_by), None
        )

    cart = carts[household_id]
    existing = next((i for i in cart["items"] if i["sku"] == body.sku), None)
    if existing:
        existing["quantity"] += body.quantity
        return existing

    item = {
        "id": str(uuid.uuid4()),
        "sku": body.sku,
        "quantity": body.quantity,
        "added_by": body.added_by,
        "added_at": datetime.utcnow().isoformat(),
        "name": article["name"],
        "category": article["category"],
        "price": float(article["price"]),
        "added_by_name": member["name"] if member else "You",
        "added_by_color": member["color"] if member else "#E1002A",
    }
    cart["items"].append(item)
    return item


class UpdateCartItemRequest(BaseModel):
    quantity: int


@app.patch("/cart/{household_id}/items/{sku}")
def update_cart_item(household_id: str, sku: str, body: UpdateCartItemRequest):
    cart = carts.get(household_id)
    if not cart:
        raise HTTPException(status_code=404, detail="Cart not found")
    item = next((i for i in cart["items"] if i["sku"] == sku), None)
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    item["quantity"] = body.quantity
    return item


@app.delete("/cart/{household_id}/items/{sku}")
def remove_cart_item(household_id: str, sku: str):
    cart = carts.get(household_id)
    if not cart:
        raise HTTPException(status_code=404, detail="Cart not found")
    cart["items"] = [i for i in cart["items"] if i["sku"] != sku]
    return {"ok": True}


@app.delete("/cart/{household_id}")
def clear_cart(household_id: str):
    if household_id in carts:
        carts[household_id]["items"] = []
    return {"ok": True}


# ── Recommendations ───────────────────────────────────────────────────────────

class GenerateRequest(BaseModel):
    customer_id: str
    fc_id: str = "FC1"
    use_llm: bool = True


@app.post("/recommendations/generate")
def generate_recommendations(body: GenerateRequest):
    # Pre-generated file takes priority — no DB or LLM call needed
    if load_output_file(body.customer_id):
        return {"basket_id": body.customer_id, "cached": True}

    # Return existing valid DB basket if one exists
    existing = get_latest_basket(body.customer_id)
    if existing:
        return {"basket_id": existing["basket_id"], "cached": True}

    basket_id = run_pipeline(
        body.customer_id,
        use_llm=body.use_llm,
        fc_id=body.fc_id,
    )
    if not basket_id:
        raise HTTPException(
            status_code=404,
            detail="No recommendations available — customer may have no order history",
        )
    return {"basket_id": basket_id, "cached": False}


@app.get("/recommendations/latest/{customer_id}")
def get_recommendations(customer_id: str):
    # Serve pre-generated file first (works without DB / LLM)
    file_data = load_output_file(customer_id)
    if file_data:
        return file_data

    basket = get_latest_basket(customer_id)
    if not basket:
        raise HTTPException(status_code=404, detail="No pending basket found")
    return clean(basket)


# ── WebSocket ─────────────────────────────────────────────────────────────────

@app.websocket("/ws/{household_id}")
async def websocket_endpoint(websocket: WebSocket, household_id: str):
    await websocket.accept()
    ws_connections.setdefault(household_id, []).append(websocket)
    try:
        cart = carts.get(
            household_id, {"cart_id": household_id, "status": "open", "items": []}
        )
        await websocket.send_json({"type": "cart_state", "items": cart["items"]})
        while True:
            await websocket.receive_text()  # keep-alive
    except WebSocketDisconnect:
        conns = ws_connections.get(household_id, [])
        if websocket in conns:
            conns.remove(websocket)
