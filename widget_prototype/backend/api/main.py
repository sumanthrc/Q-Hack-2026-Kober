
"""
api/main.py

FastAPI server for the Picnic Shared Cart MVP.
Provides: auth, household management, shared cart CRUD, product search,
and WebSocket real-time sync between household members.

Run:  .venv/bin/uvicorn api.main:app --reload --port 8000
"""

import os
import uuid as _uuid
import json
import asyncio
from datetime import datetime
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

load_dotenv()

# ── Lazy-import DB helpers (they call load_dotenv themselves) ──
from db.connection import init_pool, execute, fetchone, fetchall


# ═══════════════════════════════════════════════════════════════
# Lifespan: create tables + connection pool on startup
# ═══════════════════════════════════════════════════════════════

MIGRATION_SQL = """
CREATE TABLE IF NOT EXISTS household (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL DEFAULT 'My Household',
    share_code TEXT UNIQUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS household_member (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id UUID REFERENCES household(id) ON DELETE CASCADE,
    customer_id TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'member',
    color TEXT NOT NULL DEFAULT '#2563EB',
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(household_id, customer_id)
);

CREATE TABLE IF NOT EXISTS shared_cart (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id UUID REFERENCES household(id) ON DELETE CASCADE UNIQUE,
    status TEXT NOT NULL DEFAULT 'accumulating',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS shared_cart_item (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cart_id UUID REFERENCES shared_cart(id) ON DELETE CASCADE,
    sku TEXT NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    added_by TEXT NOT NULL,
    added_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(cart_id, sku)
);
"""


_main_loop: asyncio.AbstractEventLoop | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _main_loop
    _main_loop = asyncio.get_running_loop()
    init_pool()
    # Run migration as a single batch
    execute(MIGRATION_SQL)
    print("[api] Migration complete")
    yield


app = FastAPI(title="Picnic Shared Cart API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ═══════════════════════════════════════════════════════════════
# Pydantic models
# ═══════════════════════════════════════════════════════════════

class LoginRequest(BaseModel):
    customer_id: str


class JoinHouseholdRequest(BaseModel):
    customer_id: str
    share_code: str


class LeaveHouseholdRequest(BaseModel):
    customer_id: str


class AddItemRequest(BaseModel):
    sku: str
    quantity: int = 1
    added_by: str  # customer_id


class UpdateItemRequest(BaseModel):
    quantity: int
    updated_by: str | None = None


class RemoveItemRequest(BaseModel):
    pass


# ═══════════════════════════════════════════════════════════════
# Auth
# ═══════════════════════════════════════════════════════════════

@app.post("/auth/login")
def login(req: LoginRequest):
    """Login by customer_id. Returns customer profile."""
    customer = fetchone(
        "SELECT id, name, dietary_preference, preferred_categories FROM customer WHERE id = %s",
        (req.customer_id,),
    )
    if not customer:
        raise HTTPException(404, "Customer not found")

    # Check if customer is in a household (most recently joined)
    membership = fetchone(
        """SELECT hm.household_id, hm.role, hm.color, h.share_code, h.name as household_name
           FROM household_member hm
           JOIN household h ON h.id = hm.household_id
           WHERE hm.customer_id = %s
           ORDER BY hm.joined_at DESC
           LIMIT 1""",
        (req.customer_id,),
    )

    return {
        "customer": customer,
        "household": membership,
    }


@app.get("/auth/customers")
def list_customers():
    """List available customer accounts for demo login picker."""
    rows = fetchall(
        "SELECT id, name, dietary_preference FROM customer ORDER BY name LIMIT 20"
    )
    return rows


# ═══════════════════════════════════════════════════════════════
# Household
# ═══════════════════════════════════════════════════════════════

def _generate_share_code() -> str:
    return "PICNIC-" + _uuid.uuid4().hex[:6].upper()


@app.post("/household/create")
def create_household(customer_id: str, name: str = "My Household"):
    """Create a household and add the creator as admin."""
    share_code = _generate_share_code()
    household_id = str(_uuid.uuid4())

    execute(
        "INSERT INTO household (id, name, share_code) VALUES (%s, %s, %s)",
        (household_id, name, share_code),
    )

    # Pick a color for the admin
    colors = ["#E1002A", "#2563EB", "#16A34A", "#9333EA", "#EA580C"]
    execute(
        "INSERT INTO household_member (household_id, customer_id, role, color) VALUES (%s, %s, 'admin', %s)",
        (household_id, customer_id, colors[0]),
    )

    # Create shared cart
    cart_id = str(_uuid.uuid4())
    execute(
        "INSERT INTO shared_cart (id, household_id) VALUES (%s, %s)",
        (cart_id, household_id),
    )

    return {
        "household_id": household_id,
        "share_code": share_code,
        "cart_id": cart_id,
    }


@app.post("/household/join")
def join_household(req: JoinHouseholdRequest):
    """Join a household using a share code."""
    household = fetchone(
        "SELECT id, name, share_code FROM household WHERE share_code = %s",
        (req.share_code,),
    )
    if not household:
        raise HTTPException(404, "Invalid share code")

    # Check not already a member
    existing = fetchone(
        "SELECT id FROM household_member WHERE household_id = %s AND customer_id = %s",
        (household["id"], req.customer_id),
    )
    if existing:
        return {"household_id": household["id"], "share_code": household["share_code"], "already_member": True}

    # Remove from any previous households (one household per user)
    old_households = fetchall(
        "SELECT household_id FROM household_member WHERE customer_id = %s",
        (req.customer_id,),
    )
    for old in old_households:
        execute(
            "DELETE FROM household_member WHERE household_id = %s AND customer_id = %s",
            (old["household_id"], req.customer_id),
        )
        # Clean up empty households
        remaining = fetchone(
            "SELECT COUNT(*) as cnt FROM household_member WHERE household_id = %s",
            (old["household_id"],),
        )
        if remaining and remaining["cnt"] == 0:
            execute("DELETE FROM shared_cart WHERE household_id = %s", (old["household_id"],))
            execute("DELETE FROM household WHERE id = %s", (old["household_id"],))

    # Pick a color not already used in this household
    colors = ["#E1002A", "#2563EB", "#16A34A", "#9333EA", "#EA580C"]
    used = fetchall(
        "SELECT color FROM household_member WHERE household_id = %s",
        (household["id"],),
    )
    used_colors = {r["color"] for r in used}
    color = next((c for c in colors if c not in used_colors), colors[-1])

    execute(
        "INSERT INTO household_member (household_id, customer_id, role, color) VALUES (%s, %s, 'member', %s)",
        (household["id"], req.customer_id, color),
    )

    # Broadcast to WebSocket
    _broadcast_to_household(
        household["id"],
        {"type": "member_joined", "customer_id": req.customer_id},
    )

    return {"household_id": household["id"], "share_code": household["share_code"]}


@app.post("/household/leave")
def leave_household(req: LeaveHouseholdRequest):
    """Remove a user from their current household."""
    membership = fetchone(
        """SELECT hm.id, hm.household_id
           FROM household_member hm
           WHERE hm.customer_id = %s
           ORDER BY hm.joined_at DESC LIMIT 1""",
        (req.customer_id,),
    )
    if not membership:
        raise HTTPException(404, "Not in a household")

    household_id = membership["household_id"]

    # Remove from household
    execute(
        "DELETE FROM household_member WHERE household_id = %s AND customer_id = %s",
        (household_id, req.customer_id),
    )

    # Broadcast to remaining members
    _broadcast_to_household(
        household_id,
        {"type": "member_left", "customer_id": req.customer_id},
    )

    # Clean up if household is now empty
    remaining = fetchone(
        "SELECT COUNT(*) as cnt FROM household_member WHERE household_id = %s",
        (household_id,),
    )
    if remaining and remaining["cnt"] == 0:
        execute("DELETE FROM shared_cart_item WHERE cart_id IN (SELECT id FROM shared_cart WHERE household_id = %s)", (household_id,))
        execute("DELETE FROM shared_cart WHERE household_id = %s", (household_id,))
        execute("DELETE FROM household WHERE id = %s", (household_id,))

    return {"left": True}


@app.get("/household/{household_id}")
def get_household(household_id: str):
    """Get household info with members."""
    household = fetchone(
        "SELECT id, name, share_code FROM household WHERE id = %s",
        (household_id,),
    )
    if not household:
        raise HTTPException(404, "Household not found")

    members = fetchall(
        """SELECT hm.customer_id, hm.role, hm.color, c.name
           FROM household_member hm
           JOIN customer c ON c.id = hm.customer_id::uuid
           WHERE hm.household_id = %s
           ORDER BY hm.joined_at""",
        (household_id,),
    )

    return {**household, "members": members}


# ═══════════════════════════════════════════════════════════════
# Products
# ═══════════════════════════════════════════════════════════════

@app.get("/products/search")
def search_products(q: str = Query(..., min_length=1), limit: int = 20):
    """Search articles by name or category."""
    rows = fetchall(
        """SELECT sku, name, category, price, nutriscore, is_biological, is_available
           FROM article
           WHERE (LOWER(name) LIKE LOWER(%s) OR LOWER(category) LIKE LOWER(%s))
             AND is_available = TRUE
           ORDER BY popularity_score DESC NULLS LAST
           LIMIT %s""",
        (f"%{q}%", f"%{q}%", limit),
    )
    return rows


@app.get("/products/categories")
def list_categories():
    """List distinct product categories."""
    rows = fetchall(
        "SELECT DISTINCT category FROM article WHERE is_available = TRUE ORDER BY category"
    )
    return [r["category"] for r in rows]


@app.get("/products/by-category")
def products_by_category(category: str, limit: int = 30):
    """Get products in a category."""
    rows = fetchall(
        """SELECT sku, name, category, price, nutriscore, is_biological
           FROM article
           WHERE category = %s AND is_available = TRUE
           ORDER BY popularity_score DESC NULLS LAST
           LIMIT %s""",
        (category, limit),
    )
    return rows


@app.get("/products/smart-search")
def smart_search(q: str = Query(..., min_length=1), customer_id: str = Query(...)):
    """
    Smart search: checks the customer's purchase history first.
    If they've bought a matching item before, returns it as a
    'history_match' with their usual quantity. Otherwise falls
    back to regular search.
    """
    # Step 1: Search in customer's purchase history (frequency table)
    history_matches = fetchall(
        """
        SELECT cif.sku, cif.total_orders, cif.avg_quantity_per_order,
               a.name, a.category, a.price, a.is_available
        FROM customeritemfrequency cif
        JOIN article a ON a.sku = cif.sku
        WHERE cif.customer_id = %s
          AND a.is_available = TRUE
          AND (LOWER(a.name) LIKE LOWER(%s) OR LOWER(a.category) LIKE LOWER(%s))
        ORDER BY cif.total_orders DESC, cif.avg_quantity_per_order DESC
        LIMIT 3
        """,
        (customer_id, f"%{q}%", f"%{q}%"),
    )

    if history_matches:
        top = history_matches[0]
        avg_qty = top["avg_quantity_per_order"]
        qty = max(1, round(float(avg_qty)))
        return {
            "type": "history_match",
            "match": {
                "sku": top["sku"],
                "name": top["name"],
                "category": top["category"],
                "price": top["price"],
                "quantity": qty,
                "total_orders": top["total_orders"],
                "reason": f"Your usual — ordered {top['total_orders']} times",
            },
            "alternatives": [
                {
                    "sku": m["sku"],
                    "name": m["name"],
                    "category": m["category"],
                    "price": m["price"],
                    "quantity": max(1, round(float(m["avg_quantity_per_order"]))),
                }
                for m in history_matches[1:]
            ],
        }

    # Step 2: No history — fall back to regular search
    results = fetchall(
        """
        SELECT sku, name, category, price
        FROM article
        WHERE (LOWER(name) LIKE LOWER(%s) OR LOWER(category) LIKE LOWER(%s))
          AND is_available = TRUE
        ORDER BY popularity_score DESC NULLS LAST
        LIMIT 8
        """,
        (f"%{q}%", f"%{q}%"),
    )
    return {
        "type": "search_results",
        "match": None,
        "alternatives": [
            {"sku": r["sku"], "name": r["name"], "category": r["category"], "price": r["price"], "quantity": 1}
            for r in results
        ],
    }


# ═══════════════════════════════════════════════════════════════
# Shared Cart
# ═══════════════════════════════════════════════════════════════

@app.get("/cart/{household_id}")
def get_cart(household_id: str):
    """Get the shared cart with all items."""
    cart = fetchone(
        "SELECT id, status FROM shared_cart WHERE household_id = %s",
        (household_id,),
    )
    if not cart:
        raise HTTPException(404, "Cart not found")

    items = fetchall(
        """SELECT sci.id, sci.sku, sci.quantity, sci.added_by, sci.added_at,
                  a.name, a.category, a.price,
                  c.name as added_by_name,
                  hm.color as added_by_color,
                  COALESCE(s.quantity, 0) as stock_qty,
                  CASE
                    WHEN s.quantity IS NULL OR s.quantity = 0 THEN 'out_of_stock'
                    WHEN s.quantity <= 5 THEN 'low_stock'
                    ELSE 'in_stock'
                  END as stock_status
           FROM shared_cart_item sci
           JOIN article a ON a.sku = sci.sku
           JOIN customer c ON c.id = sci.added_by::uuid
           LEFT JOIN household_member hm ON hm.customer_id = sci.added_by
               AND hm.household_id = %s::uuid
           LEFT JOIN stock s ON s.sku = sci.sku AND s.fc_id = 'FC1'
           WHERE sci.cart_id = %s
           ORDER BY sci.added_at DESC""",
        (household_id, cart["id"]),
    )

    return {"cart_id": cart["id"], "status": cart["status"], "items": items}


@app.get("/products/{sku}/substitutes")
def get_substitutes(sku: str, limit: int = 3):
    """Find in-stock substitutes for an unavailable item in the same category."""
    article = fetchone("SELECT category, price FROM article WHERE sku = %s", (sku,))
    if not article:
        return []
    subs = fetchall(
        """SELECT a.sku, a.name, a.category, a.price
           FROM article a
           JOIN stock s ON s.sku = a.sku AND s.fc_id = 'FC1'
           WHERE a.category = %s
             AND a.sku != %s
             AND s.quantity > 5
             AND s.is_marked_imperfect = FALSE
           ORDER BY ABS(a.price - %s)
           LIMIT %s""",
        (article["category"], sku, float(article["price"]), limit),
    )
    return subs


@app.post("/cart/{household_id}/items")
def add_cart_item(household_id: str, req: AddItemRequest):
    """Add an item to the shared cart (or increment quantity)."""
    cart = fetchone(
        "SELECT id FROM shared_cart WHERE household_id = %s",
        (household_id,),
    )
    if not cart:
        raise HTTPException(404, "Cart not found")

    # Upsert: if item already in cart, increment quantity
    existing = fetchone(
        "SELECT id, quantity FROM shared_cart_item WHERE cart_id = %s AND sku = %s",
        (cart["id"], req.sku),
    )

    if existing:
        new_qty = existing["quantity"] + req.quantity
        execute(
            "UPDATE shared_cart_item SET quantity = %s, added_by = %s, added_at = NOW() WHERE id = %s",
            (new_qty, req.added_by, existing["id"]),
        )
    else:
        execute(
            "INSERT INTO shared_cart_item (cart_id, sku, quantity, added_by) VALUES (%s, %s, %s, %s)",
            (cart["id"], req.sku, req.quantity, req.added_by),
        )

    # Update cart timestamp
    execute(
        "UPDATE shared_cart SET updated_at = NOW() WHERE id = %s",
        (cart["id"],),
    )

    # Get the full item for broadcast
    item = fetchone(
        """SELECT sci.id, sci.sku, sci.quantity, sci.added_by, sci.added_at,
                  a.name, a.category, a.price,
                  c.name as added_by_name,
                  hm.color as added_by_color
           FROM shared_cart_item sci
           JOIN article a ON a.sku = sci.sku
           JOIN customer c ON c.id = sci.added_by::uuid
           LEFT JOIN household_member hm ON hm.customer_id = sci.added_by
               AND hm.household_id = %s
           WHERE sci.cart_id = %s AND sci.sku = %s""",
        (household_id, cart["id"], req.sku),
    )

    _broadcast_to_household(
        household_id,
        {"type": "item_added", "item": _serialize(item)},
    )

    return item


@app.patch("/cart/{household_id}/items/{sku}")
def update_cart_item(household_id: str, sku: str, req: UpdateItemRequest):
    """Update quantity of a cart item."""
    cart = fetchone(
        "SELECT id FROM shared_cart WHERE household_id = %s",
        (household_id,),
    )
    if not cart:
        raise HTTPException(404, "Cart not found")

    if req.quantity <= 0:
        execute(
            "DELETE FROM shared_cart_item WHERE cart_id = %s AND sku = %s",
            (cart["id"], sku),
        )
        _broadcast_to_household(
            household_id,
            {"type": "item_removed", "sku": sku},
        )
        return {"removed": True}

    if req.updated_by:
        execute(
            "UPDATE shared_cart_item SET quantity = %s, added_by = %s, added_at = NOW() WHERE cart_id = %s AND sku = %s",
            (req.quantity, req.updated_by, cart["id"], sku),
        )
    else:
        execute(
            "UPDATE shared_cart_item SET quantity = %s WHERE cart_id = %s AND sku = %s",
            (req.quantity, cart["id"], sku),
        )
    _broadcast_to_household(
        household_id,
        {"type": "item_updated", "sku": sku, "quantity": req.quantity},
    )
    return {"sku": sku, "quantity": req.quantity}


@app.delete("/cart/{household_id}/items/{sku}")
def remove_cart_item(household_id: str, sku: str):
    """Remove an item from the shared cart."""
    cart = fetchone(
        "SELECT id FROM shared_cart WHERE household_id = %s",
        (household_id,),
    )
    if not cart:
        raise HTTPException(404, "Cart not found")

    execute(
        "DELETE FROM shared_cart_item WHERE cart_id = %s AND sku = %s",
        (cart["id"], sku),
    )

    _broadcast_to_household(
        household_id,
        {"type": "item_removed", "sku": sku},
    )

    return {"removed": True}


# ═══════════════════════════════════════════════════════════════
# WebSocket — real-time household sync
# ═══════════════════════════════════════════════════════════════

# household_id -> set of connected WebSockets
_ws_rooms: dict[str, set[WebSocket]] = {}


def _serialize(obj: Any) -> Any:
    """Make a dict JSON-serializable (handle datetime, Decimal)."""
    if obj is None:
        return obj
    if isinstance(obj, dict):
        return {k: _serialize(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_serialize(i) for i in obj]
    if isinstance(obj, (_uuid.UUID,)):
        return str(obj)
    if isinstance(obj, datetime):
        return obj.isoformat()
    if hasattr(obj, "as_integer_ratio"):  # Decimal / float
        return float(obj)
    return obj


def _broadcast_to_household(household_id: str | object, message: dict):
    """Send a message to all connected WebSocket clients in a household."""
    room = _ws_rooms.get(str(household_id), set())
    if not room or not _main_loop:
        return
    dead = set()
    data = json.dumps(_serialize(message))
    for ws in room:
        try:
            asyncio.run_coroutine_threadsafe(ws.send_text(data), _main_loop)
        except Exception:
            dead.add(ws)
    for ws in dead:
        room.discard(ws)


@app.websocket("/ws/{household_id}")
async def websocket_endpoint(websocket: WebSocket, household_id: str):
    await websocket.accept()

    # Join room
    if household_id not in _ws_rooms:
        _ws_rooms[household_id] = set()
    _ws_rooms[household_id].add(websocket)

    try:
        # Send initial cart state
        cart = fetchone(
            "SELECT id, status FROM shared_cart WHERE household_id = %s",
            (household_id,),
        )
        if cart:
            items = fetchall(
                """SELECT sci.id, sci.sku, sci.quantity, sci.added_by, sci.added_at,
                          a.name, a.category, a.price,
                          c.name as added_by_name,
                          hm.color as added_by_color
                   FROM shared_cart_item sci
                   JOIN article a ON a.sku = sci.sku
                   JOIN customer c ON c.id = sci.added_by::uuid
                   LEFT JOIN household_member hm ON hm.customer_id = sci.added_by
                       AND hm.household_id = %s
                   WHERE sci.cart_id = %s
                   ORDER BY sci.added_at DESC""",
                (household_id, cart["id"]),
            )
            await websocket.send_text(
                json.dumps(_serialize({"type": "cart_state", "items": items}))
            )

        # Listen for messages
        while True:
            data = await websocket.receive_text()
            msg = json.loads(data)

            # Client can send cart mutations via WS too
            if msg.get("type") == "add_item":
                add_cart_item(
                    household_id,
                    AddItemRequest(
                        sku=msg["sku"],
                        quantity=msg.get("quantity", 1),
                        added_by=msg["added_by"],
                    ),
                )
            elif msg.get("type") == "remove_item":
                remove_cart_item(household_id, msg["sku"])
            elif msg.get("type") == "update_quantity":
                update_cart_item(
                    household_id,
                    msg["sku"],
                    UpdateItemRequest(quantity=msg["quantity"]),
                )
            elif msg.get("type") == "order_confirmed":
                # Broadcast to all OTHER members in the household
                room = _ws_rooms.get(str(household_id), set())
                data_str = json.dumps({"type": "order_confirmed", "confirmed_by": msg.get("confirmed_by", "Someone")})
                for ws in room:
                    if ws != websocket:
                        try:
                            await ws.send_text(data_str)
                        except Exception:
                            pass

    except WebSocketDisconnect:
        pass
    finally:
        _ws_rooms.get(household_id, set()).discard(websocket)


# ═══════════════════════════════════════════════════════════════
# Recommendations (bridge to existing engine)
# ═══════════════════════════════════════════════════════════════

@app.post("/recommendations/generate/{customer_id}")
def generate_recommendations(customer_id: str):
    """Generate personalized recommendations for a customer."""
    try:
        from engine.orchestrator import run_pipeline
        basket_id = run_pipeline(customer_id, use_llm=False)
        if not basket_id:
            return {"basket_id": None, "items": []}
        from engine.orchestrator import get_latest_basket
        basket = get_latest_basket(customer_id)
        return basket
    except Exception as e:
        raise HTTPException(500, f"Recommendation error: {str(e)}")
