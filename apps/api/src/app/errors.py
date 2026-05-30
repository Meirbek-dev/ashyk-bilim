from typing import Any
from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse


def _serialize_validation_errors(exc: RequestValidationError) -> list[dict[str, Any]]:
    try:
        return exc.errors(include_url=False)  # pyright: ignore[reportCallIssue]
    except TypeError:
        errors = exc.errors()
        sanitized_errors: list[dict[str, Any]] = []
        for error in errors:
            if isinstance(error, dict) and "url" in error:
                sanitized_errors.append({k: v for k, v in error.items() if k != "url"})
            else:
                sanitized_errors.append(error)
        return sanitized_errors


def register_exception_handlers(app: FastAPI) -> None:
    # Maps fastapi-users string error codes to structured client-facing errors.
    FASTAPI_USERS_ERROR_MAP: dict[str, dict[str, Any]] = {
        "REGISTER_USER_ALREADY_EXISTS": {
            "error_code": "email_taken",
            "message": "Электронная почта уже существует",
            "detail": {"code": "email_taken"},
        },
    }

    @app.exception_handler(HTTPException)
    def http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:  # pyright: ignore[reportUnusedFunction]
        detail: Any = exc.detail
        headers = exc.headers
        if isinstance(detail, str) and detail in FASTAPI_USERS_ERROR_MAP:
            return JSONResponse(
                status_code=exc.status_code,
                content=FASTAPI_USERS_ERROR_MAP[detail],
                headers=headers,
            )
        if isinstance(detail, dict):
            error_code = detail.get("error_code")
            message = detail.get("message")
            if isinstance(error_code, str) and isinstance(message, str):
                return JSONResponse(status_code=exc.status_code, content=detail, headers=headers)
            return JSONResponse(
                status_code=exc.status_code,
                content={
                    "error_code": "HTTP_ERROR",
                    "message": str(message if message is not None else detail),
                },
                headers=headers,
            )
        return JSONResponse(
            status_code=exc.status_code,
            content={"error_code": "HTTP_ERROR", "message": str(detail)},
            headers=headers,
        )

    @app.exception_handler(RequestValidationError)
    def request_validation_exception_handler(request: Request, exc: RequestValidationError) -> JSONResponse:  # pyright: ignore[reportUnusedFunction]
        return JSONResponse(
            status_code=422,
            content={
                "error_code": "VALIDATION_ERROR",
                "message": "Ошибка валидации запроса",
                "detail": _serialize_validation_errors(exc),
            },
        )
