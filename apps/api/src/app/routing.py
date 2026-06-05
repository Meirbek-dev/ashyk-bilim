from fastapi import FastAPI
from fastapi.routing import APIRoute


class StrictAPIRoute(APIRoute):
    """APIRoute that keeps declared response-model fields in responses/OpenAPI."""

    def __init__(self, *args: object, **kwargs: object) -> None:
        kwargs.setdefault("response_model_exclude_none", False)
        # We forward the generic *args and **kwargs arguments to APIRoute's complex
        # constructor signature. Subclassing APIRoute requires forwarding these arguments,
        # but typing them dynamically without Any causes arg-type warnings under strict mypy.
        super().__init__(*args, **kwargs)  # type: ignore[arg-type]


def enforce_strict_response_models(app: FastAPI) -> None:
    for route in app.routes:
        if isinstance(route, APIRoute):
            route.response_model_exclude_none = False
