"""
Custom exceptions for AI services.
"""

from typing import Any


class AIServiceException(Exception):
    """Base exception for all AI service errors."""

    def __init__(
        self,
        message: str,
        error_code: str = "AI_ERROR",
        details: dict[str, Any] | None = None,
    ) -> None:
        self.message = message
        self.error_code = error_code
        self.details = details or {}
        super().__init__(self.message)

    def to_dict(self) -> dict[str, Any]:
        """Convert exception to dictionary for API responses."""
        return {
            "error": self.message,
            "error_code": self.error_code,
            "details": self.details,
        }


class AIProcessingError(AIServiceException):
    """Raised when AI processing fails (maps to HTTP 500)."""

    def __init__(self, message: str, details: dict[str, Any] | None = None) -> None:
        super().__init__(message, "AI_PROCESSING_ERROR", details)


class AITimeoutError(AIServiceException):
    """Raised when AI processing times out (maps to HTTP 504)."""

    def __init__(self, timeout: int, details: dict[str, Any] | None = None) -> None:
        message = f"AI processing timed out after {timeout} seconds"
        super().__init__(message, "AI_TIMEOUT_ERROR", details)


class RetrievalError(AIServiceException):
    """Raised when retrieval or embedding operations fail (maps to HTTP 500)."""

    def __init__(self, message: str, details: dict[str, Any] | None = None) -> None:
        super().__init__(message, "RETRIEVAL_ERROR", details)


class ChatSessionError(AIServiceException):
    """Raised when chat session operations fail (maps to HTTP 500)."""

    def __init__(self, message: str, details: dict[str, Any] | None = None) -> None:
        super().__init__(message, "CHAT_SESSION_ERROR", details)


class ActivityNotFoundError(AIServiceException):
    """Raised when the requested activity does not exist (maps to HTTP 404)."""

    def __init__(
        self, activity_uuid: str, details: dict[str, Any] | None = None
    ) -> None:
        message = f"Activity '{activity_uuid}' not found"
        super().__init__(message, "ACTIVITY_NOT_FOUND", details)
