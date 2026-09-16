"""Unit tests for app.core.http_cache (weak ETag + 304 helpers)."""
from fastapi import Request, Response
from starlette.datastructures import Headers

from app.core.http_cache import (
    CACHE_CONTROL_VALUE,
    compute_etag,
    etag_payload,
    is_not_modified,
    not_modified_response,
    set_cache_headers,
)


def _request_with_etag(value: str | None) -> Request:
    headers = [(b"if-none-match", value.encode())] if value else []
    return Request(
        {"type": "http", "method": "GET", "headers": headers}
    )


def test_compute_etag_is_weak_and_stable():
    etag1 = compute_etag(b'{"a":1}')
    etag2 = compute_etag(b'{"a":1}')
    etag3 = compute_etag(b'{"a":2}')
    assert etag1.startswith('W/"') and etag1.endswith('"')
    assert etag1 == etag2
    assert etag1 != etag3


def test_etag_payload_is_deterministic_for_dicts():
    assert etag_payload({"b": 2, "a": 1}) == etag_payload({"a": 1, "b": 2})


def test_is_not_modified_matches_weak_and_strong_forms():
    etag = 'W/"abc123"'
    assert is_not_modified(_request_with_etag('"abc123"'), etag) is True
    assert is_not_modified(_request_with_etag('W/"abc123"'), etag) is True
    assert is_not_modified(_request_with_etag('"other", W/"abc123"'), etag) is True
    assert is_not_modified(_request_with_etag('"other"'), etag) is False
    assert is_not_modified(_request_with_etag(None), etag) is False
    assert is_not_modified(_request_with_etag("*"), etag) is True


def test_set_cache_headers_attaches_both_headers():
    response = Response()
    set_cache_headers(response, 'W/"abc123"')
    assert response.headers["Cache-Control"] == CACHE_CONTROL_VALUE
    assert response.headers["ETag"] == 'W/"abc123"'


def test_not_modified_response_is_304_with_headers():
    response = not_modified_response('W/"abc123"')
    assert response.status_code == 304
    assert response.headers["Cache-Control"] == CACHE_CONTROL_VALUE
    assert response.headers["ETag"] == 'W/"abc123"'
    assert Headers(raw=response.raw_headers).get("content-length") in (None, "0")
