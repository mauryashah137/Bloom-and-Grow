"""
Offer Service — Promo code validation with full edge case handling.
"""
import logging, time
from datetime import datetime
from typing import Optional

logger = logging.getLogger(__name__)

ACTIVE_OFFERS = {
    "WELCOME10": {
        "discount_pct": 10, "description": "10% welcome discount for new customers",
        "min_order": 0, "valid_tiers": ["Standard", "Silver", "Gold", "Platinum"],
        "max_uses": 1, "expires_at": "2026-12-31", "stackable": False,
    },
    "GOLD15": {
        "discount_pct": 15, "description": "Exclusive 15% off for Gold+ members",
        "min_order": 25, "valid_tiers": ["Gold", "Platinum"],
        "max_uses": 3, "expires_at": "2026-06-30", "stackable": False,
    },
    "SPRING20": {
        "discount_pct": 20, "description": "Spring Sale — 20% off everything",
        "min_order": 50, "valid_tiers": ["Standard", "Silver", "Gold", "Platinum"],
        "max_uses": 1, "expires_at": "2026-04-30", "stackable": False,
    },
    "GREENUP": {
        "discount_pct": 5, "description": "5% loyalty reward",
        "min_order": 0, "valid_tiers": ["Standard", "Silver", "Gold", "Platinum"],
        "max_uses": 5, "expires_at": "2026-12-31", "stackable": True,
    },
    "BLOOM30": {
        "discount_pct": 30, "description": "Platinum exclusive — 30% off",
        "min_order": 100, "valid_tiers": ["Platinum"],
        "max_uses": 1, "expires_at": "2026-12-31", "stackable": False,
    },
}

_USAGE: dict = {}


class OfferService:
    def __init__(self, cart_service=None, policy_service=None):
        self._cart = cart_service
        self._policy = policy_service

    async def validate_and_apply(
        self, code: str, customer_id: str,
        customer_tier: str = "Standard", cart_subtotal: float = 0,
    ) -> dict:
        if not code or not code.strip():
            return {"success": False, "error": "Please provide a promo code."}

        code = code.strip().upper()
        offer = ACTIVE_OFFERS.get(code)

        if not offer:
            suggestion = self._suggest_alternative(customer_tier)
            return {
                "success": False,
                "error": f"Code '{code}' is not valid or has expired.",
                "suggestion": suggestion,
            }

        # Check expiry
        try:
            expiry = datetime.strptime(offer["expires_at"], "%Y-%m-%d")
            if datetime.now() > expiry:
                return {"success": False, "error": f"Code '{code}' has expired."}
        except (ValueError, KeyError):
            pass

        # Check tier
        if customer_tier not in offer["valid_tiers"]:
            return {
                "success": False,
                "error": f"Code '{code}' is not available for {customer_tier} members.",
                "available_for": offer["valid_tiers"],
            }

        # Check minimum order
        if cart_subtotal < offer["min_order"]:
            return {
                "success": False,
                "error": f"Minimum order of ${offer['min_order']:.2f} required for '{code}'. Your cart is ${cart_subtotal:.2f}.",
            }

        # Check usage
        usage_key = f"{customer_id}:{code}"
        uses = _USAGE.get(usage_key, 0)
        if uses >= offer["max_uses"]:
            return {"success": False, "error": f"Code '{code}' has already been used the maximum number of times ({offer['max_uses']})."}

        # Check stacking
        if not offer.get("stackable") and self._cart:
            cart = await self._cart.get_cart(customer_id)
            existing_code = cart.get("offer_code")
            if existing_code and existing_code != code:
                existing_offer = ACTIVE_OFFERS.get(existing_code, {})
                if not existing_offer.get("stackable"):
                    return {
                        "success": False,
                        "error": f"You already have code '{existing_code}' applied. Remove it first or use a stackable code.",
                        "current_code": existing_code,
                    }

        # Apply
        _USAGE[usage_key] = uses + 1
        if self._cart:
            await self._cart.apply_offer(customer_id, code, offer["discount_pct"])

        return {
            "success": True, "code": code,
            "discount_pct": offer["discount_pct"],
            "description": offer["description"],
            "applied_at": time.time(),
        }

    async def get_available_offers(self, customer_tier: str = "Standard") -> list:
        available = []
        now = datetime.now()
        for code, offer in ACTIVE_OFFERS.items():
            if customer_tier in offer["valid_tiers"]:
                try:
                    expiry = datetime.strptime(offer["expires_at"], "%Y-%m-%d")
                    if now > expiry:
                        continue
                except (ValueError, KeyError):
                    pass
                available.append({
                    "code": code, "discount_pct": offer["discount_pct"],
                    "description": offer["description"], "min_order": offer["min_order"],
                })
        return available

    def _suggest_alternative(self, tier: str) -> Optional[str]:
        for code, offer in ACTIVE_OFFERS.items():
            if tier in offer["valid_tiers"]:
                return f"Try code {code} for {offer['discount_pct']}% off!"
        return None
