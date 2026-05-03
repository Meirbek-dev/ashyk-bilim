"""Unified assessment authoring models.

An Assessment is the canonical authoring row for every gradeable activity. The
legacy course assessment tables may still exist for analytics or historical
storage, but new API surfaces should read and write this module.
"""

from datetime import UTC, datetime
from enum import StrEnum
from typing import Annotated, Literal, Self

from pydantic import ConfigDict, Field, TypeAdapter, field_validator, model_validator
from sqlalchemy import JSON, Column, DateTime, Float, ForeignKey, Index, Integer, String
from sqlmodel import Field as SQLField

from src.db.courses.activities import ActivityAssessmentPolicyRead
from src.db.grading.submissions import AssessmentType, SubmissionRead
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
    ASSIGNMENT_FILE = "ASSIGNMENT_FILE"
    ASSIGNMENT_QUIZ = "ASSIGNMENT_QUIZ"
    ASSIGNMENT_FORM = "ASSIGNMENT_FORM"
    ASSIGNMENT_OTHER = "ASSIGNMENT_OTHER"


class AssessmentGradingType(StrEnum):
    NUMERIC = "NUMERIC"
    PERCENTAGE = "PERCENTAGE"


# ── Item body schemas ─────────────────────────────────────────────────────────


class ChoiceOption(PydanticStrictBaseModel):
    id: str
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
    id: str
    label: str = ""
    field_type: Literal["text", "textarea", "number", "date"] = "text"
    required: bool = False


class FormItemBody(PydanticStrictBaseModel):
    kind: Literal["FORM"] = "FORM"
    prompt: str = ""
    fields: list[FormField] = Field(default_factory=list)


class CodeTestCase(PydanticStrictBaseModel):
    id: str
    input: str = ""
    expected_output: str = ""
    is_visible: bool = True
    weight: int = 1
    description: str | None = None


class CodeItemBody(PydanticStrictBaseModel):
    kind: Literal["CODE"] = "CODE"
    prompt: str = ""
    languages: list[int] = Field(default_factory=list)
    starter_code: dict[str, str] = Field(default_factory=dict)
    tests: list[CodeTestCase] = Field(default_factory=list)
    time_limit_seconds: int | None = None
    memory_limit_mb: int | None = None


class MatchPair(PydanticStrictBaseModel):
    left: str
    right: str


class MatchingItemBody(PydanticStrictBaseModel):
    kind: Literal["MATCHING"] = "MATCHING"
    prompt: str = ""
    pairs: list[MatchPair] = Field(default_factory=list)
    explanation: str | None = None


class AssignmentFileItemBody(PydanticStrictBaseModel):
    kind: Literal["ASSIGNMENT_FILE"] = "ASSIGNMENT_FILE"
    description: str = ""
    hint: str = ""
    reference_file: str | None = None
    allowed_mime_types: list[str] = Field(default_factory=list)
    max_file_size_mb: int | None = None
    max_files: int = 1


class AssignmentQuizOption(PydanticStrictBaseModel):
    optionUUID: str
    text: str = ""
    fileID: str = ""
    type: Literal["text", "image", "audio", "video"] = "text"
    assigned_right_answer: bool = False


class AssignmentQuizQuestion(PydanticStrictBaseModel):
    questionUUID: str
    questionText: str = ""
    options: list[AssignmentQuizOption] = Field(default_factory=list)


class AssignmentQuizSettings(PydanticStrictBaseModel):
    max_attempts: int | None = None
    time_limit_seconds: int | None = None
    max_score_penalty_per_attempt: float | None = None


class AssignmentQuizItemBody(PydanticStrictBaseModel):
    kind: Literal["ASSIGNMENT_QUIZ"] = "ASSIGNMENT_QUIZ"
    description: str = ""
    hint: str = ""
    questions: list[AssignmentQuizQuestion] = Field(default_factory=list)
    settings: AssignmentQuizSettings = Field(default_factory=AssignmentQuizSettings)


class AssignmentFormBlank(PydanticStrictBaseModel):
    blankUUID: str
    placeholder: str = ""
    correctAnswer: str = ""
    hint: str = ""


class AssignmentFormQuestion(PydanticStrictBaseModel):
    questionUUID: str
    questionText: str = ""
    blanks: list[AssignmentFormBlank] = Field(default_factory=list)


class AssignmentFormItemBody(PydanticStrictBaseModel):
    kind: Literal["ASSIGNMENT_FORM"] = "ASSIGNMENT_FORM"
    description: str = ""
    hint: str = ""
    questions: list[AssignmentFormQuestion] = Field(default_factory=list)


class AssignmentOtherItemBody(PydanticStrictBaseModel):
    kind: Literal["ASSIGNMENT_OTHER"] = "ASSIGNMENT_OTHER"
    description: str = ""
    hint: str = ""
    body: dict[str, object] = Field(default_factory=dict)


type ItemBody = Annotated[
    ChoiceItemBody
    | OpenTextItemBody
    | FileUploadItemBody
    | FormItemBody
    | CodeItemBody
    | MatchingItemBody
    | AssignmentFileItemBody
    | AssignmentQuizItemBody
    | AssignmentFormItemBody
    | AssignmentOtherItemBody,
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
    details: dict[str, object] = Field(default_factory=dict)


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


class AssignmentFileItemAnswer(PydanticStrictBaseModel):
    kind: Literal["ASSIGNMENT_FILE"] = "ASSIGNMENT_FILE"
    content_type: Literal["file"] = "file"
    uploads: list[FileUploadReference] = Field(default_factory=list)
    file_key: str | None = None
    answer_metadata: dict[str, object] = Field(default_factory=dict)


class AssignmentQuizItemAnswer(PydanticStrictBaseModel):
    kind: Literal["ASSIGNMENT_QUIZ"] = "ASSIGNMENT_QUIZ"
    content_type: Literal["quiz"] = "quiz"
    quiz_answers: dict[str, object] | None = None
    answer_metadata: dict[str, object] = Field(default_factory=dict)


class AssignmentFormItemAnswer(PydanticStrictBaseModel):
    kind: Literal["ASSIGNMENT_FORM"] = "ASSIGNMENT_FORM"
    content_type: Literal["form"] = "form"
    form_data: dict[str, object] | None = None
    answer_metadata: dict[str, object] = Field(default_factory=dict)


class AssignmentOtherItemAnswer(PydanticStrictBaseModel):
    kind: Literal["ASSIGNMENT_OTHER"] = "ASSIGNMENT_OTHER"
    content_type: Literal["text", "other"] = "text"
    text_content: str | None = None
    answer_metadata: dict[str, object] = Field(default_factory=dict)


type ItemAnswer = Annotated[
    ChoiceItemAnswer
    | OpenTextItemAnswer
    | FileUploadItemAnswer
    | FormItemAnswer
    | CodeItemAnswer
    | MatchingItemAnswer
    | AssignmentFileItemAnswer
    | AssignmentQuizItemAnswer
    | AssignmentFormItemAnswer
    | AssignmentOtherItemAnswer,
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
            return AssessmentType(value)
        return value

    @field_validator("lifecycle", mode="before")
    @classmethod
    def validate_lifecycle(cls, value: object) -> object:
        if isinstance(value, str):
            return AssessmentLifecycle(value)
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
    max_attempts: int | None = None
    time_limit_seconds: int | None = None
    due_at: datetime | None = None
    allow_late: bool | None = None
    late_policy_json: dict[str, object] | None = None
    anti_cheat_json: dict[str, object] | None = None
    settings_json: dict[str, object] | None = None


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


class AssessmentUpdate(PydanticStrictBaseModel):
    title: str | None = None
    description: str | None = None
    weight: float | None = None
    grading_type: AssessmentGradingType | None = None
    policy: AssessmentPolicyPatch | None = None


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


class AssessmentRead(PydanticStrictBaseModel):
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
    created_at: datetime
    updated_at: datetime


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
    submission: SubmissionRead | None = None
