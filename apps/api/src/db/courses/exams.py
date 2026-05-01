from enum import Enum, StrEnum

from pydantic import ConfigDict, field_validator
from sqlalchemy import JSON, Column, ForeignKey, Index, Integer
from sqlmodel import Field

from src.db.strict_base_model import SQLModelStrictBaseModel


# Exam ##
class AccessModeEnum(StrEnum):
    NO_ACCESS = "NO_ACCESS"
    WHITELIST = "WHITELIST"
    ALL_ENROLLED = "ALL_ENROLLED"


class QuestionTypeEnum(StrEnum):
    SINGLE_CHOICE = "SINGLE_CHOICE"
    MULTIPLE_CHOICE = "MULTIPLE_CHOICE"
    TRUE_FALSE = "TRUE_FALSE"
    MATCHING = "MATCHING"


# Limits for exam settings
TIME_LIMIT_MIN = 1
TIME_LIMIT_MAX = 180
ATTEMPT_LIMIT_MIN = 1
ATTEMPT_LIMIT_MAX = 5
VIOLATION_THRESHOLD_MIN = 1
VIOLATION_THRESHOLD_MAX = 10
QUESTION_LIMIT_MIN = 1


class ExamSettingsBase(SQLModelStrictBaseModel):
    """Settings for exam behavior and access control"""

    # Time & Attempts
    time_limit: int | None = None  # in minutes, None = unlimited
    attempt_limit: int | None = 1  # None = unlimited

    # Question Behavior
    shuffle_questions: bool = True
    shuffle_answers: bool = True  # Always ON, non-configurable (enforced by validator)
    question_limit: int | None = None  # None = show all questions

    # Access Control
    access_mode: AccessModeEnum = AccessModeEnum.NO_ACCESS
    whitelist_user_ids: list[int] = Field(default_factory=list, sa_column=Column(JSON))

    # Result Visibility
    allow_result_review: bool = True
    show_correct_answers: bool = True
    passing_score: int = 60

    # Anti-Cheating / Violation Detection
    copy_paste_protection: bool = False
    tab_switch_detection: bool = False
    devtools_detection: bool = False
    right_click_disable: bool = False
    fullscreen_enforcement: bool = False
    violation_threshold: int | None = 3  # None = no auto-submit

    # Unified authoring lifecycle for the shared assessment studio. Stored in
    # activity.details/settings by the activity update service for exams.
    lifecycle_status: str = "DRAFT"
    scheduled_at: str | None = None
    published_at: str | None = None
    archived_at: str | None = None

    @field_validator("time_limit", mode="before")
    @classmethod
    def validate_time_limit(cls, v):
        if v is None:
            return v
        if not (TIME_LIMIT_MIN <= v <= TIME_LIMIT_MAX):
            msg = f"time_limit must be between {TIME_LIMIT_MIN} and {TIME_LIMIT_MAX}"
            raise ValueError(msg)
        return v

    @field_validator("attempt_limit", mode="before")
    @classmethod
    def validate_attempt_limit(cls, v):
        if v is None:
            return v
        if not (ATTEMPT_LIMIT_MIN <= v <= ATTEMPT_LIMIT_MAX):
            msg = f"attempt_limit must be between {ATTEMPT_LIMIT_MIN} and {ATTEMPT_LIMIT_MAX}"
            raise ValueError(msg)
        return v

    @field_validator("question_limit", mode="before")
    @classmethod
    def validate_question_limit(cls, v):
        if v is None:
            return v
        if v < QUESTION_LIMIT_MIN:
            msg = f"question_limit must be >= {QUESTION_LIMIT_MIN}"
            raise ValueError(msg)
        return v

    @field_validator("violation_threshold", mode="before")
    @classmethod
    def validate_violation_threshold(cls, v):
        if v is None:
            return v
        if not (VIOLATION_THRESHOLD_MIN <= v <= VIOLATION_THRESHOLD_MAX):
            msg = f"violation_threshold must be between {VIOLATION_THRESHOLD_MIN} and {VIOLATION_THRESHOLD_MAX}"
            raise ValueError(msg)
        return v

    @field_validator("passing_score", mode="before")
    @classmethod
    def validate_passing_score(cls, v):
        if v is None:
            return 60
        if not (0 <= int(v) <= 100):
            raise ValueError("passing_score must be between 0 and 100")
        return int(v)

    @field_validator("access_mode", mode="before")
    @classmethod
    def validate_access_mode(cls, v):
        if isinstance(v, str):
            return AccessModeEnum(v)
        return v

    @field_validator("shuffle_answers", mode="before")
    @classmethod
    def validate_shuffle_answers(cls, v) -> bool:
        # Always enforce shuffle_answers=True for security
        return True


class ExamBase(SQLModelStrictBaseModel):
    """Base exam model"""

    model_config = ConfigDict(use_enum_values=True)

    title: str
    description: str
    published: bool = False

    course_id: int
    chapter_id: int
    activity_id: int

    # Compatibility storage for older exam routes. Canonical settings live on
    # Activity.settings and are read/written through src.services.assessments.settings.
    settings: dict[str, object] = Field(default_factory=dict, sa_column=Column(JSON))


class ExamCreate(ExamBase):
    """Model for creating a new exam"""


class ExamRead(ExamBase):
    """Model for reading an exam"""

    id: int
    exam_uuid: str
    creation_date: str | None = None
    update_date: str | None = None


class ExamUpdate(SQLModelStrictBaseModel):
    """Model for updating an exam"""

    model_config = ConfigDict(use_enum_values=True)

    title: str | None = None
    description: str | None = None
    published: bool | None = None
    settings: dict[str, object] | None = None
    update_date: str | None = None


class Exam(ExamBase, table=True):
    """Exam database model"""

    id: int | None = Field(default=None, primary_key=True)
    exam_uuid: str = ""
    course_id: int = Field(
        sa_column=Column(Integer, ForeignKey("course.id", ondelete="CASCADE"))
    )
    chapter_id: int = Field(
        sa_column=Column(Integer, ForeignKey("chapter.id", ondelete="CASCADE"))
    )
    activity_id: int = Field(
        sa_column=Column(Integer, ForeignKey("activity.id", ondelete="CASCADE"))
    )
    creation_date: str = ""
    update_date: str = ""


# Question ##


class QuestionBase(SQLModelStrictBaseModel):
    """Base question model"""

    question_text: str
    question_type: QuestionTypeEnum
    points: int = 1
    explanation: str | None = None
    order_index: int = 0

    # Answer options stored as JSON
    # Format depends on question_type:
    # SINGLE_CHOICE/MULTIPLE_CHOICE: [{"text": "...", "is_correct": bool}]
    # TRUE_FALSE: [{"text": "True", "is_correct": bool}, {"text": "False", "is_correct": bool}]
    # MATCHING: [{"left": "...", "right": "..."}]
    answer_options: list[dict[str, object]] = Field(
        default_factory=list, sa_column=Column(JSON)
    )

    exam_id: int | None = None

    @field_validator("question_type", mode="before")
    @classmethod
    def validate_question_type(cls, v):
        if isinstance(v, str):
            return QuestionTypeEnum(v)
        return v


class QuestionCreate(QuestionBase):
    """Model for creating a question"""


class QuestionRead(QuestionBase):
    """Model for reading a question (full data for teachers)"""

    id: int
    question_uuid: str
    creation_date: str | None = None
    update_date: str | None = None


class QuestionReadStudent(SQLModelStrictBaseModel):
    """Model for reading a question as a student - is_correct stripped from answer_options"""

    id: int
    question_uuid: str
    question_text: str
    question_type: QuestionTypeEnum
    points: int
    order_index: int
    answer_options: list[dict[str, object]]  # is_correct stripped

    @classmethod
    def from_question(
        cls, q: Question | QuestionRead, shuffle_answers: bool = False
    ) -> QuestionReadStudent:
        """Create a student-facing question, stripping is_correct from answer_options."""
        import random as _random

        if q.question_type == QuestionTypeEnum.MATCHING:
            left_values = [opt.get("left") for opt in q.answer_options or []]
            right_values = [opt.get("right") for opt in q.answer_options or []]
            if shuffle_answers:
                _random.shuffle(right_values)
            return cls(
                id=q.id,
                question_uuid=q.question_uuid,
                question_text=q.question_text,
                question_type=q.question_type,
                points=q.points,
                order_index=q.order_index,
                answer_options=[
                    {"left": left, "right": right_values[index]}
                    for index, left in enumerate(left_values)
                ],
            )

        stripped = []
        for index, opt in enumerate(q.answer_options or []):
            clean = {k: v for k, v in opt.items() if k != "is_correct"}
            clean["option_id"] = index
            stripped.append(clean)

        if shuffle_answers:
            _random.shuffle(stripped)

        return cls(
            id=q.id,
            question_uuid=q.question_uuid,
            question_text=q.question_text,
            question_type=q.question_type,
            points=q.points,
            order_index=q.order_index,
            answer_options=stripped,
        )


class QuestionUpdate(SQLModelStrictBaseModel):
    """Model for updating a question"""

    question_text: str | None = None
    question_type: QuestionTypeEnum | None = None
    points: int | None = None
    explanation: str | None = None
    order_index: int | None = None
    answer_options: list[dict[str, object]] | None = None

    @field_validator("question_type", mode="before")
    @classmethod
    def validate_question_type(cls, v):
        if v is None:
            return v
        if isinstance(v, str):
            return QuestionTypeEnum(v)
        return v


class Question(QuestionBase, table=True):
    """Question database model"""

    id: int | None = Field(default=None, primary_key=True)
    question_uuid: str = ""
    exam_id: int = Field(
        sa_column=Column(Integer, ForeignKey("exam.id", ondelete="CASCADE"))
    )
    creation_date: str = ""
    update_date: str = ""


# Exam Attempt ##


class AttemptStatusEnum(StrEnum):
    IN_PROGRESS = "IN_PROGRESS"
    SUBMITTED = "SUBMITTED"
    AUTO_SUBMITTED = "AUTO_SUBMITTED"


class ExamAttemptBase(SQLModelStrictBaseModel):
    """Base exam attempt model"""

    model_config = ConfigDict(use_enum_values=True)

    exam_id: int
    user_id: int

    status: AttemptStatusEnum = AttemptStatusEnum.IN_PROGRESS
    score: int | None = None
    max_score: int | None = None

    # Stores student answers: {question_id: selected_answer_indices or answer_data}
    answers: dict[str, object] = Field(default_factory=dict, sa_column=Column(JSON))

    # Question order for this attempt (list of question IDs)
    question_order: list[int] = Field(default_factory=list, sa_column=Column(JSON))

    # Violation tracking
    violations: list[dict[str, object]] = Field(
        default_factory=list, sa_column=Column(JSON)
    )

    # Preview mode flag (teacher testing, exclude from analytics)
    is_preview: bool = Field(default=False)

    started_at: str | None = None
    submitted_at: str | None = None

    @field_validator("status", mode="before")
    @classmethod
    def validate_status(cls, v):
        if isinstance(v, str):
            return AttemptStatusEnum(v)
        return v


class ExamAttemptCreate(SQLModelStrictBaseModel):
    """Model for creating an exam attempt"""

    exam_id: int
    user_id: int


class ExamAttemptRead(ExamAttemptBase):
    """Model for reading an exam attempt"""

    id: int
    attempt_uuid: str
    creation_date: str | None = None
    update_date: str | None = None


class ExamAttemptUpdate(SQLModelStrictBaseModel):
    """Model for updating an exam attempt"""

    model_config = ConfigDict(use_enum_values=True)

    status: AttemptStatusEnum | None = None
    score: int | None = None
    max_score: int | None = None
    answers: dict[str, object] | None = None
    violations: list[dict[str, object]] | None = None
    submitted_at: str | None = None

    @field_validator("status", mode="before")
    @classmethod
    def validate_status(cls, v):
        if v is None:
            return v
        if isinstance(v, str):
            return AttemptStatusEnum(v)
        return v


class ExamAttempt(ExamAttemptBase, table=True):
    """Exam attempt database model"""

    __table_args__ = (Index("idx_exam_attempt_exam_user", "exam_id", "user_id"),)

    id: int | None = Field(default=None, primary_key=True)
    attempt_uuid: str = ""
    exam_id: int = Field(
        sa_column=Column(Integer, ForeignKey("exam.id", ondelete="CASCADE"))
    )
    user_id: int = Field(
        sa_column=Column(Integer, ForeignKey("user.id", ondelete="CASCADE"))
    )
    creation_date: str = ""
    update_date: str = ""


# Combined Creation ##


class ExamCreateWithActivity(SQLModelStrictBaseModel):
    """Model for creating exam with activity in one request"""

    activity_name: str
    chapter_id: int
    exam_title: str
    exam_description: str
    settings: dict[str, object] = Field(default_factory=dict)
