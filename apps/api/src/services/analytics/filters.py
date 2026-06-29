from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Annotated, Literal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import HTTPException, Query
from pydantic import Field, field_validator

from src.db.strict_base_model import PydanticStrictBaseModel

WindowPreset = Literal["7d", "28d", "90d"]
ComparePreset = Literal["previous_period", "none"]
Bucket = Literal["day", "week"]
SortOrder = Literal["asc", "desc"]
CourseSortBy = Literal[
    "name",
    "active",
    "completion",
    "risk",
    "health",
    "engagement",
    "pressure",
    "difficulty",
    "signals",
]
AssessmentSortBy = Literal["title", "submission", "pass", "difficulty", "latency", "signals"]


def _parse_csv_ints(value: str | None) -> list[int]:
    if not value:
        return []
    items: list[int] = []
    for raw in value.split(","):
        chunk = raw.strip()
        if not chunk:
            continue
        try:
            items.append(int(chunk))
        except ValueError as exc:
            raise HTTPException(
                status_code=422,
                detail=f"Некорректное значение списка целых чисел: {chunk}",
            ) from exc
    return items


class AnalyticsFilters(PydanticStrictBaseModel):
    window: WindowPreset = "28d"
    compare: ComparePreset = "previous_period"
    bucket: Bucket = "day"
    bucket_start: datetime | None = None
    course_ids: list[int] = Field(default_factory=list)
    cohort_ids: list[int] = Field(default_factory=list)
    teacher_user_id: int | None = None
    timezone: str = "UTC"
    page: int = 1
    page_size: int = 25
    sort_by: CourseSortBy | AssessmentSortBy | None = None
    sort_order: SortOrder = "desc"

    @field_validator("timezone")
    @classmethod
    def validate_timezone(cls, value: str) -> str:
        try:
            ZoneInfo(value)
        except ZoneInfoNotFoundError as exc:
            msg = f"Неизвестный часовой пояс: {value}"
            raise ValueError(msg) from exc
        return value

    @property
    def window_days(self) -> int:
        return {"7d": 7, "28d": 28, "90d": 90}[self.window]

    @property
    def tzinfo(self) -> ZoneInfo:
        return ZoneInfo(self.timezone)

    @property
    def bucket_count(self) -> int:
        if self.bucket == "week":
            return max(1, self.window_days // 7)
        return self.window_days

    @property
    def offset(self) -> int:
        return (self.page - 1) * self.page_size

    @field_validator("page")
    @classmethod
    def validate_page(cls, value: int) -> int:
        return max(1, value)

    @field_validator("page_size")
    @classmethod
    def validate_page_size(cls, value: int) -> int:
        return min(max(1, value), 200)

    def window_bounds(self, *, now: datetime | None = None) -> tuple[datetime, datetime]:
        end = (now or datetime.now(tz=UTC)).astimezone(UTC)
        start = end - timedelta(days=self.window_days)
        return start, end

    def previous_window_bounds(self, *, now: datetime | None = None) -> tuple[datetime, datetime]:
        current_start, _ = self.window_bounds(now=now)
        previous_end = current_start
        previous_start = previous_end - timedelta(days=self.window_days)
        return previous_start, previous_end


def get_analytics_filters(
    window: Annotated[WindowPreset, Query()] = "28d",
    compare: Annotated[ComparePreset, Query()] = "previous_period",
    bucket: Annotated[Bucket, Query()] = "day",
    bucket_start: Annotated[datetime | None, Query()] = None,
    course_ids: Annotated[str | None, Query()] = None,
    cohort_ids: Annotated[str | None, Query()] = None,
    teacher_user_id: Annotated[int | None, Query()] = None,
    timezone: Annotated[str, Query()] = "UTC",
    page: Annotated[int, Query()] = 1,
    page_size: Annotated[int, Query()] = 25,
    sort_by: Annotated[CourseSortBy | AssessmentSortBy | None, Query()] = None,
    sort_order: Annotated[SortOrder, Query()] = "desc",
) -> AnalyticsFilters:
    return AnalyticsFilters(
        window=window,
        compare=compare,
        bucket=bucket,
        bucket_start=bucket_start,
        course_ids=_parse_csv_ints(course_ids),
        cohort_ids=_parse_csv_ints(cohort_ids),
        teacher_user_id=teacher_user_id,
        timezone=timezone,
        page=page,
        page_size=page_size,
        sort_by=sort_by,
        sort_order=sort_order,
    )
