"""
Teacher grading service.
"""

import csv
import io
import logging
from collections.abc import Generator
from datetime import UTC, datetime

from fastapi import HTTPException, status
from sqlalchemy import asc, desc, func, or_
from sqlmodel import Session, select
from ulid import ULID

from src.db.courses.activities import Activity
from src.db.gamification import XPSource
from src.db.grading.entries import GradingEntry
from src.db.grading.schemas import (
    BatchGradeRequest,
    BatchGradeResponse,
    BatchGradeResultItem,
    BulkPublishGradesResponse,
)
from src.db.grading.submissions import (
    AssessmentType,
    GradedItem,
    GradingBreakdown,
    ItemFeedback,
    Submission,
    SubmissionListResponse,
    SubmissionRead,
    SubmissionStats,
    SubmissionStatus,
    SubmissionUser,
    TeacherGradeInput,
)
from src.db.users import PublicUser, User
from src.security.rbac import PermissionChecker
from src.services.gamification.service import award_xp as _gamification_award_xp
from src.services.grading.assignment_breakdown import build_effective_grading_breakdown
from src.services.grading.events import publish_grading_event
from src.services.progress.submissions import (
    _attach_policy,
    recalculate_activity_progress,
)

logger = logging.getLogger(__name__)

# Valid status transitions a teacher may request.
# DRAFT is intentionally absent — teachers should never be able to revert
# a submitted submission to draft.
_ALLOWED_TEACHER_TRANSITIONS: dict[SubmissionStatus, frozenset[SubmissionStatus]] = {
    SubmissionStatus.PENDING: frozenset({
        SubmissionStatus.GRADED,
        SubmissionStatus.PUBLISHED,
        SubmissionStatus.RETURNED,
    }),
    SubmissionStatus.GRADED: frozenset({
        SubmissionStatus.GRADED,  # re-save is a no-op transition, always allowed
        SubmissionStatus.PUBLISHED,
        SubmissionStatus.RETURNED,
    }),
    SubmissionStatus.RETURNED: frozenset({
        SubmissionStatus.GRADED,
        SubmissionStatus.PENDING,
        SubmissionStatus.PUBLISHED,
    }),
    SubmissionStatus.PUBLISHED: frozenset({
        SubmissionStatus.PUBLISHED,  # Idempotent publish should be allowed
        SubmissionStatus.RETURNED,  # allow recalling a published grade for correction
    }),
}

# XP source for each assessment type — awarded when a grade is published.
_XP_SOURCE_ON_PUBLISH: dict[AssessmentType, XPSource] = {
    AssessmentType.QUIZ: XPSource.QUIZ_COMPLETION,
    AssessmentType.EXAM: XPSource.EXAM_COMPLETION,
    AssessmentType.ASSIGNMENT: XPSource.ASSIGNMENT_SUBMISSION,
    AssessmentType.CODE_CHALLENGE: XPSource.CODE_CHALLENGE_COMPLETION,
}

_SORT_MAP = {
    "submitted_at": Submission.submitted_at,
    "final_score": Submission.final_score,
    "created_at": Submission.created_at,
    "attempt_number": Submission.attempt_number,
}


async def get_submissions_for_activity(
    activity_id: int,
    current_user: PublicUser,
    db_session: Session,
    *,
    status_filter: str | None = None,
    late_only: bool = False,
    search: str | None = None,
    sort_by: str = "submitted_at",
    sort_dir: str = "desc",
    page: int = 1,
    page_size: int = 25,
) -> SubmissionListResponse:
    """
    Return paginated, filterable, searchable submissions for an activity (teacher view).

    Uses SQL LIMIT/OFFSET — no in-memory loading.
    """
    activity = db_session.exec(
        select(Activity).where(Activity.id == activity_id)
    ).first()

    if not activity:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Activity not found",
        )

    checker = PermissionChecker(db_session)
    checker.require(
        current_user.id,
        "assignment:read",
        resource_owner_id=activity.creator_id,
    )

    # Base query — join User for search support
    query = (
        select(Submission)
        .join(User, User.id == Submission.user_id)
        .where(Submission.activity_id == activity_id)
    )

    if status_filter:
        # "NEEDS_GRADING" is a virtual filter mapping to PENDING
        if status_filter == "NEEDS_GRADING":
            query = query.where(Submission.status == SubmissionStatus.PENDING)
        else:
            try:
                query = query.where(
                    Submission.status == SubmissionStatus(status_filter)
                )
            except ValueError:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Invalid status '{status_filter}'",
                )

    if late_only:
        query = query.where(Submission.is_late)

    if search:
        term = f"%{search}%"
        query = query.where(
            or_(
                User.first_name.ilike(term),
                User.last_name.ilike(term),
                User.username.ilike(term),
                User.email.ilike(term),
            )
        )

    count_query = select(func.count()).select_from(query.subquery())
    total: int = db_session.exec(count_query).one()

    sort_col = _SORT_MAP.get(sort_by, Submission.submitted_at)
    order_fn = desc if sort_dir == "desc" else asc
    query = query.order_by(order_fn(sort_col))

    offset = (page - 1) * page_size
    page_rows = db_session.exec(query.offset(offset).limit(page_size)).all()

    users_by_id = _batch_fetch_users({s.user_id for s in page_rows}, db_session)

    pages = max(1, -(-total // page_size))
    return SubmissionListResponse(
        items=[_enrich(s, users_by_id) for s in page_rows],
        total=total,
        page=page,
        page_size=page_size,
        pages=pages,
    )


async def get_submission_stats(
    activity_id: int,
    current_user: PublicUser,
    db_session: Session,
) -> SubmissionStats:
    """
    Return aggregate statistics for the teacher dashboard.

    Uses two SQL queries instead of five:
      1. Status counts (GROUP BY status)
      2. Scores for graded submissions (for avg/pass-rate)
    """
    activity = db_session.exec(
        select(Activity).where(Activity.id == activity_id)
    ).first()
    if not activity:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Activity not found"
        )

    checker = PermissionChecker(db_session)
    checker.require(
        current_user.id, "assignment:read", resource_owner_id=activity.creator_id
    )

    # Query 1: status counts (excludes DRAFTs)
    status_rows = db_session.exec(
        select(Submission.status, func.count().label("cnt"))
        .where(
            Submission.activity_id == activity_id,
            Submission.status != SubmissionStatus.DRAFT,
        )
        .group_by(Submission.status)
    ).all()

    status_counts: dict[str, int] = {row.status: row.cnt for row in status_rows}
    total = sum(status_counts.values())
    pending_count = status_counts.get(SubmissionStatus.PENDING, 0)
    graded_count = status_counts.get(SubmissionStatus.GRADED, 0) + status_counts.get(
        SubmissionStatus.PUBLISHED, 0
    )

    # Query 2: late count — all submitted (non-DRAFT) late submissions, regardless
    # of current status (graded/published late submissions still count as late).
    late_count: int = db_session.exec(
        select(func.count()).where(
            Submission.activity_id == activity_id,
            Submission.status != SubmissionStatus.DRAFT,
            Submission.is_late,
        )
    ).one()

    # Query 3 (small): scores for graded/published (for avg + pass rate)
    graded_scores: list[float] = db_session.exec(
        select(Submission.final_score).where(
            Submission.activity_id == activity_id,
            Submission.status.in_([
                SubmissionStatus.GRADED,
                SubmissionStatus.PUBLISHED,
            ]),
            Submission.final_score.is_not(None),
        )
    ).all()

    avg_score = (
        round(sum(graded_scores) / len(graded_scores), 2) if graded_scores else None
    )
    passing = [s for s in graded_scores if s >= 50.0]
    pass_rate = (
        round(len(passing) / len(graded_scores) * 100, 1) if graded_scores else None
    )

    return SubmissionStats(
        total=total,
        graded_count=graded_count,
        needs_grading_count=pending_count,
        late_count=late_count,
        avg_score=avg_score,
        pass_rate=pass_rate,
    )


async def get_submission_for_teacher(
    submission_uuid: str,
    current_user: PublicUser,
    db_session: Session,
) -> SubmissionRead:
    """
    Fetch a single submission with full answers and grading breakdown.

    Requires assignment:read permission scoped to the activity's creator,
    preventing cross-activity and cross-course data leakage.
    """
    submission = db_session.exec(
        select(Submission).where(Submission.submission_uuid == submission_uuid)
    ).first()
    if not submission:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Submission not found"
        )

    activity = db_session.exec(
        select(Activity).where(Activity.id == submission.activity_id)
    ).first()
    if not activity:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Activity not found"
        )

    checker = PermissionChecker(db_session)
    checker.require(
        current_user.id,
        "assignment:read",
        resource_owner_id=activity.creator_id,
    )

    result = SubmissionRead.model_validate(submission)
    result.grading_json = build_effective_grading_breakdown(submission, db_session)
    users_by_id = _batch_fetch_users({submission.user_id}, db_session)
    user = users_by_id.get(submission.user_id)
    if user:
        result.user = _make_submission_user(user)
    return result


def export_grades_csv(
    activity_id: int,
    current_user: PublicUser,
    db_session: Session,
) -> Generator[str]:
    """
    Stream CSV rows of all non-draft submissions one batch at a time.

    Yields the header line first, then rows in batches of 200 so the
    response starts immediately and memory usage stays bounded regardless
    of class size.  Uses Python's csv module for safe escaping.
    """
    activity = db_session.exec(
        select(Activity).where(Activity.id == activity_id)
    ).first()
    if not activity:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Activity not found"
        )

    checker = PermissionChecker(db_session)
    checker.require(
        current_user.id, "assignment:read", resource_owner_id=activity.creator_id
    )

    buf = io.StringIO()
    writer = csv.writer(buf)

    writer.writerow([
        "Student Name",
        "Email",
        "Attempt",
        "Status",
        "Late",
        "Submitted At",
        "Auto Score",
        "Final Score",
    ])
    yield buf.getvalue()
    buf.truncate(0)
    buf.seek(0)

    query = (
        select(Submission)
        .join(User, User.id == Submission.user_id)
        .where(
            Submission.activity_id == activity_id,
            Submission.status != SubmissionStatus.DRAFT,
        )
        .order_by(asc(Submission.submitted_at))
    )

    # Pre-fetch all involved users in a single query (user records are small).
    # Submission rows are streamed below so memory scales with batch size, not
    # with the total number of submissions.
    all_user_ids_query = (
        select(Submission.user_id)
        .where(
            Submission.activity_id == activity_id,
            Submission.status != SubmissionStatus.DRAFT,
        )
        .distinct()
    )
    all_user_ids = set(db_session.exec(all_user_ids_query).all())
    users_by_id = _batch_fetch_users(all_user_ids, db_session)

    for s in db_session.exec(query).yield_per(200):
        u = users_by_id.get(s.user_id)
        if u:
            parts = [p for p in [u.first_name, u.middle_name, u.last_name] if p]
            name = " ".join(parts) if parts else u.username
            email = str(u.email)
        else:
            name = f"User #{s.user_id}"
            email = ""

        submitted = s.submitted_at.isoformat() if s.submitted_at else ""
        writer.writerow([
            name,
            email,
            s.attempt_number,
            s.status,
            "yes" if s.is_late else "no",
            submitted,
            s.auto_score if s.auto_score is not None else "",
            s.final_score if s.final_score is not None else "",
        ])
        yield buf.getvalue()
        buf.truncate(0)
        buf.seek(0)


async def save_grade(
    submission_uuid: str,
    grade_input: TeacherGradeInput,
    current_user: PublicUser,
    db_session: Session,
    *,
    expected_version: int | None = None,
) -> SubmissionRead:
    """Apply a teacher-entered final score and optional per-item feedback.

    Pass ``expected_version`` (from the ``If-Match`` request header) to enable
    optimistic concurrency control.  If the submission has been modified since
    the teacher loaded it, a 412 Precondition Failed is returned.
    """
    submission, activity = _get_submission_with_activity(submission_uuid, db_session)

    checker = PermissionChecker(db_session)
    checker.require(
        current_user.id,
        "assignment:grade",
        resource_owner_id=activity.creator_id,
    )

    return _save_teacher_grade(
        submission=submission,
        grade_input=grade_input,
        submission_uuid=submission_uuid,
        current_user=current_user,
        db_session=db_session,
        expected_version=expected_version,
    )


async def batch_grade_submissions(
    batch_request: BatchGradeRequest,
    current_user: PublicUser,
    db_session: Session,
) -> BatchGradeResponse:
    """Apply teacher grades to multiple submissions in one request.

    Each item is isolated: a failure on one submission rolls back only that
    item and is reported in the response, while valid items still commit.
    """
    if len(batch_request.grades) > 100:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Batch grading supports at most 100 submissions per request",
        )

    requested_uuids = [grade.submission_uuid for grade in batch_request.grades]
    rows = db_session.exec(
        select(Submission, Activity)
        .join(Activity, Activity.id == Submission.activity_id)
        .where(Submission.submission_uuid.in_(requested_uuids))
    ).all()

    submissions_by_uuid = {
        submission.submission_uuid: (submission, activity)
        for submission, activity in rows
    }
    checker = PermissionChecker(db_session)

    results: list[BatchGradeResultItem] = []
    succeeded = 0
    failed = 0

    for grade in batch_request.grades:
        row = submissions_by_uuid.get(grade.submission_uuid)
        if row is None:
            results.append(
                BatchGradeResultItem(
                    submission_uuid=grade.submission_uuid,
                    success=False,
                    error="Submission not found",
                )
            )
            failed += 1
            continue

        submission, activity = row
        if not checker.check(
            current_user.id,
            "assignment:grade",
            resource_owner_id=activity.creator_id,
        ):
            results.append(
                BatchGradeResultItem(
                    submission_uuid=grade.submission_uuid,
                    success=False,
                    error="Not authorized to grade this submission",
                )
            )
            failed += 1
            continue

        try:
            grade_input = TeacherGradeInput(
                final_score=grade.final_score,
                status=grade.status,
                feedback=grade.feedback or "",
                item_feedback=grade.item_feedback or [],
            )
            _save_teacher_grade(
                submission=submission,
                grade_input=grade_input,
                submission_uuid=grade.submission_uuid,
                current_user=current_user,
                db_session=db_session,
            )
            results.append(
                BatchGradeResultItem(
                    submission_uuid=grade.submission_uuid,
                    success=True,
                )
            )
            succeeded += 1
        except HTTPException as exc:
            db_session.rollback()
            results.append(
                BatchGradeResultItem(
                    submission_uuid=grade.submission_uuid,
                    success=False,
                    error=_stringify_http_exception_detail(exc.detail),
                )
            )
            failed += 1
        except Exception as exc:
            db_session.rollback()
            logger.exception(
                "Unexpected batch grading failure for submission %s",
                grade.submission_uuid,
            )
            results.append(
                BatchGradeResultItem(
                    submission_uuid=grade.submission_uuid,
                    success=False,
                    error=str(exc),
                )
            )
            failed += 1

    return BatchGradeResponse(results=results, succeeded=succeeded, failed=failed)


def _save_teacher_grade(
    *,
    submission: Submission,
    grade_input: TeacherGradeInput,
    submission_uuid: str,
    current_user: PublicUser,
    db_session: Session,
    expected_version: int | None = None,
) -> SubmissionRead:
    """Persist a teacher-entered grade after the caller has validated access.

    Atomicity guarantee: the submission update, ActivityProgress, and
    CourseProgress are all flushed inside a single ``db_session.commit()``.
    If any step raises, the whole operation rolls back.

    Optimistic locking: if ``expected_version`` is supplied and does not match
    ``submission.version``, raises 412 Precondition Failed so the caller knows
    a concurrent edit already landed.
    """

    # ── Optimistic lock check ─────────────────────────────────────────────────
    if expected_version is not None and submission.version != expected_version:
        raise HTTPException(
            status_code=status.HTTP_412_PRECONDITION_FAILED,
            detail=(
                f"Submission was modified concurrently (version {submission.version}). "
                "Refresh and retry."
            ),
        )

    # ── State machine validation ──────────────────────────────────────────────
    requested_status = SubmissionStatus(grade_input.status)
    current_status = submission.status

    if requested_status != current_status:
        allowed = _ALLOWED_TEACHER_TRANSITIONS.get(current_status, frozenset())
        if requested_status not in allowed:
            logger.warning(
                "Invalid teacher grade transition from %s to %s for submission %s",
                current_status,
                requested_status,
                submission_uuid,
            )
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=(
                    f"Cannot transition from {current_status} to {requested_status}. "
                    f"Allowed transitions: {[s.value for s in allowed]}"
                ),
            )

    # ── Merge item feedback into grading breakdown ────────────────────────────
    existing = build_effective_grading_breakdown(submission, db_session)
    item_map = {item.item_id: item for item in existing.items}

    for fb in grade_input.item_feedback:
        if not isinstance(fb, ItemFeedback):
            fb = ItemFeedback(**fb) if isinstance(fb, dict) else fb
        if fb.item_id in item_map:
            update: dict = {}
            if fb.score is not None:
                update["score"] = fb.score
                update["needs_manual_review"] = False
            if fb.feedback:
                update["feedback"] = fb.feedback
            if update:
                item_map[fb.item_id] = item_map[fb.item_id].model_copy(update=update)
        else:
            item_map[fb.item_id] = GradedItem(
                item_id=fb.item_id,
                score=fb.score or 0.0,
                max_score=0.0,
                feedback=fb.feedback,
            )

    still_needs_review = any(
        item.needs_manual_review and not item.feedback for item in item_map.values()
    )
    updated_grading = GradingBreakdown(
        items=list(item_map.values()),
        needs_manual_review=still_needs_review,
        auto_graded=existing.auto_graded,
        feedback=grade_input.feedback,
    )

    # ── Apply all writes and commit atomically ────────────────────────────────
    now = datetime.now(UTC)
    raw_score = float(grade_input.final_score)
    penalty_pct = float(submission.late_penalty_pct or 0)
    final_score = round(raw_score * (1 - min(100.0, max(0.0, penalty_pct)) / 100), 2)

    submission.final_score = final_score
    submission.status = requested_status
    submission.grading_json = updated_grading.model_dump()
    submission.graded_at = now
    submission.updated_at = now
    submission.version += 1  # bump optimistic lock version

    # Ensure the assessment policy is attached before progress recalculation.
    _attach_policy(submission, db_session)
    db_session.add(submission)
    if submission.id is not None:
        db_session.add(
            GradingEntry(
                entry_uuid=f"entry_{ULID()}",
                submission_id=submission.id,
                graded_by=current_user.id,
                raw_score=raw_score,
                penalty_pct=penalty_pct,
                final_score=final_score,
                breakdown=updated_grading.model_dump(),
                overall_feedback=grade_input.feedback,
                grading_version=submission.grading_version,
                created_at=now,
                published_at=(
                    now if requested_status == SubmissionStatus.PUBLISHED else None
                ),
            )
        )

    # Recalculate ActivityProgress + CourseProgress in the same transaction.
    recalculate_activity_progress(
        submission.activity_id,
        submission.user_id,
        db_session,
        commit=False,  # we commit below — all three tables in one transaction
    )

    db_session.commit()
    db_session.refresh(submission)

    # ── Post-commit side-effects (non-critical, separate transactions) ────────
    # XP is awarded after the main commit so a gamification failure never rolls
    # back a grade. The idempotency key prevents double-awarding on re-publish.
    if (
        current_status != SubmissionStatus.PUBLISHED
        and requested_status == SubmissionStatus.PUBLISHED
        and final_score >= 50.0
    ):
        _award_xp_on_publish(
            user_id=submission.user_id,
            assessment_type=submission.assessment_type,
            submission_uuid=submission_uuid,
            db_session=db_session,
        )

    if requested_status == SubmissionStatus.PUBLISHED:
        publish_grading_event(
            "grade.published",
            submission_uuid,
            {
                "submission_uuid": submission_uuid,
                "final_score": final_score,
                "published_at": now.isoformat(),
            },
        )
    elif requested_status == SubmissionStatus.RETURNED:
        publish_grading_event(
            "submission.returned",
            submission_uuid,
            {
                "submission_uuid": submission_uuid,
                "feedback": grade_input.feedback,
                "returned_at": now.isoformat(),
            },
        )

    return SubmissionRead.model_validate(submission)


async def bulk_publish_grades(
    activity_id: int,
    current_user: PublicUser,
    db_session: Session,
) -> BulkPublishGradesResponse:
    """Publish all graded submissions for an activity at once (BATCH release mode).

    For each PUBLISHED submission that does not yet have a GradingEntry row with
    published_at set, a new immutable GradingEntry is inserted with published_at
    stamped to now.  This makes the grade visible on the student-facing endpoint.

    Returns counts of how many grades were published vs already visible.
    """
    activity = db_session.exec(
        select(Activity).where(Activity.id == activity_id)
    ).first()
    if not activity:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Activity not found"
        )

    checker = PermissionChecker(db_session)
    checker.require(
        current_user.id, "assignment:grade", resource_owner_id=activity.creator_id
    )

    # All graded submissions for this activity
    submissions = db_session.exec(
        select(Submission).where(
            Submission.activity_id == activity_id,
            Submission.status.in_([
                SubmissionStatus.GRADED,
                SubmissionStatus.PUBLISHED,
            ]),
            Submission.id.is_not(None),
        )
    ).all()

    if not submissions:
        return BulkPublishGradesResponse(
            activity_id=activity_id,
            published_count=0,
            already_published_count=0,
        )

    # Which submission IDs already have a published GradingEntry?
    submission_ids = [s.id for s in submissions if s.id is not None]
    already_published_ids: set[int] = set(
        db_session.exec(
            select(GradingEntry.submission_id).where(
                GradingEntry.submission_id.in_(submission_ids),
                GradingEntry.published_at.is_not(None),
            )
        ).all()
    )

    now = datetime.now(UTC)
    published_count = 0
    for submission in submissions:
        if submission.id in already_published_ids:
            continue

        latest_entry = db_session.exec(
            select(GradingEntry)
            .where(GradingEntry.submission_id == submission.id)
            .order_by(desc(GradingEntry.created_at), desc(GradingEntry.id))
        ).first()

        entry = GradingEntry(
            entry_uuid=f"entry_{ULID()}",
            submission_id=submission.id,
            graded_by=current_user.id,
            raw_score=float(
                latest_entry.raw_score
                if latest_entry is not None
                else submission.final_score or submission.auto_score or 0
            ),
            penalty_pct=float(
                latest_entry.penalty_pct
                if latest_entry is not None
                else submission.late_penalty_pct or 0
            ),
            final_score=float(
                latest_entry.final_score
                if latest_entry is not None
                else submission.final_score or submission.auto_score or 0
            ),
            breakdown=(
                latest_entry.breakdown
                if latest_entry is not None
                else submission.grading_json
                if isinstance(submission.grading_json, dict)
                else {}
            ),
            overall_feedback=(
                latest_entry.overall_feedback
                if latest_entry is not None
                else submission.grading_json.get("feedback", "")
                if isinstance(submission.grading_json, dict)
                else ""
            ),
            grading_version=submission.grading_version,
            created_at=now,
            published_at=now,
        )
        db_session.add(entry)
        submission.status = SubmissionStatus.PUBLISHED
        submission.final_score = entry.final_score
        submission.updated_at = now
        db_session.add(submission)
        recalculate_activity_progress(
            submission.activity_id,
            submission.user_id,
            db_session,
            commit=False,
        )
        published_count += 1

    if published_count:
        db_session.commit()
        for submission in submissions:
            if submission.id in already_published_ids:
                continue
            publish_grading_event(
                "grade.published",
                submission.submission_uuid,
                {
                    "submission_uuid": submission.submission_uuid,
                    "final_score": submission.final_score,
                    "published_at": now.isoformat(),
                },
            )

    return BulkPublishGradesResponse(
        activity_id=activity_id,
        published_count=published_count,
        already_published_count=len(already_published_ids),
    )


def _get_submission_with_activity(
    submission_uuid: str,
    db_session: Session,
) -> tuple[Submission, Activity]:
    row = db_session.exec(
        select(Submission, Activity)
        .join(Activity, Activity.id == Submission.activity_id)
        .where(Submission.submission_uuid == submission_uuid)
    ).first()
    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Submission not found",
        )
    return row


def _stringify_http_exception_detail(detail: object) -> str:
    if isinstance(detail, dict):
        message = detail.get("message")
        if isinstance(message, str) and message:
            return message
        return str(detail)
    if isinstance(detail, list):
        return "; ".join(str(item) for item in detail)
    return str(detail)


# ── Helpers ───────────────────────────────────────────────────────────────────


def _batch_fetch_users(user_ids: set[int], db_session: Session) -> dict[int, User]:
    if not user_ids:
        return {}
    rows = db_session.exec(select(User).where(User.id.in_(user_ids))).all()
    return {u.id: u for u in rows}


def _make_submission_user(u: User) -> SubmissionUser:
    return SubmissionUser(
        id=u.id,
        username=u.username,
        first_name=u.first_name or None,
        last_name=u.last_name or None,
        middle_name=u.middle_name or None,
        email=str(u.email),
        avatar_image=u.avatar_image or None,
        user_uuid=u.user_uuid or None,
    )


def _enrich(s: Submission, users_by_id: dict[int, User]) -> SubmissionRead:
    base = SubmissionRead.model_validate(s)
    user = users_by_id.get(s.user_id)
    if user:
        base.user = _make_submission_user(user)
    return base


def _award_xp_on_publish(
    user_id: int,
    assessment_type: AssessmentType,
    submission_uuid: str,
    db_session: Session,
) -> None:
    """Award XP when a grade is published and the student passed.

    Errors are logged and swallowed so a gamification failure never prevents
    a grade from being published.  The idempotency key prevents double-awarding
    if a grade is recalled and re-published.
    """
    xp_source = _XP_SOURCE_ON_PUBLISH.get(assessment_type)
    if not xp_source:
        return
    try:
        _gamification_award_xp(
            db=db_session,
            user_id=user_id,
            source=xp_source.value,
            source_id=submission_uuid,
            idempotency_key=f"submission_{submission_uuid}",
        )
        db_session.commit()
    except Exception as e:  # noqa: BLE001
        logger.warning("Failed to award XP for submission %s: %s", submission_uuid, e)
        db_session.rollback()
