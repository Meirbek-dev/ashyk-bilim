"""Canonical assessment settings read/write path.

Assessment settings are stored once on Activity.settings and validated through
the discriminated AssessmentSettings union below. Legacy per-kind columns remain
compatibility mirrors only.
"""

from typing import Annotated, Literal, TypeAlias

from fastapi import HTTPException, status
from pydantic import Field as PydanticField
from pydantic import TypeAdapter
from sqlmodel import Session, select

from src.db.courses.activities import Activity, ActivityTypeEnum
from src.db.courses.blocks import Block, BlockTypeEnum
from src.db.courses.code_challenges import (
    CodeChallengeSettings,
    ExecutionMode,
    GradingStrategy,
)
from src.db.courses.exams import AccessModeEnum
from src.db.courses.exams import Exam
from src.db.courses.quiz import QuizSettings
from src.db.strict_base_model import PydanticStrictBaseModel


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


class QuizAssessmentSettings(QuizSettings):
    kind: Literal["QUIZ"] = "QUIZ"
    due_date_iso: str | None = None
    questions: list[dict[str, object]] = PydanticField(default_factory=list)


class CodeAssessmentSettings(CodeChallengeSettings):
    kind: Literal["CODE_CHALLENGE"] = "CODE_CHALLENGE"
    grading_strategy: GradingStrategy = GradingStrategy.PARTIAL_CREDIT
    execution_mode: ExecutionMode = ExecutionMode.COMPLETE_FEEDBACK


AssessmentSettings: TypeAlias = Annotated[
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

    return _legacy_settings_for_activity(activity, db_session)


def put_settings(
    activity_id: int,
    settings: AssessmentSettings,
    db_session: Session,
) -> AssessmentSettings:
    activity = _get_activity_or_404(activity_id, db_session)
    validated = validate_settings(_dump_settings(settings))
    payload = _dump_settings(validated)

    activity.settings = payload

    # Compatibility mirrors for routes that still read legacy storage.
    if validated.kind == "EXAM":
        exam = db_session.exec(
            select(Exam).where(Exam.activity_id == activity.id)
        ).first()
        if exam is not None:
            exam.settings = {k: v for k, v in payload.items() if k != "kind"}
            db_session.add(exam)
    elif validated.kind == "CODE_CHALLENGE":
        activity.details = {k: v for k, v in payload.items() if k != "kind"}

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


def _legacy_settings_for_activity(
    activity: Activity,
    db_session: Session,
) -> AssessmentSettings:
    if activity.activity_type == ActivityTypeEnum.TYPE_EXAM:
        exam = db_session.exec(
            select(Exam).where(Exam.activity_id == activity.id)
        ).first()
        return validate_settings({
            "kind": "EXAM",
            **(exam.settings if exam is not None else {}),
        })

    if activity.activity_type == ActivityTypeEnum.TYPE_CODE_CHALLENGE:
        return validate_settings({"kind": "CODE_CHALLENGE", **(activity.details or {})})

    if activity.activity_type == ActivityTypeEnum.TYPE_ASSIGNMENT:
        details = activity.details or {}
        return validate_settings({"kind": "ASSIGNMENT", **details})

    quiz_block = db_session.exec(
        select(Block)
        .where(Block.activity_id == activity.id)
        .where(Block.block_type == BlockTypeEnum.BLOCK_QUIZ)
    ).first()
    if quiz_block is not None:
        raw = quiz_block.content.get("settings", {})
        questions = quiz_block.content.get("questions", [])
        return validate_settings({"kind": "QUIZ", **raw, "questions": questions})

    return AssignmentAssessmentSettings()


def _dump_settings(settings: AssessmentSettings) -> dict[str, object]:
    return settings.model_dump(mode="json")
