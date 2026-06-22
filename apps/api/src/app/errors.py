import logging
import uuid
from collections.abc import Mapping
from typing import cast

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.openapi.utils import get_openapi
from fastapi.responses import JSONResponse

from src.app.exceptions import AppError
from src.db.strict_base_model import PydanticStrictBaseModel

logger = logging.getLogger(__name__)


class ApiFieldError(PydanticStrictBaseModel):
    field: str | None = None
    message: str
    code: str = "invalid"
    details: dict[str, object] | None = None


class ApiErrorEnvelope(PydanticStrictBaseModel):
    code: str
    message: str
    details: dict[str, object] | list[dict[str, object]] | None
    field_errors: list[ApiFieldError]
    request_id: str


def _get_request_id(request: Request) -> str:
    request_id = getattr(request.state, "request_id", None)
    if isinstance(request_id, str) and request_id:
        return request_id

    header_request_id = request.headers.get("X-Request-ID")
    if header_request_id:
        return header_request_id

    return str(uuid.uuid4())


def _get_correlation_id(request: Request) -> str | None:
    correlation_id = getattr(request.state, "correlation_id", None)
    if isinstance(correlation_id, str) and correlation_id:
        return correlation_id

    header_correlation_id = request.headers.get("X-Correlation-ID")
    if header_correlation_id:
        return header_correlation_id

    traceparent = request.headers.get("traceparent")
    if traceparent:
        return traceparent

    return None


def _response_headers(request_id: str, headers: Mapping[str, str] | None = None) -> dict[str, str]:
    response_headers = dict(headers or {})
    response_headers["X-Request-ID"] = request_id
    return response_headers


def _response_headers_for_request(
    request: Request,
    request_id: str,
    headers: Mapping[str, str] | None = None,
) -> dict[str, str]:
    response_headers = _response_headers(request_id, headers)
    correlation_id = _get_correlation_id(request)
    if correlation_id:
        response_headers["X-Correlation-ID"] = correlation_id
    return response_headers


def _app_error_headers(exc: AppError) -> dict[str, str]:
    headers: dict[str, str] = {}
    if exc.retry_after is not None:
        headers["Retry-After"] = str(exc.retry_after)
    return headers


def _app_error_field_errors(exc: AppError) -> list[ApiFieldError]:
    field_errors: list[ApiFieldError] = []
    for field_error in exc.field_errors:
        if isinstance(field_error, ApiFieldError):
            field_errors.append(field_error)
        elif isinstance(field_error, Mapping):
            field_errors.append(ApiFieldError.model_validate(dict(field_error)))
        else:
            field_errors.append(ApiFieldError(message=str(field_error)))
    return field_errors


def _log_app_error(request: Request, exc: AppError, request_id: str) -> None:
    if exc.status_code < 500 and exc.log_level not in {"error", "critical"}:
        return

    log = getattr(logger, exc.log_level, logger.error)
    log(
        "Application request error",
        extra={
            "request_id": request_id,
            "method": request.method,
            "path": request.url.path,
            "error_code": exc.code,
            "status_code": exc.status_code,
        },
        exc_info=exc.__cause__ is not None,
    )


def api_error_response(
    request: Request,
    *,
    status_code: int,
    code: str,
    message: str,
    details: dict[str, object] | list[dict[str, object]] | None = None,
    field_errors: list[ApiFieldError] | None = None,
    headers: Mapping[str, str] | None = None,
) -> JSONResponse:
    request_id = _get_request_id(request)
    envelope = ApiErrorEnvelope(
        code=code,
        message=message,
        details=details,
        field_errors=field_errors or [],
        request_id=request_id,
    )
    return JSONResponse(
        status_code=status_code,
        content=envelope.model_dump(mode="json"),
        headers=_response_headers_for_request(request, request_id, headers),
    )


def _serialize_validation_errors(exc: RequestValidationError) -> list[dict[str, object]]:
    sanitized_errors: list[dict[str, object]] = []
    for error in exc.errors():
        if isinstance(error, dict):
            sanitized_errors.append({str(k): v for k, v in error.items() if k != "url"})
        else:
            sanitized_errors.append({"msg": str(error)})
    return sanitized_errors


def _validation_field_errors(exc: RequestValidationError) -> list[ApiFieldError]:
    field_errors: list[ApiFieldError] = []
    for error in exc.errors():
        if not isinstance(error, dict):
            field_errors.append(ApiFieldError(message=str(error)))
            continue


def _serialize_validation_errors(exc: RequestValidationError) -> list[dict[str, object]]:
    sanitized_errors: list[dict[str, object]] = []
    for error in exc.errors():
        if isinstance(error, dict):
            sanitized_errors.append({str(k): v for k, v in error.items() if k != "url"})
        else:
            sanitized_errors.append({"msg": str(error)})
    return sanitized_errors


def _validation_field_errors(exc: RequestValidationError) -> list[ApiFieldError]:
    field_errors: list[ApiFieldError] = []
    for error in exc.errors():
        if not isinstance(error, dict):
            field_errors.append(ApiFieldError(message=str(error)))
            continue

        loc = error.get("loc")
        field = ".".join(str(part) for part in loc) if isinstance(loc, (list, tuple)) else None
        message = error.get("msg")
        code = error.get("type")
        ctx = error.get("ctx")
        field_errors.append(
            ApiFieldError(
                field=field,
                message=message if isinstance(message, str) else "Недопустимое значение",
                code=code if isinstance(code, str) else "invalid",
                details=ctx if isinstance(ctx, dict) else None,
            )
        )
    return field_errors


def _normalize_http_detail(detail: object) -> tuple[str, str, dict[str, object] | list[dict[str, object]] | None]:
    if isinstance(detail, dict):
        raw_code = detail.get("code") or detail.get("error_code")
        raw_message = detail.get("message")
        code = raw_code if isinstance(raw_code, str) and raw_code else "HTTP_ERROR"
        message = raw_message if isinstance(raw_message, str) and raw_message else str(detail)

        raw_details = detail.get("details")
        if raw_details is None:
            raw_details = detail.get("detail")
        if isinstance(raw_details, dict):
            details: dict[str, object] | list[dict[str, object]] | None = {str(k): v for k, v in raw_details.items()}
        elif isinstance(raw_details, list) and all(isinstance(item, dict) for item in raw_details):
            details = [{str(k): v for k, v in item.items()} for item in raw_details]
        else:
            details = None

        return code, message, details

    if isinstance(detail, str):
        return "HTTP_ERROR", detail, None

    if isinstance(detail, list) and all(isinstance(item, dict) for item in detail):
        return "HTTP_ERROR", "Ошибка запроса", [{str(k): v for k, v in item.items()} for item in detail]

    return "HTTP_ERROR", str(detail), None


def _standard_error_response(description: str = "Error response") -> dict[str, object]:
    return {
        "description": description,
        "content": {
            "application/json": {
                "schema": {"$ref": "#/components/schemas/ApiErrorEnvelope"},
            },
        },
    }


def _install_openapi_error_schema(app: FastAPI) -> None:
    def custom_openapi() -> dict[str, object]:
        if app.openapi_schema:
            return app.openapi_schema

        schema = get_openapi(
            title=app.title,
            version=app.version,
            openapi_version=app.openapi_version,
            summary=app.summary,
            description=app.description,
            routes=app.routes,
            tags=app.openapi_tags,
            servers=app.servers,
            terms_of_service=app.terms_of_service,
            contact=app.contact,
            license_info=app.license_info,
            separate_input_output_schemas=app.separate_input_output_schemas,
        )

        schemas = schema.setdefault("components", {}).setdefault("schemas", {})
        envelope_schema = ApiErrorEnvelope.model_json_schema(ref_template="#/components/schemas/{model}")
        definitions = envelope_schema.pop("$defs", {})
        schemas.update(definitions)
        schemas["ApiErrorEnvelope"] = envelope_schema

        for path_item in schema.get("paths", {}).values():
            if not isinstance(path_item, dict):
                continue
            for operation in path_item.values():
                if not isinstance(operation, dict):
                    continue
                responses = operation.setdefault("responses", {})
                if not isinstance(responses, dict):
                    continue
                for status_code, response in list(responses.items()):
                    if not status_code.isdigit() or int(status_code) < 400 or not isinstance(response, dict):
                        continue
                    response["content"] = _standard_error_response(response.get("description", "Error response"))[
                        "content"
                    ]
                responses.setdefault("500", _standard_error_response("Внутренняя ошибка сервера"))

        app.openapi_schema = schema
        return schema

    app.openapi = custom_openapi  # type: ignore[method-assign]


def register_exception_handlers(app: FastAPI) -> None:
    # Maps fastapi-users string error codes to structured client-facing errors.
    fastapi_users_error_map: dict[str, tuple[str, str, dict[str, object] | None]] = {
        "REGISTER_USER_ALREADY_EXISTS": (
            "email_taken",
            "\u042d\u043b\u0435\u043a\u0442\u0440\u043e\u043d\u043d\u0430\u044f \u043f\u043e\u0447\u0442\u0430 \u0443\u0436\u0435 \u0441\u0443\u0449\u0435\u0441\u0442\u0432\u0443\u0435\u0442",
            {"code": "email_taken"},
        ),
    }

    @app.exception_handler(AppError)
    def app_error_handler(request: Request, exc: AppError) -> JSONResponse:  # pyright: ignore[reportUnusedFunction]
        request_id = _get_request_id(request)
        _log_app_error(request, exc, request_id)
        return api_error_response(
            request,
            status_code=exc.status_code,
            code=exc.code,
            message=exc.message,
            details=exc.public_details,
            field_errors=_app_error_field_errors(exc),
            headers=_app_error_headers(exc),
        )

    @app.exception_handler(HTTPException)
    def http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:  # pyright: ignore[reportUnusedFunction]
        detail: object = exc.detail
        details: dict[str, object] | list[dict[str, object]] | None
        if isinstance(detail, str) and detail in fastapi_users_error_map:
            code, message, details = fastapi_users_error_map[detail]
            return api_error_response(
                request,
                status_code=exc.status_code,
                code=code,
                message=message,
                details=details,
                headers=cast("Mapping[str, str] | None", exc.headers),
            )

        code, message, details = _normalize_http_detail(detail)
        return api_error_response(
            request,
            status_code=exc.status_code,
            code=code,
            message=message,
            details=details,
            headers=cast("Mapping[str, str] | None", exc.headers),
        )

    @app.exception_handler(RequestValidationError)
    def request_validation_exception_handler(request: Request, exc: RequestValidationError) -> JSONResponse:  # pyright: ignore[reportUnusedFunction]
        return api_error_response(
            request,
            status_code=422,
            code="VALIDATION_ERROR",
            message="\u041e\u0448\u0438\u0431\u043a\u0430 \u0432\u0430\u043b\u0438\u0434\u0430\u0446\u0438\u0438 \u0437\u0430\u043f\u0440\u043e\u0441\u0430",
            details=_serialize_validation_errors(exc),
            field_errors=_validation_field_errors(exc),
        )

    @app.exception_handler(Exception)
    def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:  # pyright: ignore[reportUnusedFunction]
        request_id = _get_request_id(request)
        logger.error(
            "Unhandled request exception",
            extra={
                "request_id": request_id,
                "method": request.method,
                "path": request.url.path,
            },
            exc_info=exc,
        )
        return api_error_response(
            request,
            status_code=500,
            code="INTERNAL_SERVER_ERROR",
            message="Внутренняя ошибка сервера",
        )

    _install_openapi_error_schema(app)
