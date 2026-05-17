"""Assessment service — shared private helpers, constants, and builders.

All private helpers used across multiple assessment service modules live here.
"""

import logging
from datetime import UTC, datetime, timedelta

from fastapi import HTTPException, status
from pydantic import ValidationError
from sqlalchemy import asc, desc, func, or_
from sqlmodel import Session, select
from ulid import ULID

from src.db.assessments import (
    ITEM_ANSWER_ADAPTER,
    ITEM_BODY_ADAPTER,
    Assessment,
    AssessmentAttemptProjection,
    AssessmentCreate,
    AssessmentDraftPatch,
    AssessmentDraftRead,
    AssessmentEffectivePolicy,
    AssessmentGradingType,
    AssessmentItem,
    AssessmentItemCreate,
    AssessmentItemReorder,
    AssessmentItemUpdate,
    AssessmentLifecycle,
    AssessmentLifecycleTransition,
    AssessmentPolicyPatch,
    AssessmentPolicyPreset,
    AssessmentRead,
    AssessmentReadiness,
    AssessmentReadItem,
    AssessmentReviewProjection,
    AssessmentScoreProjection,
    AssessmentUpdate,
    CodeRunRequest,
    CodeRunResponse,
    GradingDraftSave,
    ItemGradeEntry,
    ItemKind,
    ReadinessIssue,
    ReviewQueueRead,
    RubricCriterion,
    StudentPolicyOverrideCreate,
    StudentPolicyOverrideRead,
    StudentPolicyOverrideUpdate,
    StudentSubmissionRead,
    TeacherSubmissionRead,
)
from src.db.code_execution import CodeRunPurpose, CodeRunStatus
from src.db.courses.activities import (
    Activity,
    ActivityAssessmentPolicyRead,
    ActivitySubTypeEnum,
    ActivityTypeEnum,
)
from src.db.courses.chapters import Chapter
from src.db.courses.courses import Course
from src.db.grading.entries import GradingEntry
from src.db.grading.overrides import StudentPolicyOverride
from src.db.grading.progress import (
    AssessmentCompletionRule,
    AssessmentGradingMode,
    AssessmentPolicy,
    GradeReleaseMode,
    LatePolicyNone,
)
from src.db.grading.schemas import BulkPublishGradesResponse
from src.db.grading.submissions import (
    AssessmentType,
    GradingBreakdown,
    Submission,
    SubmissionRead,
    SubmissionStats,
    SubmissionStatus,
    TeacherGradeInput,
)
from src.db.users import AnonymousUser, PublicUser, User
from src.security.rbac import PermissionChecker
from src.services.assessments.settings import validate_settings
from src.services.code_execution import get_code_execution_service
from src.services.courses._utils import (
    _get_activity_by_uuid_or_404,
    _next_activity_order,
)
from src.services.courses.access import user_has_course_access
from src.services.grading.pipeline.orchestrator import (
    submit_assessment as submit_assessment_pipeline,
)
from src.services.grading.settings_loader import load_activity_settings
from src.services.grading.submission import start_submission_v2
from src.services.grading.teacher import _save_teacher_grade, bulk_publish_grades
from src.services.progress import submissions as progress_submissions

ASSESSABLE_ACTIVITY_TYPES = {
    ActivityTypeEnum.TYPE_EXAM,
    ActivityTypeEnum.TYPE_CUSTOM,
    ActivityTypeEnum.TYPE_CODE_CHALLENGE,
}

_KIND_TO_ACTIVITY: dict[
    AssessmentType, tuple[ActivityTypeEnum, ActivitySubTypeEnum]
] = {
    AssessmentType.EXAM: (
        ActivityTypeEnum.TYPE_EXAM,
        ActivitySubTypeEnum.SUBTYPE_EXAM_STANDARD,
    ),
    AssessmentType.CODE_CHALLENGE: (
        ActivityTypeEnum.TYPE_CODE_CHALLENGE,
        ActivitySubTypeEnum.SUBTYPE_CODE_GENERAL,
    ),
    AssessmentType.QUIZ: (
        ActivityTypeEnum.TYPE_CUSTOM,
        ActivitySubTypeEnum.SUBTYPE_CUSTOM,
    ),
}

_ACTIVITY_TO_KIND: dict[ActivityTypeEnum, AssessmentType] = {
    ActivityTypeEnum.TYPE_EXAM: AssessmentType.EXAM,
    ActivityTypeEnum.TYPE_CODE_CHALLENGE: AssessmentType.CODE_CHALLENGE,
}

_ALLOWED_LIFECYCLE_TRANSITIONS: dict[
    AssessmentLifecycle, frozenset[AssessmentLifecycle]
] = {
    AssessmentLifecycle.DRAFT: frozenset({
        AssessmentLifecycle.SCHEDULED,
        AssessmentLifecycle.PUBLISHED,
        AssessmentLifecycle.ARCHIVED,
    }),
    AssessmentLifecycle.SCHEDULED: frozenset({
        AssessmentLifecycle.DRAFT,
        AssessmentLifecycle.PUBLISHED,
        AssessmentLifecycle.ARCHIVED,
    }),
    AssessmentLifecycle.PUBLISHED: frozenset({
        AssessmentLifecycle.DRAFT,
        AssessmentLifecycle.ARCHIVED,
    }),
    AssessmentLifecycle.ARCHIVED: frozenset({
        AssessmentLifecycle.DRAFT,
    }),
}

logger = logging.getLogger(__name__)
_UNSET = object()
_REVIEW_SORT_MAP = {
    "submitted_at": Submission.submitted_at,
    "final_score": Submission.final_score,
    "created_at": Submission.created_at,
    "attempt_number": Submission.attempt_number,
}


def _get_or_project_assessment_for_activity(
    activity: Activity,
    db_session: Session,
) -> Assessment:
    """Return the canonical Assessment row for an activity.

    This is a pure read operation. It never creates Assessment or
    AssessmentPolicy rows. Activities without a canonical assessment row
    should have been migrated by the Phase 0 Alembic migration.
    """
    existing = db_session.exec(
        select(Assessment).where(Assessment.activity_id == activity.id)
    ).first()
    if existing is not None:
        return existing

    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail={
            "code": "ASSESSMENT_NOT_FOUND",
            "message": (
                "У этой активности нет канонической записи оценивания. "
                "Обратитесь к администратору для проверки миграции данных."
            ),
        },
    )


# ── Builders and helpers ──────────────────────────────────────────────────────


def _build_assessment_read(
    assessment: Assessment,
    db_session: Session,
    *,
    current_user: PublicUser | AnonymousUser | None = None,
) -> AssessmentRead:
    activity = db_session.get(Activity, assessment.activity_id)
    if activity is None:
        raise HTTPException(status_code=404, detail="Активность не найдена")
    course = _get_course_for_activity_or_404(activity, db_session)
    return AssessmentRead(
        id=assessment.id or 0,
        assessment_uuid=assessment.assessment_uuid,
        activity_id=assessment.activity_id,
        activity_uuid=activity.activity_uuid,
        course_id=activity.course_id,
        course_uuid=course.course_uuid,
        chapter_id=activity.chapter_id,
        kind=assessment.kind,
        title=assessment.title,
        description=assessment.description,
        lifecycle=assessment.lifecycle,
        scheduled_at=assessment.scheduled_at,
        published_at=assessment.published_at,
        archived_at=assessment.archived_at,
        weight=assessment.weight,
        grading_type=assessment.grading_type,
        policy_id=assessment.policy_id,
        assessment_policy=_build_policy_read(
            _get_policy_for_assessment(assessment, db_session)
        ),
        items=[_build_item_read(item) for item in _get_items(assessment, db_session)],
        attempt_projection=_build_attempt_projection(
            assessment,
            activity,
            course,
            current_user,
            db_session,
        ),
        review_projection=_build_review_projection(assessment, activity),
        content_version=_content_version(assessment),
        policy_version=_policy_version(
            _get_policy_for_assessment(assessment, db_session)
        ),
        created_at=assessment.created_at,
        updated_at=assessment.updated_at,
    )


def _build_attempt_projection(
    assessment: Assessment,
    activity: Activity,
    course: Course,
    current_user: PublicUser | AnonymousUser | None,
    db_session: Session,
) -> AssessmentAttemptProjection | None:
    if not _has_submit_access(current_user, activity, course, db_session):
        return None

    assert isinstance(current_user, PublicUser)
    state = _build_attempt_state(assessment, activity, current_user, db_session)
    active_submission = state["active_submission"]
    submission_status = (
        SubmissionStatus(active_submission.status)
        if active_submission is not None
        else None
    )
    can_edit = bool(state["can_edit"])

    return AssessmentAttemptProjection(
        assessment_uuid=assessment.assessment_uuid,
        submission_uuid=active_submission.submission_uuid
        if active_submission
        else None,
        submission_status=submission_status.value if submission_status else None,
        release_state=_release_state_for_submission(active_submission, db_session),
        can_edit=can_edit,
        can_save_draft=bool(state["can_save_draft"]),
        can_submit=bool(state["can_submit"]),
        can_start=bool(state["can_start"]),
        can_continue=bool(state["can_continue"]),
        can_view_result=bool(state["can_view_result"]),
        can_start_revision=bool(state["can_start_revision"]),
        recommended_action=str(state["recommended_action"]),
        primary_button_label_key=str(state["primary_button_label_key"]),
        is_returned_for_revision=submission_status == SubmissionStatus.RETURNED,
        is_result_visible=_is_result_visible(active_submission, db_session),
        score=_score_projection_from_submission(active_submission, db_session),
        disabled_action_reasons=list(state["disabled_action_reasons"]),
        effective_policy=state["effective_policy"],
        server_now=state["server_now"],
        started_at=state["started_at"],
        timer_started_at=state["timer_started_at"],
        timer_expires_at=state["timer_expires_at"],
        available_at=state["available_at"],
        closes_at=state["closes_at"],
        due_at=state["due_at"],
        time_remaining_seconds=state["time_remaining_seconds"],
        content_version=_content_version(assessment),
        policy_version=_policy_version(
            _get_policy_for_assessment(assessment, db_session)
        ),
    )


def _build_review_projection(
    assessment: Assessment,
    activity: Activity,
) -> AssessmentReviewProjection:
    return AssessmentReviewProjection(
        assessment_uuid=assessment.assessment_uuid,
        activity_id=activity.id,
        activity_uuid=activity.activity_uuid,
        title=assessment.title,
        kind=assessment.kind,
        default_filter="NEEDS_GRADING",
    )


def _build_attempt_state(
    assessment: Assessment,
    activity: Activity,
    current_user: PublicUser,
    db_session: Session,
) -> dict[str, object]:
    now = datetime.now(UTC)
    policy = _get_policy_for_assessment(assessment, db_session)
    override = _active_policy_override(policy, current_user.id, db_session)
    submissions = db_session.exec(
        select(Submission)
        .where(
            Submission.activity_id == activity.id,
            Submission.user_id == current_user.id,
        )
        .order_by(desc(Submission.created_at))
    ).all()
    draft = next(
        (
            submission
            for submission in submissions
            if submission.status == SubmissionStatus.DRAFT
        ),
        None,
    )
    latest = submissions[0] if submissions else None
    active_submission = draft or latest
    completed_count = len([
        submission
        for submission in submissions
        if submission.status != SubmissionStatus.DRAFT
    ])
    max_attempts = policy.max_attempts if policy is not None else None
    if override is not None and override.max_attempts_override is not None:
        max_attempts = override.max_attempts_override
    due_at = _effective_due_at(policy, override)
    time_limit_seconds = policy.time_limit_seconds if policy is not None else None
    lifecycle = AssessmentLifecycle(assessment.lifecycle)

    reasons: list[str] = []
    available_at: datetime | None = None
    if lifecycle == AssessmentLifecycle.DRAFT:
        reasons.append("NOT_PUBLISHED")
    elif lifecycle == AssessmentLifecycle.SCHEDULED:
        available_at = _coerce_datetime(assessment.scheduled_at)
        if available_at is None or available_at > now:
            reasons.append("SCHEDULED_NOT_OPEN")
    elif lifecycle == AssessmentLifecycle.ARCHIVED:
        reasons.append("ARCHIVED")

    allow_late = policy.allow_late if policy is not None else True
    if due_at is not None and now > due_at and not allow_late:
        reasons.append("PAST_DUE")

    has_editable_existing = draft is not None
    attempts_remaining = (
        None if max_attempts is None else max(0, int(max_attempts) - completed_count)
    )
    if (
        max_attempts is not None
        and completed_count >= int(max_attempts)
        and not has_editable_existing
    ):
        reasons.append("MAX_ATTEMPTS_REACHED")

    time_remaining_seconds: int | None = None
    timed_close_at: datetime | None = None
    if draft is not None and time_limit_seconds and draft.started_at:
        started_at = (
            draft.started_at
            if draft.started_at.tzinfo
            else draft.started_at.replace(tzinfo=UTC)
        )
        timed_close_at = started_at + timedelta(seconds=int(time_limit_seconds))
        time_remaining_seconds = max(0, int((timed_close_at - now).total_seconds()))
        if time_remaining_seconds <= 0:
            reasons.append("TIME_LIMIT_EXPIRED")

    closes_at = _earliest_datetime([due_at, timed_close_at])
    editable_statuses = {None, SubmissionStatus.DRAFT, SubmissionStatus.RETURNED}
    active_status = (
        SubmissionStatus(active_submission.status)
        if active_submission is not None
        else None
    )
    can_edit = active_status in editable_statuses and not reasons

    # Fine-grained action flags
    has_draft = draft is not None
    has_submitted = latest is not None and active_status != SubmissionStatus.DRAFT
    can_start = not has_draft and not has_submitted and not reasons
    can_continue = has_draft and not reasons
    can_view_result = _is_result_visible(active_submission, db_session)
    can_start_revision = active_status == SubmissionStatus.RETURNED and not reasons

    # Recommended action and label key for the primary button
    if reasons:
        recommended_action = "NO_ACTION"
        primary_button_label_key = "blocked"
    elif can_start_revision:
        recommended_action = "START_REVISION"
        primary_button_label_key = "startRevision"
    elif can_view_result:
        recommended_action = "VIEW_RESULT"
        primary_button_label_key = "viewResult"
    elif can_continue:
        recommended_action = "CONTINUE_DRAFT"
        primary_button_label_key = "continueDraft"
    elif can_start:
        recommended_action = "START"
        primary_button_label_key = "start"
    elif has_submitted and not can_view_result:
        recommended_action = "WAIT_FOR_RELEASE"
        primary_button_label_key = "waitForRelease"
    else:
        recommended_action = "NO_ACTION"
        primary_button_label_key = "noAction"

    # Server timestamps for the active draft/submission
    started_at: datetime | None = None
    timer_started_at: datetime | None = None
    timer_expires_at: datetime | None = None
    if draft is not None and draft.started_at:
        raw_started = draft.started_at
        started_at = (
            raw_started if raw_started.tzinfo else raw_started.replace(tzinfo=UTC)
        )
        if time_limit_seconds:
            timer_started_at = started_at
            timer_expires_at = started_at + timedelta(seconds=int(time_limit_seconds))
    elif latest is not None and latest.started_at:
        raw_started = latest.started_at
        started_at = (
            raw_started if raw_started.tzinfo else raw_started.replace(tzinfo=UTC)
        )

    return {
        "active_submission": active_submission,
        "can_edit": can_edit,
        "can_save_draft": can_edit,
        "can_submit": can_edit,
        "can_start": can_start,
        "can_continue": can_continue,
        "can_view_result": can_view_result,
        "can_start_revision": can_start_revision,
        "recommended_action": recommended_action,
        "primary_button_label_key": primary_button_label_key,
        "disabled_action_reasons": sorted(set(reasons)),
        "effective_policy": AssessmentEffectivePolicy(
            max_attempts=max_attempts,
            attempts_used=completed_count,
            attempts_remaining=attempts_remaining,
            time_limit_seconds=time_limit_seconds,
            due_at=due_at,
            allow_late=allow_late,
            late_policy=policy.late_policy_json if policy is not None else {},
            grade_release_mode=(
                policy.grade_release_mode
                if policy is not None
                else GradeReleaseMode.IMMEDIATE
            ),
            anti_cheat_json=policy.anti_cheat_json if policy is not None else {},
            settings_json=policy.settings_json if policy is not None else {},
        ),
        "server_now": now,
        "started_at": started_at,
        "timer_started_at": timer_started_at,
        "timer_expires_at": timer_expires_at,
        "available_at": available_at,
        "closes_at": closes_at,
        "due_at": due_at,
        "time_remaining_seconds": time_remaining_seconds,
    }


def _assert_attempt_action_allowed(
    *,
    action: str,
    assessment: Assessment,
    activity: Activity,
    course: Course,
    current_user: PublicUser,
    db_session: Session,
) -> dict[str, object]:
    _require_submit_access(current_user, activity, course, db_session)
    state = _build_attempt_state(assessment, activity, current_user, db_session)
    allowed_key = {
        "start": "can_edit",
        "save_draft": "can_save_draft",
        "submit": "can_submit",
    }[action]
    if not state[allowed_key]:
        reasons = list(state["disabled_action_reasons"])
        reason = reasons[0] if reasons else "ACTION_NOT_ALLOWED"
        logger.warning(
            "ASSESSMENT_ATTEMPT_BLOCKED action=%s reason=%s assessment_uuid=%s activity_uuid=%s user_id=%s",
            action,
            reason,
            assessment.assessment_uuid,
            activity.activity_uuid,
            current_user.id,
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "code": reason,
                "action": action,
                "reasons": reasons,
            },
        )
    return state


def _release_state_for_submission(
    submission: Submission | None,
    db_session: Session,
) -> str:
    if submission is None:
        return "HIDDEN"
    submission_status = SubmissionStatus(submission.status)
    if submission_status == SubmissionStatus.RETURNED:
        return "RETURNED_FOR_REVISION"
    if _has_published_grade(submission, db_session):
        return "VISIBLE"
    if submission_status == SubmissionStatus.GRADED:
        return "AWAITING_RELEASE"
    return "HIDDEN"


def _score_projection_from_submission(
    submission: Submission | None,
    db_session: Session,
) -> AssessmentScoreProjection:
    if submission is None or not _is_result_visible(submission, db_session):
        return AssessmentScoreProjection()
    if submission.final_score is not None:
        return AssessmentScoreProjection(
            percent=round(float(submission.final_score), 2),
            source="teacher",
        )
    if submission.auto_score is not None:
        return AssessmentScoreProjection(
            percent=round(float(submission.auto_score), 2),
            source="auto",
        )
    return AssessmentScoreProjection()


def _build_item_read(item: AssessmentItem) -> AssessmentReadItem:
    return AssessmentReadItem(
        id=item.id or 0,
        item_uuid=item.item_uuid,
        order=item.order,
        kind=item.kind,
        title=item.title,
        body=ITEM_BODY_ADAPTER.validate_python(item.body_json),
        max_score=item.max_score,
        created_at=item.created_at,
        updated_at=item.updated_at,
    )


def _get_items(assessment: Assessment, db_session: Session) -> list[AssessmentItem]:
    return _get_items_raw(assessment, db_session)


def _get_items_raw(assessment: Assessment, db_session: Session) -> list[AssessmentItem]:
    return db_session.exec(
        select(AssessmentItem)
        .where(AssessmentItem.assessment_id == assessment.id)
        .order_by(AssessmentItem.order, AssessmentItem.id)
    ).all()


def _get_item_or_404(
    assessment: Assessment,
    item_uuid: str,
    db_session: Session,
) -> AssessmentItem:
    item = db_session.exec(
        select(AssessmentItem).where(
            AssessmentItem.assessment_id == assessment.id,
            AssessmentItem.item_uuid == item_uuid,
        )
    ).first()
    if item is None:
        raise HTTPException(status_code=404, detail="Элемент оценивания не найден")
    return item


def _get_assessment_by_uuid_or_404(
    assessment_uuid: str,
    db_session: Session,
) -> Assessment:
    assessment = db_session.exec(
        select(Assessment).where(Assessment.assessment_uuid == assessment_uuid)
    ).first()
    if assessment is None:
        raise HTTPException(status_code=404, detail="Оценивание не найдено")
    return assessment


def _get_activity_and_course(
    assessment: Assessment,
    db_session: Session,
) -> tuple[Activity, Course]:
    activity = db_session.get(Activity, assessment.activity_id)
    if activity is None:
        raise HTTPException(status_code=404, detail="Активность не найдена")
    return activity, _get_course_for_activity_or_404(activity, db_session)


def _get_assessment_submission_or_404(
    *,
    activity_id: int,
    submission_uuid: str,
    db_session: Session,
) -> Submission:
    submission = db_session.exec(
        select(Submission).where(
            Submission.submission_uuid == submission_uuid,
            Submission.activity_id == activity_id,
        )
    ).first()
    if submission is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Submission not found",
        )
    return submission


def _get_course_for_activity_or_404(activity: Activity, db_session: Session) -> Course:
    if activity.course_id is not None:
        course = db_session.get(Course, activity.course_id)
        if course is not None:
            return course
    chapter = db_session.get(Chapter, activity.chapter_id)
    if chapter is not None:
        course = db_session.get(Course, chapter.course_id)
        if course is not None:
            return course
    raise HTTPException(status_code=404, detail="Курс не найден")


def _get_course_or_404(course_id: int, db_session: Session) -> Course:
    course = db_session.get(Course, course_id)
    if course is None:
        raise HTTPException(status_code=404, detail="Курс не найден")
    return course


def _get_chapter_or_404(chapter_id: int, db_session: Session) -> Chapter:
    chapter = db_session.get(Chapter, chapter_id)
    if chapter is None:
        raise HTTPException(status_code=404, detail="Глава не найдена")
    return chapter


def _require_author(user: PublicUser, course: Course, db_session: Session) -> None:
    checker = PermissionChecker(db_session)
    if checker.check(user.id, "assessment:author", resource_owner_id=course.creator_id):
        return
    checker.require(user.id, "activity:update", resource_owner_id=course.creator_id)


def _require_publish(user: PublicUser, course: Course, db_session: Session) -> None:
    checker = PermissionChecker(db_session)
    if checker.check(
        user.id, "assessment:publish", resource_owner_id=course.creator_id
    ):
        return
    checker.require(user.id, "activity:update", resource_owner_id=course.creator_id)


def _require_grade(user: PublicUser, course: Course, db_session: Session) -> None:
    checker = PermissionChecker(db_session)
    if checker.check(user.id, "assessment:grade", resource_owner_id=course.creator_id):
        return
    checker.require(user.id, "assessment:grade", resource_owner_id=course.creator_id)


def _require_read(
    user: PublicUser | AnonymousUser,
    activity: Activity,
    course: Course,
    db_session: Session,
) -> None:
    if course.public and activity.published:
        return
    checker = PermissionChecker(db_session)
    if checker.check(
        user.id,
        "assessment:read",
        resource_owner_id=course.creator_id,
        is_assigned=True,
    ):
        return
    checker.require(
        user.id,
        "activity:read",
        resource_owner_id=activity.creator_id,
        is_assigned=True,
    )


def _require_submit_access(
    user: PublicUser,
    activity: Activity,
    course: Course,
    db_session: Session,
) -> None:
    if not user_has_course_access(user.id, course, db_session):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Вы должны быть зачислены на этот курс, чтобы отправлять работы",
        )
    checker = PermissionChecker(db_session)
    if checker.check(
        user.id,
        "assessment:submit",
        resource_owner_id=activity.creator_id,
        is_assigned=True,
    ):
        return
    checker.require(
        user.id,
        "assessment:submit",
        resource_owner_id=activity.creator_id,
        is_assigned=True,
    )


def _has_submit_access(
    user: PublicUser | AnonymousUser | None,
    activity: Activity,
    course: Course,
    db_session: Session,
) -> bool:
    if not isinstance(user, PublicUser):
        return False
    if not user_has_course_access(user.id, course, db_session):
        return False
    checker = PermissionChecker(db_session)
    return checker.check(
        user.id,
        "assessment:submit",
        resource_owner_id=activity.creator_id,
        is_assigned=True,
    )


def _ensure_authorable(assessment: Assessment, db_session: Session) -> None:
    if AssessmentLifecycle(assessment.lifecycle) == AssessmentLifecycle.ARCHIVED:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Архивные оценивания доступны только для чтения",
        )
    if AssessmentLifecycle(assessment.lifecycle) == AssessmentLifecycle.PUBLISHED:
        existing_submissions = db_session.exec(
            select(func.count()).where(Submission.activity_id == assessment.activity_id)
        ).one()
        if existing_submissions > 0:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={
                    "code": "PUBLISHED_ASSESSMENT_HAS_SUBMISSIONS",
                    "message": (
                        "Опубликованные оценивания с отправленными работами нельзя редактировать "
                        "до появления системы версионирования."
                    ),
                },
            )


def _get_or_create_policy(
    *,
    activity_id: int,
    kind: AssessmentType,
    patch: AssessmentPolicyPatch | None,
    db_session: Session,
    now: datetime,
) -> AssessmentPolicy:
    policy = db_session.exec(
        select(AssessmentPolicy).where(AssessmentPolicy.activity_id == activity_id)
    ).first()
    if policy is None:
        policy = AssessmentPolicy(
            policy_uuid=f"policy_{ULID()}",
            activity_id=activity_id,
            assessment_type=kind,
            grading_mode=_default_grading_mode(kind),
            completion_rule=_default_completion_rule(kind),
            passing_score=60,
            max_attempts=1 if kind == AssessmentType.EXAM else None,
            time_limit_seconds=3600 if kind == AssessmentType.EXAM else None,
            allow_late=kind != AssessmentType.EXAM,
            late_policy_json=LatePolicyNone().model_dump(mode="json"),
            anti_cheat_json=_default_anti_cheat(kind),
            settings_json={},
            created_at=now,
            updated_at=now,
        )
        db_session.add(policy)

    if patch is not None:
        for field, value in _normalized_policy_patch(kind, patch).items():
            if field == "late_policy_json":
                policy.late_policy_json = value
                continue
            if hasattr(policy, field):
                setattr(policy, field, value)
        policy.policy_version = _policy_version(policy) + 1
    policy.updated_at = now
    db_session.add(policy)
    return policy


def _normalized_policy_patch(
    kind: AssessmentType,
    patch: AssessmentPolicyPatch,
) -> dict[str, object]:
    payload = patch.model_dump(exclude_unset=True)

    # Map `late_policy` → `late_policy_json` for the ORM
    if "late_policy" in payload:
        lp = payload.pop("late_policy")
        payload["late_policy_json"] = lp

    # Map policy fields that live in settings_json
    settings_overrides: dict[str, object] = {}
    if "required" in payload:
        settings_overrides["required"] = payload.pop("required")
    if "review_visibility" in payload:
        settings_overrides["review_visibility"] = payload.pop("review_visibility")

    settings_json = _normalize_policy_settings_json(
        kind,
        patch.settings_json if "settings_json" in patch.model_fields_set else None,
        due_at=patch.due_at if "due_at" in patch.model_fields_set else _UNSET,
        max_attempts=(
            patch.max_attempts if "max_attempts" in patch.model_fields_set else _UNSET
        ),
        time_limit_seconds=(
            patch.time_limit_seconds
            if "time_limit_seconds" in patch.model_fields_set
            else _UNSET
        ),
    )
    if settings_json is not None or settings_overrides:
        merged = dict(settings_json or {})
        merged.update(settings_overrides)
        payload["settings_json"] = merged
    elif "settings_json" in payload:
        existing = dict(payload["settings_json"] or {})
        existing.update(settings_overrides)
        payload["settings_json"] = existing

    return payload


def _normalize_policy_settings_json(
    kind: AssessmentType,
    settings_json: dict[str, object] | None,
    *,
    due_at: datetime | object | None = _UNSET,
    max_attempts: int | object | None = _UNSET,
    time_limit_seconds: int | object | None = _UNSET,
) -> dict[str, object] | None:
    if (
        settings_json is None
        and due_at is _UNSET
        and max_attempts is _UNSET
        and time_limit_seconds is _UNSET
    ):
        return None

    normalized = dict(settings_json or {})

    normalized_due_at = _first_string_setting(
        normalized, "due_at", "due_date_iso", "due_date"
    )
    if due_at is not _UNSET:
        normalized_due_at = due_at.isoformat() if isinstance(due_at, datetime) else None
    if due_at is not _UNSET or normalized_due_at is not None:
        normalized["due_at"] = normalized_due_at
        if kind in {AssessmentType.EXAM, AssessmentType.QUIZ}:
            normalized["due_date_iso"] = normalized_due_at
        if kind == AssessmentType.CODE_CHALLENGE:
            normalized["due_date"] = normalized_due_at

    normalized_max_attempts = _first_int_setting(
        normalized, "max_attempts", "attempt_limit"
    )
    if max_attempts is not _UNSET:
        normalized_max_attempts = (
            max_attempts if isinstance(max_attempts, int) else None
        )
    if max_attempts is not _UNSET or normalized_max_attempts is not None:
        normalized["max_attempts"] = normalized_max_attempts
        if kind in {AssessmentType.EXAM, AssessmentType.QUIZ}:
            normalized["attempt_limit"] = normalized_max_attempts

    if kind in {AssessmentType.EXAM, AssessmentType.QUIZ}:
        normalized_time_limit_seconds = _time_limit_seconds_from_settings(normalized)
        if time_limit_seconds is not _UNSET:
            normalized_time_limit_seconds = (
                time_limit_seconds if isinstance(time_limit_seconds, int) else None
            )
        if (
            time_limit_seconds is not _UNSET
            or normalized_time_limit_seconds is not None
        ):
            normalized["time_limit_seconds"] = normalized_time_limit_seconds
            normalized["time_limit"] = (
                None
                if normalized_time_limit_seconds is None
                else max(1, (normalized_time_limit_seconds + 59) // 60)
            )

    return normalized


def _first_int_setting(payload: dict[str, object], *keys: str) -> int | None:
    for key in keys:
        value = payload.get(key)
        if isinstance(value, bool):
            continue
        if isinstance(value, int):
            return value
        if isinstance(value, float) and value.is_integer():
            return int(value)
    return None


def _first_string_setting(payload: dict[str, object], *keys: str) -> str | None:
    for key in keys:
        value = payload.get(key)
        if isinstance(value, str) and value.strip():
            return value
    return None


def _time_limit_seconds_from_settings(payload: dict[str, object]) -> int | None:
    return _first_int_setting(payload, "time_limit_seconds")


def _default_grading_mode(kind: AssessmentType) -> AssessmentGradingMode:
    if kind == AssessmentType.EXAM:
        return AssessmentGradingMode.AUTO_THEN_MANUAL
    return AssessmentGradingMode.AUTO


def _default_completion_rule(kind: AssessmentType) -> AssessmentCompletionRule:
    return AssessmentCompletionRule.PASSED


def _default_anti_cheat(kind: AssessmentType) -> dict[str, object]:
    if kind != AssessmentType.EXAM:
        return {}
    return {
        "copy_paste_protection": True,
        "tab_switch_detection": True,
        "devtools_detection": True,
        "right_click_disable": True,
        "fullscreen_enforcement": True,
        "violation_threshold": 3,
    }


def _default_activity_settings(kind: AssessmentType) -> dict[str, object]:
    if kind == AssessmentType.EXAM:
        return validate_settings({"kind": "EXAM"}).model_dump(mode="json")
    if kind == AssessmentType.CODE_CHALLENGE:
        return validate_settings({"kind": "CODE_CHALLENGE"}).model_dump(mode="json")
    if kind == AssessmentType.QUIZ:
        return validate_settings({"kind": "QUIZ"}).model_dump(mode="json")
    raise ValueError(f"Unsupported assessment kind: {kind}")


def _sync_activity_lifecycle(
    assessment: Assessment,
    activity: Activity,
) -> None:
    lifecycle = AssessmentLifecycle(assessment.lifecycle)
    details = activity.details if isinstance(activity.details, dict) else {}
    details["lifecycle_status"] = lifecycle.value
    details["scheduled_at"] = _dt_iso(assessment.scheduled_at)
    details["published_at"] = _dt_iso(assessment.published_at)
    details["archived_at"] = _dt_iso(assessment.archived_at)
    activity.details = details

    settings = activity.settings if isinstance(activity.settings, dict) else {}
    settings.update({
        "lifecycle_status": lifecycle.value,
        "scheduled_at": _dt_iso(assessment.scheduled_at),
        "published_at": _dt_iso(assessment.published_at),
        "archived_at": _dt_iso(assessment.archived_at),
    })
    activity.settings = settings


def _normalize_answer_patch(
    assessment: Assessment,
    payload: AssessmentDraftPatch,
    current_user: PublicUser,
    db_session: Session,
) -> dict[str, dict[str, object]]:
    items = {item.item_uuid: item for item in _get_items(assessment, db_session)}
    normalized: dict[str, dict[str, object]] = {}
    invalid: list[str] = []
    mismatched: list[str] = []

    for entry in payload.answers:
        item = items.get(entry.item_uuid)
        if item is None:
            invalid.append(entry.item_uuid)
            continue
        answer = ITEM_ANSWER_ADAPTER.validate_python(
            entry.answer.model_dump(mode="json")
        )
        if str(answer.kind) != str(item.kind):
            mismatched.append(entry.item_uuid)
            continue
        answer_payload = answer.model_dump(mode="json")
        normalized[entry.item_uuid] = answer_payload

    if invalid or mismatched:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "message": "Некорректные ответы оценивания",
                "unknown_item_uuids": invalid,
                "kind_mismatch_item_uuids": mismatched,
            },
        )
    return normalized


def _get_or_create_submission_draft(
    *,
    assessment: Assessment,
    activity: Activity,
    current_user: PublicUser,
    db_session: Session,
) -> Submission:
    draft = db_session.exec(
        select(Submission).where(
            Submission.activity_id == activity.id,
            Submission.user_id == current_user.id,
            Submission.status == SubmissionStatus.DRAFT,
        )
    ).first()
    if draft is not None:
        return draft

    read = start_submission_v2(
        activity_id=activity.id,
        assessment_type=AssessmentType(assessment.kind),
        current_user=current_user,
        db_session=db_session,
    )
    draft = db_session.exec(
        select(Submission).where(Submission.submission_uuid == read.submission_uuid)
    ).first()
    if draft is None:
        raise HTTPException(status_code=500, detail="Черновик отправки не был создан")
    return draft


def _enforce_draft_version(draft: Submission, if_match: str | None) -> None:
    if if_match is None:
        return
    raw = if_match.strip().strip('"')
    try:
        expected = int(raw)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Заголовок If-Match должен содержать текущую числовую версию отправки",
        ) from exc
    if draft.version != expected:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "message": "Конфликт версий черновика",
                "latest": SubmissionRead.model_validate(draft).model_dump(mode="json"),
            },
        )


def _parse_if_match_version(if_match: str | None) -> int | None:
    if if_match is None:
        return None
    raw = if_match.strip().strip('"')
    try:
        return int(raw)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Заголовок If-Match должен содержать текущую числовую версию отправки",
        ) from exc


def _item_readiness_issues(item: AssessmentItem) -> list[ReadinessIssue]:
    try:
        body = ITEM_BODY_ADAPTER.validate_python(item.body_json)
    except ValidationError as exc:
        return [
            ReadinessIssue(
                code="item.body_invalid",
                message=f"Тело элемента некорректно: {exc}",
                item_uuid=item.item_uuid,
            )
        ]

    issues: list[ReadinessIssue] = []
    if not item.title.strip():
        issues.append(
            ReadinessIssue(
                code="item.title_missing",
                message="Название элемента обязательно.",
                item_uuid=item.item_uuid,
            )
        )
    if item.max_score <= 0:
        issues.append(
            ReadinessIssue(
                code="item.max_score_invalid",
                message="Баллы за элемент должны быть больше нуля.",
                item_uuid=item.item_uuid,
            )
        )

    if body.kind == "CHOICE":
        if not body.prompt.strip():
            issues.append(
                ReadinessIssue(
                    code="choice.prompt_missing",
                    message="Текст вопроса (промпт) обязателен.",
                    item_uuid=item.item_uuid,
                )
            )
        if len(body.options) < 2:
            issues.append(
                ReadinessIssue(
                    code="choice.options_missing",
                    message="Для элементов с выбором нужно как минимум два варианта.",
                    item_uuid=item.item_uuid,
                )
            )
        if any(not option.text.strip() for option in body.options):
            issues.append(
                ReadinessIssue(
                    code="choice.option_text_missing",
                    message="Каждый вариант выбора должен содержать видимый текст.",
                    item_uuid=item.item_uuid,
                )
            )
        option_texts = [
            option.text.strip().lower()
            for option in body.options
            if option.text.strip()
        ]
        if len(set(option_texts)) != len(option_texts):
            issues.append(
                ReadinessIssue(
                    code="choice.option_duplicate",
                    message="Варианты выбора должны быть уникальными.",
                    item_uuid=item.item_uuid,
                )
            )
        correct = [option for option in body.options if option.is_correct]
        if not correct:
            issues.append(
                ReadinessIssue(
                    code="choice.correct_missing",
                    message="Отметьте хотя бы один правильный вариант.",
                    item_uuid=item.item_uuid,
                )
            )
        if not body.multiple and len(correct) > 1:
            issues.append(
                ReadinessIssue(
                    code="choice.too_many_correct",
                    message="В вопросах с одиночным выбором может быть только один правильный вариант.",
                    item_uuid=item.item_uuid,
                )
            )
    elif body.kind == "OPEN_TEXT":
        if not body.prompt.strip():
            issues.append(
                ReadinessIssue(
                    code="open_text.prompt_missing",
                    message="Текст открытого вопроса (промпт) обязателен.",
                    item_uuid=item.item_uuid,
                )
            )
        if body.min_words is not None and body.min_words < 0:
            issues.append(
                ReadinessIssue(
                    code="open_text.min_words_invalid",
                    message="Минимальное количество слов не может быть отрицательным.",
                    item_uuid=item.item_uuid,
                )
            )
    elif body.kind == "FORM":
        if not body.prompt.strip():
            issues.append(
                ReadinessIssue(
                    code="form.prompt_missing",
                    message="Текст формы (промпт) обязателен.",
                    item_uuid=item.item_uuid,
                )
            )
        if not body.fields:
            issues.append(
                ReadinessIssue(
                    code="form.fields_missing",
                    message="Элементы формы должны содержать хотя бы одно поле.",
                    item_uuid=item.item_uuid,
                )
            )
        if any(not field.label.strip() for field in body.fields):
            issues.append(
                ReadinessIssue(
                    code="form.field_label_missing",
                    message="Каждое поле формы должно иметь метку.",
                    item_uuid=item.item_uuid,
                )
            )
        field_ids = [
            field.id.strip().lower() for field in body.fields if field.id.strip()
        ]
        if len(set(field_ids)) != len(field_ids):
            issues.append(
                ReadinessIssue(
                    code="form.field_id_duplicate",
                    message="Поля формы должны иметь уникальные идентификаторы.",
                    item_uuid=item.item_uuid,
                )
            )
    elif body.kind == "CODE":
        # Older code-challenge saves could persist an empty body prompt while the
        # item title still held the task text. Treat the title as the prompt
        # fallback so configured challenges are not blocked only by that legacy
        # blank field.
        prompt_text = body.prompt.strip() or item.title.strip()
        if not prompt_text:
            issues.append(
                ReadinessIssue(
                    code="code.prompt_missing",
                    message="Текст задания по коду (промпт) обязателен.",
                    item_uuid=item.item_uuid,
                )
            )
        if not body.languages:
            issues.append(
                ReadinessIssue(
                    code="code.languages_missing",
                    message="В задачах по коду должен быть разрешен хотя бы один язык.",
                    item_uuid=item.item_uuid,
                )
            )
        if not body.tests:
            issues.append(
                ReadinessIssue(
                    code="code.tests_missing",
                    message="В задачах по коду должен быть хотя бы один тест-кейс.",
                    item_uuid=item.item_uuid,
                )
            )
        if any(
            not test.input.strip() or not test.expected_output.strip()
            for test in body.tests
        ):
            issues.append(
                ReadinessIssue(
                    code="code.test_io_missing",
                    message="Каждый тест кода должен иметь входные данные и ожидаемый результат.",
                    item_uuid=item.item_uuid,
                )
            )
        if any(test.weight <= 0 for test in body.tests):
            issues.append(
                ReadinessIssue(
                    code="code.test_weight_invalid",
                    message="Каждый тест кода должен иметь положительный вес.",
                    item_uuid=item.item_uuid,
                )
            )
    elif body.kind == "MATCHING":
        if not body.prompt.strip():
            issues.append(
                ReadinessIssue(
                    code="matching.prompt_missing",
                    message="Текст задания на соответствие обязателен.",
                    item_uuid=item.item_uuid,
                )
            )
        if not body.pairs:
            issues.append(
                ReadinessIssue(
                    code="matching.pairs_missing",
                    message="В заданиях на соответствие должна быть хотя бы одна пара.",
                    item_uuid=item.item_uuid,
                )
            )
        if any(not pair.left.strip() or not pair.right.strip() for pair in body.pairs):
            issues.append(
                ReadinessIssue(
                    code="matching.pair_value_missing",
                    message="Каждая пара должна иметь значения слева и справа.",
                    item_uuid=item.item_uuid,
                )
            )
        left_values = [
            pair.left.strip().lower() for pair in body.pairs if pair.left.strip()
        ]
        right_values = [
            pair.right.strip().lower() for pair in body.pairs if pair.right.strip()
        ]
        if len(set(left_values)) != len(left_values):
            issues.append(
                ReadinessIssue(
                    code="matching.left_duplicate",
                    message="Значения слева должны быть уникальными.",
                    item_uuid=item.item_uuid,
                )
            )
        if len(set(right_values)) != len(right_values):
            issues.append(
                ReadinessIssue(
                    code="matching.right_duplicate",
                    message="Значения справа (ответы) должны быть уникальными.",
                    item_uuid=item.item_uuid,
                )
            )
    return issues


def _allowed_item_kinds_for_assessment(kind: str) -> set[ItemKind] | None:
    if kind == AssessmentType.EXAM:
        return {ItemKind.CHOICE, ItemKind.MATCHING}
    if kind == AssessmentType.QUIZ:
        return {ItemKind.CHOICE, ItemKind.MATCHING}
    return None


def _get_policy_for_assessment(
    assessment: Assessment,
    db_session: Session,
) -> AssessmentPolicy | None:
    if assessment.policy_id is not None:
        policy = db_session.get(AssessmentPolicy, assessment.policy_id)
        if policy is not None:
            return policy
    return db_session.exec(
        select(AssessmentPolicy).where(
            AssessmentPolicy.activity_id == assessment.activity_id
        )
    ).first()


def _build_policy_read(
    policy: AssessmentPolicy | None,
) -> ActivityAssessmentPolicyRead | None:
    if policy is None:
        return None
    return ActivityAssessmentPolicyRead(
        id=policy.id or 0,
        policy_uuid=policy.policy_uuid,
        assessment_type=str(policy.assessment_type),
        max_attempts=policy.max_attempts,
        time_limit_seconds=policy.time_limit_seconds,
        due_at=policy.due_at,
        allow_late=policy.allow_late,
        late_policy=policy.late_policy_json,
        grade_release_mode=str(policy.grade_release_mode),
        grading_mode=str(policy.grading_mode),
        completion_rule=str(policy.completion_rule),
        passing_score=policy.passing_score,
        review_visibility=str(
            (policy.settings_json or {}).get("review_visibility", "FULL")
        ),
        anti_cheat_json=policy.anti_cheat_json,
        settings_json=policy.settings_json,
    )


def _active_policy_override(
    policy: AssessmentPolicy | None,
    user_id: int,
    db_session: Session,
) -> StudentPolicyOverride | None:
    if policy is None or policy.id is None:
        return None
    now = datetime.now(UTC)
    override = db_session.exec(
        select(StudentPolicyOverride).where(
            StudentPolicyOverride.policy_id == policy.id,
            StudentPolicyOverride.user_id == user_id,
        )
    ).first()
    if override is None:
        return None
    if override.expires_at is not None:
        expires_at = (
            override.expires_at
            if override.expires_at.tzinfo
            else override.expires_at.replace(tzinfo=UTC)
        )
        if expires_at <= now:
            return None
    return override


def _effective_due_at(
    policy: AssessmentPolicy | None,
    override: StudentPolicyOverride | None,
) -> datetime | None:
    due_at = policy.due_at if policy is not None else None
    if override is not None and override.due_at_override is not None:
        due_at = override.due_at_override
    if due_at is None:
        return None
    return due_at if due_at.tzinfo else due_at.replace(tzinfo=UTC)


def _earliest_datetime(values: list[datetime | None]) -> datetime | None:
    concrete = [value for value in values if value is not None]
    return min(concrete) if concrete else None


def _has_published_grade(submission: Submission | None, db_session: Session) -> bool:
    if submission is None:
        return False
    if SubmissionStatus(submission.status) in {
        SubmissionStatus.PUBLISHED,
        SubmissionStatus.RETURNED,
    }:
        return True
    if submission.id is None:
        return False
    published_entry = db_session.exec(
        select(GradingEntry.id).where(
            GradingEntry.submission_id == submission.id,
            GradingEntry.published_at.is_not(None),
        )
    ).first()
    return published_entry is not None


def _is_result_visible(submission: Submission | None, db_session: Session) -> bool:
    return _has_published_grade(submission, db_session)


def _build_student_submission_read(
    submission: Submission,
    db_session: Session,
) -> StudentSubmissionRead:
    result = StudentSubmissionRead.model_validate(submission)
    release_state = _release_state_for_submission(submission, db_session)
    result.release_state = release_state
    result.is_result_visible = release_state in {"VISIBLE", "RETURNED_FOR_REVISION"}
    if not result.is_result_visible:
        result.auto_score = None
        result.final_score = None
        result.grading_json = GradingBreakdown()
        result.graded_at = None
    return result


def _build_teacher_submission_read(
    submission: Submission,
    assessment: Assessment,
    db_session: Session,
) -> TeacherSubmissionRead:
    result = TeacherSubmissionRead.model_validate(submission)
    result.release_state = _release_state_for_submission(submission, db_session)
    result.is_result_visible = result.release_state in {
        "VISIBLE",
        "RETURNED_FOR_REVISION",
    }
    result.content_version = _content_version(assessment)
    result.policy_version = _policy_version(
        _get_policy_for_assessment(assessment, db_session)
    )
    return result


def _content_version(assessment: Assessment) -> int:
    return int(getattr(assessment, "content_version", 1) or 1)


def _policy_version(policy: AssessmentPolicy | None) -> int:
    if policy is None:
        return 0
    return int(getattr(policy, "policy_version", 1) or 1)


def _snapshot_submission(
    submission: Submission,
    assessment: Assessment,
    db_session: Session,
) -> None:
    """Snapshot items and policy into the submission row at submit time."""
    items = _get_items(assessment, db_session)
    policy = _get_policy_for_assessment(assessment, db_session)

    changed = False
    if getattr(submission, "items_snapshot", None) is None:
        submission.items_snapshot = [
            {
                "item_uuid": item.item_uuid,
                "kind": str(item.kind),
                "title": item.title,
                "body_json": item.body_json,
                "max_score": item.max_score,
                "order": item.order,
            }
            for item in items
        ]
        submission.content_version = _content_version(assessment)
        changed = True

    if getattr(submission, "policy_snapshot", None) is None and policy is not None:
        submission.policy_snapshot = {
            "max_attempts": policy.max_attempts,
            "time_limit_seconds": policy.time_limit_seconds,
            "due_at": policy.due_at.isoformat() if policy.due_at else None,
            "allow_late": policy.allow_late,
            "late_policy_json": policy.late_policy_json,
            "passing_score": policy.passing_score,
            "grading_mode": str(policy.grading_mode),
            "completion_rule": str(policy.completion_rule),
            "grade_release_mode": str(policy.grade_release_mode),
            "settings_json": policy.settings_json,
        }
        submission.policy_version = _policy_version(policy)
        changed = True

    if changed:
        db_session.add(submission)
        db_session.commit()


def _coerce_datetime(value: object) -> datetime | None:
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=UTC)
    if not isinstance(value, str) or not value:
        return None
    try:
        parsed = datetime.fromisoformat(value)
    except ValueError:
        return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=UTC)


def _dt_iso(value: datetime | None) -> str | None:
    if value is None:
        return None
    return value.isoformat()


def _batch_fetch_users(user_ids: set[int], db_session: Session) -> dict[int, User]:
    if not user_ids:
        return {}
    rows = db_session.exec(select(User).where(User.id.in_(list(user_ids)))).all()
    return {user.id: user for user in rows if user.id is not None}


def _submission_user(user: User):
    from src.db.grading.submissions import SubmissionUser

    return SubmissionUser(
        id=user.id,
        username=user.username,
        first_name=user.first_name,
        last_name=user.last_name,
        middle_name=user.middle_name,
        email=user.email,
        avatar_image=user.avatar_image,
        user_uuid=user.user_uuid,
    )


def _build_override_read(override: StudentPolicyOverride) -> StudentPolicyOverrideRead:
    return StudentPolicyOverrideRead(
        id=override.id or 0,
        user_id=override.user_id,
        policy_id=override.policy_id,
        max_attempts_override=override.max_attempts_override,
        due_at_override=override.due_at_override,
        time_limit_override_seconds=None,
        waive_late_penalty=override.waive_late_penalty,
        note=override.note or "",
        expires_at=override.expires_at,
        granted_by=override.granted_by,
    )


# ── Phase 4: Item-level grading ────────────────────────────────────────────────


def build_readiness(
    assessment: Assessment,
    db_session: Session,
) -> AssessmentReadiness:
    issues: list[ReadinessIssue] = []
    allowed_item_kinds = _allowed_item_kinds_for_assessment(assessment.kind)
    if not assessment.title.strip():
        issues.append(
            ReadinessIssue(
                code="assessment.title_missing", message="Название обязательно"
            )
        )

    items = _get_items(assessment, db_session)
    if not items:
        issues.append(
            ReadinessIssue(
                code="assessment.empty",
                message="Добавьте хотя бы один элемент перед публикацией.",
            )
        )

    policy = _get_policy_for_assessment(assessment, db_session)
    if policy is None:
        issues.append(
            ReadinessIssue(
                code="policy.missing",
                message="Политика оценивания отсутствует.",
            )
        )
    else:
        if policy.max_attempts is not None and policy.max_attempts < 1:
            issues.append(
                ReadinessIssue(
                    code="policy.max_attempts_invalid",
                    message="Лимит попыток должен быть не менее 1.",
                )
            )
        if policy.time_limit_seconds is not None and policy.time_limit_seconds < 1:
            issues.append(
                ReadinessIssue(
                    code="policy.time_limit_invalid",
                    message="Ограничение по времени должно быть больше нуля.",
                )
            )
        anti_cheat = (
            policy.anti_cheat_json if isinstance(policy.anti_cheat_json, dict) else {}
        )
        if (
            isinstance(anti_cheat.get("violation_threshold"), int)
            and anti_cheat["violation_threshold"] < 1
        ):
            issues.append(
                ReadinessIssue(
                    code="policy.violation_threshold_invalid",
                    message="Порог нарушений должен быть не менее 1.",
                )
            )
        if (
            assessment.scheduled_at is not None
            and policy.due_at is not None
            and assessment.scheduled_at >= policy.due_at
        ):
            issues.append(
                ReadinessIssue(
                    code="schedule.after_due_at",
                    message="Запланированное время публикации должно быть раньше срока сдачи.",
                )
            )

    for item in items:
        if allowed_item_kinds is not None and item.kind not in allowed_item_kinds:
            issues.append(
                ReadinessIssue(
                    code="item.kind_forbidden",
                    message=f"Элементы типа {item.kind} не разрешены для {assessment.kind.lower()} оцениваний.",
                    item_uuid=item.item_uuid,
                )
            )
        issues.extend(_item_readiness_issues(item))

    return AssessmentReadiness(ok=not issues, issues=issues)
