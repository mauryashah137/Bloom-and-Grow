"""
Catalog Service — Product catalog operations with search, filtering, and matching.
Wraps the catalog data layer and provides intelligent search.
"""
import logging
from typing import Optional

logger = logging.getLogger(__name__)


class CatalogService:
    def __init__(self, catalog):
        self._catalog = catalog

    async def search(self, query: str = None, category: str = None, limit: int = 10) -> list:
        return await self._catalog.search(query=query, category=category, limit=limit)

    async def get(self, product_id: str) -> Optional[dict]:
        return await self._catalog.get(product_id)

    async def get_by_ids(self, product_ids: list) -> list:
        """Get multiple products by ID list."""
        results = []
        for pid in product_ids:
            p = await self._catalog.get(pid)
            if p:
                results.append(p)
        return results

    async def find_complementary(self, product_id: str, limit: int = 3) -> list:
        """Find complementary products (e.g., soil + fertilizer + pot for a plant)."""
        product = await self._catalog.get(product_id)
        if not product:
            return []

        category = product.get("category", "")
        tags = product.get("tags", [])

        # Complementary mapping
        complement_map = {
            "plants": ["soil", "pots", "fertilizers", "accessories"],
            "soil": ["plants", "pots", "fertilizers"],
            "pots": ["plants", "soil"],
            "fertilizers": ["plants", "soil", "pest-control"],
            "tools": ["accessories"],
            "lighting": ["plants"],
            "pest-control": ["plants", "tools"],
        }

        target_categories = complement_map.get(category, [])
        results = []
        for cat in target_categories:
            items = await self._catalog.search(category=cat, limit=2)
            results.extend(items)

        # Deduplicate and limit
        seen = set()
        unique = []
        for item in results:
            if item["id"] not in seen and item["id"] != product_id:
                seen.add(item["id"])
                unique.append(item)
        return unique[:limit]

    async def find_similar(self, product_id: str, limit: int = 3) -> list:
        """Find similar products in the same category."""
        product = await self._catalog.get(product_id)
        if not product:
            return []

        results = await self._catalog.search(
            category=product["category"], limit=limit + 1
        )
        return [p for p in results if p["id"] != product_id][:limit]

    async def match_from_vision(self, candidates: list, limit: int = 5) -> list:
        """Match vision identification candidates to catalog products."""
        matches = []
        seen = set()
        for candidate in candidates:
            name = candidate.get("name", "")
            category = candidate.get("category", "")
            query = f"{name} {category}".strip()
            if query:
                items = await self._catalog.search(query=query, limit=3)
                for item in items:
                    if item["id"] not in seen:
                        seen.add(item["id"])
                        item["match_reason"] = f"Matched from identified: {name}"
                        matches.append(item)
        return matches[:limit]
