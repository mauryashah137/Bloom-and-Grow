"""
Policy Service — Business rules engine.
Centralizes all policy decisions: discount limits, refund eligibility,
escalation thresholds, service booking eligibility, loyalty offer rules.
"""
import logging, time

logger = logging.getLogger(__name__)

# Tier-based policies
TIER_POLICIES = {
    "Standard": {
        "autonomous_discount_limit": 5,
        "goodwill_credit_limit": 10.00,
        "refund_window_days": 30,
        "free_consultation": False,
        "priority_support": False,
        "loyalty_multiplier": 1.0,
    },
    "Silver": {
        "autonomous_discount_limit": 8,
        "goodwill_credit_limit": 15.00,
        "refund_window_days": 45,
        "free_consultation": False,
        "priority_support": False,
        "loyalty_multiplier": 1.25,
    },
    "Gold": {
        "autonomous_discount_limit": 10,
        "goodwill_credit_limit": 25.00,
        "refund_window_days": 60,
        "free_consultation": True,
        "priority_support": True,
        "loyalty_multiplier": 1.5,
    },
    "Platinum": {
        "autonomous_discount_limit": 15,
        "goodwill_credit_limit": 50.00,
        "refund_window_days": 90,
        "free_consultation": True,
        "priority_support": True,
        "loyalty_multiplier": 2.0,
    },
}

# Refund policies
REFUND_POLICIES = {
    "full_refund_reasons": [
        "defective", "damaged", "wrong_item", "not_as_described",
    ],
    "partial_refund_reasons": [
        "changed_mind", "found_cheaper", "no_longer_needed",
    ],
    "no_refund_reasons": [
        "final_sale", "opened_consumable", "past_window",
    ],
    "restocking_fee_pct": 15,
}

# Escalation thresholds
ESCALATION_RULES = {
    "auto_escalate_sentiment": "frustrated",
    "auto_escalate_after_failed_tools": 3,
    "auto_escalate_refund_above": 100.00,
    "auto_escalate_discount_above_autonomous": True,
}


class PolicyService:
    def get_autonomous_discount_limit(self, tier: str) -> float:
        """Max discount % the agent can apply without manager approval."""
        policy = TIER_POLICIES.get(tier, TIER_POLICIES["Standard"])
        return policy["autonomous_discount_limit"]

    def get_goodwill_credit_limit(self, tier: str) -> float:
        """Max goodwill credit the agent can issue autonomously."""
        policy = TIER_POLICIES.get(tier, TIER_POLICIES["Standard"])
        return policy["goodwill_credit_limit"]

    def check_refund_eligibility(
        self,
        order: dict,
        reason: str,
        customer_tier: str = "Standard",
    ) -> dict:
        """Check if a refund is eligible based on policy."""
        policy = TIER_POLICIES.get(customer_tier, TIER_POLICIES["Standard"])
        window_days = policy["refund_window_days"]

        # Check time window
        placed_at = order.get("placed_at")
        if isinstance(placed_at, str):
            # Skip time check for string dates
            within_window = True
        elif placed_at:
            days_since = (time.time() - placed_at) / 86400
            within_window = days_since <= window_days
        else:
            within_window = True

        reason_lower = reason.lower()

        # Check reason category
        if any(r in reason_lower for r in REFUND_POLICIES["full_refund_reasons"]):
            refund_type = "full"
            eligible = within_window
            restocking_fee = 0
        elif any(r in reason_lower for r in REFUND_POLICIES["partial_refund_reasons"]):
            refund_type = "partial"
            eligible = within_window
            restocking_fee = REFUND_POLICIES["restocking_fee_pct"]
        elif any(r in reason_lower for r in REFUND_POLICIES["no_refund_reasons"]):
            refund_type = "none"
            eligible = False
            restocking_fee = 0
        else:
            # Default: allow with restocking fee
            refund_type = "partial"
            eligible = within_window
            restocking_fee = REFUND_POLICIES["restocking_fee_pct"]

        return {
            "eligible": eligible,
            "refund_type": refund_type,
            "within_window": within_window,
            "window_days": window_days,
            "restocking_fee_pct": restocking_fee,
            "needs_manager_approval": not eligible or (order.get("total", 0) > ESCALATION_RULES["auto_escalate_refund_above"]),
        }

    def should_escalate(
        self,
        sentiment: str = "neutral",
        failed_tool_count: int = 0,
        refund_amount: float = 0,
        discount_pct: float = 0,
        customer_tier: str = "Standard",
    ) -> dict:
        """Determine if the situation should be escalated."""
        reasons = []

        if sentiment == ESCALATION_RULES["auto_escalate_sentiment"]:
            reasons.append("Customer sentiment is frustrated")

        if failed_tool_count >= ESCALATION_RULES["auto_escalate_after_failed_tools"]:
            reasons.append(f"Multiple tool failures ({failed_tool_count})")

        if refund_amount > ESCALATION_RULES["auto_escalate_refund_above"]:
            reasons.append(f"Refund amount (${refund_amount:.2f}) exceeds auto-approval limit")

        auto_limit = self.get_autonomous_discount_limit(customer_tier)
        if discount_pct > auto_limit:
            reasons.append(f"Discount ({discount_pct}%) exceeds {customer_tier} autonomous limit ({auto_limit}%)")

        return {
            "should_escalate": len(reasons) > 0,
            "reasons": reasons,
        }

    def get_tier_benefits(self, tier: str) -> dict:
        """Get all benefits for a tier."""
        return TIER_POLICIES.get(tier, TIER_POLICIES["Standard"])

    def check_service_eligibility(self, service_type: str, customer_tier: str) -> dict:
        """Check if customer is eligible for a service."""
        policy = TIER_POLICIES.get(customer_tier, TIER_POLICIES["Standard"])

        if service_type == "consultation" and policy["free_consultation"]:
            return {"eligible": True, "price": 0, "reason": f"Free for {customer_tier} members"}

        return {"eligible": True, "price": None, "reason": "Standard pricing applies"}
