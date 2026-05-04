"""Unified assessment service.

This module owns the canonical Assessment/AssessmentItem write path.
"""

from datetime import UTC, datetime

from fastapi import HTTPException, status
from sqlalchemy import desc, func
from sqlmodel import Session, select
from ulid import ULID

from src.db.assessments import (
    ITEM_ANSWER_ADAPTER,
    ITEM_BODY_ADAPTER,
    Assessment,
    AssessmentCreate,
    AssessmentDraftPatch,
    AssessmentDraftRead,
    AssessmentGradingType,
    AssessmentItem,
    AssessmentItemCreate,
    AssessmentItemReorder,
    AssessmentItemUpdate,
    AssessmentLifecycle,
    AssessmentLifecycleTransition,
    AssessmentPolicyPatch,
    AssessmentRead,
    AssessmentReadiness,
    AssessmentReadItem,
    AssessmentUpdate,
    ItemKind,
    ReadinessIssue,
)
from src.db.courses.activities import (
    Activity,
    ActivityAssessmentPolicyRead,
    ActivitySubTypeEnum,
    ActivityTypeEnum,
)
from src.db.courses.chapters import Chapter
from src.db.courses.courses import Course
from src.db.grading.progress import (
    AssessmentCompletionRule,
    AssessmentGradingMode,
    AssessmentPolicy,
    LatePolicyNone,
)
from src.db.grading.submissions import (
    AssessmentType,
    Submission,
    SubmissionListResponse,
    SubmissionRead,
    SubmissionStatus,
)
from src.db.uploads import Upload, UploadStatus
from src.db.users import AnonymousUser, PublicUser, User
from src.security.rbac import PermissionChecker
from src.services.assessments.settings import validate_settings
from src.services.courses._utils import _next_activity_order
from src.services.courses.access import user_has_course_access
from src.services.grading.settings_loader import load_activity_settings
from src.services.grading.submission import start_submission_v2
from src.services.grading.submit import submit_assessment as submit_assessment_pipeline
from src.services.progress import submissions as progress_submissions

ASSESSABLE_ACTIVITY_TYPES = {
    ActivityTypeEnum.TYPE_ASSIGNMENT,
    ActivityTypeEnum.TYPE_EXAM,
    ActivityTypeEnum.TYPE_CODE_CHALLENGE,
}

_KIND_TO_ACTIVITY: dict[
    AssessmentType, tuple[ActivityTypeEnum, ActivitySubTypeEnum]
] = {
    AssessmentType.ASSIGNMENT: (
        ActivityTypeEnum.TYPE_ASSIGNMENT,
        ActivitySubTypeEnum.SUBTYPE_ASSIGNMENT_ANY,
    ),
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
    ActivityTypeEnum.TYPE_ASSIGNMENT: AssessmentType.ASSIGNMENT,
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
    AssessmentLifecycle.PUBLISHED: frozenset({AssessmentLifecycle.ARCHIVED}),
    AssessmentLifecycle.ARCHIVED: frozenset(),
}


# ── Public assessment CRUD ────────────────────────────────────────────────────


async def create_assessment(
    payload: AssessmentCreate,
    current_user: PublicUser,
    db_session: Session,
) -> AssessmentRead:
    course = _get_course_or_404(payload.course_id, db_session)
    chapter = _get_chapter_or_404(payload.chapter_id, db_session)
    if chapter.course_id != course.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Chapter does not belong to the selected course",
        )

    _require_author(current_user, course, db_session)

    activity_type, activity_sub_type = _KIND_TO_ACTIVITY[payload.kind]
    now = datetime.now(UTC)

    activity = Activity(
        name=payload.title,
        activity_type=activity_type,
        activity_sub_type=activity_sub_type,
        content={},
        details={"lifecycle_status": AssessmentLifecycle.DRAFT.value},
        settings=_default_activity_settings(payload.kind),
        published=False,
        chapter_id=chapter.id,
        course_id=course.id,
        order=_next_activity_order(chapter.id, db_session),
        creator_id=current_user.id,
        activity_uuid=f"activity_{ULID()}",
        creation_date=now,
        update_date=now,
    )
    db_session.add(activity)
    db_session.flush()

    policy = _get_or_create_policy(
        activity_id=activity.id,
        kind=payload.kind,
        patch=payload.policy,
        db_session=db_session,
        now=now,
    )
    db_session.flush()

    assessment = Assessment(
        assessment_uuid=f"assessment_{ULID()}",
        activity_id=activity.id,
        kind=payload.kind,
        title=payload.title,
        description=payload.description,
        lifecycle=AssessmentLifecycle.DRAFT,
        weight=payload.weight,
        grading_type=payload.grading_type,
        policy_id=policy.id,
        created_at=now,
        updated_at=now,
    )
    db_session.add(assessment)
    db_session.commit()
    db_session.refresh(assessment)
    return _build_assessment_read(assessment, db_session)


async def get_assessment(
    assessment_uuid: str,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
) -> AssessmentRead:
    assessment = _get_assessment_by_uuid_or_404(assessment_uuid, db_session)
    activity, course = _get_activity_and_course(assessment, db_session)
    _require_read(current_user, activity, course, db_session)
    return _build_assessment_read(assessment, db_session)


async def get_assessment_by_activity_uuid(
    activity_uuid: str,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
) -> AssessmentRead:
    activity = _get_activity_by_uuid_or_404(activity_uuid, db_session)
    course = _get_course_for_activity_or_404(activity, db_session)
    _require_read(current_user, activity, course, db_session)
    assessment = _get_or_project_assessment_for_activity(activity, db_session)
    return _build_assessment_read(assessment, db_session)


async def update_assessment(
    assessment_uuid: str,
    payload: AssessmentUpdate,
    current_user: PublicUser,
    db_session: Session,
) -> AssessmentRead:
    assessment = _get_assessment_by_uuid_or_404(assessment_uuid, db_session)
    activity, course = _get_activity_and_course(assessment, db_session)
    _require_author(current_user, course, db_session)
    _ensure_authorable(assessment)

    changes = payload.model_dump(exclude_unset=True)
    policy_patch = changes.pop("policy", None)
    for field, value in changes.items():
        setattr(assessment, field, value)
        if field == "title":
            activity.name = value

    if policy_patch is not None:
        policy = _get_or_create_policy(
            activity_id=activity.id,
            kind=assessment.kind,
            patch=AssessmentPolicyPatch.model_validate(policy_patch),
            db_session=db_session,
            now=datetime.now(UTC),
        )
        assessment.policy_id = policy.id

    now = datetime.now(UTC)
    assessment.updated_at = now
    activity.update_date = now
    db_session.add(activity)
    db_session.add(assessment)
    db_session.commit()
    db_session.refresh(assessment)
    return _build_assessment_read(assessment, db_session)


async def check_publish_readiness(
    assessment_uuid: str,
    current_user: PublicUser,
    db_session: Session,
) -> AssessmentReadiness:
    assessment = _get_assessment_by_uuid_or_404(assessment_uuid, db_session)
    _activity, course = _get_activity_and_course(assessment, db_session)
    _require_author(current_user, course, db_session)
    return build_readiness(assessment, db_session)


async def transition_assessment_lifecycle(
    assessment_uuid: str,
    payload: AssessmentLifecycleTransition,
    current_user: PublicUser,
    db_session: Session,
) -> AssessmentRead:
    assessment = _get_assessment_by_uuid_or_404(assessment_uuid, db_session)
    activity, course = _get_activity_and_course(assessment, db_session)
    _require_publish(current_user, course, db_session)

    current = AssessmentLifecycle(assessment.lifecycle)
    target = AssessmentLifecycle(payload.to)
    allowed = _ALLOWED_LIFECYCLE_TRANSITIONS[current]
    if target not in allowed:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Cannot transition assessment from {current.value} to "
                f"{target.value}. Allowed: {[state.value for state in allowed]}"
            ),
        )

    readiness = build_readiness(assessment, db_session)
    if (
        target in {AssessmentLifecycle.PUBLISHED, AssessmentLifecycle.SCHEDULED}
        and not readiness.ok
    ):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"issues": [issue.model_dump() for issue in readiness.issues]},
        )

    now = datetime.now(UTC)
    if target == AssessmentLifecycle.SCHEDULED:
        scheduled_at = payload.scheduled_at
        if scheduled_at is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="scheduled_at is required when scheduling",
            )
        scheduled_at = (
            scheduled_at if scheduled_at.tzinfo else scheduled_at.replace(tzinfo=UTC)
        )
        if scheduled_at <= now:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="scheduled_at must be in the future",
            )
        assessment.scheduled_at = scheduled_at
        assessment.published_at = None
        assessment.archived_at = None
        activity.published = False
    elif target == AssessmentLifecycle.PUBLISHED:
        assessment.scheduled_at = None
        assessment.published_at = assessment.published_at or now
        assessment.archived_at = None
        activity.published = True
    elif target == AssessmentLifecycle.ARCHIVED:
        assessment.scheduled_at = None
        assessment.archived_at = assessment.archived_at or now
        activity.published = False
    else:
        assessment.scheduled_at = None
        activity.published = False

    assessment.lifecycle = target
    assessment.updated_at = now
    activity.update_date = now
    _sync_activity_lifecycle(assessment, activity)

    db_session.add(assessment)
    db_session.add(activity)
    db_session.commit()
    db_session.refresh(assessment)
    return _build_assessment_read(assessment, db_session)


# ── Items ─────────────────────────────────────────────────────────────────────


async def create_assessment_item(
    assessment_uuid: str,
    payload: AssessmentItemCreate,
    current_user: PublicUser,
    db_session: Session,
) -> AssessmentReadItem:
    assessment = _get_assessment_by_uuid_or_404(assessment_uuid, db_session)
    _activity, course = _get_activity_and_course(assessment, db_session)
    _require_author(current_user, course, db_session)
    _ensure_authorable(assessment)

    max_order = db_session.exec(
        select(func.max(AssessmentItem.order)).where(
            AssessmentItem.assessment_id == assessment.id
        )
    ).one()
    now = datetime.now(UTC)
    item = AssessmentItem(
        item_uuid=f"item_{ULID()}",
        assessment_id=assessment.id,
        order=int(max_order or 0) + 1,
        kind=payload.kind,
        title=payload.title,
        body_json=payload.body.model_dump(mode="json"),
        max_score=payload.max_score,
        created_at=now,
        updated_at=now,
    )
    assessment.updated_at = now
    db_session.add(item)
    db_session.add(assessment)
    db_session.commit()
    db_session.refresh(item)
    return _build_item_read(item)


async def update_assessment_item(
    assessment_uuid: str,
    item_uuid: str,
    payload: AssessmentItemUpdate,
    current_user: PublicUser,
    db_session: Session,
) -> AssessmentReadItem:
    assessment = _get_assessment_by_uuid_or_404(assessment_uuid, db_session)
    _activity, course = _get_activity_and_course(assessment, db_session)
    _require_author(current_user, course, db_session)
    _ensure_authorable(assessment)
    item = _get_item_or_404(assessment, item_uuid, db_session)

    changes = payload.model_dump(exclude_unset=True)
    for field, value in changes.items():
        if field == "body" and value is not None:
            item.body_json = payload.body.model_dump(mode="json")
            item.kind = ItemKind(payload.body.kind)
        elif value is not None:
            setattr(item, field, value)

    if payload.kind is not None and payload.body is None:
        item.kind = payload.kind

    now = datetime.now(UTC)
    item.updated_at = now
    assessment.updated_at = now
    db_session.add(item)
    db_session.add(assessment)
    db_session.commit()
    db_session.refresh(item)
    return _build_item_read(item)


async def reorder_assessment_items(
    assessment_uuid: str,
    payload: AssessmentItemReorder,
    current_user: PublicUser,
    db_session: Session,
) -> list[AssessmentReadItem]:
    assessment = _get_assessment_by_uuid_or_404(assessment_uuid, db_session)
    _activity, course = _get_activity_and_course(assessment, db_session)
    _require_author(current_user, course, db_session)
    _ensure_authorable(assessment)

    items = db_session.exec(
        select(AssessmentItem).where(AssessmentItem.assessment_id == assessment.id)
    ).all()
    by_uuid = {item.item_uuid: item for item in items}
    missing = [
        entry.item_uuid for entry in payload.items if entry.item_uuid not in by_uuid
    ]
    if missing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"message": "Unknown assessment items", "item_uuids": missing},
        )

    now = datetime.now(UTC)
    for entry in payload.items:
        item = by_uuid[entry.item_uuid]
        item.order = entry.order
        item.updated_at = now
        db_session.add(item)

    assessment.updated_at = now
    db_session.add(assessment)
    db_session.commit()
    return [_build_item_read(item) for item in sorted(items, key=lambda i: i.order)]


async def delete_assessment_item(
    assessment_uuid: str,
    item_uuid: str,
    current_user: PublicUser,
    db_session: Session,
) -> dict[str, str]:
    assessment = _get_assessment_by_uuid_or_404(assessment_uuid, db_session)
    _activity, course = _get_activity_and_course(assessment, db_session)
    _require_author(current_user, course, db_session)
    _ensure_authorable(assessment)
    item = _get_item_or_404(assessment, item_uuid, db_session)
    db_session.delete(item)
    assessment.updated_at = datetime.now(UTC)
    db_session.add(assessment)
    db_session.commit()
    return {"detail": "Assessment item deleted"}


# ── Student submissions ───────────────────────────────────────────────────────


async def start_assessment(
    assessment_uuid: str,
    current_user: PublicUser,
    db_session: Session,
) -> SubmissionRead:
    assessment = _get_assessment_by_uuid_or_404(assessment_uuid, db_session)
    activity, course = _get_activity_and_course(assessment, db_session)
    _require_submit_access(current_user, activity, course, assessment.kind, db_session)
    return start_submission_v2(
        activity_id=activity.id,
        assessment_type=AssessmentType(assessment.kind),
        current_user=current_user,
        db_session=db_session,
    )


async def get_my_assessment_submissions(
    assessment_uuid: str,
    current_user: PublicUser,
    db_session: Session,
) -> list[SubmissionRead]:
    assessment = _get_assessment_by_uuid_or_404(assessment_uuid, db_session)
    activity, course = _get_activity_and_course(assessment, db_session)
    _require_submit_access(current_user, activity, course, assessment.kind, db_session)
    submissions = db_session.exec(
        select(Submission)
        .where(
            Submission.activity_id == activity.id,
            Submission.user_id == current_user.id,
        )
        .order_by(desc(Submission.created_at))
    ).all()
    return [SubmissionRead.model_validate(submission) for submission in submissions]


async def get_my_assessment_draft(
    assessment_uuid: str,
    current_user: PublicUser,
    db_session: Session,
) -> AssessmentDraftRead:
    assessment = _get_assessment_by_uuid_or_404(assessment_uuid, db_session)
    activity, course = _get_activity_and_course(assessment, db_session)
    _require_submit_access(current_user, activity, course, assessment.kind, db_session)
    draft = db_session.exec(
        select(Submission).where(
            Submission.activity_id == activity.id,
            Submission.user_id == current_user.id,
            Submission.status == SubmissionStatus.DRAFT,
        )
    ).first()
    return AssessmentDraftRead(
        assessment_uuid=assessment.assessment_uuid,
        submission=SubmissionRead.model_validate(draft) if draft else None,
    )


async def save_assessment_draft(
    assessment_uuid: str,
    payload: AssessmentDraftPatch,
    current_user: PublicUser,
    db_session: Session,
    *,
    if_match: str | None = None,
) -> SubmissionRead:
    assessment = _get_assessment_by_uuid_or_404(assessment_uuid, db_session)
    activity, course = _get_activity_and_course(assessment, db_session)
    _require_submit_access(current_user, activity, course, assessment.kind, db_session)

    draft = _get_or_create_submission_draft(
        assessment=assessment,
        activity=activity,
        current_user=current_user,
        db_session=db_session,
    )
    _enforce_draft_version(draft, if_match)

    answers = _normalize_answer_patch(assessment, payload, current_user, db_session)
    current_payload = draft.answers_json if isinstance(draft.answers_json, dict) else {}
    current_answers = current_payload.get("answers", {})
    if not isinstance(current_answers, dict):
        current_answers = {}

    draft.answers_json = {
        **current_payload,
        "answers": {
            **current_answers,
            **answers,
        },
    }
    draft.version += 1
    draft.updated_at = datetime.now(UTC)

    db_session.add(draft)
    db_session.commit()
    db_session.refresh(draft)
    progress_submissions.save_activity_draft(draft, db_session)
    return SubmissionRead.model_validate(draft)


async def submit_assessment(
    assessment_uuid: str,
    payload: AssessmentDraftPatch | None,
    current_user: PublicUser,
    db_session: Session,
    *,
    violation_count: int = 0,
    if_match: str | None = None,
) -> SubmissionRead:
    assessment = _get_assessment_by_uuid_or_404(assessment_uuid, db_session)
    activity, course = _get_activity_and_course(assessment, db_session)
    _require_submit_access(current_user, activity, course, assessment.kind, db_session)

    if payload is not None:
        draft = await save_assessment_draft(
            assessment_uuid,
            payload,
            current_user,
            db_session,
            if_match=if_match,
        )
        answers_payload = draft.answers_json
        submission_uuid = draft.submission_uuid
    else:
        draft = _get_or_create_submission_draft(
            assessment=assessment,
            activity=activity,
            current_user=current_user,
            db_session=db_session,
        )
        _enforce_draft_version(draft, if_match)
        answers_payload = draft.answers_json
        submission_uuid = draft.submission_uuid

    settings = load_activity_settings(
        activity.id, AssessmentType(assessment.kind), db_session
    )
    return await submit_assessment_pipeline(
        request=None,
        activity_id=activity.id,
        assessment_type=AssessmentType(assessment.kind),
        answers_payload=answers_payload,
        settings=settings,
        current_user=current_user,
        db_session=db_session,
        violation_count=violation_count,
        submission_uuid=submission_uuid,
    )


async def get_assessment_submissions(
    assessment_uuid: str,
    current_user: PublicUser,
    db_session: Session,
    *,
    status_filter: str | None = None,
    page: int = 1,
    page_size: int = 25,
) -> SubmissionListResponse:
    assessment = _get_assessment_by_uuid_or_404(assessment_uuid, db_session)
    activity, course = _get_activity_and_course(assessment, db_session)
    _require_grade(current_user, course, db_session)

    query = select(Submission).where(Submission.activity_id == activity.id)
    if status_filter:
        if status_filter == "NEEDS_GRADING":
            query = query.where(Submission.status == SubmissionStatus.PENDING)
        else:
            query = query.where(Submission.status == SubmissionStatus(status_filter))

    total = db_session.exec(select(func.count()).select_from(query.subquery())).one()
    offset = max(page - 1, 0) * page_size
    rows = db_session.exec(
        query
        .order_by(desc(Submission.submitted_at), desc(Submission.created_at))
        .offset(offset)
        .limit(page_size)
    ).all()
    users = _batch_fetch_users({row.user_id for row in rows}, db_session)

    items = []
    for submission in rows:
        read = SubmissionRead.model_validate(submission)
        user = users.get(submission.user_id)
        if user is not None:
            read.user = _submission_user(user)
        items.append(read)

    pages = (total + page_size - 1) // page_size if page_size else 1
    return SubmissionListResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        pages=pages,
    )


# ── Readiness ─────────────────────────────────────────────────────────────────


def build_readiness(
    assessment: Assessment,
    db_session: Session,
) -> AssessmentReadiness:
    issues: list[ReadinessIssue] = []
    if not assessment.title.strip():
        issues.append(
            ReadinessIssue(code="assessment.title_missing", message="Title is required")
        )

    items = _get_items(assessment, db_session)
    if not items:
        issues.append(
            ReadinessIssue(
                code="assessment.empty",
                message="Add at least one item before publishing.",
            )
        )

    policy = _get_policy_for_assessment(assessment, db_session)
    if policy is None:
        issues.append(
            ReadinessIssue(
                code="policy.missing",
                message="Assessment policy is missing.",
            )
        )

    for item in items:
        issues.extend(_item_readiness_issues(item))

    return AssessmentReadiness(ok=not issues, issues=issues)


# ── Activity lookup ───────────────────────────────────────────────────────────


def _get_or_project_assessment_for_activity(
    activity: Activity,
    db_session: Session,
) -> Assessment:
    existing = db_session.exec(
        select(Assessment).where(Assessment.activity_id == activity.id)
    ).first()
    if existing is not None:
        return existing

    if activity.activity_type in _ACTIVITY_TO_KIND:
        kind = _ACTIVITY_TO_KIND[activity.activity_type]
        now = datetime.now(UTC)
        policy = _get_or_create_policy(
            activity_id=activity.id,
            kind=kind,
            patch=None,
            db_session=db_session,
            now=now,
        )
        db_session.flush()
        assessment = Assessment(
            assessment_uuid=f"assessment_{ULID()}",
            activity_id=activity.id,
            kind=kind,
            title=activity.name,
            description="",
            lifecycle=AssessmentLifecycle.DRAFT,
            weight=1.0,
            grading_type=AssessmentGradingType.PERCENTAGE,
            policy_id=policy.id,
            created_at=now,
            updated_at=now,
        )
        db_session.add(assessment)
        db_session.commit()
        db_session.refresh(assessment)
        return assessment

    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail="Assessment not found for activity",
    )


# ── Builders and helpers ──────────────────────────────────────────────────────


def _build_assessment_read(
    assessment: Assessment,
    db_session: Session,
) -> AssessmentRead:
    activity = db_session.get(Activity, assessment.activity_id)
    if activity is None:
        raise HTTPException(status_code=404, detail="Activity not found")
    course_uuid: str | None = None
    if activity.course_id is not None:
        from src.db.courses.courses import Course

        course_row = db_session.get(Course, activity.course_id)
        if course_row is not None:
            course_uuid = course_row.course_uuid
    return AssessmentRead(
        id=assessment.id or 0,
        assessment_uuid=assessment.assessment_uuid,
        activity_id=assessment.activity_id,
        activity_uuid=activity.activity_uuid,
        course_id=activity.course_id,
        course_uuid=course_uuid,
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
        created_at=assessment.created_at,
        updated_at=assessment.updated_at,
    )


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
        raise HTTPException(status_code=404, detail="Assessment item not found")
    return item


def _get_assessment_by_uuid_or_404(
    assessment_uuid: str,
    db_session: Session,
) -> Assessment:
    assessment = db_session.exec(
        select(Assessment).where(Assessment.assessment_uuid == assessment_uuid)
    ).first()
    if assessment is None:
        raise HTTPException(status_code=404, detail="Assessment not found")
    return assessment


def _get_activity_by_uuid_or_404(activity_uuid: str, db_session: Session) -> Activity:
    normalized = (
        activity_uuid
        if activity_uuid.startswith("activity_")
        else f"activity_{activity_uuid}"
    )
    activity = db_session.exec(
        select(Activity).where(Activity.activity_uuid == normalized)
    ).first()
    if activity is None:
        raise HTTPException(status_code=404, detail="Activity not found")
    return activity


def _get_activity_and_course(
    assessment: Assessment,
    db_session: Session,
) -> tuple[Activity, Course]:
    activity = db_session.get(Activity, assessment.activity_id)
    if activity is None:
        raise HTTPException(status_code=404, detail="Activity not found")
    return activity, _get_course_for_activity_or_404(activity, db_session)


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
    raise HTTPException(status_code=404, detail="Course not found")


def _get_course_or_404(course_id: int, db_session: Session) -> Course:
    course = db_session.get(Course, course_id)
    if course is None:
        raise HTTPException(status_code=404, detail="Course not found")
    return course


def _get_chapter_or_404(chapter_id: int, db_session: Session) -> Chapter:
    chapter = db_session.get(Chapter, chapter_id)
    if chapter is None:
        raise HTTPException(status_code=404, detail="Chapter not found")
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
    kind: AssessmentType,
    db_session: Session,
) -> None:
    if not user_has_course_access(user.id, course, db_session):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You must be enrolled in this course to submit assessments",
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


def _ensure_authorable(assessment: Assessment) -> None:
    if AssessmentLifecycle(assessment.lifecycle) == AssessmentLifecycle.ARCHIVED:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Archived assessments are read-only",
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
        for field, value in patch.model_dump(exclude_unset=True).items():
            if field == "late_policy":
                setattr(policy, "late_policy_json", value)
                continue
            setattr(policy, field, value)
    policy.updated_at = now
    db_session.add(policy)
    return policy


def _default_grading_mode(kind: AssessmentType) -> AssessmentGradingMode:
    if kind == AssessmentType.ASSIGNMENT:
        return AssessmentGradingMode.MANUAL
    if kind == AssessmentType.EXAM:
        return AssessmentGradingMode.AUTO_THEN_MANUAL
    return AssessmentGradingMode.AUTO


def _default_completion_rule(kind: AssessmentType) -> AssessmentCompletionRule:
    if kind == AssessmentType.ASSIGNMENT:
        return AssessmentCompletionRule.SUBMITTED
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
    return validate_settings({"kind": "ASSIGNMENT"}).model_dump(mode="json")


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
        if str(answer.kind) == ItemKind.FILE_UPLOAD.value:
            _validate_file_upload_answer(answer_payload, item, current_user, db_session)
        normalized[entry.item_uuid] = answer_payload

    if invalid or mismatched:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "message": "Invalid assessment answers",
                "unknown_item_uuids": invalid,
                "kind_mismatch_item_uuids": mismatched,
            },
        )
    return normalized


def _validate_file_upload_answer(
    answer: dict[str, object],
    item: AssessmentItem,
    current_user: PublicUser,
    db_session: Session,
) -> None:
    body = item.body_json if isinstance(item.body_json, dict) else {}
    allowed_mimes = (
        body.get("mimes")
        if isinstance(body.get("mimes"), list)
        else body.get("allowed_mime_types")
        if isinstance(body.get("allowed_mime_types"), list)
        else []
    )
    max_mb = (
        body.get("max_mb")
        if isinstance(body.get("max_mb"), int)
        else body.get("max_file_size_mb")
    )
    max_bytes = (
        int(max_mb) * 1024 * 1024 if isinstance(max_mb, int) and max_mb > 0 else None
    )
    uploads = answer.get("uploads") if isinstance(answer.get("uploads"), list) else []
    for file_ref in uploads:
        if not isinstance(file_ref, dict):
            raise HTTPException(status_code=400, detail="Invalid file upload answer")
        upload_id = file_ref.get("upload_uuid")
        upload = db_session.exec(
            select(Upload).where(Upload.upload_uuid == upload_id)
        ).first()
        if (
            upload is None
            or upload.user_id != current_user.id
            or upload.status != UploadStatus.FINALIZED
        ):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail={
                    "message": "File upload is not finalized for this user",
                    "upload_uuid": upload_id,
                    "item_uuid": item.item_uuid,
                },
            )
        if allowed_mimes and upload.content_type not in allowed_mimes:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail={
                    "message": "File content type is not allowed",
                    "upload_uuid": upload_id,
                    "item_uuid": item.item_uuid,
                },
            )
        if (
            max_bytes is not None
            and upload.size_bytes is not None
            and upload.size_bytes > max_bytes
        ):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail={
                    "message": "File is larger than this item allows",
                    "upload_uuid": upload_id,
                    "item_uuid": item.item_uuid,
                },
            )
        if upload.referenced_at is None:
            upload.referenced_at = datetime.now(UTC)
            upload.updated_at = upload.referenced_at
            upload.referenced_count = (upload.referenced_count or 0) + 1
            db_session.add(upload)


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
        raise HTTPException(status_code=500, detail="Draft submission was not created")
    return draft


def _enforce_draft_version(draft: Submission, if_match: str | None) -> None:
    if if_match is None:
        return
    raw = if_match.strip().strip('"')
    try:
        expected = int(raw)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="If-Match must be the current numeric submission version",
        )
    if draft.version != expected:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "message": "Draft version conflict",
                "latest": SubmissionRead.model_validate(draft).model_dump(mode="json"),
            },
        )


def _item_readiness_issues(item: AssessmentItem) -> list[ReadinessIssue]:
    try:
        body = ITEM_BODY_ADAPTER.validate_python(item.body_json)
    except Exception as exc:  # noqa: BLE001
        return [
            ReadinessIssue(
                code="item.body_invalid",
                message=f"Item body is invalid: {exc}",
                item_uuid=item.item_uuid,
            )
        ]

    issues: list[ReadinessIssue] = []
    if not item.title.strip():
        issues.append(
            ReadinessIssue(
                code="item.title_missing",
                message="Item title is required.",
                item_uuid=item.item_uuid,
            )
        )

    if body.kind == "CHOICE":
        if not body.prompt.strip():
            issues.append(
                ReadinessIssue(
                    code="item.prompt_missing",
                    message="Choice prompt is required.",
                    item_uuid=item.item_uuid,
                )
            )
        if len(body.options) < 2:
            issues.append(
                ReadinessIssue(
                    code="choice.options_missing",
                    message="Choice items need at least two options.",
                    item_uuid=item.item_uuid,
                )
            )
        correct = [option for option in body.options if option.is_correct]
        if not correct:
            issues.append(
                ReadinessIssue(
                    code="choice.correct_missing",
                    message="Mark at least one correct choice.",
                    item_uuid=item.item_uuid,
                )
            )
        if not body.multiple and len(correct) > 1:
            issues.append(
                ReadinessIssue(
                    code="choice.too_many_correct",
                    message="Single-choice items can only have one correct option.",
                    item_uuid=item.item_uuid,
                )
            )
    elif body.kind == "OPEN_TEXT":
        if not body.prompt.strip():
            issues.append(
                ReadinessIssue(
                    code="item.prompt_missing",
                    message="Open-text prompt is required.",
                    item_uuid=item.item_uuid,
                )
            )
    elif body.kind == "FILE_UPLOAD":
        if body.max_files < 1:
            issues.append(
                ReadinessIssue(
                    code="file.max_files_invalid",
                    message="File upload items must allow at least one file.",
                    item_uuid=item.item_uuid,
                )
            )
    elif body.kind == "FORM":
        if not body.fields:
            issues.append(
                ReadinessIssue(
                    code="form.fields_missing",
                    message="Form items need at least one field.",
                    item_uuid=item.item_uuid,
                )
            )
    elif body.kind == "CODE":
        if not body.languages:
            issues.append(
                ReadinessIssue(
                    code="code.languages_missing",
                    message="Code items need at least one allowed language.",
                    item_uuid=item.item_uuid,
                )
            )
        if not body.tests:
            issues.append(
                ReadinessIssue(
                    code="code.tests_missing",
                    message="Code items need at least one test case.",
                    item_uuid=item.item_uuid,
                )
            )
    elif body.kind == "MATCHING" and not body.pairs:
        issues.append(
            ReadinessIssue(
                code="matching.pairs_missing",
                message="Matching items need at least one pair.",
                item_uuid=item.item_uuid,
            )
        )
    return issues


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
        late_policy=policy.late_policy_json,
        anti_cheat_json=policy.anti_cheat_json,
        settings_json=policy.settings_json,
    )


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
