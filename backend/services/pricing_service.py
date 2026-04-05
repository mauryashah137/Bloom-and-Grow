"""
Pricing Service — Tax calculation, delivery fees, and total computation.
"""
import logging

logger = logging.getLogger(__name__)

TAX_RATE = 0.084  # 8.4% default tax rate
DELIVERY_FEE = 8.99
FREE_SHIPPING_THRESHOLD = 75.00


class PricingService:
    async def compute_totals(self, cart: dict) -> dict:
        """Compute all pricing fields for a cart."""
        items = cart.get("items", [])
        subtotal = sum(i["price"] * i["qty"] for i in items)

        # Empty cart = everything zero
        if not items or subtotal == 0:
            cart["subtotal"] = 0
            cart["discount_amount"] = 0
            cart["tax"] = 0
            cart["shipping"] = 0
            cart["total"] = 0
            cart["free_shipping_eligible"] = False
            return cart

        discount_pct = min(max(cart.get("discount_pct", 0), 0), 100)
        discount_amount = round(subtotal * discount_pct / 100, 2)

        taxable = max(subtotal - discount_amount, 0)
        tax = round(taxable * TAX_RATE, 2)

        # Free shipping over threshold, or pickup
        shipping = 0 if subtotal >= FREE_SHIPPING_THRESHOLD else DELIVERY_FEE
        if cart.get("shipping_method") == "pickup":
            shipping = 0

        total = round(taxable + tax + shipping, 2)

        cart["subtotal"] = round(subtotal, 2)
        cart["discount_amount"] = discount_amount
        cart["tax"] = tax
        cart["shipping"] = shipping
        cart["total"] = total
        cart["free_shipping_eligible"] = subtotal >= FREE_SHIPPING_THRESHOLD

        return cart

    async def compute_order_totals(
        self,
        subtotal: float,
        discount_pct: float = 0,
        shipping_method: str = "pickup",
    ) -> dict:
        """Compute order totals for checkout."""
        discount_amount = round(subtotal * discount_pct / 100, 2)
        taxable = subtotal - discount_amount
        tax = round(taxable * TAX_RATE, 2)

        shipping = 0
        if shipping_method == "delivery":
            shipping = 0 if subtotal >= FREE_SHIPPING_THRESHOLD else DELIVERY_FEE

        total = round(taxable + tax + shipping, 2)

        return {
            "subtotal": round(subtotal, 2),
            "discount_pct": discount_pct,
            "discount_amount": discount_amount,
            "tax": tax,
            "tax_rate": TAX_RATE,
            "shipping": shipping,
            "shipping_method": shipping_method,
            "total": total,
            "free_shipping_eligible": subtotal >= FREE_SHIPPING_THRESHOLD,
        }
