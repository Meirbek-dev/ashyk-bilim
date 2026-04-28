"""
Submission state-machine service.

Owns the explicit student-facing state transitions:

  NOT_STARTED   → DRAFT    (start_submission_v2 — server-stamps started_at)
  DRAFT         → PENDING  (submit, via submit.py)
  DRAFT         → GRADED   (auto-graded quiz/exam, via submit.py)
  RETURNED      → DRAFT    (create_resubmission_draft — new attempt row)

max_attempts is read from AssessmentPolicy (the canonical DB source), NOT from
block content (AssessmentSettings).  This prevents students from bypassing the
limit by submitting through endpoints that only check block-level settings.
"""

from datetime import UTC, datetime

from fastapi import HTTPException, status
from sqlmodel import Session, select
from ulid import ULID

from src.db.courses.activities import Activity
from src.db.grading.progress import AssessmentPolicy
from src.db.grading.submissions import (
    AssessmentType,
    Submission,
    SubmissionRead,
    SubmissionStatus,
)
from src.db.users import PublicUser
from src.security.rbac import PermissionChecker
from src.services.progress import submissions as progress_submissions

# ── Valid student-facing transitions ─────────────────────────────────────────
# Kept narrow on purpose: the teacher-side transitions live in teacher.py.

_SUBMIT_PERMISSION: dict[AssessmentType, str] = {
    AssessmentType.QUIZ: "quiz:submit",
    AssessmentType.EXAM: "exam:submit",
    AssessmentType.ASSIGNMENT: "assignment:submit",
    AssessmentType.CODE_CHALLENGE: "assignment:submit",
}


# ── Public API ────────────────────────────────────────────────────────────────


def start_submission_v2(
    activity_id: int,
    assessment_type: AssessmentType,
    current_user: PublicUser,
    db_session: Session,
) -> SubmissionRead:
    """
    Create a DRAFT Submission and record the server-stamped start time.

    Idempotent — returns the existing DRAFT if one is already open for this
    user/activity pair.

    max_attempts is enforced from AssessmentPolicy (canonical DB source).
    Raises 403 if the student has already exhausted their attempts.
    Raises 404 if the activity does not exist.
    """
    activity = _get_activity_or_404(activity_id, db_session)
    _require_permission(current_user, activity, assessment_type, db_session)

    # Return the open DRAFT if one already exists (idempotent)
    existing_draft = db_session.exec(
        select(Submission).where(
            Submission.activity_id == activity_id,
            Submission.user_id == current_user.id,
            Submission.status == SubmissionStatus.DRAFT,
        )
    ).first()

    if existing_draft:
        progress_submissions.start_activity_submission(existing_draft, db_session)
        return SubmissionRead.model_validate(existing_draft)

    # Enforce max_attempts from AssessmentPolicy before creating a new DRAFT.
    _enforce_attempt_limit_from_policy(activity_id, current_user.id, db_session)

    attempt_number = _count_previous_attempts(activity_id, current_user.id, db_session) + 1
    now = datetime.now(UTC)

    submission = Submission(
        submission_uuid=f"submission_{ULID()}",
        assessment_type=assessment_type,
        activity_id=activity_id,
        user_id=current_user.id,
        status=SubmissionStatus.DRAFT,
        attempt_number=attempt_number,
        answers_json={},
        grading_json={},
        started_at=now,
        created_at=now,
        updated_at=now,
    )
    db_session.add(submission)
    db_session.commit()
    db_session.refresh(submission)
    progress_submissions.start_activity_submission(submission, db_session)
    return SubmissionRead.model_validate(submission)


def create_resubmission_draft(
    submission_uuid: str,
    current_user: PublicUser,
    db_session: Session,
) -> SubmissionRead:
    """
    Create a new DRAFT from a RETURNED submission (resubmission flow).

    The original RETURNED submission is left intact.  A new Submission row is
    inserted with attempt_number = previous_attempt + 1 and status = DRAFT.

    Raises 404 if the submission does not exist or is not owned by the caller.
    Raises 422 if the submission is not in RETURNED state.
    Raises 403 if the student has exhausted max_attempts.
    """
    original = _get_own_submission_or_404(submission_uuid, current_user.id, db_session)

    if original.status != SubmissionStatus.RETURNED:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                f"Only RETURNED submissions can be resubmitted "
                f"(current status: {original.status})"
            ),
        )

    activity = _get_activity_or_404(original.activity_id, db_session)
    _require_permission(
        current_user, activity, original.assessment_type, db_session
    )

    # max_attempts includes the attempt that was just RETURNED
    _enforce_attempt_limit_from_policy(original.activity_id, current_user.id, db_session)

    now = datetime.now(UTC)
    next_attempt = _count_previous_attempts(
        original.activity_id, current_user.id, db_session
    ) + 1

    draft = Submission(
        submission_uuid=f"submission_{ULID()}",
        assessment_type=original.assessment_type,
        activity_id=original.activity_id,
        user_id=current_user.id,
        status=SubmissionStatus.DRAFT,
        attempt_number=next_attempt,
        answers_json={},
        grading_json={},
        started_at=now,
        created_at=now,
        updated_at=now,
    )
    db_session.add(draft)
    db_session.commit()
    db_session.refresh(draft)
    progress_submissions.start_activity_submission(draft, db_session)
    return SubmissionRead.model_validate(draft)


# ── Private helpers ───────────────────────────────────────────────────────────


def _get_activity_or_404(activity_id: int, db_session: Session) -> Activity:
    activity = db_session.exec(
        select(Activity).where(Activity.id == activity_id)
    ).first()
    if not activity:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Activity not found",
        )
    return activity


def _get_own_submission_or_404(
    submission_uuid: str, user_id: int, db_session: Session
) -> Submission:
    submission = db_session.exec(
        select(Submission).where(
            Submission.submission_uuid == submission_uuid,
            Submission.user_id == user_id,
        )
    ).first()
    if not submission:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Submission not found",
        )
    return submission


def _require_permission(
    current_user: PublicUser,
    activity: Activity,
    assessment_type: AssessmentType,
    db_session: Session,
) -> None:
    permission = _SUBMIT_PERMISSION.get(assessment_type, "quiz:submit")
    checker = PermissionChecker(db_session)
    checker.require(
        current_user.id,
        permission,
        resource_owner_id=activity.creator_id,
        is_assigned=True,
    )


def _count_previous_attempts(
    activity_id: int, user_id: int, db_session: Session
) -> int:
    """Count all non-DRAFT submissions as prior attempts."""
    return len(
        db_session.exec(
            select(Submission).where(
                Submission.activity_id == activity_id,
                Submission.user_id == user_id,
                Submission.status != SubmissionStatus.DRAFT,
            )
        ).all()
    )


def _enforce_attempt_limit_from_policy(
    activity_id: int,
    user_id: int,
    db_session: Session,
) -> None:
    """
    Enforce max_attempts from AssessmentPolicy.

    Unlike the block-content-based check in submit.py, this reads from the
    canonical AssessmentPolicy row so limits are consistent regardless of which
    submit endpoint the student uses.
    """
    policy = db_session.exec(
        select(AssessmentPolicy).where(AssessmentPolicy.activity_id == activity_id)
    ).first()

    if policy is None or policy.max_attempts is None:
        return  # no policy or unlimited attempts

    completed_count = _count_previous_attempts(activity_id, user_id, db_session)
    if completed_count >= policy.max_attempts:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Maximum attempts ({policy.max_attempts}) reached",
        )
