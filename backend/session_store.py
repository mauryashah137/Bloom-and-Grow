"""
Session Store — Full journey persistence with deep event tracking.
Supports: transcript, recommendations, cart changes, vision events,
order events, handoff events, sentiment timeline, approval events.
"""
import logging, os, time, uuid
logger = logging.getLogger(__name__)

try:
    from google.cloud import firestore
    _db = firestore.AsyncClient()
    USE_FS = True
except:
    _db = None
    USE_FS = False

_MEM: dict = {}

MOCK_CUSTOMERS = {
    "guest": {
        "customer_id": "guest", "name": "Guest", "email": "guest@example.com",
        "loyalty_tier": "Standard", "loyalty_points": 0, "total_orders": 0,
        "member_since": "2026-04-04",
        "preferences": {"skill_level": "beginner", "garden_type": "indoor", "budget_range": "medium"},
    },
    "demo_customer_001": {
        "customer_id": "demo_customer_001", "name": "Alex Rivera",
        "email": "alex.rivera@example.com", "loyalty_tier": "Gold",
        "loyalty_points": 1250, "total_orders": 8, "member_since": "2024-03-10",
        "preferences": {"skill_level": "beginner", "garden_type": "indoor", "budget_range": "medium"},
        "support_history": [
            {"date": "2026-02-15", "issue": "Delivery delay", "resolution": "Expedited reshipping"},
            {"date": "2025-11-20", "issue": "Wrong item received", "resolution": "Replacement sent"},
        ],
    },
}


class SessionStore:
    # ── Customer management ──────────────────────────────────────────────────
    async def get_or_create_customer(self, customer_id: str) -> dict:
        c = _MEM.get(f"cust:{customer_id}")
        if c:
            return c
        if USE_FS:
            try:
                doc = await _db.collection("customers").document(customer_id).get()
                if doc.exists:
                    c = doc.to_dict()
                    _MEM[f"cust:{customer_id}"] = c
                    return c
            except Exception as e:
                logger.error(f"Customer get: {e}")
        c = MOCK_CUSTOMERS.get(customer_id, {
            "customer_id": customer_id,
            "name": "Valued Customer",
            "email": f"{customer_id}@example.com",
            "loyalty_tier": "Gold",
            "loyalty_points": 1250,
            "total_orders": 8,
            "member_since": "2024-03-10",
            "preferences": {"skill_level": "beginner", "garden_type": "indoor", "budget_range": "medium"},
        })
        _MEM[f"cust:{customer_id}"] = c
        if USE_FS:
            try:
                await _db.collection("customers").document(customer_id).set(c)
            except:
                pass
        return c

    async def get_user_by_email(self, email: str) -> dict:
        """Look up a user by email address."""
        email = email.lower().strip()
        # Check memory first
        for k, v in _MEM.items():
            if k.startswith("cust:") and v.get("email", "").lower() == email:
                return v
        # Check Firestore
        if USE_FS:
            try:
                from google.cloud.firestore_v1.base_query import FieldFilter
                q = _db.collection("customers").where(filter=FieldFilter("email", "==", email)).limit(1)
                async for doc in q.stream():
                    user = doc.to_dict()
                    _MEM[f"cust:{user.get('customer_id', doc.id)}"] = user
                    return user
            except Exception as e:
                logger.error(f"User lookup by email: {e}")
                # Fallback to old-style query
                try:
                    q = _db.collection("customers").where("email", "==", email).limit(1)
                    async for doc in q.stream():
                        user = doc.to_dict()
                        _MEM[f"cust:{user.get('customer_id', doc.id)}"] = user
                        return user
                except:
                    pass
        return None

    async def create_user(self, data: dict) -> dict:
        """Create a new user account."""
        import uuid as _uuid
        user_id = f"user_{_uuid.uuid4().hex[:10]}"
        data["customer_id"] = user_id
        _MEM[f"cust:{user_id}"] = data
        if USE_FS:
            try:
                await _db.collection("customers").document(user_id).set(data)
            except Exception as e:
                logger.error(f"Create user: {e}")
        return data

    async def update_customer(self, customer_id: str, updates: dict):
        c = await self.get_or_create_customer(customer_id)
        c.update(updates)
        _MEM[f"cust:{customer_id}"] = c
        if USE_FS:
            try:
                await _db.collection("customers").document(customer_id).update(updates)
            except Exception as e:
                logger.error(f"Customer update: {e}")

    # ── Session lifecycle ────────────────────────────────────────────────────
    async def create_session(self, session_id: str, data: dict):
        doc = {
            **data,
            "session_id": session_id,
            "status": "active",
            "transcript": [],
            "tool_calls": [],
            "sentiment_timeline": [],
            "journey_events": [],
            "products_viewed": [],
            "recommendations_shown": [],
            "cart_changes": [],
            "vision_events": [],
            "order_events": [],
            "handoff_events": [],
            "approval_events": [],
            "uploaded_assets": [],
        }
        _MEM[f"sess:{session_id}"] = doc
        if USE_FS:
            try:
                await _db.collection("sessions").document(session_id).set(doc)
            except Exception as e:
                logger.error(f"Create session: {e}")

    async def close_session(self, session_id: str, summary: dict):
        s = _MEM.get(f"sess:{session_id}", {})
        s.update({"status": "closed", "ended_at": time.time(), **summary})
        _MEM[f"sess:{session_id}"] = s
        if USE_FS:
            try:
                await _db.collection("sessions").document(session_id).update(
                    {"status": "closed", "ended_at": time.time(), **summary}
                )
            except Exception as e:
                logger.error(f"Close session: {e}")

    async def get_session(self, session_id: str):
        s = _MEM.get(f"sess:{session_id}")
        if s:
            return s
        if USE_FS:
            try:
                doc = await _db.collection("sessions").document(session_id).get()
                if doc.exists:
                    return doc.to_dict()
            except:
                pass
        return None

    async def list_sessions(self, limit: int = 20) -> list:
        if USE_FS:
            try:
                q = _db.collection("sessions").order_by(
                    "started_at", direction=firestore.Query.DESCENDING
                ).limit(limit)
                return [d.to_dict() async for d in q.stream()]
            except Exception as e:
                logger.error(f"List sessions: {e}")
        sessions = [v for k, v in _MEM.items() if k.startswith("sess:")]
        return sorted(sessions, key=lambda s: s.get("started_at", 0), reverse=True)[:limit]

    # ── Transcript ───────────────────────────────────────────────────────────
    async def append_transcript(self, session_id: str, event: dict):
        s = _MEM.get(f"sess:{session_id}", {})
        s.setdefault("transcript", []).append(event)
        if USE_FS:
            try:
                from google.cloud.firestore import ArrayUnion
                await _db.collection("sessions").document(session_id).update(
                    {"transcript": ArrayUnion([event])}
                )
            except:
                pass

    # ── Tool calls ───────────────────────────────────────────────────────────
    async def append_tool_call(self, session_id: str, event: dict):
        s = _MEM.get(f"sess:{session_id}", {})
        s.setdefault("tool_calls", []).append(event)
        if USE_FS:
            try:
                from google.cloud.firestore import ArrayUnion
                await _db.collection("sessions").document(session_id).update(
                    {"tool_calls": ArrayUnion([event])}
                )
            except:
                pass

    # ── Journey event tracking ───────────────────────────────────────────────
    async def append_event(self, session_id: str, event_type: str, data: dict):
        """Generic event appender for all journey event types."""
        event = {"type": event_type, "ts": time.time(), **data}
        s = _MEM.get(f"sess:{session_id}", {})
        s.setdefault("journey_events", []).append(event)

        # Also append to type-specific lists
        type_map = {
            "recommendation": "recommendations_shown",
            "cart_change": "cart_changes",
            "vision": "vision_events",
            "order": "order_events",
            "handoff": "handoff_events",
            "approval": "approval_events",
            "product_view": "products_viewed",
            "asset_upload": "uploaded_assets",
            "sentiment": "sentiment_timeline",
        }
        field = type_map.get(event_type)
        if field:
            s.setdefault(field, []).append(event)

        if USE_FS:
            try:
                from google.cloud.firestore import ArrayUnion
                updates = {"journey_events": ArrayUnion([event])}
                if field:
                    updates[field] = ArrayUnion([event])
                await _db.collection("sessions").document(session_id).update(updates)
            except:
                pass

    async def append_recommendation_event(self, session_id: str, products: list):
        await self.append_event(session_id, "recommendation", {
            "products": [{"id": p.get("id"), "name": p.get("name")} for p in products],
            "count": len(products),
        })

    async def append_cart_event(self, session_id: str, action: str, cart: dict):
        await self.append_event(session_id, "cart_change", {
            "action": action,
            "item_count": len(cart.get("items", [])),
            "subtotal": cart.get("subtotal", 0),
        })

    async def append_vision_event(self, session_id: str, result: dict):
        await self.append_event(session_id, "vision", {
            "candidates": [
                {"name": c.get("name"), "confidence": c.get("confidence")}
                for c in result.get("candidates", [])
            ],
            "issue": result.get("issue_detected", "none"),
        })

    async def append_order_event(self, session_id: str, order_id: str, action: str):
        await self.append_event(session_id, "order", {
            "order_id": order_id,
            "action": action,
        })

    async def append_handoff_event(self, session_id: str, handoff_id: str, specialist: str):
        await self.append_event(session_id, "handoff", {
            "handoff_id": handoff_id,
            "specialist_type": specialist,
        })

    async def append_sentiment(self, session_id: str, value: str):
        await self.append_event(session_id, "sentiment", {"value": value})

    # ── Journey summary for context injection ────────────────────────────────
    async def get_journey_summary(self, session_id: str) -> dict:
        """Get a compact journey summary for injection into agent context."""
        s = _MEM.get(f"sess:{session_id}", {})
        return {
            "transcript_turns": len(s.get("transcript", [])),
            "tools_used": list(set(tc.get("tool", "") for tc in s.get("tool_calls", []))),
            "products_viewed": len(s.get("products_viewed", [])),
            "recommendations_shown": len(s.get("recommendations_shown", [])),
            "cart_changes": len(s.get("cart_changes", [])),
            "vision_events": len(s.get("vision_events", [])),
            "sentiment_history": [
                e.get("value") for e in s.get("sentiment_timeline", [])
            ][-5:],
            "has_handoff": len(s.get("handoff_events", [])) > 0,
            "has_orders": len(s.get("order_events", [])) > 0,
        }

    # ── Metrics ──────────────────────────────────────────────────────────────
    async def get_metrics(self) -> dict:
        sessions = await self.list_sessions(100)
        total = len(sessions)
        if total == 0:
            return {"total_sessions": 0}
        closed = [s for s in sessions if s.get("status") == "closed"]
        escalated = [
            s for s in sessions
            if any(
                tc.get("tool") == "connect_to_human" and tc.get("status") == "success"
                for tc in s.get("tool_calls", [])
            )
        ]
        refunded = [
            s for s in sessions
            if any(
                tc.get("tool") == "process_refund" and tc.get("status") == "success"
                for tc in s.get("tool_calls", [])
            )
        ]
        carted = [
            s for s in sessions
            if any(
                tc.get("tool") == "add_to_cart" and tc.get("status") == "success"
                for tc in s.get("tool_calls", [])
            )
        ]
        durations = [
            s["ended_at"] - s["started_at"]
            for s in closed
            if s.get("ended_at") and s.get("started_at")
        ]
        avg_dur = sum(durations) / len(durations) if durations else 0
        return {
            "total_sessions": total,
            "active_sessions": total - len(closed),
            "resolved_sessions": len(closed),
            "escalation_rate": round(len(escalated) / total * 100, 1),
            "refund_rate": round(len(refunded) / total * 100, 1),
            "cart_add_rate": round(len(carted) / total * 100, 1),
            "resolution_rate": round(len(closed) / total * 100, 1),
            "avg_call_duration_seconds": round(avg_dur, 1),
        }
