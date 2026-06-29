import os
from typing import cast

from granian import Granian
from granian.constants import HTTPModes, Interfaces
from granian.http import HTTP2Settings
from granian.log import LogLevels
from granian.utils.proxies import wrap_asgi_with_proxy_headers
from starlette.types import ASGIApp

from config.config import AppSettings, get_settings
from src.app.factory import create_app
from src.infra.logging import build_logging_config

settings = get_settings()
app = create_app(settings)


def _with_proxy_headers(asgi_app: ASGIApp, app_settings: AppSettings) -> ASGIApp:
    hosting_config = app_settings.hosting_config
    if not hosting_config.proxy_headers:
        return asgi_app

    return cast(
        "ASGIApp",
        wrap_asgi_with_proxy_headers(
            asgi_app,
            trusted_hosts=hosting_config.forwarded_allow_ips,
        ),
    )


served_app = _with_proxy_headers(app, settings)


def _granian_int(name: str, default: int, *, minimum: int = 1) -> int:
    raw_value = os.getenv(name)
    if raw_value is None:
        return default

    try:
        value = int(raw_value)
    except ValueError:
        return default

    return max(minimum, value)


def _granian_optional_int(name: str, *, minimum: int = 1) -> int | None:
    raw_value = os.getenv(name)
    if raw_value is None or not raw_value.strip():
        return None

    try:
        value = int(raw_value)
    except ValueError:
        return None

    return max(minimum, value)


if __name__ == "__main__":
    is_dev_mode = settings.general_config.development_mode

    if is_dev_mode:
        import uvicorn

        uvicorn.run(
            "app:app",
            host="0.0.0.0",
            port=settings.hosting_config.port,
            reload=True,
            access_log=True,
            timeout_keep_alive=65,
            proxy_headers=settings.hosting_config.proxy_headers,
            forwarded_allow_ips=settings.hosting_config.forwarded_allow_ips,
            use_colors=settings.general_config.color_logs,
        )
        raise SystemExit

    Granian(
        "app:served_app",
        address="0.0.0.0",
        port=settings.hosting_config.port,
        interface=Interfaces.ASGI,
        http=HTTPModes.http1,
        http2_settings=HTTP2Settings(
            adaptive_window=True,
            keep_alive_interval=30_000,
            keep_alive_timeout=20,
            max_concurrent_streams=_granian_int(
                "GRANIAN_HTTP2_MAX_CONCURRENT_STREAMS",
                256,
            ),
            max_headers_size=_granian_int(
                "GRANIAN_HTTP2_MAX_HEADERS_SIZE",
                1024 * 1024,
            ),
        ),
        workers=_granian_int("GRANIAN_WORKERS", 1),
        backlog=_granian_int("GRANIAN_BACKLOG", 2048, minimum=128),
        backpressure=_granian_optional_int("GRANIAN_BACKPRESSURE"),
        respawn_failed_workers=True,
        workers_kill_timeout=30,
        reload=False,
        log_dictconfig=build_logging_config(settings),
        log_access=False,
        log_level=LogLevels.info,
    ).serve()
