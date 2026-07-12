"""Role-aware work queue API contracts."""

from datetime import datetime
from typing import Literal

from pydantic import Field

from src.db.strict_base_model import PydanticStrictBaseModel

WorkRole = Literal["learner", "teacher"]
WorkPriority = Literal["critical", "high", "normal", "low"]


class WorkItem(PydanticStrictBaseModel):
    id: str
    role: WorkRole
    kind: str
    status: str
    priority: WorkPriority
    title: str
    description: str
    href: str
    primary_action: str
    course_uuid: str | None = None
    course_title: str | None = None
    activity_uuid: str | None = None
    activity_title: str | None = None
    due_at: datetime | None = None
    created_at: datetime | None = None
    allowed_actions: list[str] = Field(default_factory=list)


class WorkQueueResponse(PydanticStrictBaseModel):
    items: list[WorkItem] = Field(default_factory=list)
    total: int = 0
    next_cursor: str | None = None
