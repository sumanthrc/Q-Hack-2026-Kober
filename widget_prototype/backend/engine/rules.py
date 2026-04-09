"""
engine/rules.py

Rule-based recommendation engine.
Reads from the four analytics tables and applies ranked rules
to produce a list of (sku, quantity, reason, confidence, rule).

Rules in priority order:
  1. frequent     — bought in majority of recent orders
  2. cycle        — periodic item due for repurchase
  3. drift        — newly adopted item in last 3 orders
  4. browse       — viewed/added to cart but never bought
  5. dietary_safe — popular items compatible with dietary profile

Each rule adds items to the basket only once (no duplicates).
Items blocked by stock or dietary restrictions are filtered out.
"""

from datetime import datetime, timedelta
from dataclasses import dataclass, field
from db.connection import fetchall, fetchone

# ---------------------------------------------------------------------------
# Data structures
# ---------------------------------------------------------------------------

@dataclass
class RecommendedItem:
    sku: str
    quantity: int
    reason: str
    confidence: float
    rule_triggered: str


@dataclass
class RecommendationResult:
    items: list[RecommendedItem] = field(default_factory=list)
    customer_id: str = ""
    generated_at: datetime = field(default_factory=datetime.utcnow)


# ---------------------------------------------------------------------------
# Dietary blocking map
# ---------------------------------------------------------------------------

DIETARY_BLOCKED_LABELS = {
    "vegan":        {"milk", "eggs", "meat", "fish", "honey"},
    "vegetarian":   {"meat", "fish"},
    "gluten-free":  {"gluten"},
    "pescatarian":  {"meat"},
}


def get_blocked_labels(dietary_preference: str) -> set[str]:
    return DIETARY_BLOCKED_LABELS.get((dietary_preference or "").lower(), set())


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def get_available_skus(fc_id: str = "FC1") -> set[str]:
    """
    Returns SKUs that are in stock, not imperfect,
    and quantity > 5 at the given FC.
    """
    rows = fetchall(
        """
        SELECT sku FROM stock
        WHERE fc_id = %s
          AND quantity > 5
          AND is_marked_imperfect = FALSE
        """,
        (fc_id,),
    )
    return {r["sku"] for r in rows}


def get_article_allergy_labels(sku: str) -> list[str]:
    row = fetchone(
        "SELECT allergy_labels FROM article WHERE sku = %s", (sku,)
    )
    return row["allergy_labels"] if row else []


def is_dietary_safe(sku: str, blocked_labels: set[str]) -> bool:
    if not blocked_labels:
        return True
    labels = set(get_article_allergy_labels(sku))
    return len(labels & blocked_labels) == 0


def round_quantity(avg: float) -> int:
    """Round avg purchase quantity to a sensible integer."""
    return max(1, round(avg))


# ---------------------------------------------------------------------------
# Rule 1 — Frequent items
# ---------------------------------------------------------------------------

def rule_frequent(
    customer_id: str,
    blocked_labels: set[str],
    available_skus: set[str],
    total_orders: int,
    threshold: float = 0.6,
) -> list[RecommendedItem]:
    """
    Include items bought in >= threshold fraction of all orders.
    e.g. threshold=0.6 means 6 out of 10 orders.
    """
    min_orders = max(2, round(total_orders * threshold))

    rows = fetchall(
        """
        SELECT sku, total_orders, avg_quantity_per_order, weeks_active
        FROM customeritemfrequency
        WHERE customer_id = %s
          AND total_orders >= %s
        ORDER BY total_orders DESC
        """,
        (customer_id, min_orders),
    )

    items = []
    for r in rows:
        sku = r["sku"]
        if sku not in available_skus:
            continue
        if not is_dietary_safe(sku, blocked_labels):
            continue

        frequency_ratio = r["total_orders"] / total_orders
        confidence = min(0.99, 0.5 + frequency_ratio * 0.5)

        if r["total_orders"] >= total_orders:
            reason = f"Bought every week for {r['weeks_active']} weeks"
        else:
            reason = (
                f"Bought in {r['total_orders']} of your last "
                f"{total_orders} orders"
            )

        items.append(
            RecommendedItem(
                sku=sku,
                quantity=round_quantity(r["avg_quantity_per_order"]),
                reason=reason,
                confidence=round(confidence, 3),
                rule_triggered="frequent",
            )
        )

    return items


# ---------------------------------------------------------------------------
# Rule 2 — Cycle items
# ---------------------------------------------------------------------------

def rule_cycle(
    customer_id: str,
    blocked_labels: set[str],
    available_skus: set[str],
    lookahead_days: int = 4,
) -> list[RecommendedItem]:
    """
    Include items whose predicted next_due falls within
    the next `lookahead_days` days.
    """
    cutoff = datetime.utcnow() + timedelta(days=lookahead_days)

    rows = fetchall(
        """
        SELECT c.sku, c.avg_cycle_days, c.next_due, c.cycle_confidence,
               f.avg_quantity_per_order
        FROM customeritemcycle c
        LEFT JOIN customeritemfrequency f
            ON f.customer_id = c.customer_id AND f.sku = c.sku
        WHERE c.customer_id = %s
          AND c.next_due <= %s
        ORDER BY c.next_due ASC
        """,
        (customer_id, cutoff),
    )

    items = []
    for r in rows:
        sku = r["sku"]
        if sku not in available_skus:
            continue
        if not is_dietary_safe(sku, blocked_labels):
            continue

        cycle_days = round(r["avg_cycle_days"])
        reason = f"You buy this every {cycle_days} days — due this week"

        items.append(
            RecommendedItem(
                sku=sku,
                quantity=round_quantity(r["avg_quantity_per_order"] or 1),
                reason=reason,
                confidence=round(float(r["cycle_confidence"]) * 0.95, 3),
                rule_triggered="cycle",
            )
        )

    return items


# ---------------------------------------------------------------------------
# Rule 3 — Drift items
# ---------------------------------------------------------------------------

def rule_drift(
    customer_id: str,
    blocked_labels: set[str],
    available_skus: set[str],
) -> list[RecommendedItem]:
    """
    Include items that have recently appeared in the customer's
    orders but weren't part of their older routine.
    Signals dietary shift or new habit forming.
    """
    rows = fetchall(
        """
        SELECT d.sku, d.drift_score, d.recent_order_count,
               f.avg_quantity_per_order
        FROM customeritemdrift d
        LEFT JOIN customeritemfrequency f
            ON f.customer_id = d.customer_id AND f.sku = d.sku
        WHERE d.customer_id = %s
        ORDER BY d.drift_score DESC
        LIMIT 5
        """,
        (customer_id,),
    )

    items = []
    for r in rows:
        sku = r["sku"]
        if sku not in available_skus:
            continue
        if not is_dietary_safe(sku, blocked_labels):
            continue

        reason = (
            f"New addition to your basket — bought "
            f"{r['recent_order_count']} times recently"
        )
        items.append(
            RecommendedItem(
                sku=sku,
                quantity=round_quantity(r["avg_quantity_per_order"] or 1),
                reason=reason,
                confidence=round(float(r["drift_score"]) * 0.85, 3),
                rule_triggered="drift",
            )
        )

    return items


# ---------------------------------------------------------------------------
# Rule 4 — Browse signals
# ---------------------------------------------------------------------------

def rule_browse(
    customer_id: str,
    blocked_labels: set[str],
    available_skus: set[str],
    max_items: int = 2,
) -> list[RecommendedItem]:
    """
    Include up to max_items items the customer viewed or added to
    cart but never purchased.  Ranked by signal_score.
    """
    rows = fetchall(
        """
        SELECT sku, signal_score, add_to_cart_count, view_count
        FROM customerbrowsesignal
        WHERE customer_id = %s
        ORDER BY signal_score DESC
        LIMIT %s
        """,
        (customer_id, max_items),
    )

    items = []
    for r in rows:
        sku = r["sku"]
        if sku not in available_skus:
            continue
        if not is_dietary_safe(sku, blocked_labels):
            continue

        if r["add_to_cart_count"] > 0:
            reason = "You added this to your cart before — want to try it?"
        else:
            reason = f"You viewed this {r['view_count']} times"

        confidence = min(0.75, float(r["signal_score"]) / 10.0)
        items.append(
            RecommendedItem(
                sku=sku,
                quantity=1,
                reason=reason,
                confidence=round(confidence, 3),
                rule_triggered="browse",
            )
        )

    return items


# ---------------------------------------------------------------------------
# Rule 5 — Popular dietary-safe items (discovery)
# ---------------------------------------------------------------------------

def rule_popular(
    customer_id: str,
    blocked_labels: set[str],
    available_skus: set[str],
    already_included: set[str],
    preferred_categories: list[str],
    max_items: int = 2,
) -> list[RecommendedItem]:
    """
    Suggest popular items in the customer's preferred categories
    that they have never bought.  Acts as a discovery layer.
    """
    if not preferred_categories:
        return []

    rows = fetchall(
        """
        SELECT sku, name, category, popularity_score
        FROM article
        WHERE category = ANY(%s)
          AND is_available = TRUE
          AND sku NOT IN (
              SELECT DISTINCT ol.sku
              FROM orderline ol
              JOIN "Order" o ON ol.order_id = o.id
              WHERE o.customer_id = %s
          )
        ORDER BY popularity_score DESC
        LIMIT 20
        """,
        (preferred_categories, customer_id),
    )

    items = []
    for r in rows:
        if len(items) >= max_items:
            break
        sku = r["sku"]
        if sku in already_included:
            continue
        if sku not in available_skus:
            continue
        if not is_dietary_safe(sku, blocked_labels):
            continue

        reason = (
            f"Popular in {r['category']} — "
            f"you haven't tried this yet"
        )
        items.append(
            RecommendedItem(
                sku=sku,
                quantity=1,
                reason=reason,
                confidence=0.45,
                rule_triggered="popular",
            )
        )

    return items


# ---------------------------------------------------------------------------
# Main engine entry point
# ---------------------------------------------------------------------------

def generate_recommendations(customer_id: str) -> RecommendationResult:
    """
    Runs all rules in priority order and returns a deduplicated
    list of recommended items for the given customer.
    """
    customer = fetchone(
        """
        SELECT id, dietary_preference, price_sensitivity,
               preferred_categories, household_size
        FROM customer WHERE id = %s
        """,
        (customer_id,),
    )
    if not customer:
        raise ValueError(f"Customer {customer_id} not found")

    # Count total historical orders for threshold calculation
    order_count_row = fetchone(
        'SELECT COUNT(*) AS cnt FROM "Order" WHERE customer_id = %s',
        (customer_id,),
    )
    total_orders = order_count_row["cnt"] if order_count_row else 0
    if total_orders == 0:
        return RecommendationResult(customer_id=customer_id)

    blocked_labels = get_blocked_labels(customer["dietary_preference"])
    available_skus = get_available_skus()
    preferred_categories = customer["preferred_categories"] or []

    result = RecommendationResult(customer_id=customer_id)
    seen_skus: set[str] = set()

    def add_items(new_items: list[RecommendedItem]) -> None:
        for item in new_items:
            if item.sku not in seen_skus:
                seen_skus.add(item.sku)
                result.items.append(item)

    # Apply rules in priority order
    add_items(rule_frequent(customer_id, blocked_labels,
                            available_skus, total_orders))
    add_items(rule_cycle(customer_id, blocked_labels, available_skus))
    add_items(rule_drift(customer_id, blocked_labels, available_skus))
    add_items(rule_browse(customer_id, blocked_labels, available_skus))
    add_items(rule_popular(customer_id, blocked_labels, available_skus,
                           seen_skus, preferred_categories))

    return result
