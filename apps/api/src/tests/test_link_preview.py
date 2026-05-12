import pytest
from httpx import Request, Response

from config.config import LinkPreviewConfig
from src.services.utils import link_preview
from src.services.utils.link_preview import (
    LinkPreviewError,
    UnsafeLinkPreviewURL,
    _assert_html_response,
    _assert_public_destination,
    _assert_response_peer_is_public,
    _get_cached_preview,
    _normalize_user_url,
    _parse_preview,
    _sanitize_preview_assets,
    _set_cached_preview,
)


class _FakeStream:
    def __init__(self, server_addr):
        self._server_addr = server_addr

    def get_extra_info(self, info: str):
        if info == "server_addr":
            return self._server_addr
        return None


def test_link_preview_rejects_non_http_and_local_hosts():
    with pytest.raises(UnsafeLinkPreviewURL):
        _normalize_user_url("file:///etc/passwd")

    with pytest.raises(UnsafeLinkPreviewURL):
        _normalize_user_url("http://localhost:8000")

    with pytest.raises(UnsafeLinkPreviewURL):
        _normalize_user_url("https://user:pass@example.com")


@pytest.mark.asyncio
async def test_link_preview_rejects_private_ip_literal():
    with pytest.raises(UnsafeLinkPreviewURL):
        await _assert_public_destination("http://127.0.0.1/")

    with pytest.raises(UnsafeLinkPreviewURL):
        await _assert_public_destination("http://169.254.169.254/")


def test_link_preview_requires_html_content_type():
    _assert_html_response(Response(200, headers={"content-type": "text/html; charset=utf-8"}))

    with pytest.raises(LinkPreviewError):
        _assert_html_response(Response(200, headers={"content-type": "application/json"}))


def test_link_preview_revalidates_connected_peer_address():
    _assert_response_peer_is_public(
        Response(
            200,
            request=Request("GET", "https://example.com/"),
            extensions={"network_stream": _FakeStream(("93.184.216.34", 443))},
        )
    )

    with pytest.raises(UnsafeLinkPreviewURL):
        _assert_response_peer_is_public(
            Response(
                200,
                request=Request("GET", "http://example.com/"),
                extensions={"network_stream": _FakeStream(("127.0.0.1", 80))},
            )
        )


def test_link_preview_parser_extracts_metadata_and_resolves_assets():
    preview = _parse_preview(
        "https://example.com/posts/1",
        """
        <html>
          <head>
            <title>Fallback title</title>
            <meta property="og:title" content="OG title">
            <meta name="description" content="Description">
            <meta property="og:image" content="/image.png">
            <link rel="shortcut icon" href="/favicon.ico">
          </head>
        </html>
        """,
    )

    assert preview["title"] == "OG title"
    assert preview["description"] == "Description"
    assert preview["og_image"] == "https://example.com/image.png"
    assert preview["favicon"] == "https://example.com/favicon.ico"


@pytest.mark.asyncio
async def test_link_preview_omits_unsafe_asset_urls():
    preview = {
        "title": "Unsafe asset",
        "description": None,
        "og_image": "http://127.0.0.1/image.png",
        "favicon": "file:///favicon.ico",
        "og_type": None,
        "og_url": "https://example.com/",
        "url": "https://example.com/",
    }

    sanitized = await _sanitize_preview_assets(preview)

    assert sanitized["og_image"] is None
    assert sanitized["favicon"] is None


@pytest.mark.asyncio
async def test_link_preview_memory_cache_avoids_repeated_work(monkeypatch):
    monkeypatch.setattr(link_preview, "get_async_redis_client", lambda: None)
    settings = LinkPreviewConfig(cache_ttl_seconds=60)
    url = "https://example.com/"
    payload = {
        "title": "Cached",
        "description": None,
        "og_image": None,
        "favicon": "https://example.com/favicon.ico",
        "og_type": None,
        "og_url": url,
        "url": url,
    }

    await _set_cached_preview(url, payload, settings)

    assert await _get_cached_preview(url, settings) == payload
