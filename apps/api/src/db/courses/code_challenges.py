"""
Code Challenge Models

Database models for the coding activity system with Judge0 integration.
"""

from datetime import datetime
from enum import Enum, StrEnum

from pydantic import ConfigDict, field_validator
from pydantic import Field as PydanticField
from sqlalchemy import JSON, BigInteger, Column, ForeignKey, Index, Text
from sqlmodel import Field

from src.db.strict_base_model import PydanticStrictBaseModel, SQLModelStrictBaseModel

# Enums


class DifficultyLevel(StrEnum):
    """Difficulty level for code challenges"""

    EASY = "EASY"
    MEDIUM = "MEDIUM"
    HARD = "HARD"


class GradingStrategy(StrEnum):
    """Grading strategy for code challenges"""

    ALL_OR_NOTHING = "ALL_OR_NOTHING"
    PARTIAL_CREDIT = "PARTIAL_CREDIT"
    BEST_SUBMISSION = "BEST_SUBMISSION"
    LATEST_SUBMISSION = "LATEST_SUBMISSION"


class ExecutionMode(StrEnum):
    """Execution mode for test cases"""

    FAST_FEEDBACK = "FAST_FEEDBACK"  # Stop on first failure
    COMPLETE_FEEDBACK = "COMPLETE_FEEDBACK"  # Run all tests


class SubmissionStatus(StrEnum):
    """Status of a code submission"""

    PENDING = "PENDING"
    PROCESSING = "PROCESSING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
    PENDING_JUDGE0 = "PENDING_JUDGE0"  # Judge0 unavailable, needs retry


class Judge0Status(int, Enum):
    """Judge0 submission status codes"""

    IN_QUEUE = 1
    PROCESSING = 2
    ACCEPTED = 3
    WRONG_ANSWER = 4
    TIME_LIMIT_EXCEEDED = 5
    COMPILATION_ERROR = 6
    RUNTIME_ERROR_SIGSEGV = 7
    RUNTIME_ERROR_SIGXFSZ = 8
    RUNTIME_ERROR_SIGFPE = 9
    RUNTIME_ERROR_SIGABRT = 10
    RUNTIME_ERROR_NZEC = 11
    RUNTIME_ERROR_OTHER = 12
    INTERNAL_ERROR = 13
    EXEC_FORMAT_ERROR = 14

    @classmethod
    def from_code(cls, code: int) -> Judge0Status:
        """Get status from code, defaulting to INTERNAL_ERROR for unknown codes"""
        try:
            return cls(code)
        except ValueError:
            return cls.INTERNAL_ERROR

    @property
    def is_finished(self) -> bool:
        """Check if this status represents a finished submission"""
        return self.value >= 3

    @property
    def is_success(self) -> bool:
        """Check if this status represents a successful submission"""
        return self == Judge0Status.ACCEPTED

    @property
    def is_error(self) -> bool:
        """Check if this status represents an error"""
        return self.value >= 4


# Pydantic models for JSON fields


class TestCase(PydanticStrictBaseModel):
    """Test case model stored in activity.details JSON"""

    id: str  # ULID
    input: str
    expected_output: str
    is_visible: bool = True
    weight: int = 1  # for partial credit
    description: str | None = None
    group: str = "default"  # basic, edge, performance
    time_limit_override: int | None = None  # seconds, overrides challenge default


class TestCaseResult(PydanticStrictBaseModel):
    """Result of a single test case execution"""

    test_case_id: str
    status: int  # Judge0 status code
    status_description: str
    passed: bool
    time_ms: float | None = None
    memory_kb: float | None = None
    stdout: str | None = None
    stderr: str | None = None
    compile_output: str | None = None
    message: str | None = None


class Hint(PydanticStrictBaseModel):
    """Hint model stored in activity.content.hints"""

    id: str
    order: int
    content: str  # Markdown
    xp_penalty: int = 5  # XP deducted per hint viewed


class CodeChallengeSettings(PydanticStrictBaseModel):
    """Settings stored in activity.details JSON field"""

    difficulty: DifficultyLevel = DifficultyLevel.EASY
    allowed_languages: list[int] = PydanticField(
        default_factory=list
    )  # Judge0 language IDs
    time_limit: int = 5  # seconds per test case
    memory_limit: int = 256  # MB
    grading_strategy: GradingStrategy = GradingStrategy.PARTIAL_CREDIT
    execution_mode: ExecutionMode = ExecutionMode.COMPLETE_FEEDBACK
    allow_custom_input: bool = True
    points: int = 100
    due_date: str | None = None
    starter_code: dict[str, str] = PydanticField(
        default_factory=dict
    )  # {language_id: code}
    visible_tests: list[TestCase] = PydanticField(default_factory=list)
    hidden_tests: list[TestCase] = PydanticField(default_factory=list)
    hints: list[Hint] = PydanticField(default_factory=list)
    reference_solution: str | None = None  # Encrypted, admin only
    lifecycle_status: str = "DRAFT"
    scheduled_at: str | None = None
    published_at: str | None = None
    archived_at: str | None = None

    @field_validator("difficulty", mode="before")
    @classmethod
    def validate_difficulty(cls, v):
        if isinstance(v, str):
            return DifficultyLevel(v)
        return v

    @field_validator("grading_strategy", mode="before")
    @classmethod
    def validate_grading_strategy(cls, v):
        if isinstance(v, str):
            return GradingStrategy(v)
        return v

    @field_validator("execution_mode", mode="before")
    @classmethod
    def validate_execution_mode(cls, v):
        if isinstance(v, str):
            return ExecutionMode(v)
        return v

    @field_validator("memory_limit", mode="before")
    @classmethod
    def validate_memory_limit(cls, v) -> int | None:
        """Ensure memory_limit is an integer MB and clamp to sensible bounds (64-2048 MB)"""
        if v is None:
            return v
        try:
            val = int(v)
        except TypeError, ValueError:
            msg = "memory_limit must be an integer number of MB"
            raise ValueError(msg)
        # Clamp to [64, 2048] MB to prevent too-low values that break V8 and too-high values
        if val < 64:
            return 64
        if val > 2048:
            return 2048
        return val


# Database Models


class CodeSubmissionBase(SQLModelStrictBaseModel):
    """Base model for code submissions"""

    model_config = ConfigDict(use_enum_values=True)

    language_id: int  # Judge0 language ID
    language_name: str = ""  # Human-readable language name
    source_code: str = Field(sa_column=Column(Text))  # Base64 encoded
    status: SubmissionStatus = SubmissionStatus.PENDING
    score: float = 0.0  # 0-100
    passed_tests: int = 0
    total_tests: int = 0
    execution_time_ms: float | None = None
    memory_kb: float | None = None

    @field_validator("status", mode="before")
    @classmethod
    def validate_status(cls, v):
        if isinstance(v, str):
            return SubmissionStatus(v)
        return v


class CodeSubmission(CodeSubmissionBase, table=True):
    """Legacy database table model for code submissions.

    New features must write canonical src.db.grading.submissions.Submission
    rows and ActivityProgress first. This table remains as the Judge0 adapter
    record while old code-challenge URLs are supported.
    """

    __tablename__ = "code_submission"

    id: int | None = Field(default=None, primary_key=True)
    submission_uuid: str = Field(index=True)

    activity_id: int = Field(
        sa_column=Column(BigInteger, ForeignKey("activity.id", ondelete="CASCADE"))
    )
    user_id: int = Field(
        sa_column=Column(BigInteger, ForeignKey("user.id", ondelete="CASCADE"))
    )

    # Test results stored as JSON
    test_results: dict = Field(default_factory=dict, sa_column=Column(JSON))

    # Timestamps
    created_at: str = ""
    updated_at: str = ""

    # Optional plagiarism score from MOSS
    plagiarism_score: float | None = None

    # Judge0 batch tokens for polling
    judge0_tokens: list[str] = Field(default_factory=list, sa_column=Column(JSON))

    __table_args__ = (
        Index("idx_code_submission_user_activity", "user_id", "activity_id"),
        Index("idx_code_submission_score", "activity_id", "score"),
        Index("idx_code_submission_created", "created_at"),
    )


class CodeSubmissionCreate(PydanticStrictBaseModel):
    """Model for creating a code submission"""

    language_id: int
    source_code: str  # Base64 encoded


class CodeSubmissionRead(CodeSubmissionBase):
    """Model for reading a code submission"""

    model_config = ConfigDict(from_attributes=True)

    id: int
    uuid: str | None = None
    submission_uuid: str
    submission_status: str | None = None
    activity_id: int
    user_id: int
    test_results: dict
    created_at: str
    updated_at: str
    max_score: float = 100.0
    plagiarism_score: float | None = None


class CodeSubmissionDetail(CodeSubmissionRead):
    """Detailed submission with source code (for review)"""

    source_code: str


# Hint Usage Tracking


class HintUsageBase(SQLModelStrictBaseModel):
    """Base model for hint usage tracking"""

    hint_id: str
    xp_deducted: int = 0


class HintUsage(HintUsageBase, table=True):
    """Database table for tracking hint usage"""

    __tablename__ = "hint_usage"

    id: int | None = Field(default=None, primary_key=True)
    activity_id: int = Field(
        sa_column=Column(BigInteger, ForeignKey("activity.id", ondelete="CASCADE"))
    )
    user_id: int = Field(
        sa_column=Column(BigInteger, ForeignKey("user.id", ondelete="CASCADE"))
    )
    unlocked_at: str = ""

    __table_args__ = (Index("idx_hint_usage_user_activity", "user_id", "activity_id"),)


# Response Models


class SubmissionResponse(PydanticStrictBaseModel):
    """Response after creating a submission"""

    submission_uuid: str
    status: SubmissionStatus
    message: str = "Submission created successfully"


class TestRunResponse(PydanticStrictBaseModel):
    """Response for running visible tests only"""

    results: list[TestCaseResult]
    passed: int
    total: int
    execution_time_ms: float | None = None


class CustomTestResponse(PydanticStrictBaseModel):
    """Response for custom test input"""

    status: int
    status_description: str
    stdout: str | None = None
    stderr: str | None = None
    compile_output: str | None = None
    time_ms: float | None = None
    memory_kb: float | None = None


class Judge0Language(PydanticStrictBaseModel):
    """Judge0 language info"""

    id: int
    name: str


class StudentAnalytics(PydanticStrictBaseModel):
    """Analytics for a student on a code challenge"""

    total_submissions: int
    best_score: float
    best_submission_uuid: str | None = None
    average_score: float
    languages_used: list[str]
    total_time_spent_ms: float
    first_ac_time_ms: float | None = None  # Time to first Accepted
    hints_used: int
    xp_earned: int


class InstructorAnalytics(PydanticStrictBaseModel):
    """Analytics for instructors on a code challenge"""

    total_submissions: int
    unique_students: int
    completion_rate: float  # Students with score >= passing threshold
    average_score: float
    score_distribution: dict[str, int]  # {"0-20": 5, "21-40": 10, ...}
    language_distribution: dict[str, int]  # {language_name: count}
    common_errors: list[dict]  # Top errors with count
    failing_tests: dict[str, int]  # {test_id: failure_count}


class LeaderboardEntry(PydanticStrictBaseModel):
    """Single entry in the leaderboard"""

    rank: int
    user_id: int
    username: str
    avatar_url: str | None = None
    score: float
    time_to_first_ac_ms: float | None = None
    attempts: int
    composite_score: float  # Weighted: 0.6*score + 0.3*speed + 0.1*(1/attempts)


class CodeChallengeLeaderboard(PydanticStrictBaseModel):
    """Leaderboard for a code challenge"""

    activity_uuid: str
    entries: list[LeaderboardEntry]
    current_user_rank: int | None = None
    total_participants: int
