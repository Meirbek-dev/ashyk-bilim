"""Custom exceptions for AI services."""

from src.types import JsonObject


class AIServiceException(Exception):
    """Base exception for all AI service errors."""

    def __init__(
        self,
        message: str,
        error_code: str = "AI_ERROR",
        details: JsonObject | None = None,
    ) -> None:
        self.message = message
        self.error_code = error_code
        self.details = details or {}
        super().__init__(self.message)

    def to_dict(self) -> JsonObject:
        """Convert exception to dictionary for API responses."""
        return {
            "error": self.message,
            "error_code": self.error_code,
            "details": self.details,
        }


class AIProcessingError(AIServiceException):
    """Raised when AI processing fails (maps to HTTP 500)."""

    def __init__(self, message: str, details: JsonObject | None = None) -> None:
        super().__init__(message, "AI_PROCESSING_ERROR", details)


class ContentModerationError(AIServiceException):
    """Raised when a user message is blocked by content moderation."""

    def __init__(self, details: JsonObject | None = None) -> None:
        super().__init__(
            "Message blocked by content safety policy",
            "CONTENT_MODERATION_BLOCKED",
            details,
        )


class AITimeoutError(AIServiceException):
    """Raised when AI processing times out (maps to HTTP 504)."""

    def __init__(self, timeout: int, details: JsonObject | None = None) -> None:
        message = f"AI processing timed out after {timeout} seconds"
        super().__init__(message, "AI_TIMEOUT_ERROR", details)


class RetrievalError(AIServiceException):
    """Raised when retrieval or embedding operations fail (maps to HTTP 500)."""

    def __init__(self, message: str, details: JsonObject | None = None) -> None:
        super().__init__(message, "RETRIEVAL_ERROR", details)


class ChatSessionError(AIServiceException):
    """Raised when chat session operations fail (maps to HTTP 500)."""

    def __init__(self, message: str, details: JsonObject | None = None) -> None:
        super().__init__(message, "CHAT_SESSION_ERROR", details)


class ActivityNotFoundError(AIServiceException):
    """Raised when the requested activity does not exist (maps to HTTP 404)."""

    def __init__(self, activity_uuid: str, details: JsonObject | None = None) -> None:
        message = f"Activity '{activity_uuid}' not found"
        super().__init__(message, "ACTIVITY_NOT_FOUND", details)
