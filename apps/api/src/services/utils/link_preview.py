from __future__ import annotations

import asyncio
import hashlib
import ipaddress
import json
import logging
import socket
from typing import Any, cast
from urllib.parse import urljoin, urlsplit, urlunsplit

import httpx
from cachebox import TTLCache
from selectolax.lexbor import LexborHTMLParser

from config.config import LinkPreviewConfig, get_settings
from src.services.cache.redis_client import get_async_redis_client

logger = logging.getLogger(__name__)

_HTML_CONTENT_TYPES = {"text/html", "application/xhtml+xml"}
_LOCAL_HOSTNAMES = {"localhost", "localhost.localdomain", "0", "0.0.0.0"}

_http_client: httpx.AsyncClient | None = None
_http_client_timeout: float | None = None
_http_client_lock = asyncio.Lock()

_memory_cache: TTLCache[str, dict[str, str | None]] | None = None
_memory_cache_fingerprint: tuple[int, int] | None = None
_memory_cache_lock = asyncio.Lock()


class LinkPreviewError(ValueError):
    """Base error for rejected or failed link-preview fetches."""


class UnsafeLinkPreviewURL(LinkPreviewError):
    """Raised when a URL could reach private infrastructure."""


async def fetch_link_preview(url: str) -> dict[str, str | None]:
    settings = get_settings().integrations.link_preview
    safe_url = _normalize_user_url(url)
    await _assert_public_destination(safe_url)

    cached = await _get_cached_preview(safe_url, settings)
    if cached is not None:
        return cached

    final_url, html = await _fetch_html(safe_url, settings)
    preview = await _sanitize_preview_assets(_parse_preview(final_url, html))
    await _set_cached_preview(safe_url, preview, settings)
    return preview


async def close_link_preview_client() -> None:
    global _http_client, _http_client_timeout

    async with _http_client_lock:
        client = _http_client
        _http_client = None
        _http_client_timeout = None
    if client is not None:
        await client.aclose()


def _normalize_user_url(url: str) -> str:
    if not isinstance(url, str):  # pyright: ignore[reportUnnecessaryIsInstance]
        raise UnsafeLinkPreviewURL("URL must be a string")  # pyright: ignore[reportUnreachable]

    stripped = url.strip()
    if not stripped:
        raise UnsafeLinkPreviewURL("URL must not be empty")

    parsed = urlsplit(stripped)
    if parsed.scheme.lower() not in {"http", "https"}:
        raise UnsafeLinkPreviewURL("Only http and https URLs are allowed")
    if parsed.username or parsed.password:
        raise UnsafeLinkPreviewURL("URLs with embedded credentials are not allowed")
    if not parsed.hostname:
        raise UnsafeLinkPreviewURL("URL must include a hostname")

    hostname = parsed.hostname.strip().lower().rstrip(".")
    if hostname in _LOCAL_HOSTNAMES or hostname.endswith(".localhost"):
        raise UnsafeLinkPreviewURL("Localhost URLs are not allowed")

    path = parsed.path or "/"
    return urlunsplit((
        parsed.scheme.lower(),
        parsed.netloc,
        path,
        parsed.query,
        "",
    ))


async def _assert_public_destination(url: str) -> None:
    parsed = urlsplit(url)
    host = parsed.hostname
    if host is None:
        raise UnsafeLinkPreviewURL("URL must include a hostname")

    try:
        literal_ip = ipaddress.ip_address(host)
    except ValueError:
        literal_ip = None

    if literal_ip is not None:
        _assert_public_ip(literal_ip, host)
        return

    port = parsed.port or (443 if parsed.scheme == "https" else 80)
    loop = asyncio.get_running_loop()
    try:
        results = await loop.getaddrinfo(
            host,
            port,
            type=socket.SOCK_STREAM,
            proto=socket.IPPROTO_TCP,
        )
    except socket.gaierror as exc:
        raise UnsafeLinkPreviewURL("URL hostname could not be resolved") from exc

    if not results:
        raise UnsafeLinkPreviewURL("URL hostname could not be resolved")

    for result in results:
        sockaddr = result[4]
        ip_text = sockaddr[0]
        _assert_public_ip(ipaddress.ip_address(ip_text), host)


def _assert_public_ip(address: ipaddress.IPv4Address | ipaddress.IPv6Address, host: str) -> None:
    if address.is_global:
        return

    msg = f"URL resolves to a non-public address: {host}"
    raise UnsafeLinkPreviewURL(msg)


async def _fetch_html(url: str, settings: LinkPreviewConfig) -> tuple[str, str]:
    client = await _get_http_client(settings)
    current_url = url
    headers = {
        "Accept": "text/html,application/xhtml+xml;q=0.9",
        "User-Agent": settings.user_agent,
    }

    for redirect_count in range(settings.max_redirects + 1):
        await _assert_public_destination(current_url)
        try:
            async with client.stream("GET", current_url, headers=headers) as response:
                _assert_response_peer_is_public(response)
                if response.is_redirect:
                    if redirect_count >= settings.max_redirects:
                        raise LinkPreviewError("Too many redirects")
                    location = response.headers.get("location")
                    if not location:
                        raise LinkPreviewError("Redirect response did not include Location")
                    current_url = _normalize_user_url(urljoin(current_url, location))
                    await _assert_public_destination(current_url)
                    continue

                response.raise_for_status()
                _assert_html_response(response)
                body = await _read_limited_response(response, settings.max_response_bytes)
                encoding = response.encoding or "utf-8"
                return str(response.url), body.decode(encoding, errors="replace")
        except httpx.HTTPError as exc:
            msg = f"Failed to fetch link preview: {exc}"
            raise LinkPreviewError(msg) from exc

    raise LinkPreviewError("Too many redirects")


def _assert_html_response(response: httpx.Response) -> None:
    content_type = response.headers.get("content-type", "")
    media_type = content_type.split(";", 1)[0].strip().lower()
    if media_type not in _HTML_CONTENT_TYPES:
        raise LinkPreviewError("Link preview response must be HTML")


def _assert_response_peer_is_public(response: httpx.Response) -> None:
    stream = response.extensions.get("network_stream")
    if stream is None:
        raise LinkPreviewError("Unable to verify link preview peer address")

    server_addr = stream.get_extra_info("server_addr")
    if not server_addr:
        raise LinkPreviewError("Unable to verify link preview peer address")

    ip_text = str(server_addr[0])
    host = urlsplit(str(response.url)).hostname or ip_text
    try:
        address = ipaddress.ip_address(ip_text)
    except ValueError as exc:
        raise LinkPreviewError("Unable to verify link preview peer address") from exc
    _assert_public_ip(address, host)


async def _read_limited_response(response: httpx.Response, max_bytes: int) -> bytes:
    chunks: list[bytes] = []
    total = 0
    async for chunk in response.aiter_bytes():
        total += len(chunk)
        if total > max_bytes:
            raise LinkPreviewError("Link preview response is too large")
        chunks.append(chunk)
    return b"".join(chunks)


async def _get_http_client(settings: LinkPreviewConfig) -> httpx.AsyncClient:
    global _http_client, _http_client_timeout

    timeout_seconds = settings.request_timeout_seconds
    async with _http_client_lock:
        if _http_client is not None and _http_client_timeout == timeout_seconds:
            return _http_client
        if _http_client is not None:
            await _http_client.aclose()

        _http_client = httpx.AsyncClient(
            follow_redirects=False,
            timeout=httpx.Timeout(timeout_seconds),
            limits=httpx.Limits(max_connections=20, max_keepalive_connections=10),
        )
        _http_client_timeout = timeout_seconds
        return _http_client


def _parse_preview(url: str, html: str) -> dict[str, str | None]:
    tree = LexborHTMLParser(html)

    def get_meta(property_name: str, attr: str = "property") -> str | None:
        node = tree.css_first(f'meta[{attr}="{property_name}"]')
        return node.attributes.get("content") if cast(Any, node) else None

    title_node = tree.css_first("title")
    title = title_node.text(strip=True) if cast(Any, title_node) else None
    description = get_meta("og:description") or get_meta("description", "name")

    og_image = get_meta("og:image")
    if og_image and not og_image.startswith(("http://", "https://")):
        og_image = urljoin(url, og_image)

    favicon: str | None = None
    icon_rels = {
        "icon",
        "shortcut icon",
        "apple-touch-icon",
        "apple-touch-icon-precomposed",
    }
    for node in tree.css("link[rel]"):
        rel = node.attributes.get("rel") or ""
        href = node.attributes.get("href") or ""
        rel_values = {part.strip().lower() for part in rel.split()}
        if href and rel_values.intersection(icon_rels):
            favicon = href
            break

    if not favicon:
        parsed = urlsplit(url)
        favicon = f"{parsed.scheme}://{parsed.netloc}/favicon.ico"
    elif not favicon.startswith(("http://", "https://")):
        favicon = urljoin(url, favicon)

    og_title = get_meta("og:title")
    og_type = get_meta("og:type")
    og_url = get_meta("og:url")

    return {
        "title": og_title or title,
        "description": description,
        "og_image": og_image,
        "favicon": favicon,
        "og_type": og_type,
        "og_url": og_url or url,
        "url": url,
    }


async def _sanitize_preview_assets(
    preview: dict[str, str | None],
) -> dict[str, str | None]:
    sanitized = dict(preview)
    for key in ("og_image", "favicon"):
        raw_url = sanitized.get(key)
        if raw_url is None:
            continue
        try:
            safe_url = _normalize_user_url(raw_url)
            await _assert_public_destination(safe_url)
        except UnsafeLinkPreviewURL:
            sanitized[key] = None
        else:
            sanitized[key] = safe_url
    return sanitized


async def _get_cached_preview(url: str, settings: LinkPreviewConfig) -> dict[str, str | None] | None:
    redis = get_async_redis_client()
    cache_key = _cache_key(url)
    if redis is not None:
        try:
            raw = await redis.get(cache_key)
            if raw:
                if isinstance(raw, bytes):
                    raw = raw.decode()
                decoded = json.loads(raw)
                if isinstance(decoded, dict):
                    return _coerce_preview(decoded)
        except Exception:
            logger.exception("Failed to read link preview cache key=%s", cache_key)

    async with _memory_cache_lock:
        cache = _get_memory_cache(settings)
        cached = cast(Any, cache.get(cache_key))
        if cached is None:
            return None
        return cached


async def _set_cached_preview(
    url: str,
    preview: dict[str, str | None],
    settings: LinkPreviewConfig,
) -> None:
    cache_key = _cache_key(url)
    ttl = settings.cache_ttl_seconds
    payload = json.dumps(preview)
    redis = get_async_redis_client()
    if redis is not None:
        try:
            await redis.setex(cache_key, ttl, payload)
        except Exception:
            logger.exception("Failed to write link preview cache key=%s", cache_key)

    async with _memory_cache_lock:
        _get_memory_cache(settings)[cache_key] = preview


def _cache_key(url: str) -> str:
    digest = hashlib.sha256(url.encode()).hexdigest()
    return f"link-preview:{digest}"


def _get_memory_cache(
    settings: LinkPreviewConfig,
) -> TTLCache[str, dict[str, str | None]]:
    global _memory_cache, _memory_cache_fingerprint

    fingerprint = (
        max(1, settings.memory_cache_max_items),
        max(1, settings.cache_ttl_seconds),
    )
    if _memory_cache is None or _memory_cache_fingerprint != fingerprint:
        _memory_cache = TTLCache(maxsize=fingerprint[0], ttl=fingerprint[1])
        _memory_cache_fingerprint = fingerprint
    return _memory_cache


def _coerce_preview(value: dict[str, Any]) -> dict[str, str | None]:
    keys = ("title", "description", "og_image", "favicon", "og_type", "og_url", "url")
    return {key: raw if isinstance((raw := value.get(key)), str) or raw is None else str(raw) for key in keys}
