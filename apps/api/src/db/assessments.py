"""Unified assessment authoring models.

An Assessment is the canonical authoring row for every gradeable activity. The
legacy course assessment tables may still exist for analytics or historical
storage, but new API surfaces should read and write this module.
"""

from datetime import UTC, datetime
from enum import StrEnum
from typing import Annotated, Literal, Self

from pydantic import ConfigDict, Field, TypeAdapter, field_validator, model_validator
from sqlalchemy import (
    JSON,
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
)
from sqlmodel import Field as SQLField
from ulid import ULID

from src.db.courses.activities import ActivityAssessmentPolicyRead
from src.db.grading.progress import (
    AssessmentCompletionRule,
    AssessmentGradingMode,
    GradeReleaseMode,
    LatePolicy,
    LatePolicyNone,
)
from src.db.grading.submissions import (
    AssessmentType,
    SubmissionListResponse,
    SubmissionRead,
)
from src.db.strict_base_model import PydanticStrictBaseModel, SQLModelStrictBaseModel


class AssessmentLifecycle(StrEnum):
    DRAFT = "DRAFT"
    SCHEDULED = "SCHEDULED"
    PUBLISHED = "PUBLISHED"
    ARCHIVED = "ARCHIVED"


class ItemKind(StrEnum):
    CHOICE = "CHOICE"
    OPEN_TEXT = "OPEN_TEXT"
    FILE_UPLOAD = "FILE_UPLOAD"
    FORM = "FORM"
    CODE = "CODE"
    MATCHING = "MATCHING"


class AssessmentGradingType(StrEnum):
    NUMERIC = "NUMERIC"
    PERCENTAGE = "PERCENTAGE"


# ── Item body schemas ─────────────────────────────────────────────────────────


class ChoiceOption(PydanticStrictBaseModel):
    id: str = Field(default_factory=lambda: str(ULID()))
    text: str = ""
    is_correct: bool = False


class ChoiceItemBody(PydanticStrictBaseModel):
    kind: Literal["CHOICE"] = "CHOICE"
    prompt: str = ""
    options: list[ChoiceOption] = Field(default_factory=list)
    multiple: bool = False
    variant: Literal["SINGLE_CHOICE", "MULTIPLE_CHOICE", "TRUE_FALSE"] | None = None
    explanation: str | None = None


class OpenTextItemBody(PydanticStrictBaseModel):
    kind: Literal["OPEN_TEXT"] = "OPEN_TEXT"
    prompt: str = ""
    min_words: int | None = None
    rubric: str | None = None


class FileUploadItemBody(PydanticStrictBaseModel):
    kind: Literal["FILE_UPLOAD"] = "FILE_UPLOAD"
    prompt: str = ""
    max_files: int = 1
    max_mb: int | None = None
    mimes: list[str] = Field(default_factory=list)


class FormField(PydanticStrictBaseModel):
    id: str = Field(default_factory=lambda: str(ULID()))
    label: str = ""
    field_type: Literal["text", "textarea", "number", "date"] = "text"
    required: bool = False


class FormItemBody(PydanticStrictBaseModel):
    kind: Literal["FORM"] = "FORM"
    prompt: str = ""
    fields: list[FormField] = Field(default_factory=list)


class CodeTestCase(PydanticStrictBaseModel):
    id: str = Field(default_factory=lambda: str(ULID()))
    input: str = ""
    expected_output: str = ""
    is_visible: bool = True
    weight: int = 1
    description: str | None = None
    match_mode: Literal["EXACT"] = "EXACT"


class CodeItemBody(PydanticStrictBaseModel):
    kind: Literal["CODE"] = "CODE"
    prompt: str = ""
    input_spec: str = ""
    output_spec: str = ""
    constraints: list[str] = Field(default_factory=list)
    languages: list[int] = Field(default_factory=list)
    starter_code: dict[str, str] = Field(default_factory=dict)
    reference_solutions: dict[str, str] = Field(default_factory=dict)
    tests: list[CodeTestCase] = Field(default_factory=list)
    time_limit_seconds: int | None = None
    memory_limit_mb: int | None = None
    max_output_kb: int | None = None
    scoring_strategy: Literal[
        "PARTIAL_CREDIT",
        "ALL_OR_NOTHING",
        "BEST_SUBMISSION",
        "LATEST_SUBMISSION",
    ] = "PARTIAL_CREDIT"


class MatchPair(PydanticStrictBaseModel):
    left: str
    right: str


class MatchingItemBody(PydanticStrictBaseModel):
    kind: Literal["MATCHING"] = "MATCHING"
    prompt: str = ""
    pairs: list[MatchPair] = Field(default_factory=list)
    explanation: str | None = None


type ItemBody = Annotated[
    ChoiceItemBody
    | OpenTextItemBody
    | FileUploadItemBody
    | FormItemBody
    | CodeItemBody
    | MatchingItemBody,
    Field(discriminator="kind"),
]

ITEM_BODY_ADAPTER: TypeAdapter[ItemBody] = TypeAdapter(ItemBody)


# ── Item answer schemas ───────────────────────────────────────────────────────


class ChoiceItemAnswer(PydanticStrictBaseModel):
    kind: Literal["CHOICE"] = "CHOICE"
    selected: list[str] = Field(default_factory=list)


class OpenTextItemAnswer(PydanticStrictBaseModel):
    kind: Literal["OPEN_TEXT"] = "OPEN_TEXT"
    text: str = ""


class FileUploadReference(PydanticStrictBaseModel):
    upload_uuid: str
    filename: str = ""


class FileUploadItemAnswer(PydanticStrictBaseModel):
    kind: Literal["FILE_UPLOAD"] = "FILE_UPLOAD"
    uploads: list[FileUploadReference] = Field(default_factory=list)


class FormItemAnswer(PydanticStrictBaseModel):
    kind: Literal["FORM"] = "FORM"
    values: dict[str, str] = Field(default_factory=dict)


class CodeRunResult(PydanticStrictBaseModel):
    passed: int = 0
    total: int = 0
    score: float | None = None
    details: list[dict[str, object]] = Field(default_factory=list)


class CodeItemAnswer(PydanticStrictBaseModel):
    kind: Literal["CODE"] = "CODE"
    language: int
    source: str = ""
    latest_run: CodeRunResult | None = None


class MatchingAnswerPair(PydanticStrictBaseModel):
    left: str
    right: str


class MatchingItemAnswer(PydanticStrictBaseModel):
    kind: Literal["MATCHING"] = "MATCHING"
    matches: list[MatchingAnswerPair] = Field(default_factory=list)


type ItemAnswer = Annotated[
    ChoiceItemAnswer
    | OpenTextItemAnswer
    | FileUploadItemAnswer
    | FormItemAnswer
    | CodeItemAnswer
    | MatchingItemAnswer,
    Field(discriminator="kind"),
]

ITEM_ANSWER_ADAPTER: TypeAdapter[ItemAnswer] = TypeAdapter(ItemAnswer)


# ── Tables ────────────────────────────────────────────────────────────────────


class Assessment(SQLModelStrictBaseModel, table=True):
    """Canonical assessment row for one gradeable activity."""

    __tablename__ = "assessment"
    __table_args__ = (
        Index("ix_assessment_uuid", "assessment_uuid", unique=True),
        Index("ix_assessment_activity_id", "activity_id", unique=True),
        Index("ix_assessment_kind", "kind"),
        Index("ix_assessment_lifecycle", "lifecycle"),
    )

    model_config = ConfigDict(use_enum_values=True)

    id: int | None = SQLField(default=None, primary_key=True)
    assessment_uuid: str
    activity_id: int = SQLField(
        sa_column=Column(
            "activity_id",
            ForeignKey("activity.id", ondelete="CASCADE"),
            nullable=False,
        )
    )
    kind: AssessmentType = SQLField(sa_column=Column("kind", String, nullable=False))
    title: str = SQLField(sa_column=Column(String(500), nullable=False))
    description: str = ""
    lifecycle: AssessmentLifecycle = SQLField(
        default=AssessmentLifecycle.DRAFT,
        sa_column=Column(
            "lifecycle",
            String,
            nullable=False,
            server_default=AssessmentLifecycle.DRAFT.value,
        ),
    )
    scheduled_at: datetime | None = SQLField(
        default=None,
        sa_column=Column(DateTime(timezone=True), nullable=True),
    )
    published_at: datetime | None = SQLField(
        default=None,
        sa_column=Column(DateTime(timezone=True), nullable=True),
    )
    archived_at: datetime | None = SQLField(
        default=None,
        sa_column=Column(DateTime(timezone=True), nullable=True),
    )
    weight: float = SQLField(
        default=1.0,
        sa_column=Column(Float, nullable=False, server_default="1.0"),
    )
    grading_type: AssessmentGradingType = SQLField(
        default=AssessmentGradingType.PERCENTAGE,
        sa_column=Column(
            "grading_type",
            String,
            nullable=False,
            server_default=AssessmentGradingType.PERCENTAGE.value,
        ),
    )
    policy_id: int | None = SQLField(
        default=None,
        sa_column=Column(
            "policy_id",
            ForeignKey("assessment_policy.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    inline_parent_activity_id: int | None = SQLField(
        default=None,
        sa_column=Column(
            "inline_parent_activity_id",
            ForeignKey("activity.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    is_inline: bool = SQLField(
        default=False,
        sa_column=Column(
            "is_inline",
            Boolean,
            nullable=False,
            server_default="false",
        ),
    )
    created_at: datetime = SQLField(
        default_factory=lambda: datetime.now(UTC),
        sa_column=Column(DateTime(timezone=True), nullable=False),
    )
    updated_at: datetime = SQLField(
        default_factory=lambda: datetime.now(UTC),
        sa_column=Column(DateTime(timezone=True), nullable=False),
    )
    content_version: int = SQLField(
        default=1,
        sa_column=Column(Integer, nullable=False, server_default="1"),
    )

    @field_validator("kind", mode="before")
    @classmethod
    def validate_kind(cls, value: object) -> object:
        if isinstance(value, str):
            return AssessmentType(value)
        return value

    @field_validator("lifecycle", mode="before")
    @classmethod
    def validate_lifecycle(cls, value: object) -> object:
        if isinstance(value, str):
            return AssessmentLifecycle(value)
        return value

    @field_validator("grading_type", mode="before")
    @classmethod
    def validate_grading_type(cls, value: object) -> object:
        if isinstance(value, str):
            return AssessmentGradingType(value)
        return value


class AssessmentItem(SQLModelStrictBaseModel, table=True):
    """Single authoring item inside an assessment."""

    __tablename__ = "assessment_item"
    __table_args__ = (
        Index("ix_assessment_item_uuid", "item_uuid", unique=True),
        Index("ix_assessment_item_assessment_order", "assessment_id", "order"),
    )

    model_config = ConfigDict(use_enum_values=True)

    id: int | None = SQLField(default=None, primary_key=True)
    item_uuid: str
    assessment_id: int = SQLField(
        sa_column=Column(
            "assessment_id",
            ForeignKey("assessment.id", ondelete="CASCADE"),
            nullable=False,
        )
    )
    order: int = SQLField(
        default=0,
        sa_column=Column(Integer, nullable=False, server_default="0"),
    )
    kind: ItemKind = SQLField(sa_column=Column("kind", String, nullable=False))
    title: str = ""
    body_json: dict[str, object] = SQLField(
        default_factory=dict,
        sa_column=Column(JSON, nullable=False, server_default="{}"),
    )
    max_score: float = SQLField(
        default=0.0,
        sa_column=Column(Float, nullable=False, server_default="0"),
    )
    created_at: datetime = SQLField(
        default_factory=lambda: datetime.now(UTC),
        sa_column=Column(DateTime(timezone=True), nullable=False),
    )
    updated_at: datetime = SQLField(
        default_factory=lambda: datetime.now(UTC),
        sa_column=Column(DateTime(timezone=True), nullable=False),
    )

    @field_validator("kind", mode="before")
    @classmethod
    def validate_kind(cls, value: object) -> object:
        if isinstance(value, str):
            return ItemKind(value)
        return value


# ── API schemas ───────────────────────────────────────────────────────────────


class AssessmentPolicyPatch(PydanticStrictBaseModel):
    model_config = ConfigDict(strict=False)
    # Attempt policy
    max_attempts: int | None = None
    time_limit_seconds: int | None = None
    # Scheduling / availability
    due_at: datetime | None = None
    allow_late: bool | None = None
    late_policy: LatePolicy | None = None
    # Grading policy
    grade_release_mode: GradeReleaseMode | None = None
    grading_mode: AssessmentGradingMode | None = None
    completion_rule: AssessmentCompletionRule | None = None
    passing_score: float | None = None
    # Required flag (stored in settings_json)
    required: bool | None = None
    # Review visibility: what students see after release
    review_visibility: Literal["NONE", "SCORE_ONLY", "FULL"] | None = None
    # Anti-cheat
    anti_cheat_json: dict[str, object] | None = None
    # Arbitrary extension fields
    settings_json: dict[str, object] | None = None

    @field_validator("late_policy", mode="before")
    @classmethod
    def validate_late_policy(cls, value: object) -> object:
        if value is None:
            return None
        return LatePolicyNone() if value == {} else value

    @field_validator("grade_release_mode", mode="before")
    @classmethod
    def validate_grade_release_mode(cls, value: object) -> object:
        return GradeReleaseMode(value) if isinstance(value, str) else value

    @field_validator("grading_mode", mode="before")
    @classmethod
    def validate_grading_mode(cls, value: object) -> object:
        return AssessmentGradingMode(value) if isinstance(value, str) else value

    @field_validator("completion_rule", mode="before")
    @classmethod
    def validate_completion_rule(cls, value: object) -> object:
        return AssessmentCompletionRule(value) if isinstance(value, str) else value


class AssessmentCreate(PydanticStrictBaseModel):
    kind: AssessmentType
    title: str
    description: str = ""
    course_id: int
    chapter_id: int
    weight: float = 1.0
    grading_type: AssessmentGradingType = AssessmentGradingType.PERCENTAGE
    policy: AssessmentPolicyPatch | None = None

    @field_validator("kind", mode="before")
    @classmethod
    def validate_kind(cls, value: object) -> object:
        if isinstance(value, str):
            return AssessmentType(value)
        return value

    @field_validator("grading_type", mode="before")
    @classmethod
    def validate_grading_type(cls, value: object) -> object:
        if isinstance(value, str):
            return AssessmentGradingType(value)
        return value


class AssessmentUpdate(PydanticStrictBaseModel):
    title: str | None = None
    description: str | None = None
    weight: float | None = None
    grading_type: AssessmentGradingType | None = None
    policy: AssessmentPolicyPatch | None = None

    @field_validator("grading_type", mode="before")
    @classmethod
    def validate_grading_type(cls, value: object) -> object:
        if value is not None and isinstance(value, str):
            return AssessmentGradingType(value)
        return value


class AssessmentLifecycleTransition(PydanticStrictBaseModel):
    to: AssessmentLifecycle
    scheduled_at: datetime | None = None

    @field_validator("to", mode="before")
    @classmethod
    def validate_to(cls, value: object) -> object:
        if isinstance(value, str):
            return AssessmentLifecycle(value)
        return value


class AssessmentReadItem(PydanticStrictBaseModel):
    id: int
    item_uuid: str
    order: int
    kind: ItemKind
    title: str
    body: ItemBody
    max_score: float
    created_at: datetime
    updated_at: datetime

    @field_validator("kind", mode="before")
    @classmethod
    def validate_kind(cls, value: object) -> object:
        if isinstance(value, str):
            return ItemKind(value)
        return value


class AssessmentScoreProjection(PydanticStrictBaseModel):
    percent: float | None = None
    source: Literal["teacher", "auto", "none"] = "none"


class AssessmentEffectivePolicy(PydanticStrictBaseModel):
    max_attempts: int | None = None
    attempts_used: int = 0
    attempts_remaining: int | None = None
    time_limit_seconds: int | None = None
    due_at: datetime | None = None
    allow_late: bool = True
    late_policy: dict[str, object] = Field(default_factory=dict)
    grade_release_mode: GradeReleaseMode = GradeReleaseMode.IMMEDIATE
    anti_cheat_json: dict[str, object] = Field(default_factory=dict)
    settings_json: dict[str, object] = Field(default_factory=dict)

    @field_validator("grade_release_mode", mode="before")
    @classmethod
    def validate_grade_release_mode(cls, value: object) -> object:
        if isinstance(value, str):
            return GradeReleaseMode(value)
        return value


class AttemptStateRead(PydanticStrictBaseModel):
    model_config = ConfigDict(use_enum_values=True)

    assessment_uuid: str
    submission_uuid: str | None = None
    submission_status: str | None = None
    release_state: Literal[
        "HIDDEN",
        "AWAITING_RELEASE",
        "VISIBLE",
        "RETURNED_FOR_REVISION",
    ] = "HIDDEN"
    # Legacy capability flags (kept for backward compat)
    can_edit: bool = False
    can_save_draft: bool = False
    can_submit: bool = False
    # Fine-grained action flags
    can_start: bool = False
    can_continue: bool = False
    can_view_result: bool = False
    can_start_revision: bool = False
    # Machine-readable next action for UI rendering
    recommended_action: Literal[
        "START",
        "CONTINUE_DRAFT",
        "SUBMIT",
        "WAIT_FOR_RELEASE",
        "VIEW_RESULT",
        "START_REVISION",
        "NO_ACTION",
    ] = "NO_ACTION"
    # i18n key the frontend looks up to label the primary button
    primary_button_label_key: str = "noAction"
    is_returned_for_revision: bool = False
    is_result_visible: bool = False
    score: AssessmentScoreProjection = Field(default_factory=AssessmentScoreProjection)
    disabled_action_reasons: list[str] = Field(default_factory=list)
    effective_policy: AssessmentEffectivePolicy = Field(
        default_factory=AssessmentEffectivePolicy
    )
    # Authoritative server timestamps
    server_now: datetime | None = None
    started_at: datetime | None = None
    timer_started_at: datetime | None = None
    timer_expires_at: datetime | None = None
    available_at: datetime | None = None
    closes_at: datetime | None = None
    due_at: datetime | None = None
    time_remaining_seconds: int | None = None
    content_version: int = 1
    policy_version: int = 1


class AssessmentAttemptProjection(AttemptStateRead):
    """Backward-compatible OpenAPI name for the attempt state contract."""


class AssessmentReviewProjection(PydanticStrictBaseModel):
    model_config = ConfigDict(use_enum_values=True)

    assessment_uuid: str
    activity_id: int
    activity_uuid: str
    title: str
    kind: AssessmentType
    default_filter: Literal[
        "ALL",
        "NEEDS_GRADING",
        "PENDING",
        "GRADED",
        "PUBLISHED",
        "RETURNED",
    ] = "NEEDS_GRADING"
    supports_search: bool = True
    supports_late_only: bool = True
    supported_sorts: list[Literal["submitted_at", "final_score", "attempt_number"]] = (
        Field(
            default_factory=lambda: [
                "submitted_at",
                "final_score",
                "attempt_number",
            ]
        )
    )

    @field_validator("kind", mode="before")
    @classmethod
    def validate_kind(cls, value: object) -> object:
        if isinstance(value, str):
            return AssessmentType(value)
        return value


class AssessmentDetailRead(PydanticStrictBaseModel):
    model_config = ConfigDict(use_enum_values=True)

    id: int
    assessment_uuid: str
    activity_id: int
    activity_uuid: str
    course_id: int | None = None
    course_uuid: str | None = None
    chapter_id: int
    kind: AssessmentType
    title: str
    description: str
    lifecycle: AssessmentLifecycle
    scheduled_at: datetime | None = None
    published_at: datetime | None = None
    archived_at: datetime | None = None
    weight: float
    grading_type: AssessmentGradingType
    policy_id: int | None = None
    assessment_policy: ActivityAssessmentPolicyRead | None = None
    items: list[AssessmentReadItem] = Field(default_factory=list)
    attempt_projection: AssessmentAttemptProjection | None = None
    review_projection: AssessmentReviewProjection | None = None
    content_version: int = 1
    policy_version: int = 1
    created_at: datetime
    updated_at: datetime

    @field_validator("kind", mode="before")
    @classmethod
    def validate_kind(cls, value: object) -> object:
        if isinstance(value, str):
            return AssessmentType(value)
        return value

    @field_validator("lifecycle", mode="before")
    @classmethod
    def validate_lifecycle(cls, value: object) -> object:
        if isinstance(value, str):
            return AssessmentLifecycle(value)
        return value

    @field_validator("grading_type", mode="before")
    @classmethod
    def validate_grading_type(cls, value: object) -> object:
        if isinstance(value, str):
            return AssessmentGradingType(value)
        return value


class AssessmentRead(AssessmentDetailRead):
    """Backward-compatible OpenAPI name for the assessment detail contract."""


class StudentSubmissionRead(SubmissionRead):
    release_state: Literal[
        "HIDDEN",
        "AWAITING_RELEASE",
        "VISIBLE",
        "RETURNED_FOR_REVISION",
    ] = "HIDDEN"
    is_result_visible: bool = False
    # Draft progress metadata — populated on draft save responses.
    answered_count: int | None = None
    total_items: int | None = None
    time_remaining_seconds: int | None = None


class TeacherSubmissionRead(SubmissionRead):
    release_state: Literal[
        "HIDDEN",
        "AWAITING_RELEASE",
        "VISIBLE",
        "RETURNED_FOR_REVISION",
    ] = "HIDDEN"
    is_result_visible: bool = False
    content_version: int = 1
    policy_version: int = 1


class ReviewQueueRead(SubmissionListResponse):
    items: list[TeacherSubmissionRead]
    contract_version: int = 1


class AssessmentCreateResponse(PydanticStrictBaseModel):
    assessment: AssessmentRead


class AssessmentItemCreate(PydanticStrictBaseModel):
    kind: ItemKind
    title: str = ""
    body: ItemBody
    max_score: float = 0.0

    @field_validator("kind", mode="before")
    @classmethod
    def validate_kind(cls, value: object) -> object:
        if isinstance(value, str):
            return ItemKind(value)
        return value

    @model_validator(mode="after")
    def kind_matches_body(self) -> Self:
        if str(self.kind) != str(self.body.kind):
            raise ValueError("Item kind must match body.kind")
        return self


class AssessmentItemUpdate(PydanticStrictBaseModel):
    kind: ItemKind | None = None
    title: str | None = None
    body: ItemBody | None = None
    max_score: float | None = None

    @field_validator("kind", mode="before")
    @classmethod
    def validate_kind(cls, value: object) -> object:
        if value is not None and isinstance(value, str):
            return ItemKind(value)
        return value

    @model_validator(mode="after")
    def kind_matches_body(self) -> Self:
        if (
            self.kind is not None
            and self.body is not None
            and str(self.kind) != str(self.body.kind)
        ):
            raise ValueError("Item kind must match body.kind")
        return self


class AssessmentItemReorderEntry(PydanticStrictBaseModel):
    item_uuid: str
    order: int


class AssessmentItemReorder(PydanticStrictBaseModel):
    items: list[AssessmentItemReorderEntry]


class ReadinessIssue(PydanticStrictBaseModel):
    code: str
    message: str
    item_uuid: str | None = None


class AssessmentReadiness(PydanticStrictBaseModel):
    ok: bool
    issues: list[ReadinessIssue] = Field(default_factory=list)


class AssessmentAnswerPatch(PydanticStrictBaseModel):
    item_uuid: str
    answer: ItemAnswer


class AssessmentDraftPatch(PydanticStrictBaseModel):
    answers: list[AssessmentAnswerPatch] = Field(default_factory=list)


class AssessmentDraftRead(PydanticStrictBaseModel):
    assessment_uuid: str
    submission: StudentSubmissionRead | None = None


# ── Student policy overrides ──────────────────────────────────────────────────


class StudentPolicyOverrideCreate(PydanticStrictBaseModel):
    user_id: int
    max_attempts_override: int | None = None
    due_at_override: datetime | None = None
    time_limit_override_seconds: int | None = None
    waive_late_penalty: bool = False
    note: str = ""
    expires_at: datetime | None = None


class StudentPolicyOverrideUpdate(PydanticStrictBaseModel):
    max_attempts_override: int | None = None
    due_at_override: datetime | None = None
    time_limit_override_seconds: int | None = None
    waive_late_penalty: bool | None = None
    note: str | None = None
    expires_at: datetime | None = None


class StudentPolicyOverrideRead(PydanticStrictBaseModel):
    id: int
    user_id: int
    policy_id: int
    max_attempts_override: int | None = None
    due_at_override: datetime | None = None
    time_limit_override_seconds: int | None = None
    waive_late_penalty: bool = False
    note: str = ""
    expires_at: datetime | None = None
    granted_by: int | None = None


# ── Code challenge runtime ────────────────────────────────────────────────────


class CodeRunRequest(PydanticStrictBaseModel):
    """Request body for POST /assessments/{uuid}/items/{item_uuid}/runs."""

    language: int
    source: str
    custom_input: str | None = None
    # Client-provided idempotency key — the same key always returns the same job
    idempotency_key: str | None = None


class CodeRunTestResult(PydanticStrictBaseModel):
    test_id: str
    passed: bool
    stdin: str | None = None
    expected: str | None = None
    actual: str | None = None
    is_visible: bool = True
    time: float | None = None
    memory: int | None = None


class CodeRunResponse(PydanticStrictBaseModel):
    """Response body for POST /assessments/{uuid}/items/{item_uuid}/runs."""

    run_id: str
    # QUEUED | RUNNING | ACCEPTED | WRONG_ANSWER | COMPILE_ERROR | RUNTIME_ERROR | TIME_LIMIT | DEGRADED
    status: str
    passed: int = 0
    total: int = 0
    score: float | None = None
    stdout: str | None = None
    stderr: str | None = None
    compile_output: str | None = None
    time: float | None = None
    memory: int | None = None
    visible_results: list[CodeRunTestResult] = Field(default_factory=list)
    error_message: str | None = None
    # True when the runner is unavailable and the client should retry
    is_retryable: bool = False


class Judge0LanguageRead(PydanticStrictBaseModel):
    id: int
    name: str
    monaco_language: str
    is_archived: bool = False


# ── Item-level grading ────────────────────────────────────────────────────────


class RubricCriterion(PydanticStrictBaseModel):
    criterion_id: str
    label: str = ""
    score: float = 0.0
    max_score: float = 0.0
    note: str = ""


class ItemGradeEntry(PydanticStrictBaseModel):
    item_uuid: str
    score: float | None = None
    feedback: str = ""
    rubric_criteria: list[RubricCriterion] = Field(default_factory=list)
    is_manual: bool = False


class GradingDraftSave(PydanticStrictBaseModel):
    """Body for saving a grading draft before publishing."""

    item_grades: list[ItemGradeEntry] = Field(default_factory=list)
    overall_feedback: str = ""
    # If true, override calculated score with final_score
    override_score: bool = False
    final_score: float | None = None
    override_reason: str | None = None
    # GRADED = save (teacher-only); PUBLISHED = publish to student; RETURNED = revise
    status: str = "GRADED"


class AssessmentPolicyPreset(PydanticStrictBaseModel):
    """Default policy settings for a given assessment kind."""

    kind: AssessmentType
    grade_release_mode: GradeReleaseMode
    grading_mode: AssessmentGradingMode
    completion_rule: AssessmentCompletionRule
    passing_score: float
    max_attempts: int | None
    time_limit_seconds: int | None
    allow_late: bool
    anti_cheat_enabled: bool
    review_visibility: str
