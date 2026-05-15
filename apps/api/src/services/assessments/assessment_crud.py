"""Assessment CRUD operations — create, read, update, delete assessments and items.

Extracted from core.py. Handles:
- Assessment creation (with activity + policy provisioning)
- Assessment retrieval (by uuid, by activity_uuid)
- Assessment update (title, description, weight, policy)
- Item CRUD (create, update, reorder, delete)
- Readiness checks
- Lifecycle transitions
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime

from fastapi import HTTPException, status
from sqlalchemy import func
from sqlmodel import Session, select
from ulid import ULID

from src.db.assessments import (
    ITEM_BODY_ADAPTER,
    Assessment,
    AssessmentCreate,
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
    AssessmentUpdate,
    ItemKind,
    ReadinessIssue,
)
from src.db.courses.activities import Activity, ActivitySubTypeEnum, ActivityTypeEnum
from src.db.courses.chapters import Chapter
from src.db.courses.courses import Course
from src.db.grading.progress import (
    AssessmentCompletionRule,
    AssessmentGradingMode,
    AssessmentPolicy,
    GradeReleaseMode,
    LatePolicyNone,
)
from src.db.grading.submissions import AssessmentType, Submission, SubmissionStatus
from src.db.users import AnonymousUser, PublicUser
from src.services.assessments._constants import (
    _ALLOWED_LIFECYCLE_TRANSITIONS,
    _KIND_TO_ACTIVITY,
)
from src.services.assessments._helpers import (
    _build_assessment_read,
    _build_item_read,
    _content_version,
    _default_activity_settings,
    _ensure_authorable,
    _get_activity_and_course,
    _get_activity_by_uuid_or_404,
    _get_assessment_by_uuid_or_404,
    _get_chapter_or_404,
    _get_course_for_activity_or_404,
    _get_course_or_404,
    _get_item_or_404,
    _get_or_create_policy,
    _get_or_project_assessment_for_activity,
    _require_author,
    _require_publish,
    _require_read,
    _sync_activity_lifecycle,
    build_readiness,
)
from src.services.courses._utils import _next_activity_order

logger = logging.getLogger(__name__)

# Scoring fields that cannot be changed once an assessment is "locked"
# (PUBLISHED + has non-DRAFT submissions).  Metadata fields like title,
# description, and explanation are always editable.
_SCORING_FIELDS: frozenset[str] = frozenset({"body", "body_json", "kind", "max_score"})


def _is_assessment_locked(assessment: Assessment, db_session: Session) -> bool:
    """Return True if the assessment is PUBLISHED and has ≥1 non-DRAFT submission."""
    if assessment.lifecycle != AssessmentLifecycle.PUBLISHED:
        return False
    active_submission = db_session.exec(
        select(Submission)
        .where(
            Submission.assessment_policy_id.in_(  # type: ignore[union-attr]
                select(AssessmentPolicy.id).where(
                    AssessmentPolicy.activity_id == assessment.activity_id
                )
            )
        )
        .where(Submission.status != SubmissionStatus.DRAFT)
        .limit(1)
    ).first()
    return active_submission is not None


def _reject_legacy_file_upload_item(
    assessment: Assessment,
    item_kind: ItemKind,
) -> None:
    if (
        AssessmentType(assessment.kind) == AssessmentType.ASSIGNMENT
        and ItemKind(item_kind) == ItemKind.FILE_UPLOAD
    ):
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail={
                "code": "FILE_UPLOAD_ITEM_REMOVED",
                "message": (
                    "File submissions are now a separate activity type. "
                    "Create a TYPE_FILE_SUBMISSION activity instead."
                ),
            },
        )


# ── Public assessment CRUD ────────────────────────────────────────────────────


async def create_assessment(
    payload: AssessmentCreate,
    current_user: PublicUser,
    db_session: Session,
) -> AssessmentRead:
    """Create a new assessment with its backing activity and policy."""
    course = _get_course_or_404(payload.course_id, db_session)
    chapter = _get_chapter_or_404(payload.chapter_id, db_session)
    if chapter.course_id != course.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Глава не принадлежит выбранному курсу",
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
    return _build_assessment_read(assessment, db_session, current_user=current_user)


async def get_assessment(
    assessment_uuid: str,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
) -> AssessmentRead:
    assessment = _get_assessment_by_uuid_or_404(assessment_uuid, db_session)
    activity, course = _get_activity_and_course(assessment, db_session)
    _require_read(current_user, activity, course, db_session)
    return _build_assessment_read(assessment, db_session, current_user=current_user)


async def get_assessment_by_activity_uuid(
    activity_uuid: str,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
) -> AssessmentRead:
    activity = _get_activity_by_uuid_or_404(activity_uuid, db_session)
    course = _get_course_for_activity_or_404(activity, db_session)
    _require_read(current_user, activity, course, db_session)
    assessment = _get_or_project_assessment_for_activity(activity, db_session)
    return _build_assessment_read(assessment, db_session, current_user=current_user)


async def update_assessment(
    assessment_uuid: str,
    payload: AssessmentUpdate,
    current_user: PublicUser,
    db_session: Session,
) -> AssessmentRead:
    assessment = _get_assessment_by_uuid_or_404(assessment_uuid, db_session)
    activity, course = _get_activity_and_course(assessment, db_session)
    _require_author(current_user, course, db_session)
    _ensure_authorable(assessment, db_session)

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
    return _build_assessment_read(assessment, db_session, current_user=current_user)


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
                f"Невозможно перевести оценивание из {current.value} в "
                f"{target.value}. Разрешено: {[state.value for state in allowed]}"
            ),
        )

    readiness = build_readiness(assessment, db_session)
    if (
        target in {AssessmentLifecycle.PUBLISHED, AssessmentLifecycle.SCHEDULED}
        and not readiness.ok
    ):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={"issues": [issue.model_dump() for issue in readiness.issues]},
        )

    now = datetime.now(UTC)
    if target == AssessmentLifecycle.SCHEDULED:
        scheduled_at = payload.scheduled_at
        if scheduled_at is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="Параметр scheduled_at обязателен при планировании",
            )
        scheduled_at = (
            scheduled_at if scheduled_at.tzinfo else scheduled_at.replace(tzinfo=UTC)
        )
        if scheduled_at <= now:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="Время публикации (scheduled_at) должно быть в будущем",
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
    return _build_assessment_read(assessment, db_session, current_user=current_user)


# ── Items ─────────────────────────────────────────────────────────────────────


async def create_assessment_item(
    assessment_uuid: str,
    payload: AssessmentItemCreate,
    current_user: PublicUser,
    db_session: Session,
) -> AssessmentReadItem:
    _MAX_ITEMS_PER_ASSESSMENT = 200

    assessment = _get_assessment_by_uuid_or_404(assessment_uuid, db_session)
    _activity, course = _get_activity_and_course(assessment, db_session)
    _require_author(current_user, course, db_session)
    _ensure_authorable(assessment, db_session)
    _reject_legacy_file_upload_item(assessment, payload.kind)

    item_count = db_session.exec(
        select(func.count()).where(AssessmentItem.assessment_id == assessment.id)
    ).one()
    if item_count >= _MAX_ITEMS_PER_ASSESSMENT:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "code": "ITEM_LIMIT_EXCEEDED",
                "message": (
                    f"Assessment already has {item_count} items. "
                    f"Maximum allowed: {_MAX_ITEMS_PER_ASSESSMENT}."
                ),
                "max": _MAX_ITEMS_PER_ASSESSMENT,
                "current": item_count,
            },
        )

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
    assessment.content_version = _content_version(assessment) + 1
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
    _ensure_authorable(assessment, db_session)
    item = _get_item_or_404(assessment, item_uuid, db_session)
    next_kind = payload.kind
    if next_kind is None and payload.body is not None:
        next_kind = ItemKind(payload.body.kind)
    if next_kind is not None:
        _reject_legacy_file_upload_item(assessment, next_kind)

    # ── Content locking: block scoring-field changes on locked assessments ────
    if _is_assessment_locked(assessment, db_session):
        changed_keys = set(payload.model_dump(exclude_unset=True).keys())
        forbidden_changes = changed_keys & _SCORING_FIELDS
        if forbidden_changes:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={
                    "code": "ASSESSMENT_LOCKED",
                    "message": (
                        "Cannot modify scoring fields of a published assessment "
                        "that has active submissions. Only title, description, and "
                        "explanation may be updated."
                    ),
                    "locked_fields": sorted(forbidden_changes),
                },
            )

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
    assessment.content_version = _content_version(assessment) + 1
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
    _ensure_authorable(assessment, db_session)

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
            detail={
                "message": "Неизвестные элементы оценивания",
                "item_uuids": missing,
            },
        )

    now = datetime.now(UTC)
    for entry in payload.items:
        item = by_uuid[entry.item_uuid]
        item.order = entry.order
        item.updated_at = now
        db_session.add(item)

    assessment.updated_at = now
    assessment.content_version = _content_version(assessment) + 1
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
    _ensure_authorable(assessment, db_session)

    # ── Content locking: cannot delete items on locked assessments ────────────
    if _is_assessment_locked(assessment, db_session):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "ASSESSMENT_LOCKED",
                "message": (
                    "Cannot delete items from a published assessment that has "
                    "active submissions."
                ),
            },
        )

    item = _get_item_or_404(assessment, item_uuid, db_session)
    db_session.delete(item)
    now = datetime.now(UTC)
    assessment.updated_at = now
    assessment.content_version = _content_version(assessment) + 1
    db_session.add(assessment)
    db_session.commit()
    return {"detail": "Элемент оценивания удален"}


async def duplicate_assessment(
    assessment_uuid: str,
    current_user: PublicUser,
    db_session: Session,
) -> AssessmentRead:
    """Deep-copy an Assessment + its Items + its Policy into a new DRAFT.

    The duplicate is placed in the same chapter/course as the source, gets new
    UUIDs throughout, and starts in ``DRAFT`` lifecycle regardless of the
    source's lifecycle state.  The caller must be an author of the course.
    """
    source = _get_assessment_by_uuid_or_404(assessment_uuid, db_session)
    activity, course = _get_activity_and_course(source, db_session)
    _require_author(current_user, course, db_session)

    now = datetime.now(UTC)

    # ── Duplicate the backing Activity ───────────────────────────────────────
    new_activity = Activity(
        name=f"{activity.name} (копия)",
        activity_type=activity.activity_type,
        activity_sub_type=activity.activity_sub_type,
        content={},
        details={"lifecycle_status": AssessmentLifecycle.DRAFT.value},
        settings=activity.settings,
        published=False,
        chapter_id=activity.chapter_id,
        course_id=activity.course_id,
        order=_next_activity_order(activity.chapter_id, db_session),
        creator_id=current_user.id,
        activity_uuid=f"activity_{ULID()}",
        creation_date=now,
        update_date=now,
    )
    db_session.add(new_activity)
    db_session.flush()

    # ── Duplicate the Policy (deep-copy settings, reset runtime counters) ────
    source_policy: AssessmentPolicy | None = (
        db_session.get(AssessmentPolicy, source.policy_id) if source.policy_id else None
    )
    new_policy = _get_or_create_policy(
        activity_id=new_activity.id,
        kind=source.kind,
        patch=None,
        db_session=db_session,
        now=now,
    )
    if source_policy is not None:
        # Mirror all configurable policy fields from source.
        new_policy.max_attempts = source_policy.max_attempts
        new_policy.time_limit_seconds = source_policy.time_limit_seconds
        new_policy.late_policy_json = source_policy.late_policy_json
        new_policy.completion_rule = source_policy.completion_rule
        new_policy.grading_mode = source_policy.grading_mode
        new_policy.grade_release_mode = source_policy.grade_release_mode
        new_policy.passing_score = source_policy.passing_score
        db_session.add(new_policy)
    db_session.flush()

    # ── Duplicate the Assessment ──────────────────────────────────────────────
    new_assessment = Assessment(
        assessment_uuid=f"assessment_{ULID()}",
        activity_id=new_activity.id,
        kind=source.kind,
        title=f"{source.title} (копия)",
        description=source.description,
        lifecycle=AssessmentLifecycle.DRAFT,
        weight=source.weight,
        grading_type=source.grading_type,
        policy_id=new_policy.id,
        content_version=1,
        created_at=now,
        updated_at=now,
    )
    db_session.add(new_assessment)
    db_session.flush()

    # ── Duplicate all AssessmentItems ────────────────────────────────────────
    source_items: list[AssessmentItem] = list(
        db_session.exec(
            select(AssessmentItem)
            .where(AssessmentItem.assessment_id == source.id)
            .order_by(AssessmentItem.order)
        ).all()
    )
    for src_item in source_items:
        new_item = AssessmentItem(
            item_uuid=f"item_{ULID()}",
            assessment_id=new_assessment.id,
            order=src_item.order,
            kind=src_item.kind,
            title=src_item.title,
            description=src_item.description,
            explanation=src_item.explanation,
            body_json=src_item.body_json,
            max_score=src_item.max_score,
            created_at=now,
            updated_at=now,
        )
        db_session.add(new_item)

    db_session.commit()
    db_session.refresh(new_assessment)
    return _build_assessment_read(new_assessment, db_session, current_user=current_user)
