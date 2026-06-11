"""Versioned stream events for the AI LMS runtime."""

from datetime import UTC, datetime
from typing import Literal

from pydantic import Field

from src.db.strict_base_model import PydanticStrictBaseModel
from src.services.ai.contracts.outputs import AIArtifact, EvidenceCitation
from src.types import JsonObject


def utc_now() -> datetime:
    return datetime.now(UTC)


class V2EventBase(PydanticStrictBaseModel):
    version: Literal[2] = 2
    type: str
    event_id: str
    run_id: str
    thread_id: str
    sequence: int = Field(ge=1)
    timestamp: datetime = Field(default_factory=utc_now)


class StatusChangedPayload(PydanticStrictBaseModel):
    status: str
    message: str


class ToolProgressPayload(PydanticStrictBaseModel):
    tool_name: str
    label: str
    status: Literal["pending", "running", "complete", "error"]
    detail: str | None = None


class ArtifactDeltaPayload(PydanticStrictBaseModel):
    artifact: AIArtifact
    final: bool = False


class CitationAddedPayload(PydanticStrictBaseModel):
    citation: EvidenceCitation


class RunErrorPayload(PydanticStrictBaseModel):
    message: str
    code: str
    recoverable: bool = True
    details: JsonObject = Field(default_factory=dict)


class V2RunStartedEvent(V2EventBase):
    type: Literal["run.started"] = "run.started"
    payload: JsonObject = Field(default_factory=dict)


class V2StatusChangedEvent(V2EventBase):
    type: Literal["status.changed"] = "status.changed"
    payload: StatusChangedPayload


class V2ToolStartedEvent(V2EventBase):
    type: Literal["tool.started"] = "tool.started"
    payload: ToolProgressPayload


class V2ToolDeltaEvent(V2EventBase):
    type: Literal["tool.delta"] = "tool.delta"
    payload: ToolProgressPayload


class V2ToolFinishedEvent(V2EventBase):
    type: Literal["tool.finished"] = "tool.finished"
    payload: ToolProgressPayload


class V2MessageDeltaEvent(V2EventBase):
    type: Literal["message.delta"] = "message.delta"
    payload: JsonObject


class V2ArtifactDeltaEvent(V2EventBase):
    type: Literal["artifact.delta"] = "artifact.delta"
    payload: ArtifactDeltaPayload


class V2CitationAddedEvent(V2EventBase):
    type: Literal["citation.added"] = "citation.added"
    payload: CitationAddedPayload


class V2RunFinishedEvent(V2EventBase):
    type: Literal["run.finished"] = "run.finished"
    payload: JsonObject = Field(default_factory=dict)


class V2RunErrorEvent(V2EventBase):
    type: Literal["run.error"] = "run.error"
    payload: RunErrorPayload


class V2RunAbortedEvent(V2EventBase):
    type: Literal["run.aborted"] = "run.aborted"
    payload: JsonObject = Field(default_factory=dict)


V2StreamEvent = (
    V2RunStartedEvent
    | V2StatusChangedEvent
    | V2ToolStartedEvent
    | V2ToolDeltaEvent
    | V2ToolFinishedEvent
    | V2MessageDeltaEvent
    | V2ArtifactDeltaEvent
    | V2CitationAddedEvent
    | V2RunFinishedEvent
    | V2RunErrorEvent
    | V2RunAbortedEvent
)
