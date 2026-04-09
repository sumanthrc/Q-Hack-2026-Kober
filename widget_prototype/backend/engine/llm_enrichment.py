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
    item_lines = "\n".join(
        f"  - {articles.get(i.sku, {}).get('name', i.sku)} "
        f"(x{i.quantity}) — rule: {i.rule_triggered}, "
        f"reason: {i.reason}"
        for i in items
    )

    return f"""You are a friendly grocery assistant for Picnic,
an online supermarket that delivers to your door.

A recommendation engine has prepared the following basket for
a customer. Your job is to:
1. Write a short, warm basket_summary (2-3 sentences max)
   that feels personal, not algorithmic.
2. For items where the reason is generic, write a better one.
   Keep reasons under 12 words.

Customer profile:
- Name: {customer['name']}
- Household size: {customer['household_size']}
- Dietary preference: {customer['dietary_preference'] or 'None'}
- Price sensitivity: {customer['price_sensitivity'] or 'Medium'}

Recommended basket:
{item_lines}

Respond ONLY with valid JSON. No markdown, no preamble.
Format:
{{
  "basket_summary": "...",
  "enriched_reasons": {{
    "SKU001": "short improved reason",
    "SKU002": "short improved reason"
  }}
}}

Only include SKUs in enriched_reasons where you can genuinely
improve on the existing reason.  Leave others out.
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
        model = genai.GenerativeModel("gemini-1.5-flash")
        
        response = model.generate_content(
            prompt,
            generation_config=genai.GenerationConfig(
                max_output_tokens=600,
                response_mime_type="application/json" # Forces valid JSON output
            )
        )
        
        # Since we enforced application/json, we can skip the markdown stripping logic
        raw = response.text.strip()
        parsed = json.loads(raw)
        
        return (
            parsed.get("basket_summary", _fallback_summary(result)),
            parsed.get("enriched_reasons", {}),
        )
    except Exception as e:
        print(f"[LLM enrichment] Failed: {e}")
        return _fallback_summary(result), {}


def _fallback_summary(result: RecommendationResult) -> str:
    n = len(result.items)
    return (
        f"We've prepared a basket of {n} items based on "
        f"your shopping history. Review and confirm below."
    )
