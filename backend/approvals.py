"""approvals.py - Manager discount approval queue."""
import asyncio, logging, time
logger = logging.getLogger(__name__)

try:
    from google.cloud import firestore
    _db = firestore.AsyncClient()
    USE_FS = True
except: USE_FS = False

_MEMORY: dict = {}


class ApprovalQueue:
    async def add(self, request_id: str, data: dict):
        _MEMORY[request_id] = data
        if USE_FS:
            try: await _db.collection("discount_requests").document(request_id).set(data)
            except Exception as e: logger.error(f"Approval add: {e}")

    async def list_pending(self) -> list:
        if USE_FS:
            try:
                q = _db.collection("discount_requests").where("status","==","pending")
                return [d.to_dict() async for d in q.stream()]
            except: pass
        return [v for v in _MEMORY.values() if v.get("status") == "pending"]

    async def approve(self, request_id: str, note: str = "") -> dict:
        return await self._resolve(request_id, "approved", note)

    async def reject(self, request_id: str, note: str = "") -> dict:
        return await self._resolve(request_id, "rejected", note)

    async def _resolve(self, request_id: str, status: str, note: str) -> dict:
        data = _MEMORY.get(request_id, {})
        data.update({"status": status, "note": note, "resolved_at": time.time()})
        _MEMORY[request_id] = data
        if USE_FS:
            try:
                await _db.collection("discount_requests").document(request_id).update(
                    {"status": status, "note": note, "resolved_at": time.time()}
                )
            except Exception as e: logger.error(f"Approval resolve: {e}")
        return data
