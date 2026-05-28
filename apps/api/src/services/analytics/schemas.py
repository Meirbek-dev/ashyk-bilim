from __future__ import annotations

from typing import Literal

from pydantic import Field

from src.db.strict_base_model import PydanticStrictBaseModel


class MetricCard(PydanticStrictBaseModel):
    value: float
    delta_value: float | None
    delta_pct: float | None
    direction: Literal["up", "down", "flat"]
    label: str
    unit: str | None = None
    is_higher_better: bool = True
    # Optional comparative baseline shown alongside the current value.
    benchmark: float | None = None
    benchmark_label: str | None = None


class TimeSeriesPoint(PydanticStrictBaseModel):
    bucket_start: str
    value: float


class AlertItem(PydanticStrictBaseModel):
    id: str
    type: Literal[
        "risk_spike",
        "engagement_drop",
        "grading_backlog",
        "grading_slo",
        "assessment_outlier",
        "content_stale",
    ]
    severity: Literal["info", "warning", "critical"]
    title: str
    body: str
    href: str | None = None
    course_id: int | None = None
    activity_id: int | None = None
    assessment_id: int | None = None
    learner_count: int | None = None


class AnalyticsFilterOption(PydanticStrictBaseModel):
    label: str
    value: str


class RiskDistributionCounts(PydanticStrictBaseModel):
    high: int = 0
    medium: int = 0
    low: int = 0


class InterventionSummary(PydanticStrictBaseModel):
    total: int = 0
    open: int = 0
    resolved: int = 0
    recovered_learners: int = 0
    avg_risk_delta_after_intervention: float | None = None


class ContentBottleneckRow(PydanticStrictBaseModel):
    course_id: int
    course_name: str
    activity_id: int
    activity_name: str
    activity_type: str
    signal: Literal[
        "high_time_low_completion",
        "exit_after_open",
        "repeated_assessment_failures",
        "stale_low_performance",
    ]
    severity: Literal["info", "warning", "critical"]
    completion_rate: float | None = None
    started_learners: int = 0
    completed_learners: int = 0
    avg_time_seconds: float | None = None
    exit_count: int = 0
    failed_assessments: int = 0
    stale_days: int | None = None
    note: str


class WorkloadAgingBuckets(PydanticStrictBaseModel):
    h0_24: int = 0
    d1_3: int = 0
    d3_7: int = 0
    d7_plus: int = 0


class GradingBacklogItem(PydanticStrictBaseModel):
    course_id: int
    course_name: str
    assessment_id: int
    assessment_type: Literal["manual_assessment"]
    title: str
    awaiting_review: int
    oldest_submitted_at: str | None = None
    age_hours: float | None = None
    sla_breaches: int = 0


class TeacherWorkloadSummary(PydanticStrictBaseModel):
    backlog_total: int = 0
    sla_breaches: int = 0
    median_feedback_latency_hours: float | None = None
    aging_buckets: WorkloadAgingBuckets
    forecast_backlog_7d: int = 0
    backlog_by_manual_assessment: list[GradingBacklogItem]


class InsightFeedItem(PydanticStrictBaseModel):
    id: str
    category: Literal[
        "risk",
        "assessment",
        "content",
        "workload",
        "completion",
        "intervention",
    ]
    severity: Literal["info", "warning", "critical"]
    priority: int
    title: str
    body: str
    course_id: int | None = None
    activity_id: int | None = None
    assessment_type: str | None = None
    assessment_id: int | None = None
    learner_count: int | None = None
    href: str | None = None


class SavedAnalyticsViewCreate(PydanticStrictBaseModel):
    name: str
    view_type: str = "overview"
    query: dict[str, object] = Field(default_factory=dict)


class SavedAnalyticsViewRow(PydanticStrictBaseModel):
    id: int
    teacher_user_id: int
    name: str
    view_type: str
    query: dict[str, object]
    created_at: str
    updated_at: str


class SavedAnalyticsViewListResponse(PydanticStrictBaseModel):
    generated_at: str
    total: int = 0
    items: list[SavedAnalyticsViewRow]


class DrillThroughResponse(PydanticStrictBaseModel):
    generated_at: str
    metric: Literal["active_learners", "completion_rate", "pass_rate", "backlog"]
    total: int = 0
    items: list[dict[str, object]] = Field(default_factory=list)


class DataQualityIssue(PydanticStrictBaseModel):
    id: str
    severity: Literal["info", "warning", "critical"]
    title: str
    detail: str
    course_id: int | None = None
    source: str | None = None


class AnalyticsDataQuality(PydanticStrictBaseModel):
    mode: Literal["live", "rollup"]
    last_rollup_time: str | None = None
    freshness_seconds: int = 0
    confidence_level: Literal["low", "medium", "high"]
    missing_event_sources: list[str]
    courses_without_enough_data: list[dict[str, object]]
    excluded_preview_attempts: int = 0
    excluded_teacher_attempts: int = 0
    issues: list[DataQualityIssue]


class ForecastItem(PydanticStrictBaseModel):
    id: str
    type: Literal[
        "completion_target_miss",
        "grading_backlog_7d",
        "course_completion_deadline",
        "assessment_failure_risk",
    ]
    severity: Literal["info", "warning", "critical"]
    title: str
    prediction: str
    confidence_level: Literal["low", "medium", "high"]
    course_id: int | None = None
    course_name: str | None = None
    assessment_type: str | None = None
    assessment_id: int | None = None
    learner_count: int | None = None
    expected_value: float | None = None
    target_value: float | None = None
    deadline_at: str | None = None


class AnomalyItem(PydanticStrictBaseModel):
    id: str
    type: Literal[
        "engagement_drop",
        "submission_spike",
        "fast_quiz_completion",
        "score_distribution_shift",
    ]
    severity: Literal["info", "warning", "critical"]
    title: str
    detail: str
    observed_value: float | None = None
    baseline_value: float | None = None
    course_id: int | None = None
    course_name: str | None = None
    assessment_type: str | None = None
    assessment_id: int | None = None
    activity_id: int | None = None


class AdminAnalyticsTeacherRow(PydanticStrictBaseModel):
    teacher_user_id: int
    teacher_display_name: str
    managed_course_count: int
    workload_backlog: int
    sla_breaches: int
    median_feedback_latency_hours: float | None = None
    at_risk_learners: int


class AdminAnalyticsCourseRow(PydanticStrictBaseModel):
    course_id: int
    course_uuid: str
    course_name: str
    health_score: float
    completion_rate: float
    active_learners_7d: int
    at_risk_learners: int
    content_roi_score: float | None = None


class AdminAnalyticsCohortRow(PydanticStrictBaseModel):
    cohort_id: int
    cohort_name: str
    learners: int
    retained_learners: int
    retention_rate: float | None = None
    avg_progress_pct: float | None = None


class AdminAnalyticsProgramRow(PydanticStrictBaseModel):
    program_id: int | None = None
    program_name: str
    course_count: int
    learner_count: int
    completion_rate: float | None = None
    health_score: float | None = None


class AdminAnalyticsResponse(PydanticStrictBaseModel):
    generated_at: str
    teacher_workload_comparison: list[AdminAnalyticsTeacherRow]
    course_health_ranking: list[AdminAnalyticsCourseRow]
    cohort_retention: list[AdminAnalyticsCohortRow]
    department_program_performance: list[AdminAnalyticsProgramRow]
    content_roi: list[AdminAnalyticsCourseRow]


class TeacherInterventionCreate(PydanticStrictBaseModel):
    user_id: int
    course_id: int
    intervention_type: Literal[
        "message_sent",
        "submission_graded",
        "extension_granted",
        "meeting_scheduled",
        "learner_recovered",
    ]
    status: Literal["planned", "completed", "resolved"] = "completed"
    outcome: str | None = None
    notes: str | None = None
    payload: dict[str, object] = Field(default_factory=dict)


class TeacherInterventionRow(PydanticStrictBaseModel):
    id: int
    teacher_user_id: int
    user_id: int
    course_id: int
    intervention_type: str
    status: str
    outcome: str | None = None
    notes: str | None = None
    risk_score_before: float | None = None
    risk_score_after: float | None = None
    created_at: str
    updated_at: str
    resolved_at: str | None = None


class TeacherInterventionListResponse(PydanticStrictBaseModel):
    generated_at: str
    total: int = 0
    items: list[TeacherInterventionRow]


class AtRiskLearnerRow(PydanticStrictBaseModel):
    user_id: int
    course_id: int
    course_uuid: str | None = None
    course_name: str
    user_display_name: str
    cohort_name: str | None = None
    progress_pct: float
    days_since_last_activity: int | None = None
    open_grading_blocks: int
    failed_assessments: int
    missing_required_assessments: int
    risk_score: float
    risk_level: Literal["low", "medium", "high"]
    risk_components: dict[str, float] = Field(default_factory=dict)
    reason_codes: list[str]
    risk_trend: Literal["newly_at_risk", "worsening", "improving", "recovered", "stable"] = "stable"
    previous_risk_score: float | None = None
    risk_score_delta: float | None = None
    top_contributing_factor: str | None = None
    confidence_level: Literal["low", "medium", "high"] = "medium"
    why_now: str | None = None
    intervention_count: int = 0
    last_intervention_type: str | None = None
    last_intervention_at: str | None = None
    last_intervention_outcome: str | None = None
    recommended_action: str


class TeacherOverviewScope(PydanticStrictBaseModel):
    teacher_user_id: int
    course_ids: list[int]
    cohort_ids: list[int]


class TeacherOverviewSummary(PydanticStrictBaseModel):
    active_learners: MetricCard
    returning_learners: MetricCard
    completion_rate: MetricCard
    at_risk_learners: MetricCard
    ungraded_submissions: MetricCard
    negative_engagement_courses: MetricCard


class TeacherOverviewTrends(PydanticStrictBaseModel):
    active_learners: list[TimeSeriesPoint]
    completions: list[TimeSeriesPoint]
    submissions: list[TimeSeriesPoint]
    grading_completed: list[TimeSeriesPoint]


class TeacherOverviewResponse(PydanticStrictBaseModel):
    generated_at: str
    freshness_seconds: int
    window: Literal["7d", "28d", "90d"]
    compare: Literal["previous_period", "none"]
    scope: TeacherOverviewScope
    summary: TeacherOverviewSummary
    trends: TeacherOverviewTrends
    alerts: list[AlertItem]
    insights: list[InsightFeedItem]
    data_quality: AnalyticsDataQuality
    forecasts: list[ForecastItem]
    anomalies: list[AnomalyItem]
    risk_distribution: RiskDistributionCounts
    intervention_summary: InterventionSummary
    workload: TeacherWorkloadSummary
    content_bottlenecks: list[ContentBottleneckRow]
    at_risk_preview: list[AtRiskLearnerRow]
    course_preview: list[TeacherCourseRow]
    assessment_preview: list[AssessmentOutlierRow]
    course_total: int = 0
    assessment_total: int = 0
    at_risk_total: int = 0
    course_options: list[AnalyticsFilterOption] = Field(default_factory=list)
    cohort_options: list[AnalyticsFilterOption] = Field(default_factory=list)


class TeacherCourseRow(PydanticStrictBaseModel):
    course_id: int
    course_uuid: str
    course_name: str
    active_learners_7d: int
    completion_rate: float
    engagement_delta_pct: float | None = None
    at_risk_learners: int
    ungraded_submissions: int
    content_health_score: float
    assessment_difficulty_score: float | None = None
    teacher_completion_delta_pct: float | None = None
    platform_completion_delta_pct: float | None = None
    historical_completion_delta_pct: float | None = None
    cohort_completion_delta_pct: float | None = None
    last_content_update_at: str | None = None
    top_alert: AlertItem | None = None


class TeacherCourseListResponse(PydanticStrictBaseModel):
    generated_at: str
    total: int = 0
    page: int = 1
    page_size: int = 25
    items: list[TeacherCourseRow]
    course_options: list[AnalyticsFilterOption] = Field(default_factory=list)
    cohort_options: list[AnalyticsFilterOption] = Field(default_factory=list)


class FunnelStep(PydanticStrictBaseModel):
    label: str
    count: int
    pct_of_previous: float | None = None


class ActivityDropoffRow(PydanticStrictBaseModel):
    chapter_id: int
    activity_id: int
    activity_name: str
    activity_type: str
    previous_step_completions: int
    current_step_completions: int
    dropoff_pct: float


class ContentHealthRow(PydanticStrictBaseModel):
    course_id: int
    signal: str
    severity: Literal["info", "warning", "critical"]
    value: float | None = None
    note: str


class AssessmentOutlierRow(PydanticStrictBaseModel):
    assessment_type: Literal["manual_assessment", "quiz", "exam", "code_challenge"]
    assessment_id: int
    activity_id: int | None = None
    course_id: int
    course_name: str
    title: str
    submission_rate: float | None = None
    completion_rate: float | None = None
    pass_rate: float | None = None
    median_score: float | None = None
    avg_attempts: float | None = None
    grading_latency_hours_p50: float | None = None
    grading_latency_hours_p90: float | None = None
    difficulty_score: float | None = None
    score_variance: float | None = None
    reliability_score: float | None = None
    discrimination_index: float | None = None
    suspicious_flag: str | None = None
    outlier_reason_codes: list[str]


class TeacherCourseDetailSummary(PydanticStrictBaseModel):
    enrolled_learners: int
    active_learners_7d: int
    completion_rate: float
    avg_progress_pct: float
    at_risk_learners: int
    ungraded_submissions: int
    certificates_issued: int


class TeacherCourseDetailResponse(PydanticStrictBaseModel):
    generated_at: str
    course: dict[str, int | str]
    summary: TeacherCourseDetailSummary
    funnels: dict[str, list[FunnelStep]]
    engagement_trend: list[TimeSeriesPoint]
    activity_dropoff: list[ActivityDropoffRow]
    at_risk_learners: list[AtRiskLearnerRow]
    assessment_outliers: list[AssessmentOutlierRow]
    content_health: list[ContentHealthRow]
    content_bottlenecks: list[ContentBottleneckRow]


class TeacherAssessmentListResponse(PydanticStrictBaseModel):
    generated_at: str
    total: int = 0
    page: int = 1
    page_size: int = 25
    items: list[AssessmentOutlierRow]
    course_options: list[AnalyticsFilterOption] = Field(default_factory=list)
    cohort_options: list[AnalyticsFilterOption] = Field(default_factory=list)


class HistogramBucket(PydanticStrictBaseModel):
    label: str
    count: int


class QuestionDifficultyRow(PydanticStrictBaseModel):
    question_id: str
    question_label: str
    accuracy_pct: float | None = None
    avg_time_seconds: float | None = None
    discrimination_index: float | None = None
    strong_miss_pct: float | None = None
    weak_correct_pct: float | None = None
    distractor_issue_count: int = 0


class CommonFailureRow(PydanticStrictBaseModel):
    key: str
    label: str
    count: int


class AssessmentLearnerRow(PydanticStrictBaseModel):
    user_id: int
    user_display_name: str
    attempts: int
    best_score: float | None = None
    last_score: float | None = None
    submitted_at: str | None = None
    graded_at: str | None = None
    status: str | None = None


class AssessmentDiagnosticsSnapshot(PydanticStrictBaseModel):
    manual_grading_required: bool = False
    total_attempt_records: int = 0
    draft_attempts: int = 0
    awaiting_grading: int = 0
    graded_not_released: int = 0
    returned_for_resubmission: int = 0
    released: int = 0
    late_submissions: int = 0
    stale_backlog: int = 0
    suspicious_attempts: int = 0
    missing_scores: int = 0
    note: str | None = None


class AssessmentAuditEventRow(PydanticStrictBaseModel):
    id: str
    source: Literal["grading_entry", "bulk_action"]
    action: str
    actor_user_id: int | None = None
    actor_display_name: str | None = None
    occurred_at: str
    status: str | None = None
    summary: str
    affected_count: int | None = None
    submission_id: int | None = None


class AssessmentSloSnapshot(PydanticStrictBaseModel):
    status: Literal["healthy", "warning", "breached", "not_applicable"]
    target_hours: float | None = None
    observed_p50_hours: float | None = None
    observed_p90_hours: float | None = None
    backlog_count: int = 0
    overdue_backlog_count: int = 0
    note: str


class AssessmentMigrationStatus(PydanticStrictBaseModel):
    is_canonical: bool
    canonical_row_count: int = 0
    cutover_ready: bool
    compatibility_mode: Literal["canonical"]
    note: str


class AssessmentSupportAlertRow(PydanticStrictBaseModel):
    code: Literal[
        "grading_slo_breached",
        "grading_slo_warning",
        "suspicious_attempts",
        "missing_scores",
        "cutover_blocked",
    ]
    severity: Literal["info", "warning", "critical"]
    summary: str


class AssessmentSupportDiagnostics(PydanticStrictBaseModel):
    analytics_mode: Literal["live"]
    scoped_eligible_learners: int = 0
    scoped_visible_learners: int = 0
    scoped_cohort_count: int = 0
    cohort_filter_applied: bool = False
    audit_event_count: int = 0
    cutover_blockers: list[str]
    alerts: list[AssessmentSupportAlertRow]
    note: str


class AssessmentItemAnalyticsRow(PydanticStrictBaseModel):
    item_key: str
    item_label: str
    item_type: Literal["workflow", "question", "test"]
    population_count: int = 0
    impacted_count: int = 0
    impact_rate: float | None = None
    signal: Literal["healthy", "watch", "critical"]
    note: str


class AssessmentCohortRow(PydanticStrictBaseModel):
    cohort_id: int
    cohort_name: str
    eligible_learners: int = 0
    submitted_learners: int = 0
    submission_rate: float | None = None
    pass_rate: float | None = None
    awaiting_grading: int = 0
    returned_for_resubmission: int = 0
    released_learners: int = 0
    avg_attempts: float | None = None
    median_score: float | None = None


class TeacherAssessmentDetailSummary(PydanticStrictBaseModel):
    eligible_learners: int
    submitted_learners: int
    submission_rate: float | None = None
    pass_rate: float | None = None
    median_score: float | None = None
    avg_attempts: float | None = None
    grading_latency_hours_p50: float | None = None
    grading_latency_hours_p90: float | None = None


class TeacherAssessmentDetailResponse(PydanticStrictBaseModel):
    generated_at: str
    assessment_type: Literal["manual_assessment", "quiz", "exam", "code_challenge"]
    assessment_id: int
    course_id: int
    title: str
    pass_threshold: float | None = None
    pass_threshold_bucket_label: str | None = None
    summary: TeacherAssessmentDetailSummary
    score_distribution: list[HistogramBucket]
    attempt_distribution: list[HistogramBucket]
    question_breakdown: list[QuestionDifficultyRow] | None = None
    common_failures: list[CommonFailureRow]
    learner_rows: list[AssessmentLearnerRow]
    diagnostics: AssessmentDiagnosticsSnapshot
    audit_history: list[AssessmentAuditEventRow]
    slo: AssessmentSloSnapshot
    migration: AssessmentMigrationStatus
    support: AssessmentSupportDiagnostics
    cohort_analytics: list[AssessmentCohortRow]
    item_analytics: list[AssessmentItemAnalyticsRow]


class AtRiskLearnersResponse(PydanticStrictBaseModel):
    generated_at: str
    total: int
    page: int = 1
    page_size: int = 25
    items: list[AtRiskLearnerRow]
    course_options: list[AnalyticsFilterOption] = Field(default_factory=list)
    cohort_options: list[AnalyticsFilterOption] = Field(default_factory=list)
