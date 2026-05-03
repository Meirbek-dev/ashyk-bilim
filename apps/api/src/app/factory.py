from fastapi import FastAPI
from fastapi.routing import APIRoute

from src.app.errors import register_exception_handlers
from src.app.lifespan import create_lifespan
from src.app.middleware import add_application_middleware, mount_static_routes
from src.infra.settings import AppSettings, get_settings
from src.router import v1_router


class StrictAPIRoute(APIRoute):
    """Custom APIRoute that enforces strict OpenAPI compliance.

    Sets response_model_exclude_none=False by default so that the generated
    OpenAPI schema (and the actual JSON response) always includes all fields
    defined in the response model, preventing schema drift.
    """

    def __init__(self, *args, **kwargs) -> None:
        if "response_model_exclude_none" not in kwargs:
            kwargs["response_model_exclude_none"] = False
        super().__init__(*args, **kwargs)


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

    # Apply strict route class to the app and v1_router
    app.router.route_class = StrictAPIRoute
    v1_router.route_class = StrictAPIRoute

    app.state.settings = resolved_settings
    add_application_middleware(app, resolved_settings)
    register_exception_handlers(app)
    mount_static_routes(app)
    app.include_router(v1_router)

    @app.get("/")
    def root() -> dict[str, str]:
        return {"Message": "Добро пожаловать в Ashyk Bilim"}

    return app
