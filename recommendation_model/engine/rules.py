"""
engine/rules.py

Rule-based recommendation engine.
Reads from the analytics tables and applies ranked rules
to produce a list of (sku, quantity, reason, confidence, rule).

Rules in priority order:
  1. frequent  — bought in majority of recent orders, still bought recently
  2. cycle     — periodic item due for repurchase
  3. drift     — newly adopted item in last 3 orders
  4. popular   — top items in preferred categories never bought before,
                 preferring seasonal items

Each rule adds items to the basket only once (no duplicates).
Items blocked by stock or dietary restrictions are filtered out.
Only items with confidence >= MIN_CONFIDENCE are included.
"""

from datetime import datetime, timedelta, timezone
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
    out_of_stock: bool = False


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
    Returns SKUs that are in stock (quantity > 5, not imperfect) at the given FC.
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


def get_stocked_skus(fc_id: str = "FC1") -> set[str]:
    """
    Returns ALL SKUs carried at this FC regardless of current quantity.
    Used to decide whether an out-of-stock item should still be recommended
    (it's a known product at this FC, just temporarily unavailable).
    """
    rows = fetchall(
        "SELECT sku FROM stock WHERE fc_id = %s",
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
    stocked_skus: set[str],
    total_orders: int,
    threshold: float = 0.6,
) -> list[RecommendedItem]:
    """
    Include items bought in >= threshold fraction of all orders.
    Items that are out of stock but carried at this FC are still included
    and flagged out_of_stock=True so the LLM can suggest a substitute.
    """
    min_orders = max(2, round(total_orders * threshold))

    rows = fetchall(
        """
        SELECT sku, total_orders, avg_quantity_per_order, weeks_active,
               last_purchased
        FROM customeritemfrequency
        WHERE customer_id = %s
          AND total_orders >= %s
        ORDER BY total_orders DESC
        """,
        (customer_id, min_orders),
    )

    now = datetime.now(timezone.utc)
    four_weeks_ago = now - timedelta(weeks=4)
    items = []
    for r in rows:
        sku = r["sku"]
        in_stock = sku in available_skus
        # Include if in stock OR if it's a known product at this FC (out-of-stock pass-through)
        if not in_stock and sku not in stocked_skus:
            continue
        if not is_dietary_safe(sku, blocked_labels):
            continue

        frequency_ratio = r["total_orders"] / total_orders
        confidence = min(0.99, 0.5 + frequency_ratio * 0.5)

        last_purchased = r["last_purchased"]
        if last_purchased and last_purchased.tzinfo is None:
            last_purchased = last_purchased.replace(tzinfo=timezone.utc)
        if last_purchased and last_purchased < four_weeks_ago:
            days_since = (now - last_purchased).days
            confidence = round(confidence * 0.8, 3)
            reason = f"A regular in your basket — last bought {days_since} days ago"
        elif r["total_orders"] >= total_orders:
            reason = f"In every order for the past {r['weeks_active']} weeks"
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
                out_of_stock=not in_stock,
            )
        )

    return items


# ---------------------------------------------------------------------------
# Rule 2 — Cycle items
# ---------------------------------------------------------------------------

def _cycle_interval_label(days: float) -> str:
    """Return a human-readable repurchase interval, e.g. 'every 2 weeks'."""
    if days <= 8:
        return "every week"
    if days <= 18:
        return f"every {round(days / 7)} weeks"
    if days <= 45:
        return f"every {round(days / 7)} weeks"
    return f"every {round(days / 30)} months"


def rule_cycle(
    customer_id: str,
    blocked_labels: set[str],
    available_skus: set[str],
    stocked_skus: set[str],
    lookahead_days: int = 4,
) -> list[RecommendedItem]:
    """
    Include items whose predicted next_due falls within lookahead_days.
    Out-of-stock items that are carried at this FC are still included
    and flagged out_of_stock=True.
    """
    now = datetime.now(timezone.utc)
    cutoff = now + timedelta(days=lookahead_days)

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
        in_stock = sku in available_skus
        if not in_stock and sku not in stocked_skus:
            continue
        if not is_dietary_safe(sku, blocked_labels):
            continue

        interval_label = _cycle_interval_label(r["avg_cycle_days"])
        next_due = r["next_due"]
        if next_due.tzinfo is None:
            next_due = next_due.replace(tzinfo=timezone.utc)
        days_until = (next_due - now).days

        if days_until <= 0:
            due_label = "due today"
        elif days_until == 1:
            due_label = "due tomorrow"
        else:
            due_label = f"due in {days_until} days"

        reason = f"You buy this {interval_label} — {due_label}"

        items.append(
            RecommendedItem(
                sku=sku,
                quantity=round_quantity(r["avg_quantity_per_order"] or 1),
                reason=reason,
                confidence=round(float(r["cycle_confidence"]) * 0.95, 3),
                rule_triggered="cycle",
                out_of_stock=not in_stock,
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
               d.first_seen, f.avg_quantity_per_order
        FROM customeritemdrift d
        LEFT JOIN customeritemfrequency f
            ON f.customer_id = d.customer_id AND f.sku = d.sku
        WHERE d.customer_id = %s
        ORDER BY d.drift_score DESC
        LIMIT 5
        """,
        (customer_id,),
    )

    now = datetime.now(timezone.utc)
    items = []
    for r in rows:
        sku = r["sku"]
        if sku not in available_skus:
            continue
        if not is_dietary_safe(sku, blocked_labels):
            continue

        first_seen = r["first_seen"]
        if first_seen and first_seen.tzinfo is None:
            first_seen = first_seen.replace(tzinfo=timezone.utc)
        days_since_first = (now - first_seen).days if first_seen else None

        if days_since_first is not None and days_since_first <= 7:
            reason = "Just added to your basket — you've picked this up every time since"
        elif days_since_first is not None:
            reason = f"New habit forming — bought {r['recent_order_count']} times in the past {days_since_first} days"
        else:
            reason = f"New addition to your basket — bought {r['recent_order_count']} times recently"

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
# Rule 4 — Popular dietary-safe items (discovery)
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
    that they have never bought. Seasonal items are surfaced first.
    """
    if not preferred_categories:
        return []

    rows = fetchall(
        """
        SELECT sku, name, category, subcategory, popularity_score, seasonal_flag
        FROM article
        WHERE category = ANY(%s)
          AND is_available = TRUE
          AND sku NOT IN (
              SELECT DISTINCT ol.sku
              FROM orderline ol
              JOIN "Order" o ON ol.order_id = o.id
              WHERE o.customer_id = %s
          )
        ORDER BY seasonal_flag DESC, popularity_score DESC
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

        label = r["subcategory"] or r["category"]
        if r["seasonal_flag"]:
            reason = f"Popular seasonal pick in {label} — something new to try"
        else:
            reason = f"Top pick in {label} you haven't tried yet"

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

MIN_CONFIDENCE = 0.7


def generate_recommendations(customer_id: str) -> RecommendationResult:
    """
    Runs all rules in priority order and returns a deduplicated
    list of recommended items for the given customer.

    Only items with confidence >= MIN_CONFIDENCE (0.7) are included,
    so basket size is driven by data quality rather than a fixed count.
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

    blocked_labels     = get_blocked_labels(customer["dietary_preference"])
    available_skus     = get_available_skus()
    stocked_skus       = get_stocked_skus()
    preferred_categories = customer["preferred_categories"] or []

    result = RecommendationResult(customer_id=customer_id)
    seen_skus: set[str] = set()

    def add_items(new_items: list[RecommendedItem]) -> None:
        for item in new_items:
            if item.sku not in seen_skus and item.confidence >= MIN_CONFIDENCE:
                seen_skus.add(item.sku)
                result.items.append(item)

    # Apply rules in priority order
    add_items(rule_frequent(customer_id, blocked_labels,
                            available_skus, stocked_skus, total_orders))
    add_items(rule_cycle(customer_id, blocked_labels,
                         available_skus, stocked_skus))
    add_items(rule_drift(customer_id, blocked_labels, available_skus))
    add_items(rule_popular(customer_id, blocked_labels, available_skus,
                           seen_skus, preferred_categories))

    return result
