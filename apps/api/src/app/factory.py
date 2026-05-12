from fastapi import FastAPI
from fastapi_pagination import add_pagination

from src.app.errors import register_exception_handlers
from src.app.lifespan import create_lifespan
from src.app.middleware import add_application_middleware, mount_static_routes
from src.app.routing import StrictAPIRoute, enforce_strict_response_models
from src.infra.settings import AppSettings, get_settings
from src.router import v1_router


def create_app(settings: AppSettings | None = None) -> FastAPI:
    resolved_settings = settings or get_settings()

    app = FastAPI(
        title="Ashyk Bilim",
        description="Образовательная платформа Ashyk Bilim",
        docs_url="/docs" if resolved_settings.general_config.development_mode else None,
        redoc_url="/redoc"
        if resolved_settings.general_config.development_mode
        else None,
        version="0.1.0",
        lifespan=create_lifespan(resolved_settings),
    )

    app.router.route_class = StrictAPIRoute

    app.state.settings = resolved_settings
    add_application_middleware(app, resolved_settings)
    register_exception_handlers(app)
    mount_static_routes(app)
    app.include_router(v1_router)
    enforce_strict_response_models(app)
    add_pagination(app)

    @app.get("/")
    def root() -> dict[str, str]:
        return {"Message": "Добро пожаловать в Ashyk Bilim"}

    return app
