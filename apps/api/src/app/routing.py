from fastapi import FastAPI
from fastapi.routing import APIRoute


class StrictAPIRoute(APIRoute):
    """APIRoute that keeps declared response-model fields in responses/OpenAPI."""

    def __init__(self, *args, **kwargs) -> None:
        kwargs.setdefault("response_model_exclude_none", False)
        super().__init__(*args, **kwargs)


def enforce_strict_response_models(app: FastAPI) -> None:
    for route in app.routes:
        if isinstance(route, APIRoute):
            route.response_model_exclude_none = False
