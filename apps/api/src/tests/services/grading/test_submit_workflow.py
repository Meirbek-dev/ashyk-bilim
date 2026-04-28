"""
Integration tests for the submission state-machine workflow.

Covers:
  start_submission_v2   — DRAFT creation, idempotency, max_attempts enforcement
  create_resubmission_draft — RETURNED → new DRAFT, state guard, max_attempts
"""

from __future__ import annotations

from datetime import UTC, datetime
from unittest.mock import patch

import pytest
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine, select

from src.db.courses.activities import (
    Activity,
    ActivitySubTypeEnum,
    ActivityTypeEnum,
)
from src.db.courses.chapters import Chapter
from src.db.courses.courses import Course
from src.db.grading.progress import (
    AssessmentCompletionRule,
    AssessmentGradingMode,
    AssessmentPolicy,
)
from src.db.grading.submissions import AssessmentType, Submission, SubmissionStatus
from src.db.model_registry import import_orm_models
from src.db.users import PublicUser
from src.services.grading.submission import (
    create_resubmission_draft,
    start_submission_v2,
)


# ── Fixtures ──────────────────────────────────────────────────────────────────


@pytest.fixture()
def db_session() -> Session:
    import_orm_models()
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        yield session


@pytest.fixture()
def student() -> PublicUser:
    return PublicUser(
        id=10,
        user_uuid="user_10",
        username="student",
        first_name="Student",
        middle_name="",
        last_name="One",
        email="student@example.com",
        avatar_image="",
        bio="",
        details={},
        profile={},
        theme="default",
        locale="en-US",
    )


def _seed_activity(db_session: Session) -> Activity:
    """Insert the minimal Course → Chapter → Activity chain."""
    course = Course(
        id=1,
        name="Test Course",
        description="",
        about="",
        learnings="",
        tags="",
        thumbnail_image="",
        public=True,
        open_to_contributors=False,
        course_uuid="course_test",
        creator_id=99,
    )
    db_session.add(course)
    db_session.flush()

    chapter = Chapter(id=1, name="Ch1", course_id=course.id, order=1)
    db_session.add(chapter)
    db_session.flush()

    activity = Activity(
        id=1,
        name="Test Assignment",
        activity_type=ActivityTypeEnum.TYPE_ASSIGNMENT,
        activity_sub_type=ActivitySubTypeEnum.SUBTYPE_DOCUMENT_DOC,
        course_id=course.id,
        chapter_id=chapter.id,
        order=1,
        published=True,
        creator_id=99,
    )
    db_session.add(activity)
    db_session.flush()
    return activity


def _seed_policy(
    db_session: Session,
    activity: Activity,
    *,
    max_attempts: int | None = None,
) -> AssessmentPolicy:
    """Insert an AssessmentPolicy for the activity."""
    policy = AssessmentPolicy(
        policy_uuid=f"policy_{activity.id}",
        activity_id=activity.id,
        assessment_type=AssessmentType.ASSIGNMENT,
        grading_mode=AssessmentGradingMode.MANUAL,
        completion_rule=AssessmentCompletionRule.GRADED,
        passing_score=60.0,
        max_attempts=max_attempts,
        settings_json={},
    )
    db_session.add(policy)
    db_session.flush()
    return policy


def _make_non_draft(
    db_session: Session,
    activity_id: int,
    user_id: int,
    status: SubmissionStatus = SubmissionStatus.GRADED,
    attempt_number: int = 1,
) -> Submission:
    """Insert a non-DRAFT submission row (counts as a used attempt)."""
    now = datetime.now(UTC)
    submission = Submission(
        submission_uuid=f"submission_attempt_{attempt_number}",
        assessment_type=AssessmentType.ASSIGNMENT,
        activity_id=activity_id,
        user_id=user_id,
        status=status,
        attempt_number=attempt_number,
        answers_json={},
        grading_json={},
        started_at=now,
        submitted_at=now,
        created_at=now,
        updated_at=now,
    )
    db_session.add(submission)
    db_session.flush()
    return submission


# ── start_submission_v2 ───────────────────────────────────────────────────────


class TestStartSubmissionV2:
    def test_creates_draft_on_first_attempt(
        self, db_session: Session, student: PublicUser
    ) -> None:
        activity = _seed_activity(db_session)
        _seed_policy(db_session, activity, max_attempts=3)

        with patch("src.services.grading.submission.PermissionChecker") as mock_pc:
            mock_pc.return_value.require.return_value = None
            result = start_submission_v2(
                activity_id=activity.id,
                assessment_type=AssessmentType.ASSIGNMENT,
                current_user=student,
                db_session=db_session,
            )

        assert result.status == SubmissionStatus.DRAFT
        assert result.attempt_number == 1
        assert result.user_id == student.id
        assert result.activity_id == activity.id
        assert result.started_at is not None

    def test_idempotent_returns_existing_draft(
        self, db_session: Session, student: PublicUser
    ) -> None:
        activity = _seed_activity(db_session)
        _seed_policy(db_session, activity, max_attempts=5)

        with patch("src.services.grading.submission.PermissionChecker") as mock_pc:
            mock_pc.return_value.require.return_value = None

            result1 = start_submission_v2(
                activity_id=activity.id,
                assessment_type=AssessmentType.ASSIGNMENT,
                current_user=student,
                db_session=db_session,
            )
            result2 = start_submission_v2(
                activity_id=activity.id,
                assessment_type=AssessmentType.ASSIGNMENT,
                current_user=student,
                db_session=db_session,
            )

        # Same UUID — no second DRAFT created
        assert result1.submission_uuid == result2.submission_uuid
        drafts = db_session.exec(
            select(Submission).where(
                Submission.activity_id == activity.id,
                Submission.user_id == student.id,
                Submission.status == SubmissionStatus.DRAFT,
            )
        ).all()
        assert len(drafts) == 1

    def test_attempt_number_increments_after_previous_submissions(
        self, db_session: Session, student: PublicUser
    ) -> None:
        activity = _seed_activity(db_session)
        _seed_policy(db_session, activity, max_attempts=5)
        _make_non_draft(db_session, activity.id, student.id, attempt_number=1)

        with patch("src.services.grading.submission.PermissionChecker") as mock_pc:
            mock_pc.return_value.require.return_value = None
            result = start_submission_v2(
                activity_id=activity.id,
                assessment_type=AssessmentType.ASSIGNMENT,
                current_user=student,
                db_session=db_session,
            )

        assert result.attempt_number == 2

    def test_raises_403_when_max_attempts_reached(
        self, db_session: Session, student: PublicUser
    ) -> None:
        from fastapi import HTTPException

        activity = _seed_activity(db_session)
        _seed_policy(db_session, activity, max_attempts=2)
        _make_non_draft(db_session, activity.id, student.id, attempt_number=1)
        _make_non_draft(db_session, activity.id, student.id, attempt_number=2)

        with patch("src.services.grading.submission.PermissionChecker") as mock_pc:
            mock_pc.return_value.require.return_value = None
            with pytest.raises(HTTPException) as exc_info:
                start_submission_v2(
                    activity_id=activity.id,
                    assessment_type=AssessmentType.ASSIGNMENT,
                    current_user=student,
                    db_session=db_session,
                )

        assert exc_info.value.status_code == 403
        assert "Maximum attempts" in str(exc_info.value.detail)

    def test_no_limit_when_policy_has_no_max_attempts(
        self, db_session: Session, student: PublicUser
    ) -> None:
        activity = _seed_activity(db_session)
        _seed_policy(db_session, activity, max_attempts=None)
        # Seed 5 previous attempts — should still be allowed
        for i in range(1, 6):
            _make_non_draft(db_session, activity.id, student.id, attempt_number=i)

        with patch("src.services.grading.submission.PermissionChecker") as mock_pc:
            mock_pc.return_value.require.return_value = None
            result = start_submission_v2(
                activity_id=activity.id,
                assessment_type=AssessmentType.ASSIGNMENT,
                current_user=student,
                db_session=db_session,
            )

        assert result.status == SubmissionStatus.DRAFT
        assert result.attempt_number == 6

    def test_no_limit_when_no_policy_exists(
        self, db_session: Session, student: PublicUser
    ) -> None:
        activity = _seed_activity(db_session)
        # No policy inserted

        with patch("src.services.grading.submission.PermissionChecker") as mock_pc:
            mock_pc.return_value.require.return_value = None
            result = start_submission_v2(
                activity_id=activity.id,
                assessment_type=AssessmentType.ASSIGNMENT,
                current_user=student,
                db_session=db_session,
            )

        assert result.status == SubmissionStatus.DRAFT

    def test_raises_404_for_unknown_activity(
        self, db_session: Session, student: PublicUser
    ) -> None:
        from fastapi import HTTPException

        import_orm_models()  # ensure tables exist even with no data

        with patch("src.services.grading.submission.PermissionChecker") as mock_pc:
            mock_pc.return_value.require.return_value = None
            with pytest.raises(HTTPException) as exc_info:
                start_submission_v2(
                    activity_id=9999,
                    assessment_type=AssessmentType.ASSIGNMENT,
                    current_user=student,
                    db_session=db_session,
                )

        assert exc_info.value.status_code == 404


# ── create_resubmission_draft ─────────────────────────────────────────────────


class TestCreateResubmissionDraft:
    def test_creates_new_draft_from_returned(
        self, db_session: Session, student: PublicUser
    ) -> None:
        activity = _seed_activity(db_session)
        _seed_policy(db_session, activity, max_attempts=3)
        returned = _make_non_draft(
            db_session,
            activity.id,
            student.id,
            status=SubmissionStatus.RETURNED,
            attempt_number=1,
        )

        with patch("src.services.grading.submission.PermissionChecker") as mock_pc:
            mock_pc.return_value.require.return_value = None
            result = create_resubmission_draft(
                submission_uuid=returned.submission_uuid,
                current_user=student,
                db_session=db_session,
            )

        assert result.status == SubmissionStatus.DRAFT
        assert result.attempt_number == 2
        assert result.activity_id == activity.id
        assert result.user_id == student.id
        # Original RETURNED submission must still be intact
        original = db_session.get(Submission, returned.id)
        assert original is not None
        assert original.status == SubmissionStatus.RETURNED

    def test_raises_422_when_not_returned(
        self, db_session: Session, student: PublicUser
    ) -> None:
        from fastapi import HTTPException

        activity = _seed_activity(db_session)
        _seed_policy(db_session, activity)
        pending = _make_non_draft(
            db_session,
            activity.id,
            student.id,
            status=SubmissionStatus.PENDING,
            attempt_number=1,
        )

        with patch("src.services.grading.submission.PermissionChecker") as mock_pc:
            mock_pc.return_value.require.return_value = None
            with pytest.raises(HTTPException) as exc_info:
                create_resubmission_draft(
                    submission_uuid=pending.submission_uuid,
                    current_user=student,
                    db_session=db_session,
                )

        assert exc_info.value.status_code == 422

    def test_raises_404_for_another_users_submission(
        self, db_session: Session, student: PublicUser
    ) -> None:
        from fastapi import HTTPException

        activity = _seed_activity(db_session)
        _seed_policy(db_session, activity)
        other_user_submission = _make_non_draft(
            db_session,
            activity.id,
            user_id=99,  # different user
            status=SubmissionStatus.RETURNED,
            attempt_number=1,
        )

        with pytest.raises(HTTPException) as exc_info:
            create_resubmission_draft(
                submission_uuid=other_user_submission.submission_uuid,
                current_user=student,  # student.id == 10, not 99
                db_session=db_session,
            )

        assert exc_info.value.status_code == 404

    def test_raises_403_when_max_attempts_reached(
        self, db_session: Session, student: PublicUser
    ) -> None:
        from fastapi import HTTPException

        activity = _seed_activity(db_session)
        _seed_policy(db_session, activity, max_attempts=2)
        # 2 non-DRAFT submissions → already at the limit
        _make_non_draft(
            db_session, activity.id, student.id,
            status=SubmissionStatus.GRADED, attempt_number=1,
        )
        returned = _make_non_draft(
            db_session, activity.id, student.id,
            status=SubmissionStatus.RETURNED, attempt_number=2,
        )

        with patch("src.services.grading.submission.PermissionChecker") as mock_pc:
            mock_pc.return_value.require.return_value = None
            with pytest.raises(HTTPException) as exc_info:
                create_resubmission_draft(
                    submission_uuid=returned.submission_uuid,
                    current_user=student,
                    db_session=db_session,
                )

        assert exc_info.value.status_code == 403

    def test_raises_404_for_unknown_submission_uuid(
        self, db_session: Session, student: PublicUser
    ) -> None:
        from fastapi import HTTPException

        with pytest.raises(HTTPException) as exc_info:
            create_resubmission_draft(
                submission_uuid="submission_nonexistent",
                current_user=student,
                db_session=db_session,
            )

        assert exc_info.value.status_code == 404
