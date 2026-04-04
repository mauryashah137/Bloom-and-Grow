"""
Cart Service — Full cart lifecycle management.
Handles add, remove, update quantity, apply offers, clear, and pricing.
"""
import logging, time
from typing import Optional

logger = logging.getLogger(__name__)


class CartService:
    def __init__(self, cart_manager, pricing_service=None):
        self._cart = cart_manager
        self._pricing = pricing_service

    async def get_cart(self, customer_id: str) -> dict:
        return await self._cart.get_or_create(customer_id)

    async def add_item(self, customer_id: str, product_id: str, qty: int = 1) -> dict:
        result = await self._cart.add_item(customer_id, product_id, qty)
        if result.get("error"):
            return result
        cart = result.get("cart", result)
        if self._pricing:
            cart = await self._pricing.compute_totals(cart)
        return {"success": True, "cart": cart, "added": result.get("added", "")}

    async def remove_item(self, customer_id: str, product_id: str) -> dict:
        result = await self._cart.remove_item(customer_id, product_id)
        cart = result.get("cart", result)
        if self._pricing:
            cart = await self._pricing.compute_totals(cart)
        return {"success": True, "cart": cart}

    async def update_quantity(self, customer_id: str, product_id: str, qty: int) -> dict:
        cart = await self._cart.get_or_create(customer_id)
        found = False
        for item in cart["items"]:
            if item["product_id"] == product_id:
                if qty <= 0:
                    return await self.remove_item(customer_id, product_id)
                item["qty"] = qty
                found = True
                break
        if not found:
            return {"error": f"Product {product_id} not in cart"}
        cart["subtotal"] = sum(i["price"] * i["qty"] for i in cart["items"])
        cart["updated_at"] = time.time()
        await self._cart._save(customer_id, cart)
        if self._pricing:
            cart = await self._pricing.compute_totals(cart)
        return {"success": True, "cart": cart}

    async def apply_offer(self, customer_id: str, code: str, discount_pct: float) -> dict:
        await self._cart.apply_offer(customer_id, code, discount_pct)
        cart = await self._cart.get_or_create(customer_id)
        if self._pricing:
            cart = await self._pricing.compute_totals(cart)
        return {"success": True, "cart": cart}

    async def apply_discount_amount(self, customer_id: str, discount_pct: float, reason: str) -> dict:
        """Apply a resolved discount (from approval) directly."""
        cart = await self._cart.get_or_create(customer_id)
        cart["discount_pct"] = discount_pct
        cart["discount_reason"] = reason
        cart["updated_at"] = time.time()
        await self._cart._save(customer_id, cart)
        if self._pricing:
            cart = await self._pricing.compute_totals(cart)
        return {"success": True, "cart": cart}

    async def clear_cart(self, customer_id: str) -> dict:
        cart = await self._cart.get_or_create(customer_id)
        cart["items"] = []
        cart["subtotal"] = 0.0
        cart["discount_pct"] = 0
        cart["offer_code"] = None
        cart["updated_at"] = time.time()
        await self._cart._save(customer_id, cart)
        return {"success": True, "cart": cart}

    async def get_cart_summary(self, customer_id: str) -> dict:
        """Get a summary suitable for agent context."""
        cart = await self._cart.get_or_create(customer_id)
        return {
            "item_count": len(cart.get("items", [])),
            "items": [
                {"name": i["name"], "qty": i["qty"], "price": i["price"]}
                for i in cart.get("items", [])
            ],
            "subtotal": cart.get("subtotal", 0),
            "discount_pct": cart.get("discount_pct", 0),
            "offer_code": cart.get("offer_code"),
        }
