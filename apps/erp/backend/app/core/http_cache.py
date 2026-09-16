"""Weak ETag + Cache-Control helpers for static/reference GET endpoints.

Used by academic lookups, system settings, and the reports catalog — payloads
that change rarely and are identical for every authorized caller, so a content
hash is a safe validator. Clients send the validator back via
``If-None-Match`` and receive ``304 Not Modified`` with an empty body instead
of the full payload.
"""
import hashlib
import json
from typing import Any

from fastapi import Request, Response

CACHE_MAX_AGE = 600
CACHE_STALE_WHILE_REVALIDATE = 3600
CACHE_CONTROL_VALUE = (
    f"private, max-age={CACHE_MAX_AGE}, "
    f"stale-while-revalidate={CACHE_STALE_WHILE_REVALIDATE}"
)


def compute_etag(payload: bytes) -> str:
    """Return a weak ETag for *payload* (SHA-256, truncated to 128 bits)."""
    digest = hashlib.sha256(payload).hexdigest()[:32]
    return f'W/"{digest}"'


def etag_payload(data: Any) -> bytes:
    """Deterministically serialize *data* (pydantic models, UUIDs, dates) for hashing."""
    if hasattr(data, "model_dump"):
        data = data.model_dump(mode="json")
    return json.dumps(data, sort_keys=True, default=str).encode("utf-8")


def _normalize_etag(value: str) -> str:
    v = value.strip()
    if v[:2].upper() == "W/":
        v = v[2:].strip()
    return v.strip().strip('"').strip("'")


def is_not_modified(request: Request, etag: str) -> bool:
    """True when the request's ``If-None-Match`` matches *etag* (weak comparison)."""
    inm = request.headers.get("if-none-match")
    if not inm:
        return False
    if inm.strip() == "*":
        return True
    candidates = [_normalize_etag(part) for part in inm.split(",")]
    return _normalize_etag(etag) in candidates


def set_cache_headers(response: Response, etag: str) -> None:
    """Attach ``Cache-Control`` + ``ETag`` to a 200 response."""
    response.headers["Cache-Control"] = CACHE_CONTROL_VALUE
    response.headers["ETag"] = etag


def not_modified_response(etag: str) -> Response:
    """Empty 304 response carrying the same cache headers as the 200."""
    return Response(
        status_code=304,
        headers={"Cache-Control": CACHE_CONTROL_VALUE, "ETag": etag},
    )
