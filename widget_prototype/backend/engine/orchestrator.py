"""
engine/orchestrator.py

Single entry point for the full recommendation pipeline:

  1. Refresh analytics tables for the customer
  2. Run the rule-based engine
  3. Enrich with LLM (basket summary + improved reasons)
  4. Persist to RecommendedBasket + RecommendedBasketItem
  5. Return the basket id

Usage:
    from engine.orchestrator import run_pipeline
    basket_id = run_pipeline(customer_id="11111111-...")
"""

import uuid
from datetime import datetime, timedelta

from engine.analytics import refresh_all
from engine.rules import generate_recommendations
from engine.llm_enrichment import enrich_with_llm
from db.connection import execute, executemany, fetchone


def run_pipeline(
    customer_id: str,
    use_llm: bool = True,
    valid_hours: int = 24,
    fc_id: str = "FC1",
) -> str:
    """
    Runs the full recommendation pipeline for one customer.
    Returns the UUID of the created RecommendedBasket.
    """

    print(f"[pipeline] Starting for customer {customer_id}")

    # ----------------------------------------------------------------
    # Step 1: Refresh analytics
    # ----------------------------------------------------------------
    print("[pipeline] Refreshing analytics tables...")
    refresh_all(customer_id)

    # ----------------------------------------------------------------
    # Step 2: Run rules
    # ----------------------------------------------------------------
    print("[pipeline] Running rule engine...")
    result = generate_recommendations(customer_id)

    if not result.items:
        print("[pipeline] No recommendations generated.")
        return None

    print(f"[pipeline] {len(result.items)} items from rules:")
    for item in result.items:
        print(f"  [{item.rule_triggered}] {item.sku} x{item.quantity}"
              f" — {item.reason}")

    # ----------------------------------------------------------------
    # Step 3: LLM enrichment
    # ----------------------------------------------------------------
    basket_summary = None
    enriched_reasons: dict[str, str] = {}

    if use_llm:
        print("[pipeline] Calling LLM for enrichment...")
        basket_summary, enriched_reasons = enrich_with_llm(
            result, customer_id
        )
        print(f"[pipeline] Summary: {basket_summary}")

    # ----------------------------------------------------------------
    # Step 4: Compute overall confidence
    # ----------------------------------------------------------------
    avg_confidence = (
        sum(i.confidence for i in result.items) / len(result.items)
        if result.items else 0.0
    )

    # ----------------------------------------------------------------
    # Step 5: Persist RecommendedBasket
    # ----------------------------------------------------------------
    basket_id = str(uuid.uuid4())
    valid_until = datetime.utcnow() + timedelta(hours=valid_hours)

    execute(
        """
        INSERT INTO recommendedbasket
            (id, customer_id, generated_at, valid_until,
             status, confidence_score, basket_summary, generation_method)
        VALUES (%s, %s, %s, %s, 'pending', %s, %s, %s)
        """,
        (
            basket_id,
            customer_id,
            datetime.utcnow(),
            valid_until,
            round(avg_confidence, 3),
            basket_summary,
            "hybrid" if use_llm else "rule_based",
        ),
    )

    # ----------------------------------------------------------------
    # Step 6: Persist RecommendedBasketItems
    # ----------------------------------------------------------------
    item_rows = []
    for item in result.items:
        # Use LLM-enriched reason if available
        final_reason = enriched_reasons.get(item.sku, item.reason)
        item_rows.append(
            (
                str(uuid.uuid4()),
                basket_id,
                item.sku,
                item.quantity,
                final_reason,
                item.confidence,
                item.rule_triggered,
            )
        )

    executemany(
        """
        INSERT INTO recommendedbasketitem
            (id, basket_id, sku, quantity, reason,
             confidence, rule_triggered)
        VALUES (%s, %s, %s, %s, %s, %s, %s)
        """,
        item_rows,
    )

    print(f"[pipeline] Basket {basket_id} saved successfully.")
    return basket_id


def get_latest_basket(customer_id: str) -> dict | None:
    """
    Fetches the most recent pending basket for a customer,
    including all items with article metadata.
    """
    basket = fetchone(
        """
        SELECT id, generated_at, valid_until, status,
               confidence_score, basket_summary, generation_method
        FROM recommendedbasket
        WHERE customer_id = %s
          AND status = 'pending'
          AND valid_until > NOW()
        ORDER BY generated_at DESC
        LIMIT 1
        """,
        (customer_id,),
    )
    if not basket:
        return None

    from db.connection import fetchall
    items = fetchall(
        """
        SELECT rbi.sku, rbi.quantity, rbi.reason,
               rbi.confidence, rbi.rule_triggered,
               a.name, a.price, a.category,
               a.nutriscore, a.is_biological,
               a.carbon_footprint
        FROM recommendedbasketitem rbi
        JOIN article a ON rbi.sku = a.sku
        WHERE rbi.basket_id = %s
        ORDER BY rbi.confidence DESC
        """,
        (basket["id"],),
    )

    return {
        "basket_id": basket["id"],
        "generated_at": basket["generated_at"].isoformat(),
        "valid_until": basket["valid_until"].isoformat(),
        "status": basket["status"],
        "confidence_score": basket["confidence_score"],
        "basket_summary": basket["basket_summary"],
        "generation_method": basket["generation_method"],
        "items": [dict(i) for i in items],
    }


def accept_basket(basket_id: str) -> None:
    """Mark basket as accepted and log per-item acceptance."""
    execute(
        """
        UPDATE recommendedbasket SET status = 'accepted'
        WHERE id = %s
        """,
        (basket_id,),
    )
    execute(
        """
        UPDATE recommendedbasketitem SET is_accepted = TRUE
        WHERE basket_id = %s
        """,
        (basket_id,),
    )


def reject_basket(basket_id: str) -> None:
    execute(
        "UPDATE recommendedbasket SET status = 'rejected' WHERE id = %s",
        (basket_id,),
    )


def modify_basket(basket_id: str, kept_skus: list[str]) -> None:
    """User edited the basket — record which items they kept."""
    execute(
        "UPDATE recommendedbasket SET status = 'modified' WHERE id = %s",
        (basket_id,),
    )
    from db.connection import fetchall
    all_items = fetchall(
        "SELECT id, sku FROM recommendedbasketitem WHERE basket_id = %s",
        (basket_id,),
    )
    for item in all_items:
        accepted = item["sku"] in kept_skus
        execute(
            """
            UPDATE recommendedbasketitem
            SET is_accepted = %s WHERE id = %s
            """,
            (accepted, item["id"]),
        )
