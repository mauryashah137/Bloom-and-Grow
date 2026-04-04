"""
Handoff Service — Real human escalation with full context preservation.
Preserves transcript, identified products, cart, recommendations,
refund/discount state, and generates a concise human summary.
"""
import logging, time, uuid
from typing import Optional

logger = logging.getLogger(__name__)

try:
    from google.cloud import firestore
    _db = firestore.AsyncClient()
    USE_FS = True
except:
    _db = None
    USE_FS = False

_MEMORY: dict = {}

# Specialist queue simulation (in production: real queue system)
_QUEUE_POSITIONS = {"general": 2, "garden_expert": 3, "sales": 1, "returns": 2}


class HandoffService:
    def __init__(self, session_store=None):
        self._session_store = session_store

    async def create_handoff(
        self,
        session_id: str,
        customer_id: str,
        reason: str,
        priority: str = "normal",
        specialist_type: str = "general",
        cart: dict = None,
        recommendations: list = None,
        vision_results: list = None,
        discount_state: dict = None,
    ) -> dict:
        """Create a full handoff record with all context."""
        handoff_id = f"ESC-{uuid.uuid4().hex[:6].upper()}"

        # Gather session context
        session_context = {}
        if self._session_store:
            session = await self._session_store.get_session(session_id)
            if session:
                session_context = {
                    "transcript": session.get("transcript", []),
                    "tool_calls": session.get("tool_calls", []),
                    "sentiment_timeline": session.get("sentiment_timeline", []),
                    "mode": session.get("mode", "unknown"),
                    "started_at": session.get("started_at"),
                    "journey_events": session.get("journey_events", []),
                }

        # Generate human-readable summary
        summary = self._generate_summary(
            reason=reason,
            session_context=session_context,
            cart=cart,
            recommendations=recommendations,
            vision_results=vision_results,
            discount_state=discount_state,
        )

        # Calculate queue estimate
        base_wait = _QUEUE_POSITIONS.get(specialist_type, 3)
        is_urgent = priority == "urgent"
        queue_position = 1 if is_urgent else base_wait
        estimated_wait = queue_position * 2  # ~2 min per position

        handoff = {
            "handoff_id": handoff_id,
            "session_id": session_id,
            "customer_id": customer_id,
            "reason": reason,
            "priority": priority,
            "specialist_type": specialist_type,
            "status": "queued",
            "queue_position": queue_position,
            "estimated_wait_minutes": estimated_wait,
            "summary": summary,
            "context": {
                "cart": cart,
                "recommendations": recommendations,
                "vision_results": vision_results,
                "discount_state": discount_state,
                "transcript_length": len(session_context.get("transcript", [])),
                "tools_used": list(set(
                    tc.get("tool", "") for tc in session_context.get("tool_calls", [])
                )),
            },
            "session_context": session_context,
            "created_at": time.time(),
            "assigned_to": None,
        }

        await self._save(handoff_id, handoff)

        # Record handoff event in session
        if self._session_store:
            await self._session_store.append_event(session_id, "handoff", {
                "handoff_id": handoff_id,
                "specialist_type": specialist_type,
                "priority": priority,
                "reason": reason,
            })

        return {
            "success": True,
            "handoff_id": handoff_id,
            "queue_position": queue_position,
            "estimated_wait_minutes": estimated_wait,
            "specialist_type": specialist_type,
            "priority": priority,
            "reason": reason,
            "summary_generated": True,
        }

    async def assign_handoff(self, handoff_id: str, agent_name: str) -> dict:
        """Assign a handoff to a human agent."""
        handoff = _MEMORY.get(f"handoff:{handoff_id}")
        if not handoff:
            return {"error": "Handoff not found"}
        handoff["status"] = "assigned"
        handoff["assigned_to"] = agent_name
        handoff["assigned_at"] = time.time()
        await self._save(handoff_id, handoff)
        return {"success": True, "handoff_id": handoff_id, "assigned_to": agent_name}

    async def resolve_handoff(self, handoff_id: str, resolution: str) -> dict:
        """Mark a handoff as resolved."""
        handoff = _MEMORY.get(f"handoff:{handoff_id}")
        if not handoff:
            return {"error": "Handoff not found"}
        handoff["status"] = "resolved"
        handoff["resolution"] = resolution
        handoff["resolved_at"] = time.time()
        await self._save(handoff_id, handoff)
        return {"success": True, "handoff_id": handoff_id}

    async def get_handoff(self, handoff_id: str) -> Optional[dict]:
        return _MEMORY.get(f"handoff:{handoff_id}")

    async def list_active_handoffs(self) -> list:
        return [
            v for k, v in _MEMORY.items()
            if k.startswith("handoff:") and v.get("status") in ("queued", "assigned")
        ]

    def _generate_summary(
        self, reason: str, session_context: dict,
        cart: dict, recommendations: list,
        vision_results: list, discount_state: dict,
    ) -> str:
        """Generate a concise summary for the human agent."""
        parts = [f"**Escalation Reason:** {reason}"]

        mode = session_context.get("mode", "unknown")
        parts.append(f"**Session Mode:** {mode}")

        transcript = session_context.get("transcript", [])
        if transcript:
            last_msgs = transcript[-3:]
            convo = " → ".join(
                f"[{t.get('role', '?')}] {t.get('text', '')[:80]}"
                for t in last_msgs
            )
            parts.append(f"**Recent conversation:** {convo}")

        tools_used = session_context.get("tool_calls", [])
        if tools_used:
            tool_names = list(set(tc.get("tool", "") for tc in tools_used))
            parts.append(f"**Tools used:** {', '.join(tool_names)}")

        if cart and cart.get("items"):
            items = ", ".join(f"{i['name']} ×{i['qty']}" for i in cart["items"][:3])
            parts.append(f"**Cart ({len(cart['items'])} items):** {items} | ${cart.get('subtotal', 0):.2f}")

        if recommendations:
            rec_names = ", ".join(r.get("name", "?") for r in recommendations[:3])
            parts.append(f"**Recommendations shown:** {rec_names}")

        if vision_results:
            vis = ", ".join(
                v.get("name", "?") for v in (vision_results if isinstance(vision_results, list) else [vision_results])
            )
            parts.append(f"**Visual identification:** {vis}")

        if discount_state:
            parts.append(f"**Discount state:** {discount_state.get('status', 'none')} — {discount_state.get('discount_pct', 0)}%")

        sentiments = session_context.get("sentiment_timeline", [])
        if sentiments:
            latest = sentiments[-1] if isinstance(sentiments[-1], str) else sentiments[-1].get("value", "neutral")
            parts.append(f"**Customer sentiment:** {latest}")

        return "\n".join(parts)

    async def _save(self, handoff_id: str, handoff: dict):
        _MEMORY[f"handoff:{handoff_id}"] = handoff
        if USE_FS:
            try:
                await _db.collection("handoffs").document(handoff_id).set(handoff)
            except Exception as e:
                logger.error(f"Handoff save error: {e}")
