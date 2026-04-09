"""
engine/analytics.py

Builds and refreshes the four supporting analytics tables:
  - CustomerItemFrequency
  - CustomerItemCycle
  - CustomerItemDrift
  - CustomerBrowseSignal

Call refresh_all(customer_id) after every new order.
Call refresh_all_customers() nightly for the full population.
"""

import math
from datetime import datetime, timedelta
from db.connection import fetchall, fetchone, execute, executemany


# ---------------------------------------------------------------------------
# 1. Purchase Frequency
# ---------------------------------------------------------------------------

def refresh_frequency(customer_id: str) -> None:
    """
    Recomputes how often each SKU appears in this customer's orders.
    Counts distinct orders (not quantity), so buying 3 bananas in one
    order counts as 1 order, not 3.
    """
    rows = fetchall(
        """
        SELECT
            ol.sku,
            COUNT(DISTINCT o.id)                          AS total_orders,
            SUM(ol.quantity)                              AS total_quantity,
            MAX(o.order_time)                             AS last_purchased,
            MIN(o.order_time)                             AS first_purchased,
            AVG(ol.quantity)                              AS avg_quantity_per_order,
            COUNT(DISTINCT DATE_TRUNC('week', o.order_time)) AS weeks_active
        FROM orderline ol
        JOIN "Order" o ON ol.order_id = o.id
        WHERE o.customer_id = %s
        GROUP BY ol.sku
        """,
        (customer_id,),
    )

    if not rows:
        return

    executemany(
        """
        INSERT INTO customeritemfrequency
            (customer_id, sku, total_orders, total_quantity,
             last_purchased, first_purchased,
             avg_quantity_per_order, weeks_active)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT (customer_id, sku) DO UPDATE SET
            total_orders          = EXCLUDED.total_orders,
            total_quantity        = EXCLUDED.total_quantity,
            last_purchased        = EXCLUDED.last_purchased,
            first_purchased       = EXCLUDED.first_purchased,
            avg_quantity_per_order = EXCLUDED.avg_quantity_per_order,
            weeks_active          = EXCLUDED.weeks_active
        """,
        [
            (
                customer_id,
                r["sku"],
                r["total_orders"],
                r["total_quantity"],
                r["last_purchased"],
                r["first_purchased"],
                float(r["avg_quantity_per_order"]),
                r["weeks_active"],
            )
            for r in rows
        ],
    )


# ---------------------------------------------------------------------------
# 2. Purchase Cycles
# ---------------------------------------------------------------------------

def refresh_cycles(customer_id: str) -> None:
    """
    Detects periodic buying patterns using the gap between consecutive
    purchases of the same SKU.  Only flags a cycle when:
      - The SKU was bought at least 3 times (enough data)
      - std_dev / avg_cycle < 0.4 (reasonably consistent interval)
    """
    # Fetch ordered purchase timestamps per SKU
    rows = fetchall(
        """
        SELECT
            ol.sku,
            o.order_time
        FROM orderline ol
        JOIN "Order" o ON ol.order_id = o.id
        WHERE o.customer_id = %s
        ORDER BY ol.sku, o.order_time
        """,
        (customer_id,),
    )

    # Group by SKU
    sku_times: dict[str, list[datetime]] = {}
    for r in rows:
        sku_times.setdefault(r["sku"], []).append(r["order_time"])

    cycle_rows = []
    for sku, times in sku_times.items():
        if len(times) < 3:
            continue

        # Compute gaps in days between consecutive purchases
        gaps = [
            (times[i] - times[i - 1]).total_seconds() / 86400
            for i in range(1, len(times))
        ]

        avg_gap = sum(gaps) / len(gaps)
        variance = sum((g - avg_gap) ** 2 for g in gaps) / len(gaps)
        std_gap = math.sqrt(variance)

        # Coefficient of variation: lower = more regular
        cv = std_gap / avg_gap if avg_gap > 0 else 1.0
        if cv > 0.4:
            continue  # too irregular to call a cycle

        cycle_confidence = round(1.0 - cv, 3)
        last_purchased = times[-1]
        next_due = last_purchased + timedelta(days=avg_gap)

        cycle_rows.append(
            (
                customer_id,
                sku,
                round(avg_gap, 2),
                round(std_gap, 2),
                last_purchased,
                next_due,
                cycle_confidence,
            )
        )

    if not cycle_rows:
        return

    executemany(
        """
        INSERT INTO customeritemcycle
            (customer_id, sku, avg_cycle_days, std_cycle_days,
             last_purchased, next_due, cycle_confidence)
        VALUES (%s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT (customer_id, sku) DO UPDATE SET
            avg_cycle_days  = EXCLUDED.avg_cycle_days,
            std_cycle_days  = EXCLUDED.std_cycle_days,
            last_purchased  = EXCLUDED.last_purchased,
            next_due        = EXCLUDED.next_due,
            cycle_confidence = EXCLUDED.cycle_confidence
        """,
        cycle_rows,
    )


# ---------------------------------------------------------------------------
# 3. Behaviour Drift
# ---------------------------------------------------------------------------

def refresh_drift(customer_id: str) -> None:
    """
    Detects items that have started appearing recently but were
    absent before.  Definition:
      - Appeared in at least 2 of the last 3 orders
      - Did NOT appear in any order more than 3 weeks ago
    This catches dietary shifts, seasonal additions, new habits.
    """
    recent_orders = fetchall(
        """
        SELECT id FROM "Order"
        WHERE customer_id = %s
        ORDER BY order_time DESC
        LIMIT 3
        """,
        (customer_id,),
    )
    if len(recent_orders) < 2:
        return

    recent_ids = tuple(r["id"] for r in recent_orders)

    # SKUs in the last 3 orders
    recent_skus = fetchall(
        f"""
        SELECT sku, COUNT(DISTINCT order_id) AS recent_count,
               MIN(o.order_time) AS first_seen_recent
        FROM orderline ol
        JOIN "Order" o ON ol.order_id = o.id
        WHERE ol.order_id = ANY(%s)
        GROUP BY sku
        HAVING COUNT(DISTINCT order_id) >= 2
        """,
        (list(recent_ids),),
    )

    if not recent_skus:
        return

    # Filter to only those absent from older history
    three_weeks_ago = datetime.utcnow() - timedelta(weeks=3)
    drift_rows = []
    for r in recent_skus:
        sku = r["sku"]
        old_count = fetchone(
            """
            SELECT COUNT(*) AS cnt
            FROM orderline ol
            JOIN "Order" o ON ol.order_id = o.id
            WHERE o.customer_id = %s
              AND ol.sku = %s
              AND o.order_time < %s
            """,
            (customer_id, sku, three_weeks_ago),
        )
        if old_count and old_count["cnt"] == 0:
            drift_score = round(r["recent_count"] / 3.0, 3)
            drift_rows.append(
                (
                    customer_id,
                    sku,
                    r["first_seen_recent"],
                    r["recent_count"],
                    drift_score,
                )
            )

    if not drift_rows:
        return

    executemany(
        """
        INSERT INTO customeritemdrift
            (customer_id, sku, first_seen,
             recent_order_count, drift_score)
        VALUES (%s, %s, %s, %s, %s)
        ON CONFLICT (customer_id, sku) DO UPDATE SET
            first_seen         = EXCLUDED.first_seen,
            recent_order_count = EXCLUDED.recent_order_count,
            drift_score        = EXCLUDED.drift_score
        """,
        drift_rows,
    )


# ---------------------------------------------------------------------------
# 4. Browse Signals
# ---------------------------------------------------------------------------

def refresh_browse_signals(customer_id: str) -> None:
    """
    Aggregates UserInteraction events into a single signal score per SKU.
    Formula: signal = (add_to_cart * 2) + (views * 0.5) - (removes * 1.5)
    Only keeps SKUs not already in the customer's purchase history.
    """
    interactions = fetchall(
        """
        SELECT
            sku,
            SUM(CASE WHEN event_type = 'view'            THEN 1 ELSE 0 END) AS views,
            SUM(CASE WHEN event_type = 'add_to_cart'     THEN 1 ELSE 0 END) AS adds,
            SUM(CASE WHEN event_type = 'remove_from_cart' THEN 1 ELSE 0 END) AS removes,
            MAX(timestamp) AS last_viewed
        FROM userinteraction
        WHERE customer_id = %s
          AND sku IS NOT NULL
        GROUP BY sku
        """,
        (customer_id,),
    )

    # Get already-purchased SKUs to exclude
    purchased = {
        r["sku"]
        for r in fetchall(
            """
            SELECT DISTINCT ol.sku
            FROM orderline ol
            JOIN "Order" o ON ol.order_id = o.id
            WHERE o.customer_id = %s
            """,
            (customer_id,),
        )
    }

    signal_rows = []
    for r in interactions:
        if r["sku"] in purchased:
            continue
        if r["sku"] is None:
            continue
        score = (r["adds"] * 2.0) + (r["views"] * 0.5) - (r["removes"] * 1.5)
        if score <= 0:
            continue
        signal_rows.append(
            (
                customer_id,
                r["sku"],
                r["views"],
                r["adds"],
                r["removes"],
                r["last_viewed"],
                round(score, 3),
            )
        )

    if not signal_rows:
        return

    executemany(
        """
        INSERT INTO customerbrowsesignal
            (customer_id, sku, view_count, add_to_cart_count,
             remove_from_cart_count, last_viewed, signal_score)
        VALUES (%s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT (customer_id, sku) DO UPDATE SET
            view_count            = EXCLUDED.view_count,
            add_to_cart_count     = EXCLUDED.add_to_cart_count,
            remove_from_cart_count = EXCLUDED.remove_from_cart_count,
            last_viewed           = EXCLUDED.last_viewed,
            signal_score          = EXCLUDED.signal_score
        """,
        signal_rows,
    )


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def refresh_all(customer_id: str) -> None:
    """Refresh all analytics tables for a single customer."""
    refresh_frequency(customer_id)
    refresh_cycles(customer_id)
    refresh_drift(customer_id)
    refresh_browse_signals(customer_id)


def refresh_all_customers() -> None:
    """Nightly job — refresh analytics for every customer."""
    customers = fetchall("SELECT id FROM customer")
    for c in customers:
        refresh_all(str(c["id"]))
