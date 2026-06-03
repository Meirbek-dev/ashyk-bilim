"""Internal endpoints — metrics, health, dead-letter inspection.

These are NOT exposed to end users. Mount under /internal/ with appropriate
network-level access control (e.g., only accessible from the cluster).
"""

from typing import Any

from fastapi import APIRouter

from src.db.strict_base_model import PydanticStrictBaseModel
from src.infra.metrics import METRICS
from src.services.events.bus import get_event_bus

router = APIRouter(prefix="/internal", tags=["internal"])


class MetricSample(PydanticStrictBaseModel):
    labels: dict[str, str]
    value: float | None = None
    count: int | None = None
    sum: float | None = None
    p50: float | None = None
    p99: float | None = None


class MetricsResponse(PydanticStrictBaseModel):
    grading_submission_total: list[MetricSample]
    grading_latency_seconds: list[MetricSample]
    grading_auto_score: list[MetricSample]
    code_execution_duration_seconds: list[MetricSample]
    code_execution_degraded_total: list[MetricSample]
    assessment_lifecycle_transition_total: list[MetricSample]
    event_bus_dispatch_total: list[MetricSample]


class InternalHealthResponse(PydanticStrictBaseModel):
    status: str


class DeadLetterEntry(PydanticStrictBaseModel):
    handler: str
    event_type: str
    error: str
    occurred_at: str


class DeadLettersResponse(PydanticStrictBaseModel):
    count: int
    entries: list[DeadLetterEntry]


class DeadLettersClearResponse(PydanticStrictBaseModel):
    cleared: int


@router.get("/metrics", response_model=MetricsResponse)
async def get_metrics() -> dict[str, Any]:
    """Return all Prometheus-compatible metrics."""
    return METRICS.collect_all()


@router.get("/health", response_model=InternalHealthResponse)
async def health_check() -> InternalHealthResponse:
    """Basic health check."""
    return InternalHealthResponse(status="ok")


@router.get("/dead-letters", response_model=DeadLettersResponse)
async def get_dead_letters() -> DeadLettersResponse:
    """Return the event bus dead-letter queue for diagnostics."""
    bus = get_event_bus()
    return DeadLettersResponse(
        count=len(bus.dead_letters),
        entries=[
            DeadLetterEntry(
                handler=entry.handler_name,
                event_type=type(entry.event).__name__,
                error=entry.error,
                occurred_at=entry.occurred_at.isoformat(),
            )
            for entry in bus.dead_letters
        ],
    )


@router.post("/dead-letters/clear", response_model=DeadLettersClearResponse)
async def clear_dead_letters() -> DeadLettersClearResponse:
    """Clear the dead-letter queue."""
    bus = get_event_bus()
    count = bus.clear_dead_letters()
    return DeadLettersClearResponse(cleared=count)
