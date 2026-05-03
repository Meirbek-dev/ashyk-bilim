"""Canonical assessment settings read/write path."""

from enum import StrEnum
from typing import Annotated, Literal

from fastapi import HTTPException, status
from pydantic import Field as PydanticField
from pydantic import TypeAdapter
from sqlmodel import Session, select

from src.db.assessments import Assessment, AssessmentItem
from src.db.courses.activities import Activity, ActivityTypeEnum
from src.db.grading.progress import AssessmentPolicy
from src.db.grading.submissions import AssessmentType
from src.db.strict_base_model import PydanticStrictBaseModel


class AccessModeEnum(StrEnum):
    NO_ACCESS = "NO_ACCESS"
    WHITELIST = "WHITELIST"
    ALL_ENROLLED = "ALL_ENROLLED"


class GradingStrategy(StrEnum):
    ALL_OR_NOTHING = "ALL_OR_NOTHING"
    PARTIAL_CREDIT = "PARTIAL_CREDIT"
    BEST_SUBMISSION = "BEST_SUBMISSION"
    LATEST_SUBMISSION = "LATEST_SUBMISSION"


class ExecutionMode(StrEnum):
    FAST_FEEDBACK = "FAST_FEEDBACK"
    COMPLETE_FEEDBACK = "COMPLETE_FEEDBACK"


class CodeAssessmentSettings(PydanticStrictBaseModel):
    kind: Literal["CODE_CHALLENGE"] = "CODE_CHALLENGE"
    difficulty: str = "EASY"
    allowed_languages: list[int] = PydanticField(default_factory=list)
    time_limit: int = 5
    memory_limit: int = 256
    grading_strategy: GradingStrategy = GradingStrategy.PARTIAL_CREDIT
    execution_mode: ExecutionMode = ExecutionMode.COMPLETE_FEEDBACK
    allow_custom_input: bool = True
    points: int = 100
    due_date: str | None = None
    starter_code: dict[str, str] = PydanticField(default_factory=dict)
    visible_tests: list[dict[str, object]] = PydanticField(default_factory=list)
    hidden_tests: list[dict[str, object]] = PydanticField(default_factory=list)
    hints: list[dict[str, object]] = PydanticField(default_factory=list)
    reference_solution: str | None = None
    lifecycle_status: str = "DRAFT"
    scheduled_at: str | None = None
    published_at: str | None = None
    archived_at: str | None = None


class AssignmentAssessmentSettings(PydanticStrictBaseModel):
    kind: Literal["ASSIGNMENT"] = "ASSIGNMENT"
    lifecycle_status: str = "DRAFT"
    due_at: str | None = None
    attempt_limit: int | None = None
    grading_strategy: str = "MANUAL"
    anti_cheat: dict[str, object] = PydanticField(default_factory=dict)


class ExamAssessmentSettings(PydanticStrictBaseModel):
    kind: Literal["EXAM"] = "EXAM"
    time_limit: int | None = None
    attempt_limit: int | None = 1
    shuffle_questions: bool = True
    shuffle_answers: bool = True
    question_limit: int | None = None
    access_mode: AccessModeEnum = AccessModeEnum.NO_ACCESS
    whitelist_user_ids: list[int] = PydanticField(default_factory=list)
    allow_result_review: bool = True
    show_correct_answers: bool = True
    passing_score: int = 60
    copy_paste_protection: bool = False
    tab_switch_detection: bool = False
    devtools_detection: bool = False
    right_click_disable: bool = False
    fullscreen_enforcement: bool = False
    violation_threshold: int | None = 3
    lifecycle_status: str = "DRAFT"
    scheduled_at: str | None = None
    published_at: str | None = None
    archived_at: str | None = None


class QuizAssessmentSettings(PydanticStrictBaseModel):
    kind: Literal["QUIZ"] = "QUIZ"
    due_date_iso: str | None = None
    questions: list[dict[str, object]] = PydanticField(default_factory=list)
    max_attempts: int | None = None
    time_limit_seconds: int | None = None
    max_score_penalty_per_attempt: float | None = None
    track_violations: bool = False
    block_on_violations: bool = False
    max_violations: int = 3


type AssessmentSettings = Annotated[
    AssignmentAssessmentSettings
    | ExamAssessmentSettings
    | QuizAssessmentSettings
    | CodeAssessmentSettings,
    PydanticField(discriminator="kind"),
]

ASSESSMENT_SETTINGS_ADAPTER: TypeAdapter[AssessmentSettings] = TypeAdapter(
    AssessmentSettings
)


def validate_settings(payload: dict[str, object]) -> AssessmentSettings:
    return ASSESSMENT_SETTINGS_ADAPTER.validate_python(payload)


def get_settings(activity_id: int, db_session: Session) -> AssessmentSettings:
    activity = _get_activity_or_404(activity_id, db_session)
    raw_settings = activity.settings or {}
    if raw_settings.get("kind"):
        return validate_settings(raw_settings)
    return _settings_for_activity(activity, db_session)


def put_settings(
    activity_id: int,
    settings: AssessmentSettings,
    db_session: Session,
) -> AssessmentSettings:
    activity = _get_activity_or_404(activity_id, db_session)
    validated = validate_settings(_dump_settings(settings))
    payload = _dump_settings(validated)

    activity.settings = payload

    db_session.add(activity)
    db_session.commit()
    db_session.refresh(activity)
    return validated


def _get_activity_or_404(activity_id: int, db_session: Session) -> Activity:
    activity = db_session.exec(
        select(Activity).where(Activity.id == activity_id)
    ).first()
    if activity is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Activity not found",
        )
    return activity


def _settings_for_activity(
    activity: Activity,
    db_session: Session,
) -> AssessmentSettings:
    assessment = None
    if activity.id is not None:
        assessment = db_session.exec(
            select(Assessment).where(Assessment.activity_id == activity.id)
        ).first()
    policy = None
    if activity.id is not None:
        policy = db_session.exec(
            select(AssessmentPolicy).where(AssessmentPolicy.activity_id == activity.id)
        ).first()

    if activity.activity_type == ActivityTypeEnum.TYPE_EXAM:
        return validate_settings(
            _exam_settings_payload(activity, assessment, policy, db_session)
        )

    if activity.activity_type == ActivityTypeEnum.TYPE_CODE_CHALLENGE:
        return validate_settings(
            _code_settings_payload(activity, assessment, policy, db_session)
        )

    if activity.activity_type == ActivityTypeEnum.TYPE_ASSIGNMENT:
        return validate_settings(
            _assignment_settings_payload(activity, assessment, policy)
        )

    if assessment is not None and AssessmentType(assessment.kind) == AssessmentType.QUIZ:
        return validate_settings(_quiz_settings_payload(assessment, policy, db_session))

    return AssignmentAssessmentSettings()


def _assignment_settings_payload(
    activity: Activity,
    assessment: Assessment | None,
    policy: AssessmentPolicy | None,
) -> dict[str, object]:
    return {
        "kind": "ASSIGNMENT",
        "lifecycle_status": _lifecycle_value(activity, assessment),
        "due_at": policy.due_at.isoformat() if policy and policy.due_at else None,
        "attempt_limit": policy.max_attempts if policy else None,
        "grading_strategy": (policy.grading_mode if policy else "MANUAL"),
        "anti_cheat": policy.anti_cheat_json if policy else {},
    }


def _exam_settings_payload(
    activity: Activity,
    assessment: Assessment | None,
    policy: AssessmentPolicy | None,
    db_session: Session,
) -> dict[str, object]:
    question_limit = 0
    if assessment is not None and assessment.id is not None:
        question_limit = len(
            db_session.exec(
                select(AssessmentItem).where(AssessmentItem.assessment_id == assessment.id)
            ).all()
        )
    anti_cheat = policy.anti_cheat_json if policy else {}
    return {
        "kind": "EXAM",
        "time_limit": (
            int(policy.time_limit_seconds / 60)
            if policy and policy.time_limit_seconds
            else None
        ),
        "attempt_limit": policy.max_attempts if policy else 1,
        "question_limit": question_limit or None,
        "passing_score": int(policy.passing_score) if policy else 60,
        "copy_paste_protection": anti_cheat.get("copy_paste_protection") is True,
        "tab_switch_detection": anti_cheat.get("tab_switch_detection") is True,
        "devtools_detection": anti_cheat.get("devtools_detection") is True,
        "right_click_disable": anti_cheat.get("right_click_disable") is True,
        "fullscreen_enforcement": anti_cheat.get("fullscreen_enforcement") is True,
        "violation_threshold": anti_cheat.get("violation_threshold", 3),
        "lifecycle_status": _lifecycle_value(activity, assessment),
        "scheduled_at": assessment.scheduled_at.isoformat()
        if assessment and assessment.scheduled_at
        else None,
        "published_at": assessment.published_at.isoformat()
        if assessment and assessment.published_at
        else None,
        "archived_at": assessment.archived_at.isoformat()
        if assessment and assessment.archived_at
        else None,
    }


def _quiz_settings_payload(
    assessment: Assessment,
    policy: AssessmentPolicy | None,
    db_session: Session,
) -> dict[str, object]:
    questions = []
    if assessment.id is not None:
        questions = [
            item.body_json
            for item in db_session.exec(
                select(AssessmentItem)
                .where(AssessmentItem.assessment_id == assessment.id)
                .order_by(AssessmentItem.order, AssessmentItem.id)
            ).all()
        ]
    anti_cheat = policy.anti_cheat_json if policy else {}
    return {
        "kind": "QUIZ",
        "due_date_iso": policy.due_at.isoformat() if policy and policy.due_at else None,
        "questions": questions,
        "max_attempts": policy.max_attempts if policy else None,
        "time_limit_seconds": policy.time_limit_seconds if policy else None,
        "max_score_penalty_per_attempt": None,
        "track_violations": anti_cheat.get("tab_switch_detection") is True,
        "block_on_violations": anti_cheat.get("violation_threshold") is not None,
        "max_violations": int(anti_cheat.get("violation_threshold", 3)),
    }


def _code_settings_payload(
    activity: Activity,
    assessment: Assessment | None,
    policy: AssessmentPolicy | None,
    db_session: Session,
) -> dict[str, object]:
    payload = dict(activity.details or {})
    if assessment is not None and assessment.id is not None:
        item = db_session.exec(
            select(AssessmentItem)
            .where(AssessmentItem.assessment_id == assessment.id)
            .order_by(AssessmentItem.order, AssessmentItem.id)
        ).first()
        if item is not None and isinstance(item.body_json, dict):
            payload.setdefault("allowed_languages", item.body_json.get("languages", []))
            payload.setdefault("starter_code", item.body_json.get("starter_code", {}))
            payload.setdefault("visible_tests", item.body_json.get("tests", []))
            payload.setdefault("time_limit", item.body_json.get("time_limit_seconds", 5))
            payload.setdefault("memory_limit", item.body_json.get("memory_limit_mb", 256))
    payload.setdefault("kind", "CODE_CHALLENGE")
    payload.setdefault("due_date", policy.due_at.isoformat() if policy and policy.due_at else None)
    payload.setdefault("lifecycle_status", _lifecycle_value(activity, assessment))
    payload.setdefault(
        "scheduled_at",
        assessment.scheduled_at.isoformat() if assessment and assessment.scheduled_at else None,
    )
    payload.setdefault(
        "published_at",
        assessment.published_at.isoformat() if assessment and assessment.published_at else None,
    )
    payload.setdefault(
        "archived_at",
        assessment.archived_at.isoformat() if assessment and assessment.archived_at else None,
    )
    return payload


def _lifecycle_value(activity: Activity, assessment: Assessment | None) -> str:
    if assessment is not None:
        return str(assessment.lifecycle)
    details = activity.details if isinstance(activity.details, dict) else {}
    return str(details.get("lifecycle_status", "DRAFT"))


def _dump_settings(settings: AssessmentSettings) -> dict[str, object]:
    return settings.model_dump(mode="json")
