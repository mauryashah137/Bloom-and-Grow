"""
Cart Service — Full cart lifecycle with edge case handling.
"""
import logging, time
from typing import Optional

logger = logging.getLogger(__name__)

MAX_ITEM_QTY = 99
MAX_CART_ITEMS = 50


class CartService:
    def __init__(self, cart_manager, pricing_service=None):
        self._cart = cart_manager
        self._pricing = pricing_service

    async def get_cart(self, customer_id: str) -> dict:
        return await self._cart.get_or_create(customer_id)

    async def add_item(self, customer_id: str, product_id: str, qty: int = 1) -> dict:
        # Validate quantity
        if qty is None or qty <= 0:
            return {"error": "Quantity must be at least 1.", "success": False}
        if qty > MAX_ITEM_QTY:
            return {"error": f"Maximum quantity per item is {MAX_ITEM_QTY}.", "success": False}

        # Check cart size
        cart = await self._cart.get_or_create(customer_id)
        if len(cart.get("items", [])) >= MAX_CART_ITEMS:
            return {"error": f"Cart is full (max {MAX_CART_ITEMS} items). Please remove some items first.", "success": False}

        result = await self._cart.add_item(customer_id, product_id, qty)
        if result.get("error"):
            return result
        cart = result.get("cart", result)
        if self._pricing:
            cart = await self._pricing.compute_totals(cart)
        return {"success": True, "cart": cart, "added": result.get("added", "")}

    async def remove_item(self, customer_id: str, product_id: str) -> dict:
        # Check if item is actually in cart
        cart = await self._cart.get_or_create(customer_id)
        item_ids = [i["product_id"] for i in cart.get("items", [])]
        if product_id not in item_ids:
            return {"error": f"Product {product_id} is not in your cart.", "success": False}

        result = await self._cart.remove_item(customer_id, product_id)
        cart = result.get("cart", result)
        if self._pricing:
            cart = await self._pricing.compute_totals(cart)
        return {"success": True, "cart": cart}

    async def update_quantity(self, customer_id: str, product_id: str, qty: int) -> dict:
        if qty is not None and qty <= 0:
            return await self.remove_item(customer_id, product_id)
        if qty is not None and qty > MAX_ITEM_QTY:
            return {"error": f"Maximum quantity is {MAX_ITEM_QTY}.", "success": False}

        cart = await self._cart.get_or_create(customer_id)
        found = False
        for item in cart["items"]:
            if item["product_id"] == product_id:
                item["qty"] = qty
                found = True
                break
        if not found:
            return {"error": f"Product {product_id} not in cart."}
        cart["subtotal"] = sum(i["price"] * i["qty"] for i in cart["items"])
        cart["updated_at"] = time.time()
        await self._cart._save(customer_id, cart)
        if self._pricing:
            cart = await self._pricing.compute_totals(cart)
        return {"success": True, "cart": cart}

    async def apply_offer(self, customer_id: str, code: str, discount_pct: float) -> dict:
        # Validate discount range
        if discount_pct < 0 or discount_pct > 100:
            return {"error": "Invalid discount percentage.", "success": False}

        # Check if a different code is already applied
        cart = await self._cart.get_or_create(customer_id)
        if cart.get("offer_code") and cart["offer_code"] != code:
            old_code = cart["offer_code"]
            # Replace the old offer
            logger.info(f"Replacing offer {old_code} with {code}")

        await self._cart.apply_offer(customer_id, code, discount_pct)
        cart = await self._cart.get_or_create(customer_id)
        if self._pricing:
            cart = await self._pricing.compute_totals(cart)
        return {"success": True, "cart": cart}

    async def apply_discount_amount(self, customer_id: str, discount_pct: float, reason: str) -> dict:
        if discount_pct < 0 or discount_pct > 100:
            return {"error": "Invalid discount percentage.", "success": False}
        cart = await self._cart.get_or_create(customer_id)
        cart["discount_pct"] = min(discount_pct, 100)  # Cap at 100%
        cart["discount_reason"] = reason
        cart["offer_code"] = f"MANAGER-{int(discount_pct)}PCT"  # Replace any existing code
        cart["updated_at"] = time.time()
        await self._cart._save(customer_id, cart)
        if self._pricing:
            cart = await self._pricing.compute_totals(cart)
        return {"success": True, "cart": cart}

    async def remove_discount(self, customer_id: str) -> dict:
        """Remove any discount/offer from the cart."""
        cart = await self._cart.get_or_create(customer_id)
        old_code = cart.get("offer_code")
        old_pct = cart.get("discount_pct", 0)
        cart["discount_pct"] = 0
        cart["offer_code"] = None
        cart["discount_reason"] = None
        cart["updated_at"] = time.time()
        await self._cart._save(customer_id, cart)
        if self._pricing:
            cart = await self._pricing.compute_totals(cart)
        return {"success": True, "cart": cart, "removed_code": old_code, "removed_pct": old_pct}

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
