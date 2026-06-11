"""Helpers for ordered AI stream event emission."""

from ulid import ULID

from src.services.ai.contracts.events import (
    ArtifactDeltaPayload,
    CitationAddedPayload,
    MessageDeltaPayload,
    RunErrorPayload,
    StatusChangedPayload,
    ToolProgressPayload,
    V2ArtifactDeltaEvent,
    V2CitationAddedEvent,
    V2MessageDeltaEvent,
    V2RunAbortedEvent,
    V2RunErrorEvent,
    V2RunFinishedEvent,
    V2RunStartedEvent,
    V2StatusChangedEvent,
    V2ToolFinishedEvent,
    V2ToolStartedEvent,
)
from src.services.ai.contracts.outputs import AIArtifact, EvidenceCitation
from src.types import JsonObject


class StreamEventFactory:
    """Creates ordered v2 AI stream events for a single run."""

    __slots__ = ("_sequence", "run_id", "thread_id")

    def __init__(self, *, thread_id: str, run_id: str | None = None) -> None:
        self.thread_id = thread_id
        self.run_id = run_id or str(ULID())
        self._sequence = 0

    def _next(self) -> tuple[str, int]:
        self._sequence += 1
        return str(ULID()), self._sequence

    def started(self, payload: JsonObject | None = None) -> V2RunStartedEvent:
        event_id, sequence = self._next()
        return V2RunStartedEvent(
            event_id=event_id,
            run_id=self.run_id,
            thread_id=self.thread_id,
            sequence=sequence,
            payload=payload or {},
        )

    def status(self, *, status: str, message: str) -> V2StatusChangedEvent:
        event_id, sequence = self._next()
        return V2StatusChangedEvent(
            event_id=event_id,
            run_id=self.run_id,
            thread_id=self.thread_id,
            sequence=sequence,
            payload=StatusChangedPayload(status=status, message=message),
        )

    def tool_started(self, *, tool_name: str, label: str, detail: str | None = None) -> V2ToolStartedEvent:
        event_id, sequence = self._next()
        return V2ToolStartedEvent(
            event_id=event_id,
            run_id=self.run_id,
            thread_id=self.thread_id,
            sequence=sequence,
            payload=ToolProgressPayload(tool_name=tool_name, label=label, status="running", detail=detail),
        )

    def tool_finished(self, *, tool_name: str, label: str, detail: str | None = None) -> V2ToolFinishedEvent:
        event_id, sequence = self._next()
        return V2ToolFinishedEvent(
            event_id=event_id,
            run_id=self.run_id,
            thread_id=self.thread_id,
            sequence=sequence,
            payload=ToolProgressPayload(tool_name=tool_name, label=label, status="complete", detail=detail),
        )

    def message_delta(self, *, delta: str) -> V2MessageDeltaEvent:
        event_id, sequence = self._next()
        return V2MessageDeltaEvent(
            event_id=event_id,
            run_id=self.run_id,
            thread_id=self.thread_id,
            sequence=sequence,
            payload=MessageDeltaPayload(delta=delta),
        )

    def artifact(self, *, artifact: AIArtifact, final: bool = True) -> V2ArtifactDeltaEvent:
        event_id, sequence = self._next()
        return V2ArtifactDeltaEvent(
            event_id=event_id,
            run_id=self.run_id,
            thread_id=self.thread_id,
            sequence=sequence,
            payload=ArtifactDeltaPayload(artifact=artifact, final=final),
        )

    def citation(self, *, citation: EvidenceCitation) -> V2CitationAddedEvent:
        event_id, sequence = self._next()
        return V2CitationAddedEvent(
            event_id=event_id,
            run_id=self.run_id,
            thread_id=self.thread_id,
            sequence=sequence,
            payload=CitationAddedPayload(citation=citation),
        )

    def finished(self, payload: JsonObject | None = None) -> V2RunFinishedEvent:
        event_id, sequence = self._next()
        return V2RunFinishedEvent(
            event_id=event_id,
            run_id=self.run_id,
            thread_id=self.thread_id,
            sequence=sequence,
            payload=payload or {},
        )

    def error(self, *, message: str, code: str, details: JsonObject | None = None) -> V2RunErrorEvent:
        event_id, sequence = self._next()
        return V2RunErrorEvent(
            event_id=event_id,
            run_id=self.run_id,
            thread_id=self.thread_id,
            sequence=sequence,
            payload=RunErrorPayload(message=message, code=code, details=details or {}),
        )

    def aborted(self, payload: JsonObject | None = None) -> V2RunAbortedEvent:
        event_id, sequence = self._next()
        return V2RunAbortedEvent(
            event_id=event_id,
            run_id=self.run_id,
            thread_id=self.thread_id,
            sequence=sequence,
            payload=payload or {},
        )
