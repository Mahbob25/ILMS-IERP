import logging
from typing import Any, Optional

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

# Internal ERP API — service-to-service, gated by ERP_SERVICE_KEY + X-Actor-Id.
# The BFF is the ONLY caller that forwards the actor id (portal.users.id).
_INTERNAL_PREFIX = "/api/v1/internal/portal"


class ErpClientError(Exception):
    def __init__(self, status_code: int, detail: str):
        self.status_code = status_code
        self.detail = detail
        super().__init__(f"ERP internal API error {status_code}: {detail}")


class ErpClient:
    """Thin typed client for GET /api/v1/internal/portal/*.

    Each call carries ``X-Service-Key`` + ``X-Actor-Id`` (the portal user id).
    The ERP validates the key, resolves the actor → linked student(s), and
    scopes every read/write to those students — so the BFF can never request
    data outside a parent's links.
    """

    def __init__(self) -> None:
        self._base_url = settings.ERP_INTERNAL_URL.rstrip("/")
        self._service_key = settings.ERP_SERVICE_KEY

    async def _request(
        self,
        method: str,
        path: str,
        actor_id: str,
        params: Optional[dict[str, Any]] = None,
        json: Optional[dict[str, Any]] = None,
    ) -> Any:
        if not self._service_key:
            raise ErpClientError(500, "ERP_SERVICE_KEY not configured in portal backend")
        headers = {
            "X-Service-Key": self._service_key,
            "X-Actor-Id": actor_id,
            "Accept": "application/json",
        }
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.request(
                method,
                f"{self._base_url}{_INTERNAL_PREFIX}{path}",
                headers=headers,
                params=params,
                json=json,
            )
        if resp.status_code >= 400:
            try:
                detail = resp.json().get("detail", resp.text)
            except Exception:
                detail = resp.text
            raise ErpClientError(resp.status_code, str(detail))
        if resp.status_code == 204:
            return None
        return resp.json()

    async def get_me(self, actor_id: str) -> dict[str, Any]:
        """Actor → linked students (portal.users.id → erp.students)."""
        return await self._request("GET", "/me", actor_id)

    async def get_grades(self, actor_id: str, student_id: str) -> list[dict[str, Any]]:
        return await self._request(
            "GET", "/grades", actor_id, params={"student_id": student_id}
        )

    async def get_attendance(
        self, actor_id: str, student_id: str, section_id: Optional[str] = None
    ) -> list[dict[str, Any]]:
        params: dict[str, Any] = {"student_id": student_id}
        if section_id:
            params["section_id"] = section_id
        return await self._request("GET", "/attendance", actor_id, params=params)

    async def get_payments(self, actor_id: str, student_id: str) -> list[dict[str, Any]]:
        return await self._request(
            "GET", "/payments", actor_id, params={"student_id": student_id}
        )

    async def get_sections(self, actor_id: str, student_id: str) -> list[dict[str, Any]]:
        return await self._request(
            "GET", "/sections", actor_id, params={"student_id": student_id}
        )

    async def update_profile(
        self,
        actor_id: str,
        student_id: str,
        phone: Optional[str] = None,
        locale_pref: Optional[str] = None,
    ) -> dict[str, Any]:
        body: dict[str, Any] = {}
        if phone is not None:
            body["phone"] = phone
        if locale_pref is not None:
            body["locale_pref"] = locale_pref
        return await self._request(
            "POST",
            "/profile",
            actor_id,
            params={"student_id": student_id},
            json=body,
        )


erp_client = ErpClient()
