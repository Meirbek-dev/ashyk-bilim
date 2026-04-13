from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse


def _serialize_validation_errors(exc: RequestValidationError) -> list[dict]:
    try:
        return exc.errors(include_url=False)
    except TypeError:
        errors = exc.errors()
        sanitized_errors: list[dict] = []
        for error in errors:
            if isinstance(error, dict) and "url" in error:
                sanitized_errors.append({k: v for k, v in error.items() if k != "url"})
            else:
                sanitized_errors.append(error)
        return sanitized_errors


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(HTTPException)
    def http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
        detail = exc.detail
        if isinstance(detail, dict):
            error_code = detail.get("error_code")
            message = detail.get("message")
            if isinstance(error_code, str) and isinstance(message, str):
                return JSONResponse(status_code=exc.status_code, content=detail)
            return JSONResponse(
                status_code=exc.status_code,
                content={
                    "error_code": "HTTP_ERROR",
                    "message": str(message if message is not None else detail),
                },
            )
        return JSONResponse(
            status_code=exc.status_code,
            content={"error_code": "HTTP_ERROR", "message": str(detail)},
        )

    @app.exception_handler(RequestValidationError)
    def request_validation_exception_handler(
        request: Request, exc: RequestValidationError
    ) -> JSONResponse:
        return JSONResponse(
            status_code=422,
            content={
                "error_code": "VALIDATION_ERROR",
                "message": "Request validation failed",
                "detail": _serialize_validation_errors(exc),
            },
        )
