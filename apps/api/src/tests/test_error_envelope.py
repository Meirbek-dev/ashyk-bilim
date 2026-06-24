from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from pydantic import BaseModel

from src.app.errors import ApiFieldError, register_exception_handlers
from src.app.exceptions import DependencyAppError, RateLimitAppError, ValidationAppError


class Payload(BaseModel):
    title: str


def _build_client(*, raise_server_exceptions: bool = True) -> TestClient:
    app = FastAPI()
    register_exception_handlers(app)

    @app.get("/http-error")
    def http_error() -> None:
        raise HTTPException(status_code=404, detail="Missing resource")

    @app.post("/validation-error")
    def validation_error(_payload: Payload) -> dict[str, bool]:
        return {"ok": True}

    @app.get("/app-error")
    def app_error() -> None:
        raise ValidationAppError(
            code="COURSE_TITLE_REQUIRED",
            message="Course title is required",
            details={"reason": "empty_title"},
            field_errors=[
                ApiFieldError(field="body.title", message="Title is required", code="required"),
            ],
        )

    @app.get("/rate-limited")
    def rate_limited() -> None:
        raise RateLimitAppError(retry_after=30)

    @app.get("/dependency-error")
    def dependency_error() -> None:
        raise DependencyAppError(
            code="JUDGE0_UNAVAILABLE",
            message="Code runner is temporarily unavailable",
            details={"internal_endpoint": "http://judge0-server:2358"},
        )

    @app.get("/boom")
    def boom() -> None:
        msg = "secret database failure"
        raise RuntimeError(msg)

    return TestClient(app, raise_server_exceptions=raise_server_exceptions)


def _assert_envelope(payload: dict[str, object], *, code: str, request_id: str) -> None:
    assert payload["code"] == code
    assert isinstance(payload["message"], str)
    assert "details" in payload
    assert isinstance(payload["field_errors"], list)
    assert payload["request_id"] == request_id


def test_http_exception_uses_standard_error_envelope() -> None:
    client = _build_client()

    response = client.get("/http-error", headers={"X-Request-ID": "req-http"})

    assert response.status_code == 404
    assert response.headers["X-Request-ID"] == "req-http"
    payload = response.json()
    _assert_envelope(payload, code="HTTP_ERROR", request_id="req-http")
    assert payload["message"] == "Missing resource"


def test_validation_exception_includes_field_errors() -> None:
    client = _build_client()

    response = client.post("/validation-error", json={}, headers={"X-Request-ID": "req-validation"})

    assert response.status_code == 422
    payload = response.json()
    _assert_envelope(payload, code="VALIDATION_ERROR", request_id="req-validation")
    assert payload["field_errors"][0]["field"] == "body.title"
    assert payload["field_errors"][0]["code"] == "missing"


def test_app_error_uses_typed_error_envelope() -> None:
    client = _build_client()

    response = client.get(
        "/app-error",
        headers={"X-Request-ID": "req-app", "X-Correlation-ID": "corr-app"},
    )

    assert response.status_code == 422
    assert response.headers["X-Correlation-ID"] == "corr-app"
    payload = response.json()
    _assert_envelope(payload, code="COURSE_TITLE_REQUIRED", request_id="req-app")
    assert payload["message"] == "Course title is required"
    assert payload["details"] == {"reason": "empty_title"}
    assert payload["field_errors"] == [
        {
            "field": "body.title",
            "message": "Title is required",
            "code": "required",
            "details": None,
        }
    ]


def test_rate_limit_app_error_includes_retry_after() -> None:
    client = _build_client()

    response = client.get("/rate-limited", headers={"X-Request-ID": "req-rate"})

    assert response.status_code == 429
    assert response.headers["Retry-After"] == "30"
    payload = response.json()
    _assert_envelope(payload, code="RATE_LIMITED", request_id="req-rate")


def test_dependency_app_error_hides_unsafe_details() -> None:
    client = _build_client()

    response = client.get("/dependency-error", headers={"X-Request-ID": "req-dependency"})

    assert response.status_code == 503
    payload = response.json()
    _assert_envelope(payload, code="JUDGE0_UNAVAILABLE", request_id="req-dependency")
    assert payload["details"] is None
    assert "judge0-server" not in response.text


def test_unhandled_exception_returns_safe_500_envelope() -> None:
    client = _build_client(raise_server_exceptions=False)

    response = client.get("/boom", headers={"X-Request-ID": "req-boom"})

    assert response.status_code == 500
    payload = response.json()
    _assert_envelope(payload, code="INTERNAL_SERVER_ERROR", request_id="req-boom")
    assert payload["message"] == "Внутренняя ошибка сервера"
    assert "secret database failure" not in response.text


def test_openapi_documents_standard_error_envelope() -> None:
    client = _build_client()

    assert isinstance(client.app, FastAPI)
    schema = client.app.openapi()

    assert "ApiErrorEnvelope" in schema["components"]["schemas"]
    assert (
        schema["paths"]["/validation-error"]["post"]["responses"]["422"]["content"]["application/json"]["schema"][
            "$ref"
        ]
        == "#/components/schemas/ApiErrorEnvelope"
    )
    assert (
        schema["paths"]["/http-error"]["get"]["responses"]["500"]["content"]["application/json"]["schema"]["$ref"]
        == "#/components/schemas/ApiErrorEnvelope"
    )
