import uuid
from collections.abc import Awaitable, Callable

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.types import Receive, Scope, Send

from src.infra.settings import AppSettings

_STATIC_CACHE_HEADER = "public, max-age=31536000, immutable"


class CachedStaticFiles(StaticFiles):
    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        async def send_with_cache(message: dict) -> None:
            if message["type"] == "http.response.start":
                headers = dict(message.get("headers", []))
                headers[b"cache-control"] = _STATIC_CACHE_HEADER.encode()
                message = {**message, "headers": list(headers.items())}
            await send(message)

        await super().__call__(scope, receive, send_with_cache)


def add_application_middleware(app: FastAPI, settings: AppSettings) -> None:
    app.add_middleware(
        CORSMiddleware,
        allow_origin_regex=settings.hosting_config.allowed_regexp,
        allow_methods=["*"],
        allow_credentials=True,
        allow_headers=["*"],
    )
    app.add_middleware(GZipMiddleware, minimum_size=1000)

    @app.middleware("http")
    async def add_correlation_id(
        request: Request,
        call_next: Callable[[Request], Awaitable],
    ):
        req_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())
        response = await call_next(request)
        response.headers["X-Request-ID"] = req_id
        return response

    @app.middleware("http")
    async def enforce_sec_fetch_site(
        request: Request,
        call_next: Callable[[Request], Awaitable],
    ):
        sec_fetch_site = request.headers.get("sec-fetch-site")
        if (
            sec_fetch_site == "cross-site"
            and request.method.upper() in {"POST", "PUT", "PATCH", "DELETE"}
            and not request.headers.get("authorization")
        ):
            return JSONResponse(
                status_code=403,
                content={
                    "error_code": "CSRF_CROSS_SITE_REQUEST",
                    "message": "Cross-site requests are not allowed",
                },
            )

        return await call_next(request)


def mount_static_routes(app: FastAPI) -> None:
    app.mount(
        "/content",
        CachedStaticFiles(directory="content", check_dir=False),
        name="content",
    )
