from collections.abc import Mapping
from http import HTTPStatus
from typing import Literal, Self

type ErrorDetails = dict[str, object] | list[dict[str, object]] | None
type ErrorField = object
type ErrorLogLevel = Literal["debug", "info", "warning", "error", "critical"]


class AppError(Exception):
    """Typed application error that can be rendered as an API error envelope."""

    def __init__(
        self,
        *,
        code: str,
        message: str,
        status_code: int,
        details: ErrorDetails = None,
        field_errors: list[ErrorField] | None = None,
        retry_after: int | None = None,
        log_level: ErrorLogLevel = "warning",
        safe_details: bool = True,
        cause: BaseException | None = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code
        self.details = details
        self.field_errors = field_errors or []
        self.retry_after = retry_after
        self.log_level = log_level
        self.safe_details = safe_details
        self.__cause__ = cause

    @property
    def public_details(self) -> ErrorDetails:
        return self.details if self.safe_details else None

    @classmethod
    def from_status(
        cls,
        *,
        status_code: int,
        code: str,
        message: str,
        details: ErrorDetails = None,
        field_errors: list[ErrorField] | None = None,
        retry_after: int | None = None,
        safe_details: bool = True,
        cause: BaseException | None = None,
    ) -> Self:
        log_level: ErrorLogLevel = "error" if status_code >= HTTPStatus.INTERNAL_SERVER_ERROR else "warning"
        return cls(
            code=code,
            message=message,
            status_code=status_code,
            details=details,
            field_errors=field_errors,
            retry_after=retry_after,
            log_level=log_level,
            safe_details=safe_details,
            cause=cause,
        )


class ValidationAppError(AppError):
    def __init__(
        self,
        *,
        code: str = "VALIDATION_ERROR",
        message: str = "Request validation failed",
        details: ErrorDetails = None,
        field_errors: list[ErrorField] | None = None,
        cause: BaseException | None = None,
    ) -> None:
        super().__init__(
            code=code,
            message=message,
            status_code=HTTPStatus.UNPROCESSABLE_ENTITY,
            details=details,
            field_errors=field_errors,
            cause=cause,
        )


class AuthAppError(AppError):
    def __init__(
        self,
        *,
        code: str = "AUTH_REQUIRED",
        message: str = "Authentication is required",
        details: ErrorDetails = None,
        cause: BaseException | None = None,
    ) -> None:
        super().__init__(
            code=code,
            message=message,
            status_code=HTTPStatus.UNAUTHORIZED,
            details=details,
            cause=cause,
        )


class PermissionAppError(AppError):
    def __init__(
        self,
        *,
        code: str = "PERMISSION_DENIED",
        message: str = "You do not have permission to perform this action",
        details: ErrorDetails = None,
        cause: BaseException | None = None,
    ) -> None:
        super().__init__(
            code=code,
            message=message,
            status_code=HTTPStatus.FORBIDDEN,
            details=details,
            cause=cause,
        )


class NotFoundAppError(AppError):
    def __init__(
        self,
        *,
        code: str,
        message: str,
        details: ErrorDetails = None,
        cause: BaseException | None = None,
    ) -> None:
        super().__init__(
            code=code,
            message=message,
            status_code=HTTPStatus.NOT_FOUND,
            details=details,
            cause=cause,
        )


class ConflictAppError(AppError):
    def __init__(
        self,
        *,
        code: str = "VERSION_CONFLICT",
        message: str = "The resource was changed by another operation",
        details: ErrorDetails = None,
        cause: BaseException | None = None,
    ) -> None:
        super().__init__(
            code=code,
            message=message,
            status_code=HTTPStatus.CONFLICT,
            details=details,
            cause=cause,
        )


class RateLimitAppError(AppError):
    def __init__(
        self,
        *,
        code: str = "RATE_LIMITED",
        message: str = "Too many requests",
        details: ErrorDetails = None,
        retry_after: int | None = None,
        cause: BaseException | None = None,
    ) -> None:
        super().__init__(
            code=code,
            message=message,
            status_code=HTTPStatus.TOO_MANY_REQUESTS,
            details=details,
            retry_after=retry_after,
            cause=cause,
        )


class DependencyAppError(AppError):
    def __init__(
        self,
        *,
        code: str,
        message: str,
        details: ErrorDetails = None,
        retry_after: int | None = None,
        cause: BaseException | None = None,
    ) -> None:
        super().__init__(
            code=code,
            message=message,
            status_code=HTTPStatus.SERVICE_UNAVAILABLE,
            details=details,
            retry_after=retry_after,
            log_level="error",
            safe_details=False,
            cause=cause,
        )


class InvariantAppError(AppError):
    def __init__(
        self,
        *,
        code: str = "DATA_INVARIANT_VIOLATION",
        message: str = "Internal data invariant violation",
        details: ErrorDetails = None,
        cause: BaseException | None = None,
    ) -> None:
        super().__init__(
            code=code,
            message=message,
            status_code=HTTPStatus.INTERNAL_SERVER_ERROR,
            details=details,
            log_level="error",
            safe_details=False,
            cause=cause,
        )


def _details(**values: object) -> dict[str, object]:
    return {key: value for key, value in values.items() if value is not None}


def course_not_found(course_uuid: str | None = None) -> NotFoundAppError:
    return NotFoundAppError(
        code="COURSE_NOT_FOUND",
        message="Course was not found",
        details=_details(course_uuid=course_uuid),
    )


def activity_not_found(activity_uuid: str | None = None) -> NotFoundAppError:
    return NotFoundAppError(
        code="ACTIVITY_NOT_FOUND",
        message="Activity was not found",
        details=_details(activity_uuid=activity_uuid),
    )


def submission_not_found(submission_uuid: str | None = None) -> NotFoundAppError:
    return NotFoundAppError(
        code="SUBMISSION_NOT_FOUND",
        message="Submission was not found",
        details=_details(submission_uuid=submission_uuid),
    )


def version_conflict(details: Mapping[str, object] | None = None) -> ConflictAppError:
    return ConflictAppError(
        code="VERSION_CONFLICT",
        message="This resource was changed elsewhere. Review the latest version before saving.",
        details={str(key): value for key, value in (details or {}).items()},
    )


def dependency_unavailable(
    service: str,
    operation: str,
    *,
    retry_after: int | None = None,
    cause: BaseException | None = None,
) -> DependencyAppError:
    return DependencyAppError(
        code=f"{service.upper()}_UNAVAILABLE",
        message=f"{service} is temporarily unavailable",
        details=_details(service=service, operation=operation),
        retry_after=retry_after,
        cause=cause,
    )
