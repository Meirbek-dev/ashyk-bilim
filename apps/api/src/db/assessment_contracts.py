from datetime import datetime
from enum import StrEnum
from typing import Literal

from pydantic import ConfigDict, field_validator, model_validator
from pydantic import Field as PydanticField
from sqlmodel import Field

from src.db.assessments import AssessmentGradingType, AssessmentLifecycle
from src.db.strict_base_model import PydanticStrictBaseModel, SQLModelStrictBaseModel

AssignmentStatus = AssessmentLifecycle
GradingTypeEnum = AssessmentGradingType


def _validate_max_grade_value(value: int | None) -> int | None:
    if value is None:
        return None
    if not 0 <= value <= 100:
        raise ValueError("max_grade_value must be between 0 and 100")
    return value


class AssignmentTaskTypeEnum(StrEnum):
    FILE_SUBMISSION = "FILE_SUBMISSION"
    QUIZ = "QUIZ"
    FORM = "FORM"
    OTHER = "OTHER"


class AssignmentFileTaskConfig(SQLModelStrictBaseModel):
    kind: Literal["FILE_SUBMISSION"] = "FILE_SUBMISSION"
    allowed_mime_types: list[str] = Field(default_factory=list)
    max_file_size_mb: int | None = None
    max_files: int = 1


class AssignmentQuizOptionConfig(SQLModelStrictBaseModel):
    optionUUID: str
    text: str = ""
    fileID: str = ""
    type: Literal["text", "image", "audio", "video"] = "text"
    assigned_right_answer: bool = False


class AssignmentQuizQuestionConfig(SQLModelStrictBaseModel):
    questionUUID: str
    questionText: str = ""
    options: list[AssignmentQuizOptionConfig] = Field(default_factory=list)


class AssignmentQuizTaskSettings(SQLModelStrictBaseModel):
    max_attempts: int | None = None
    time_limit_seconds: int | None = None
    max_score_penalty_per_attempt: float | None = None


class AssignmentQuizTaskConfig(SQLModelStrictBaseModel):
    kind: Literal["QUIZ"] = "QUIZ"
    questions: list[AssignmentQuizQuestionConfig] = Field(default_factory=list)
    settings: AssignmentQuizTaskSettings = Field(
        default_factory=AssignmentQuizTaskSettings
    )


class AssignmentFormBlankConfig(SQLModelStrictBaseModel):
    blankUUID: str
    placeholder: str = ""
    correctAnswer: str = ""
    hint: str = ""


class AssignmentFormQuestionConfig(SQLModelStrictBaseModel):
    questionUUID: str
    questionText: str = ""
    blanks: list[AssignmentFormBlankConfig] = Field(default_factory=list)


class AssignmentFormTaskConfig(SQLModelStrictBaseModel):
    kind: Literal["FORM"] = "FORM"
    questions: list[AssignmentFormQuestionConfig] = Field(default_factory=list)


class AssignmentOtherTaskConfig(SQLModelStrictBaseModel):
    kind: Literal["OTHER"] = "OTHER"
    body: dict[str, object] = Field(default_factory=dict)


_TASK_TYPE_TO_CONFIG: dict[str, type[SQLModelStrictBaseModel]] = {
    AssignmentTaskTypeEnum.FILE_SUBMISSION.value: AssignmentFileTaskConfig,
    AssignmentTaskTypeEnum.QUIZ.value: AssignmentQuizTaskConfig,
    AssignmentTaskTypeEnum.FORM.value: AssignmentFormTaskConfig,
    AssignmentTaskTypeEnum.OTHER.value: AssignmentOtherTaskConfig,
}


class AssignmentRead(SQLModelStrictBaseModel):
    model_config = ConfigDict(use_enum_values=True)

    assignment_uuid: str
    title: str
    description: str
    due_at: datetime | None = None
    published: bool
    status: AssignmentStatus
    scheduled_publish_at: datetime | None = None
    published_at: datetime | None = None
    archived_at: datetime | None = None
    weight: float = 1.0
    grading_type: GradingTypeEnum
    course_uuid: str | None = None
    activity_uuid: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None


class AssignmentTaskBase(SQLModelStrictBaseModel):
    model_config = ConfigDict(use_enum_values=True)

    title: str
    description: str
    hint: str
    reference_file: str | None = None
    assignment_type: AssignmentTaskTypeEnum
    max_grade_value: int = 0

    @field_validator("assignment_type", mode="before")
    @classmethod
    def validate_assignment_type(cls, value: object) -> object:
        if isinstance(value, str):
            return AssignmentTaskTypeEnum(value)
        return value

    @field_validator("max_grade_value")
    @classmethod
    def validate_max_grade_value(cls, value: int) -> int:
        validated = _validate_max_grade_value(value)
        return 0 if validated is None else validated


class AssignmentTaskCreate(AssignmentTaskBase):
    contents: dict[str, object] = Field(default_factory=dict)

    @model_validator(mode="before")
    @classmethod
    def validate_contents_shape(cls, data: object) -> object:
        if not isinstance(data, dict):
            return data
        task_type = str(data.get("assignment_type", AssignmentTaskTypeEnum.OTHER.value))
        raw = data.get("contents")
        if isinstance(raw, dict) and raw:
            config_cls = _TASK_TYPE_TO_CONFIG.get(task_type, AssignmentOtherTaskConfig)
            config_cls.model_validate(raw)
        return data


class AssignmentTaskRead(AssignmentTaskBase):
    id: int
    assignment_task_uuid: str
    order: int = 0
    contents: dict[str, object] = Field(default_factory=dict)
    created_at: datetime | None = None
    updated_at: datetime | None = None


class AssignmentTaskUpdate(SQLModelStrictBaseModel):
    model_config = ConfigDict(use_enum_values=True)

    title: str | None = None
    description: str | None = None
    hint: str | None = None
    reference_file: str | None = None
    assignment_type: AssignmentTaskTypeEnum | None = None
    contents: dict[str, object] | None = None
    max_grade_value: int | None = None

    @field_validator("assignment_type", mode="before")
    @classmethod
    def validate_assignment_type(cls, value: object) -> object:
        if value is not None and isinstance(value, str):
            return AssignmentTaskTypeEnum(value)
        return value

    @field_validator("max_grade_value")
    @classmethod
    def validate_max_grade_value(cls, value: int | None) -> int | None:
        return _validate_max_grade_value(value)

    @model_validator(mode="before")
    @classmethod
    def validate_contents_shape(cls, data: object) -> object:
        if not isinstance(data, dict):
            return data
        task_type = data.get("assignment_type")
        raw = data.get("contents")
        if task_type is not None and isinstance(raw, dict) and raw:
            config_cls = _TASK_TYPE_TO_CONFIG.get(
                str(task_type), AssignmentOtherTaskConfig
            )
            config_cls.model_validate(raw)
        return data


class AccessModeEnum(StrEnum):
    NO_ACCESS = "NO_ACCESS"
    WHITELIST = "WHITELIST"
    ALL_ENROLLED = "ALL_ENROLLED"


class QuestionTypeEnum(StrEnum):
    SINGLE_CHOICE = "SINGLE_CHOICE"
    MULTIPLE_CHOICE = "MULTIPLE_CHOICE"
    TRUE_FALSE = "TRUE_FALSE"
    MATCHING = "MATCHING"


TIME_LIMIT_MIN = 1
TIME_LIMIT_MAX = 180
VIOLATION_THRESHOLD_MIN = 1
VIOLATION_THRESHOLD_MAX = 10
QUESTION_LIMIT_MIN = 1


class QuestionBase(SQLModelStrictBaseModel):
    question_text: str
    question_type: QuestionTypeEnum
    points: int = 1
    explanation: str | None = None
    order_index: int = 0
    answer_options: list[dict[str, object]] = Field(default_factory=list)

    @field_validator("question_type", mode="before")
    @classmethod
    def validate_question_type(cls, value: object) -> object:
        if isinstance(value, str):
            return QuestionTypeEnum(value)
        return value


class QuestionCreate(QuestionBase):
    pass


class QuestionRead(QuestionBase):
    id: int
    question_uuid: str
    creation_date: str | None = None
    update_date: str | None = None


class QuestionUpdate(SQLModelStrictBaseModel):
    question_text: str | None = None
    question_type: QuestionTypeEnum | None = None
    points: int | None = None
    explanation: str | None = None
    order_index: int | None = None
    answer_options: list[dict[str, object]] | None = None

    @field_validator("question_type", mode="before")
    @classmethod
    def validate_question_type(cls, value: object) -> object:
        if value is not None and isinstance(value, str):
            return QuestionTypeEnum(value)
        return value


class DifficultyLevel(StrEnum):
    EASY = "EASY"
    MEDIUM = "MEDIUM"
    HARD = "HARD"


class GradingStrategy(StrEnum):
    ALL_OR_NOTHING = "ALL_OR_NOTHING"
    PARTIAL_CREDIT = "PARTIAL_CREDIT"
    BEST_SUBMISSION = "BEST_SUBMISSION"
    LATEST_SUBMISSION = "LATEST_SUBMISSION"


class ExecutionMode(StrEnum):
    FAST_FEEDBACK = "FAST_FEEDBACK"
    COMPLETE_FEEDBACK = "COMPLETE_FEEDBACK"


class TestCase(PydanticStrictBaseModel):
    id: str
    input: str
    expected_output: str
    is_visible: bool = True
    weight: int = 1
    description: str | None = None
    group: str = "default"
    time_limit_override: int | None = None


class Hint(PydanticStrictBaseModel):
    id: str
    order: int
    content: str
    xp_penalty: int = 5


class CodeChallengeSettings(PydanticStrictBaseModel):
    difficulty: DifficultyLevel = DifficultyLevel.EASY
    allowed_languages: list[int] = PydanticField(default_factory=list)
    time_limit: int = 5
    memory_limit: int = 256
    grading_strategy: GradingStrategy = GradingStrategy.PARTIAL_CREDIT
    execution_mode: ExecutionMode = ExecutionMode.COMPLETE_FEEDBACK
    allow_custom_input: bool = True
    points: int = 100
    due_date: str | None = None
    starter_code: dict[str, str] = PydanticField(default_factory=dict)
    visible_tests: list[TestCase] = PydanticField(default_factory=list)
    hidden_tests: list[TestCase] = PydanticField(default_factory=list)
    hints: list[Hint] = PydanticField(default_factory=list)
    reference_solution: str | None = None
    lifecycle_status: str = "DRAFT"
    scheduled_at: str | None = None
    published_at: str | None = None
    archived_at: str | None = None

    @field_validator("difficulty", mode="before")
    @classmethod
    def validate_difficulty(cls, value: object) -> object:
        if isinstance(value, str):
            return DifficultyLevel(value)
        return value

    @field_validator("grading_strategy", mode="before")
    @classmethod
    def validate_grading_strategy(cls, value: object) -> object:
        if isinstance(value, str):
            return GradingStrategy(value)
        return value

    @field_validator("execution_mode", mode="before")
    @classmethod
    def validate_execution_mode(cls, value: object) -> object:
        if isinstance(value, str):
            return ExecutionMode(value)
        return value

    @field_validator("memory_limit", mode="before")
    @classmethod
    def validate_memory_limit(cls, value: object) -> int | None:
        if value is None:
            return None
        try:
            parsed = int(value)
        except (TypeError, ValueError) as exc:
            raise ValueError("memory_limit must be an integer number of MB") from exc
        if parsed < 64:
            return 64
        if parsed > 2048:
            return 2048
        return parsed
