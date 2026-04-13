from datetime import UTC, datetime
from enum import StrEnum
from typing import Annotated, Any, Literal

from pydantic import Field, StringConstraints
from pydantic_ai.messages import (
    ModelMessage,
    ModelRequest,
    ModelResponse,
    TextPart,
    UserPromptPart,
)

from src.db.strict_base_model import PydanticStrictBaseModel


def utc_now() -> datetime:
    return datetime.now(UTC)


class ChatRole(StrEnum):
    USER = "user"
    ASSISTANT = "assistant"


class ChatMessageMetadata(PydanticStrictBaseModel):
    activity_uuid: str | None = None
    user_id: int | None = None
    request_id: str | None = None
    extra: dict[str, Any] = Field(default_factory=dict)


class ChatMessage(PydanticStrictBaseModel):
    id: str
    role: ChatRole
    content: str = Field(min_length=1)
    created_at: datetime = Field(default_factory=utc_now)
    metadata: ChatMessageMetadata = Field(default_factory=ChatMessageMetadata)

    def to_model_message(self) -> ModelMessage:
        if self.role == ChatRole.USER:
            return ModelRequest(
                parts=[UserPromptPart(content=self.content)],
                timestamp=self.created_at,
                metadata=self.metadata.model_dump(mode="json"),
            )

        return ModelResponse(
            parts=[TextPart(content=self.content)],
            timestamp=self.created_at,
            metadata=self.metadata.model_dump(mode="json"),
        )


class ChatSessionWindow(PydanticStrictBaseModel):
    session_id: str
    messages: list[ChatMessage] = Field(default_factory=list)
    total_messages: int = 0
    window_size: int
    storage_type: Literal["redis", "memory"]
    conversation_summary: str | None = None

    def to_model_messages(self) -> list[ModelMessage]:
        return [message.to_model_message() for message in self.messages]


class RetrievedChunk(PydanticStrictBaseModel):
    id: str
    document: str = Field(min_length=1)
    score: float | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class DocumentChunk(PydanticStrictBaseModel):
    id: str
    document: str = Field(min_length=1)
    source_index: int
    chunk_index: int
    token_count: int
    metadata: dict[str, Any] = Field(default_factory=dict)


class AgentDependencies(PydanticStrictBaseModel):
    activity_uuid: str
    activity_name: str
    course_name: str
    session_id: str
    user_id: int | None = None
    request_id: str | None = None
    request_mode: str = "instructional"
    task_instruction: str | None = None
    conversation_summary: str | None = None
    retrieved_chunks: list[RetrievedChunk] = Field(default_factory=list)


class AgentAnswer(PydanticStrictBaseModel):
    message: str = Field(min_length=1)
    chunk_count: int = 0
    finish_reason: str | None = None
    model_name: str | None = None


class StatusEvent(PydanticStrictBaseModel):
    version: Literal[1] = 1
    type: Literal["status"] = "status"
    status: str
    aichat_uuid: str | None = None
    activity_uuid: str | None = None
    message: str | None = None


class DeltaEvent(PydanticStrictBaseModel):
    version: Literal[1] = 1
    type: Literal["delta"] = "delta"
    # strip_whitespace=False overrides the model-level str_strip_whitespace=True so
    # that leading/trailing spaces within streaming chunks are preserved verbatim.
    content: Annotated[str, StringConstraints(min_length=1, strip_whitespace=False)]
    chunk_id: int


class FinalEvent(PydanticStrictBaseModel):
    version: Literal[1] = 1
    type: Literal["final"] = "final"
    content: str
    aichat_uuid: str
    activity_uuid: str
    chunk_count: int


class ErrorEvent(PydanticStrictBaseModel):
    version: Literal[1] = 1
    type: Literal["error"] = "error"
    error: str
    error_code: str
    status: int | None = None


SSEEvent = StatusEvent | DeltaEvent | FinalEvent | ErrorEvent
