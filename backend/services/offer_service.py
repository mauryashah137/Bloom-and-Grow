"""
Offer Service — Promo code validation, loyalty rewards, and offer application.
Consults policy service for tier-based discount limits.
"""
import logging, time
from typing import Optional

logger = logging.getLogger(__name__)

# Active promotional offers
ACTIVE_OFFERS = {
    "WELCOME10": {
        "discount_pct": 10,
        "description": "10% welcome discount for new customers",
        "min_order": 0,
        "valid_tiers": ["Standard", "Silver", "Gold", "Platinum"],
        "max_uses": 1,
        "expires_at": "2026-12-31",
        "stackable": False,
    },
    "GOLD15": {
        "discount_pct": 15,
        "description": "Exclusive 15% off for Gold+ members",
        "min_order": 25,
        "valid_tiers": ["Gold", "Platinum"],
        "max_uses": 3,
        "expires_at": "2026-06-30",
        "stackable": False,
    },
    "SPRING20": {
        "discount_pct": 20,
        "description": "Spring Sale — 20% off everything",
        "min_order": 50,
        "valid_tiers": ["Standard", "Silver", "Gold", "Platinum"],
        "max_uses": 1,
        "expires_at": "2026-04-30",
        "stackable": False,
    },
    "GREENUP": {
        "discount_pct": 5,
        "description": "5% loyalty reward",
        "min_order": 0,
        "valid_tiers": ["Standard", "Silver", "Gold", "Platinum"],
        "max_uses": 5,
        "expires_at": "2026-12-31",
        "stackable": True,
    },
    "BLOOM30": {
        "discount_pct": 30,
        "description": "Platinum exclusive — 30% off",
        "min_order": 100,
        "valid_tiers": ["Platinum"],
        "max_uses": 1,
        "expires_at": "2026-12-31",
        "stackable": False,
    },
}

# Track usage per customer
_USAGE: dict = {}


class OfferService:
    def __init__(self, cart_service=None, policy_service=None):
        self._cart = cart_service
        self._policy = policy_service

    async def validate_and_apply(
        self,
        code: str,
        customer_id: str,
        customer_tier: str = "Standard",
        cart_subtotal: float = 0,
    ) -> dict:
        """Validate a promo code and apply it if valid."""
        code = code.strip().upper()
        offer = ACTIVE_OFFERS.get(code)

        if not offer:
            return {
                "success": False,
                "error": f"Code '{code}' is not valid or has expired.",
                "suggestion": self._suggest_alternative(customer_tier),
            }

        # Check tier eligibility
        if customer_tier not in offer["valid_tiers"]:
            return {
                "success": False,
                "error": f"Code '{code}' is not available for {customer_tier} members.",
                "required_tier": offer["valid_tiers"][0],
            }

        # Check minimum order
        if cart_subtotal < offer["min_order"]:
            return {
                "success": False,
                "error": f"Minimum order of ${offer['min_order']:.2f} required for code '{code}'.",
                "min_order": offer["min_order"],
            }

        # Check usage
        usage_key = f"{customer_id}:{code}"
        uses = _USAGE.get(usage_key, 0)
        if uses >= offer["max_uses"]:
            return {
                "success": False,
                "error": f"Code '{code}' has already been used the maximum number of times.",
            }

        # Apply the offer
        _USAGE[usage_key] = uses + 1

        if self._cart:
            await self._cart.apply_offer(customer_id, code, offer["discount_pct"])

        return {
            "success": True,
            "code": code,
            "discount_pct": offer["discount_pct"],
            "description": offer["description"],
            "applied_at": time.time(),
        }

    async def get_available_offers(self, customer_tier: str = "Standard") -> list:
        """Get all offers available for a given loyalty tier."""
        available = []
        for code, offer in ACTIVE_OFFERS.items():
            if customer_tier in offer["valid_tiers"]:
                available.append({
                    "code": code,
                    "discount_pct": offer["discount_pct"],
                    "description": offer["description"],
                    "min_order": offer["min_order"],
                })
        return available

    def _suggest_alternative(self, tier: str) -> Optional[str]:
        """Suggest a valid offer for the customer's tier."""
        for code, offer in ACTIVE_OFFERS.items():
            if tier in offer["valid_tiers"]:
                return f"Try code {code} for {offer['discount_pct']}% off!"
        return None
