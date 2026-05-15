from collections.abc import Callable
from typing import Any, cast

from granian.constants import Interfaces
from granian.log import LogLevels
from granian.utils.proxies import wrap_asgi_with_proxy_headers

from config.config import AppSettings, get_settings
from granian import Granian
from src.app.factory import create_app

type ASGIApp = Callable[..., Any]


settings = get_settings()
app = create_app(settings)


def _with_proxy_headers(asgi_app: ASGIApp, app_settings: AppSettings) -> ASGIApp:
    hosting_config = app_settings.hosting_config
    if not hosting_config.proxy_headers:
        return asgi_app

    return cast(
        ASGIApp,
        wrap_asgi_with_proxy_headers(
            asgi_app,
            trusted_hosts=hosting_config.forwarded_allow_ips,
        ),
    )


served_app = _with_proxy_headers(app, settings)


if __name__ == "__main__":
    is_dev_mode = settings.general_config.development_mode
    Granian(
        "app:served_app",
        address="0.0.0.0",
        port=settings.hosting_config.port,
        interface=Interfaces.ASGI,
        reload=is_dev_mode,
        log_access=is_dev_mode,
        log_level=LogLevels.debug if is_dev_mode else LogLevels.info,
    ).serve()
