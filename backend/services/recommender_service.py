"""
Recommender Service — Deep personalization engine.
Combines current utterance, cart contents, visual identification,
customer profile, loyalty tier, prior purchases, support history,
budget, and skill level to produce ranked, explained recommendations.
"""
import logging
from typing import Optional

logger = logging.getLogger(__name__)


class RecommenderService:
    def __init__(self, catalog_service=None):
        self._catalog = catalog_service

    async def recommend(
        self,
        need: str = "",
        category: str = None,
        budget_max: float = None,
        skill_level: str = "beginner",
        customer_profile: dict = None,
        current_cart: dict = None,
        vision_result: dict = None,
        prior_purchases: list = None,
        support_history: list = None,
    ) -> dict:
        """
        Generate deeply personalized recommendations with explanations.
        """
        profile = customer_profile or {}
        prefs = profile.get("preferences", {})

        # Merge explicit params with profile preferences
        effective_skill = skill_level or prefs.get("skill_level", "beginner")
        effective_budget = budget_max or self._parse_budget(prefs.get("budget_range", "medium"))
        garden_type = prefs.get("garden_type", "indoor")
        loyalty_tier = profile.get("loyalty_tier", "Standard")

        # Build enriched search context
        search_need = self._enrich_need(
            need=need,
            vision_result=vision_result,
            garden_type=garden_type,
            skill_level=effective_skill,
        )

        # Get base results from catalog
        if not self._catalog:
            return {"products": [], "count": 0, "personalized_for": effective_skill}

        from catalog import PRODUCTS
        candidates = list(PRODUCTS)

        # Filter by category if specified
        if category:
            candidates = [p for p in candidates if p["category"] == category]

        # Filter by budget
        if effective_budget:
            candidates = [
                p for p in candidates
                if (p.get("sale_price") or p["price"]) <= effective_budget
            ]

        # Filter by skill level
        if effective_skill:
            candidates = [
                p for p in candidates
                if p.get("skill_level", "beginner") == effective_skill
                or effective_skill == "expert"
            ]

        # Score candidates
        scored = []
        for p in candidates:
            score, reasons = self._score_product(
                product=p,
                need=search_need,
                vision_result=vision_result,
                current_cart=current_cart,
                prior_purchases=prior_purchases,
                garden_type=garden_type,
                loyalty_tier=loyalty_tier,
            )
            scored.append((score, reasons, p))

        # Sort by score descending
        scored.sort(key=lambda x: -x[0])

        # Take top results and add recommendation reasons
        results = []
        for score, reasons, product in scored[:5]:
            rec = dict(product)
            rec["recommendation_reasons"] = reasons
            rec["relevance_score"] = round(score, 2)
            results.append(rec)

        # Add complementary suggestions if we have cart items
        complementary = []
        if current_cart and current_cart.get("items"):
            cart_product_ids = [i["product_id"] for i in current_cart["items"]]
            for pid in cart_product_ids[:2]:
                comps = await self._catalog.find_complementary(pid, limit=2)
                for c in comps:
                    if c["id"] not in [r["id"] for r in results] and c["id"] not in cart_product_ids:
                        c["recommendation_reasons"] = [f"Complements {pid} in your cart"]
                        complementary.append(c)

        return {
            "products": results,
            "complementary": complementary[:3],
            "count": len(results),
            "personalized_for": effective_skill,
            "context": {
                "skill_level": effective_skill,
                "budget_max": effective_budget,
                "garden_type": garden_type,
                "loyalty_tier": loyalty_tier,
                "vision_informed": vision_result is not None,
            },
        }

    def _score_product(
        self, product: dict, need: str,
        vision_result: dict, current_cart: dict,
        prior_purchases: list, garden_type: str,
        loyalty_tier: str,
    ) -> tuple:
        """Score a product and return (score, reasons)."""
        score = product.get("rating", 3.0)
        reasons = []

        tags = product.get("tags", [])
        name_lower = product.get("name", "").lower()
        desc_lower = product.get("description", "").lower()
        need_lower = need.lower() if need else ""

        # Text relevance
        if need_lower:
            for word in need_lower.split():
                if len(word) > 2:
                    if word in name_lower:
                        score += 3
                        reasons.append(f"Matches your search: '{word}'")
                    elif word in desc_lower:
                        score += 1.5
                    elif any(word in t for t in tags):
                        score += 2
                        reasons.append(f"Tagged: '{word}'")

        # Vision match
        if vision_result:
            candidates = vision_result.get("candidates", [])
            for c in candidates:
                cname = c.get("name", "").lower()
                if any(w in name_lower for w in cname.split() if len(w) > 3):
                    score += 4
                    reasons.append(f"Matches identified: {c.get('name')}")

        # Garden type match
        if garden_type == "indoor" and "indoor" in tags:
            score += 1.5
            reasons.append("Great for indoor gardens")
        elif garden_type == "outdoor" and "outdoor" in tags:
            score += 1.5

        # Already in cart — deprioritize
        if current_cart:
            cart_ids = [i["product_id"] for i in current_cart.get("items", [])]
            if product["id"] in cart_ids:
                score -= 5

        # On sale bonus
        if product.get("sale_price"):
            score += 1
            reasons.append("Currently on sale")

        # Beginner-friendly bonus
        if product.get("skill_level") == "beginner" and "beginner" in tags:
            score += 0.5
            reasons.append("Beginner-friendly")

        # Popular items
        reviews = product.get("review_count", 0)
        if reviews > 200:
            score += 0.5
            reasons.append(f"Popular ({reviews} reviews)")

        # Bundle value
        if product.get("category") == "bundles":
            score += 1
            reasons.append("Great value bundle")

        if not reasons:
            reasons.append("Highly rated in our catalog")

        return score, reasons[:3]

    def _enrich_need(self, need: str, vision_result: dict, garden_type: str, skill_level: str) -> str:
        """Enrich the search query with contextual info."""
        parts = [need] if need else []
        if vision_result:
            for c in vision_result.get("candidates", []):
                parts.append(c.get("name", ""))
        if garden_type:
            parts.append(garden_type)
        return " ".join(parts)

    def _parse_budget(self, budget_range: str) -> Optional[float]:
        budgets = {"low": 25.0, "medium": 60.0, "high": 150.0, "premium": 500.0}
        return budgets.get(budget_range)
