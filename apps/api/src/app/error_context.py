from collections.abc import Mapping

from fastapi import Request

_MAX_CONTEXT_VALUE_LENGTH = 200
_REDACTED_KEYS = {
    "authorization",
    "cookie",
    "password",
    "refresh_token",
    "secret",
    "token",
}


def _truncate(value: object) -> object:
    if isinstance(value, str) and len(value) > _MAX_CONTEXT_VALUE_LENGTH:
        return f"{value[:_MAX_CONTEXT_VALUE_LENGTH]}..."
    return value


def safe_log_context(values: Mapping[str, object]) -> dict[str, object]:
    safe: dict[str, object] = {}
    for key, value in values.items():
        lowered = key.lower()
        if any(redacted in lowered for redacted in _REDACTED_KEYS):
            safe[key] = "[redacted]"
        else:
            safe[key] = _truncate(value)
    return safe


def get_error_context(request: Request, **extra: object) -> dict[str, object]:
    request_id = getattr(request.state, "request_id", None)
    correlation_id = getattr(request.state, "correlation_id", None)
    route = request.scope.get("route")
    route_name = getattr(route, "name", None)
    return safe_log_context({
        "request_id": request_id if isinstance(request_id, str) else request.headers.get("X-Request-ID", ""),
        "correlation_id": correlation_id
        if isinstance(correlation_id, str)
        else request.headers.get("X-Correlation-ID", ""),
        "method": request.method,
        "path": request.url.path,
        "route_name": route_name if isinstance(route_name, str) else "",
        **extra,
    })
