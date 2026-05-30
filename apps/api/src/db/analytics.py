from datetime import UTC, date, datetime
from typing import Any

from sqlalchemy import JSON, Column, DateTime, Numeric, func
from sqlmodel import Field, SQLModel


class AnalyticsEvent(SQLModel, table=True):
    __tablename__ = "analytics_event"  # pyright: ignore[reportAssignmentType]

    id: int | None = Field(default=None, primary_key=True)
    event_type: str
    course_id: int | None = None
    chapter_id: int | None = None
    activity_id: int | None = None
    assessment_type: str | None = None
    assessment_id: int | None = None
    user_id: int | None = None
    teacher_user_id: int | None = None
    cohort_id: int | None = None
    event_ts: datetime = Field(default_factory=lambda: datetime.now(tz=UTC))
    event_date: date
    payload: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON, nullable=False))
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(tz=UTC),
        sa_column=Column(DateTime(timezone=True), server_default=func.now(), nullable=False),
    )


class DailyTeacherMetrics(SQLModel, table=True):
    __tablename__ = "daily_teacher_metrics"  # pyright: ignore[reportAssignmentType]

    metric_date: date = Field(primary_key=True)
    teacher_user_id: int = Field(primary_key=True)
    managed_course_count: int = 0
    active_learners_7d: int = 0
    active_learners_28d: int = 0
    active_learners_90d: int = 0
    returning_learners_28d: int = 0
    completion_rate: float | None = Field(default=None, sa_column=Column(Numeric(5, 2)))
    avg_progress_pct: float | None = Field(default=None, sa_column=Column(Numeric(5, 2)))
    at_risk_learners: int = 0
    ungraded_submissions: int = 0
    courses_with_negative_engagement: int = 0
    certificates_issued_28d: int = 0
    generated_at: datetime = Field(
        default_factory=lambda: datetime.now(tz=UTC),
        sa_column=Column(DateTime(timezone=True), server_default=func.now(), nullable=False),
    )


class DailyCourseMetrics(SQLModel, table=True):
    __tablename__ = "daily_course_metrics"  # pyright: ignore[reportAssignmentType]

    metric_date: date = Field(primary_key=True)
    course_id: int = Field(primary_key=True)
    teacher_user_id: int | None = None
    enrolled_learners: int = 0
    active_learners_7d: int = 0
    active_learners_28d: int = 0
    completion_rate: float | None = Field(default=None, sa_column=Column(Numeric(5, 2)))
    avg_progress_pct: float | None = Field(default=None, sa_column=Column(Numeric(5, 2)))
    at_risk_learners: int = 0
    ungraded_submissions: int = 0
    certificates_issued: int = 0
    content_health_score: float | None = Field(default=None, sa_column=Column(Numeric(5, 2)))
    engagement_delta_pct: float | None = Field(default=None, sa_column=Column(Numeric(6, 2)))
    last_content_update_at: datetime | None = None
    generated_at: datetime = Field(
        default_factory=lambda: datetime.now(tz=UTC),
        sa_column=Column(DateTime(timezone=True), server_default=func.now(), nullable=False),
    )


class DailyCourseEngagement(SQLModel, table=True):
    __tablename__ = "daily_course_engagement"  # pyright: ignore[reportAssignmentType]

    metric_date: date = Field(primary_key=True)
    course_id: int = Field(primary_key=True)
    chapter_id: int | None = Field(default=None, primary_key=True)
    activity_id: int | None = Field(default=None, primary_key=True)
    step_order: int | None = None
    started_learners: int = 0
    completed_learners: int = 0
    dropoff_from_previous_pct: float | None = Field(default=None, sa_column=Column(Numeric(6, 2)))
    generated_at: datetime = Field(
        default_factory=lambda: datetime.now(tz=UTC),
        sa_column=Column(DateTime(timezone=True), server_default=func.now(), nullable=False),
    )


class DailyAssessmentMetrics(SQLModel, table=True):
    __tablename__ = "daily_assessment_metrics"  # pyright: ignore[reportAssignmentType]

    metric_date: date = Field(primary_key=True)
    assessment_type: str = Field(primary_key=True)
    assessment_id: int = Field(primary_key=True)
    course_id: int
    activity_id: int | None = None
    eligible_learners: int = 0
    submitted_learners: int = 0
    submission_rate: float | None = Field(default=None, sa_column=Column(Numeric(5, 2)))
    completion_rate: float | None = Field(default=None, sa_column=Column(Numeric(5, 2)))
    pass_rate: float | None = Field(default=None, sa_column=Column(Numeric(5, 2)))
    median_score: float | None = Field(default=None, sa_column=Column(Numeric(6, 2)))
    avg_score: float | None = Field(default=None, sa_column=Column(Numeric(6, 2)))
    avg_attempts: float | None = Field(default=None, sa_column=Column(Numeric(6, 2)))
    grading_latency_hours_p50: float | None = Field(default=None, sa_column=Column(Numeric(8, 2)))
    grading_latency_hours_p90: float | None = Field(default=None, sa_column=Column(Numeric(8, 2)))
    difficulty_score: float | None = Field(default=None, sa_column=Column(Numeric(6, 2)))
    generated_at: datetime = Field(
        default_factory=lambda: datetime.now(tz=UTC),
        sa_column=Column(DateTime(timezone=True), server_default=func.now(), nullable=False),
    )


class DailyUserCourseProgress(SQLModel, table=True):
    __tablename__ = "daily_user_course_progress"  # pyright: ignore[reportAssignmentType]

    metric_date: date = Field(primary_key=True)
    user_id: int = Field(primary_key=True)
    course_id: int = Field(primary_key=True)
    trailrun_id: int | None = None
    progress_pct: float = Field(default=0, sa_column=Column(Numeric(5, 2), nullable=False))
    completed_steps: int = 0
    total_steps: int = 0
    last_activity_at: datetime | None = None
    is_completed: bool = False
    has_certificate: bool = False
    generated_at: datetime = Field(
        default_factory=lambda: datetime.now(tz=UTC),
        sa_column=Column(DateTime(timezone=True), server_default=func.now(), nullable=False),
    )


class LearnerRiskSnapshot(SQLModel, table=True):
    __tablename__ = "learner_risk_snapshot"  # pyright: ignore[reportAssignmentType]

    snapshot_date: date = Field(primary_key=True)
    user_id: int = Field(primary_key=True)
    course_id: int = Field(primary_key=True)
    teacher_user_id: int | None = None
    progress_pct: float = Field(default=0, sa_column=Column(Numeric(5, 2), nullable=False))
    days_since_last_activity: int | None = None
    failed_assessments: int = 0
    missing_required_assessments: int = 0
    open_grading_blocks: int = 0
    risk_score: float = Field(default=0, sa_column=Column(Numeric(6, 2), nullable=False))
    risk_level: str
    reason_codes: list[str] = Field(default_factory=list, sa_column=Column(JSON, nullable=False))
    recommended_action: str | None = None
    generated_at: datetime = Field(
        default_factory=lambda: datetime.now(tz=UTC),
        sa_column=Column(DateTime(timezone=True), server_default=func.now(), nullable=False),
    )


class TeacherIntervention(SQLModel, table=True):
    __tablename__ = "teacher_intervention"  # pyright: ignore[reportAssignmentType]

    id: int | None = Field(default=None, primary_key=True)
    teacher_user_id: int = Field(index=True)
    user_id: int = Field(index=True)
    course_id: int = Field(index=True)
    intervention_type: str
    status: str = "planned"
    outcome: str | None = None
    notes: str | None = None
    risk_score_before: float | None = Field(default=None, sa_column=Column(Numeric(6, 2)))
    risk_score_after: float | None = Field(default=None, sa_column=Column(Numeric(6, 2)))
    payload: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON, nullable=False))
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(tz=UTC),
        sa_column=Column(DateTime(timezone=True), server_default=func.now(), nullable=False),
    )
    updated_at: datetime = Field(
        default_factory=lambda: datetime.now(tz=UTC),
        sa_column=Column(DateTime(timezone=True), server_default=func.now(), nullable=False),
    )
    resolved_at: datetime | None = Field(default=None, sa_column=Column(DateTime(timezone=True), nullable=True))


class AnalyticsSavedView(SQLModel, table=True):
    __tablename__ = "analytics_saved_view"  # pyright: ignore[reportAssignmentType]

    id: int | None = Field(default=None, primary_key=True)
    teacher_user_id: int = Field(index=True)
    name: str
    view_type: str = Field(default="overview", index=True)
    query: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON, nullable=False))
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(tz=UTC),
        sa_column=Column(DateTime(timezone=True), server_default=func.now(), nullable=False),
    )
    updated_at: datetime = Field(
        default_factory=lambda: datetime.now(tz=UTC),
        sa_column=Column(DateTime(timezone=True), server_default=func.now(), nullable=False),
    )
