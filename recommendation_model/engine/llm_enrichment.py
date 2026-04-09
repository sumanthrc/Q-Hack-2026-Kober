"""
engine/llm_enrichment.py

Takes the structured output from the rule engine and sends it
to Claude to generate:
  - A natural language basket_summary for the customer
  - Enriched reason strings where the rule-based ones are generic

This is intentionally the LAST step — the rule engine always
runs first.  The LLM only adds polish, never changes the SKUs.
"""

import json
import os
from engine.rules import RecommendationResult, RecommendedItem
from db.connection import fetchone, fetchall


def _build_prompt(
    customer: dict,
    items: list[RecommendedItem],
    articles: dict[str, dict],
) -> str:
    rule_descriptions = {
        "frequent": "bought regularly across many orders",
        "cycle":    "periodic purchase that is due for replenishment",
        "drift":    "newly adopted item, appearing in recent orders only",
        "browse":   "viewed or added to cart but never purchased",
        "popular":  "popular in a category the customer likes, never bought",
    }

    item_lines = []
    for i in items:
        name = articles.get(i.sku, {}).get("name", i.sku)
        rule_desc = rule_descriptions.get(i.rule_triggered, i.rule_triggered)
        item_lines.append(
            f"  - SKU: {i.sku} | Product: {name} (x{i.quantity})\n"
            f"    Signal: {rule_desc} (confidence: {i.confidence:.0%})\n"
            f"    Engine reason: {i.reason}"
        )

    return f"""You are a friendly grocery assistant for {customer['name']}.

Items to recommend:
{chr(10).join(item_lines)}

Respond ONLY with valid JSON, no markdown, no extra text:
{{
  "basket_summary": "Running low on oat milk again, are we?",
  "enriched_reasons": {{
    "SKU001": "punchy 5-8 word reason",
    "SKU002": "punchy 5-8 word reason"
  }}
}}

Rules:
- basket_summary: exactly 1 cheeky, witty sentence that teases them about a specific item or habit (e.g. "Running low on oat milk again, are we?"). Poke fun at the groceries or the pattern — NOT at the person. Never say they're predictable, never compliment them. No jargon, no flattery.
- enriched_reasons: one entry per SKU below, max 8 words each, use "you".
- Include ALL SKUs: {", ".join(i.sku for i in items)}
"""


def enrich_with_llm(
    result: RecommendationResult,
    customer_id: str,
) -> tuple[str, dict[str, str]]:
    """
    Calls the Gemini API and returns:
      - basket_summary: str
      - enriched_reasons: dict[sku -> improved_reason]

    Falls back gracefully if the API call fails.
    """
    try:
        import google.generativeai as genai
    except ImportError:
        return _fallback_summary(result), {}

    customer = fetchone(
        """SELECT name, household_size, dietary_preference,
                  price_sensitivity
           FROM customer WHERE id = %s""",
        (customer_id,),
    )
    if not customer:
        return _fallback_summary(result), {}

    # Fetch article names for the prompt
    skus = [i.sku for i in result.items]
    if not skus:
        return "Your basket is empty this week.", {}

    article_rows = fetchall(
        "SELECT sku, name FROM article WHERE sku = ANY(%s)",
        (skus,),
    )
    articles = {r["sku"]: r for r in article_rows}

    prompt = _build_prompt(customer, result.items, articles)

    try:
        # Configure the Gemini API with your key
        genai.configure(api_key=os.getenv("GEMINI_API_KEY"))
        
        # gemini-1.5-flash is ideal here: highly capable for JSON formatting and very fast
        model = genai.GenerativeModel("gemmini-2.5-pro")
        
        response = model.generate_content(
            prompt,
            generation_config=genai.GenerationConfig(
                max_output_tokens=2048,
            )
        )

        raw = response.text.strip()
        if "```" in raw:
            raw = raw.split("```")[1]
            if raw.lower().startswith("json"):
                raw = raw[4:]
            raw = raw.strip()
        parsed = json.loads(raw)
        
        return (
            parsed.get("basket_summary", _fallback_summary(result)),
            parsed.get("enriched_reasons", {}),
        )
    except Exception as e:
        raw_preview = raw[:300] if 'raw' in dir() else '<no response>'
        print(f"[LLM enrichment] Failed: {e}\nRaw response preview: {raw_preview}")
        return _fallback_summary(result), {}


def suggest_substitutes(
    out_of_stock_items: list[RecommendedItem],
    fc_id: str,
    customer: dict,
) -> dict[str, dict]:
    """
    For each out-of-stock item, finds in-stock candidates from the same
    subcategory and asks the LLM to pick the best substitute with a reason.

    Returns:
        dict[sku -> {"substitute_sku": str, "substitute_name": str,
                     "substitute_price": float, "suggestion": str}]
    """
    try:
        import google.generativeai as genai
    except ImportError:
        return {}

    if not out_of_stock_items:
        return {}

    result = {}

    for item in out_of_stock_items:
        # Fetch the out-of-stock article's details
        oos_article = fetchone(
            "SELECT sku, name, category, subcategory, price FROM article WHERE sku = %s",
            (item.sku,),
        )
        if not oos_article:
            continue

        # Find in-stock alternatives: same subcategory first, then same category
        candidates = fetchall(
            """
            SELECT a.sku, a.name, a.subcategory, a.price, a.nutriscore,
                   a.is_biological, a.carbon_footprint
            FROM article a
            JOIN stock s ON s.sku = a.sku
            WHERE s.fc_id = %s
              AND s.quantity > 5
              AND s.is_marked_imperfect = FALSE
              AND a.sku != %s
              AND (a.subcategory = %s OR a.category = %s)
              AND a.is_available = TRUE
            ORDER BY (a.subcategory = %s) DESC, a.popularity_score DESC
            LIMIT 5
            """,
            (fc_id, item.sku,
             oos_article["subcategory"], oos_article["category"],
             oos_article["subcategory"]),
        )

        if not candidates:
            continue

        candidate_lines = "\n".join(
            f"  - SKU: {c['sku']} | {c['name']} | €{c['price']:.2f} "
            f"| Nutriscore {c['nutriscore']} | Bio: {c['is_biological']}"
            for c in candidates
        )

        prompt = f"""You are a grocery assistant. A product is out of stock and you must pick the best substitute.

Out of stock: {oos_article['name']} (€{oos_article['price']:.2f})
Customer dietary preference: {customer.get('dietary_preference') or 'None'}
Customer price sensitivity: {customer.get('price_sensitivity') or 'Medium'}

Alternatives in stock:
{candidate_lines}

Pick the single best substitute SKU for this customer based on similarity, diet, and price.

Respond ONLY with valid JSON, no markdown, no explanation:
{{"substitute_sku": "SKUxx"}}
"""

        try:
            genai.configure(api_key=os.getenv("GEMINI_API_KEY"))
            model = genai.GenerativeModel("gemma-3-1b-it")
            response = model.generate_content(
                prompt,
                generation_config=genai.GenerationConfig(
                    max_output_tokens=500,
                ),
            )
            raw = response.text.strip()
            # Strip markdown fences: ```json ... ``` or ``` ... ```
            if "```" in raw:
                raw = raw.split("```")[1]           # content between first pair of fences
                if raw.lower().startswith("json"):
                    raw = raw[4:]
                raw = raw.strip()
            if not raw:
                raise ValueError("Empty response from model")
            parsed = json.loads(raw)
            sub_sku = parsed.get("substitute_sku")

            # Look up the substitute article details
            sub_article = next(
                (c for c in candidates if c["sku"] == sub_sku), None
            )
            if not sub_article:
                continue

            result[item.sku] = {
                "substitute_sku":   sub_sku,
                "substitute_name":  sub_article["name"],
                "substitute_price": float(sub_article["price"]),
                "suggestion": (
                    f"{oos_article['name']} is currently out of stock. "
                    f"Would you like to try {sub_article['name']} instead?"
                ),
            }

        except Exception as e:
            print(f"[LLM substitute] Failed for {item.sku}: {e}")
            # Fallback: just pick the top candidate without LLM reasoning
            top = candidates[0]
            result[item.sku] = {
                "substitute_sku":   top["sku"],
                "substitute_name":  top["name"],
                "substitute_price": float(top["price"]),
                "suggestion": (
                    f"{oos_article['name']} is currently out of stock. "
                    f"Would you like to try {top['name']} instead?"
                ),
            }

    return result


def _fallback_summary(result: RecommendationResult) -> str:
    n = len(result.items)
    return (
        f"We've prepared a basket of {n} items based on "
        f"your shopping history. Review and confirm below."
    )
