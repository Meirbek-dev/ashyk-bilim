# pyright: reportMissingImports=false, reportUnusedImport=false
"""
Integration tests for the core student submission workflow.

Covers:
  - Starting a submission (DRAFT creation, idempotency)
  - Attempt-limit enforcement (max_attempts from AssessmentPolicy)
  - Submitting answers and receiving a graded result
  - Listing the student's own submissions
  - Fetching a single submission result (grade visibility gating)
  - Resubmitting after a RETURNED submission
"""

import pathlib
import sys
from datetime import UTC, datetime

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlmodel import SQLModel, select

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2]))
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from src.auth.users import get_optional_public_user, get_public_user
from src.db.assessment_access import (
    AssessmentAccessPolicy,
    AssessmentAccessUser,
    AssessmentAccessUserGroup,
)
from src.db.assessments import (
    Assessment,
    AssessmentGradingType,
    AssessmentItem,
    AssessmentLifecycle,
    ItemKind,
)
from src.db.courses.activities import Activity, ActivitySubTypeEnum, ActivityTypeEnum
from src.db.courses.chapters import Chapter
from src.db.courses.courses import Course, ThumbnailType
from src.db.file_submissions import (
    FileSubmissionActivity,
    FileSubmissionAttempt,
    FileSubmissionAttemptFile,
)
from src.db.grading.entries import GradingEntry
from src.db.grading.overrides import StudentPolicyOverride
from src.db.grading.progress import (
    ActivityProgress,
    AssessmentCompletionRule,
    AssessmentGradingMode,
    AssessmentPolicy,
    CourseProgress,
    GradeReleaseMode,
    LatePolicyNone,
)
from src.db.grading.submissions import (
    AssessmentType,
    GradingBreakdown,
    Submission,
    SubmissionStatus,
)
from src.db.uploads import Upload
from src.db.usergroup_user import UserGroupUser
from src.db.usergroups import UserGroup
from src.db.users import PublicUser, User
from src.infra.db.engine import build_engine, build_session_factory
from src.infra.db.session import get_db_session
from src.infra.settings import get_settings
from src.routers.assessments.unified import router as assessments_router
from src.security.rbac import PermissionChecker
from src.services.assessments import core
from src.services.assessments._shared import _snapshot_submission
from src.services.grading import submission as submission_service

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

_ALL_TABLES = [
    User.__table__,
    UserGroup.__table__,
    UserGroupUser.__table__,
    Course.__table__,
    Chapter.__table__,
    Activity.__table__,
    AssessmentPolicy.__table__,
    Assessment.__table__,
    AssessmentAccessPolicy.__table__,
    AssessmentAccessUser.__table__,
    AssessmentAccessUserGroup.__table__,
    AssessmentItem.__table__,
    StudentPolicyOverride.__table__,
    Submission.__table__,
    GradingEntry.__table__,
    ActivityProgress.__table__,
    CourseProgress.__table__,
    Upload.__table__,
    FileSubmissionActivity.__table__,
    FileSubmissionAttempt.__table__,
    FileSubmissionAttemptFile.__table__,
]


@pytest.fixture(name="db_session_factory")
def db_session_factory_fixture():
    engine = build_engine(get_settings())
    SQLModel.metadata.create_all(engine, tables=_ALL_TABLES)
    factory = build_session_factory(engine)
    try:
        yield factory
    finally:
        SQLModel.metadata.drop_all(engine, tables=list(reversed(_ALL_TABLES)))
        engine.dispose()


@pytest.fixture(name="student_user")
def student_user_fixture() -> PublicUser:
    return PublicUser(
        id=2,
        user_uuid="user_student_submit",
        username="student.submit",
        first_name="Student",
        middle_name="",
        last_name="Submit",
        email="student.submit@example.com",
        avatar_image="",
        bio="",
        details={},
        profile={},
        theme="default",
        locale="en-US",
        auth_provider="local",
        is_active=True,
        is_superuser=False,
        is_verified=True,
    )


@pytest.fixture(name="teacher_user")
def teacher_user_fixture() -> PublicUser:
    return PublicUser(
        id=1,
        user_uuid="user_teacher_submit",
        username="teacher.submit",
        first_name="Teacher",
        middle_name="",
        last_name="Submit",
        email="teacher.submit@example.com",
        avatar_image="",
        bio="",
        details={},
        profile={},
        theme="default",
        locale="en-US",
        auth_provider="local",
        is_active=True,
        is_superuser=False,
        is_verified=True,
    )


def _make_app(db_session_factory, current_user: PublicUser, monkeypatch) -> FastAPI:
    """Build a minimal FastAPI app with both router groups and mocked dependencies."""
    app = FastAPI()
    app.include_router(assessments_router, prefix="/assessments")

    def override_get_db_session():
        session = db_session_factory()
        try:
            yield session
        finally:
            session.close()

    app.dependency_overrides[get_db_session] = override_get_db_session
    app.dependency_overrides[get_public_user] = lambda: current_user
    app.dependency_overrides[get_optional_public_user] = lambda: current_user

    # Stub out permission checks — access control is tested separately
    monkeypatch.setattr(core, "_require_submit_access", lambda *_a, **_kw: None)
    monkeypatch.setattr(core, "_has_submit_access", lambda *_a, **_kw: True)
    monkeypatch.setattr(core, "_require_read", lambda *_a, **_kw: None)
    monkeypatch.setattr(core, "_require_author", lambda *_a, **_kw: None)
    monkeypatch.setattr(PermissionChecker, "require", lambda *_a, **_kw: None)
    monkeypatch.setattr(PermissionChecker, "check", lambda *_a, **_kw: True)

    # Stub side-effects that require external services
    monkeypatch.setattr(
        submission_service,
        "_require_permission",
        lambda *_a, **_kw: None,
    )

    return app


def _seed_assessment(
    db_session_factory,
    *,
    max_attempts: int | None = 3,
    lifecycle: AssessmentLifecycle = AssessmentLifecycle.PUBLISHED,
    grading_mode: AssessmentGradingMode = AssessmentGradingMode.AUTO,
    grade_release_mode: GradeReleaseMode = GradeReleaseMode.IMMEDIATE,
) -> tuple[str, int, str]:
    """
    Insert a minimal course/chapter/activity/assessment/policy row set.

    Returns (assessment_uuid, activity_id, activity_uuid).
    """
    with db_session_factory() as session:
        teacher = User(
            id=1,
            user_uuid="user_teacher_submit",
            username="teacher.submit",
            first_name="Teacher",
            middle_name="",
            last_name="Submit",
            email="teacher.submit@example.com",
            hashed_password="hashed",
            is_active=True,
            is_superuser=False,
            is_verified=True,
        )
        student = User(
            id=2,
            user_uuid="user_student_submit",
            username="student.submit",
            first_name="Student",
            middle_name="",
            last_name="Submit",
            email="student.submit@example.com",
            hashed_password="hashed",
            is_active=True,
            is_superuser=False,
            is_verified=True,
        )
        session.add_all([teacher, student])
        session.flush()

        course = Course(
            name="Submit Course",
            description="",
            about="",
            learnings=None,
            tags=None,
            thumbnail_type=ThumbnailType.IMAGE,
            thumbnail_image="",
            thumbnail_video="",
            public=True,
            open_to_contributors=False,
            creator_id=teacher.id,
            course_uuid="course_submit",
        )
        session.add(course)
        session.flush()

        chapter = Chapter(
            name="Week 1",
            description="",
            thumbnail_image="",
            course_id=course.id,
            chapter_uuid="chapter_submit",
            creator_id=teacher.id,
            order=1,
        )
        session.add(chapter)
        session.flush()

        activity = Activity(
            name="Submit Assessment",
            activity_type=ActivityTypeEnum.TYPE_FILE_SUBMISSION,
            activity_sub_type=ActivitySubTypeEnum.SUBTYPE_FILE_SUBMISSION_STANDARD,
            content={},
            details={},
            settings={},
            published=(lifecycle == AssessmentLifecycle.PUBLISHED),
            chapter_id=chapter.id,
            course_id=course.id,
            creator_id=teacher.id,
            activity_uuid="activity_submit",
            order=1,
        )
        session.add(activity)
        session.flush()

        policy = AssessmentPolicy(
            policy_uuid="policy_submit",
            activity_id=activity.id,
            assessment_type=AssessmentType.EXAM,
            grading_mode=grading_mode,
            grade_release_mode=grade_release_mode,
            completion_rule=AssessmentCompletionRule.GRADED,
            passing_score=60.0,
            max_attempts=max_attempts,
            time_limit_seconds=None,
            due_at=None,
            allow_late=True,
            late_policy_json=LatePolicyNone().model_dump(mode="json"),
            anti_cheat_json={},
            settings_json={},
        )
        session.add(policy)
        session.flush()

        assessment = Assessment(
            assessment_uuid="assessment_submit",
            activity_id=activity.id,
            kind=AssessmentType.EXAM,
            title="Submit Assessment",
            description="",
            lifecycle=lifecycle,
            scheduled_at=None,
            published_at=(datetime.now(UTC) if lifecycle == AssessmentLifecycle.PUBLISHED else None),
            archived_at=None,
            weight=1.0,
            grading_type=AssessmentGradingType.PERCENTAGE,
            policy_id=policy.id,
        )
        session.add(assessment)
        session.flush()

        item = AssessmentItem(
            item_uuid="item_submit_1",
            assessment_id=assessment.id,
            order=1,
            kind=ItemKind.OPEN_TEXT,
            title="Describe your approach",
            body_json={"kind": "OPEN_TEXT", "prompt": "Describe your approach."},
            max_score=100,
        )
        session.add(item)
        session.commit()
        session.refresh(activity)
        assert activity.id is not None
        return assessment.assessment_uuid, activity.id, activity.activity_uuid


# ---------------------------------------------------------------------------
# Tests: start submission
# ---------------------------------------------------------------------------


def test_start_submission_creates_draft(db_session_factory, student_user, monkeypatch) -> None:
    """POST /assessments/{uuid}/start creates a DRAFT submission."""
    assessment_uuid, activity_id, _ = _seed_assessment(db_session_factory)
    app = _make_app(db_session_factory, student_user, monkeypatch)
    client = TestClient(app)

    response = client.post(f"/assessments/{assessment_uuid}/start")

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "DRAFT"
    assert payload["user_id"] == student_user.id
    assert payload["activity_id"] == activity_id
    assert payload["attempt_number"] == 1
    assert payload["started_at"] is not None


def test_start_submission_is_idempotent(db_session_factory, student_user, monkeypatch) -> None:
    """Calling start twice returns the same DRAFT (no duplicate row)."""
    assessment_uuid, _, _ = _seed_assessment(db_session_factory)
    app = _make_app(db_session_factory, student_user, monkeypatch)
    client = TestClient(app)

    first = client.post(f"/assessments/{assessment_uuid}/start")
    second = client.post(f"/assessments/{assessment_uuid}/start")

    assert first.status_code == 200
    assert second.status_code == 200
    assert first.json()["submission_uuid"] == second.json()["submission_uuid"]

    with db_session_factory() as session:
        count = len(
            session.exec(
                select(Submission).where(
                    Submission.user_id == student_user.id,
                    Submission.status == SubmissionStatus.DRAFT,
                )
            ).all()
        )
    assert count == 1


def test_start_blocked_when_assessment_not_published(db_session_factory, student_user, monkeypatch) -> None:
    """Students cannot start an assessment that is still in DRAFT lifecycle."""
    assessment_uuid, _, _ = _seed_assessment(db_session_factory, lifecycle=AssessmentLifecycle.DRAFT)
    app = _make_app(db_session_factory, student_user, monkeypatch)
    client = TestClient(app)

    response = client.post(f"/assessments/{assessment_uuid}/start")

    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "NOT_PUBLISHED"


def test_start_blocked_when_max_attempts_exhausted(db_session_factory, student_user, monkeypatch) -> None:
    """Starting a submission is blocked once max_attempts is exhausted."""
    assessment_uuid, activity_id, _ = _seed_assessment(db_session_factory, max_attempts=1)
    # Pre-seed an already-submitted attempt for this student
    with db_session_factory() as session:
        now = datetime.now(UTC)
        session.add(
            Submission(
                submission_uuid="submission_exhausted_1",
                assessment_type=AssessmentType.EXAM,
                activity_id=activity_id,
                user_id=student_user.id,
                status=SubmissionStatus.GRADED,
                attempt_number=1,
                answers_json={},
                grading_json={},
                started_at=now,
                submitted_at=now,
                graded_at=now,
            )
        )
        session.commit()

    app = _make_app(db_session_factory, student_user, monkeypatch)
    client = TestClient(app)

    response = client.post(f"/assessments/{assessment_uuid}/start")

    assert response.status_code == 403
    detail = response.json()["detail"]
    assert "attempt" in str(detail).lower() or "max" in str(detail).lower()


def test_snapshot_submission_stores_items_as_dict(db_session_factory, student_user) -> None:
    """Submitting snapshots must match the Submission.items_snapshot dict type."""
    assessment_uuid, activity_id, _ = _seed_assessment(db_session_factory)
    now = datetime.now(UTC)

    with db_session_factory() as session:
        assessment = session.exec(select(Assessment).where(Assessment.assessment_uuid == assessment_uuid)).one()
        submission = Submission(
            submission_uuid="submission_snapshot_shape",
            assessment_type=AssessmentType.EXAM,
            activity_id=activity_id,
            user_id=student_user.id,
            status=SubmissionStatus.GRADED,
            attempt_number=1,
            answers_json={},
            grading_json={},
            started_at=now,
            submitted_at=now,
            graded_at=now,
        )
        session.add(submission)
        session.commit()
        session.refresh(submission)

        _snapshot_submission(submission, assessment, session)
        session.refresh(submission)

        assert isinstance(submission.items_snapshot, dict)
        assert submission.items_snapshot["items"][0]["item_uuid"] == "item_submit_1"


# ---------------------------------------------------------------------------
# Tests: view student's own submissions
# ---------------------------------------------------------------------------


def test_get_my_submissions_returns_own_submissions(db_session_factory, student_user, monkeypatch) -> None:
    """GET /assessments/{uuid}/me returns only the calling student's submissions."""
    assessment_uuid, activity_id, _ = _seed_assessment(db_session_factory)

    other_user_id = 99
    now = datetime.now(UTC)
    with db_session_factory() as session:
        # Student's own submission
        session.add(
            Submission(
                submission_uuid="submission_own_1",
                assessment_type=AssessmentType.EXAM,
                activity_id=activity_id,
                user_id=student_user.id,
                status=SubmissionStatus.GRADED,
                attempt_number=1,
                answers_json={},
                grading_json=GradingBreakdown(feedback="Good.").model_dump(),
                auto_score=75,
                final_score=75,
                started_at=now,
                submitted_at=now,
                graded_at=now,
            )
        )
        # Another student's submission — should NOT appear
        session.add(
            Submission(
                submission_uuid="submission_other_1",
                assessment_type=AssessmentType.EXAM,
                activity_id=activity_id,
                user_id=other_user_id,
                status=SubmissionStatus.GRADED,
                attempt_number=1,
                answers_json={},
                grading_json={},
                auto_score=80,
                final_score=80,
                started_at=now,
                submitted_at=now,
                graded_at=now,
            )
        )
        session.commit()

    app = _make_app(db_session_factory, student_user, monkeypatch)
    client = TestClient(app)

    response = client.get(f"/assessments/{assessment_uuid}/me")

    assert response.status_code == 200
    items = response.json()
    assert len(items) == 1
    assert items[0]["submission_uuid"] == "submission_own_1"
    assert items[0]["user_id"] == student_user.id


def test_get_my_submissions_masks_score_when_batch_mode_unpublished(
    db_session_factory, student_user, monkeypatch
) -> None:
    """Scores are hidden until the teacher explicitly publishes (BATCH mode)."""
    assessment_uuid, activity_id, _ = _seed_assessment(
        db_session_factory,
        grade_release_mode=GradeReleaseMode.BATCH,
    )

    now = datetime.now(UTC)
    with db_session_factory() as session:
        sub = Submission(
            submission_uuid="submission_batch_hidden",
            assessment_type=AssessmentType.EXAM,
            activity_id=activity_id,
            user_id=student_user.id,
            status=SubmissionStatus.GRADED,
            attempt_number=1,
            answers_json={},
            grading_json=GradingBreakdown(feedback="Great!").model_dump(),
            auto_score=90,
            final_score=90,
            started_at=now,
            submitted_at=now,
            graded_at=now,
        )
        session.add(sub)
        session.flush()
        # GradingEntry with published_at=None → batch-unreleased
        session.add(
            GradingEntry(
                entry_uuid="entry_batch_hidden",
                submission_id=sub.id,
                graded_by=1,
                raw_score=90,
                penalty_pct=0,
                final_score=90,
                breakdown=sub.grading_json,
                overall_feedback="Great!",
                grading_version=1,
                created_at=now,
                published_at=None,
            )
        )
        session.commit()

    app = _make_app(db_session_factory, student_user, monkeypatch)
    client = TestClient(app)

    response = client.get(f"/assessments/{assessment_uuid}/me")

    assert response.status_code == 200
    payload = response.json()
    assert len(payload) == 1
    row = payload[0]
    assert row["release_state"] == "AWAITING_RELEASE"
    assert row["is_result_visible"] is False
    assert row["final_score"] is None
    assert row["auto_score"] is None


def test_get_my_submissions_shows_score_after_immediate_publish(db_session_factory, student_user, monkeypatch) -> None:
    """With IMMEDIATE release mode, published grades are visible to the student."""
    assessment_uuid, activity_id, _ = _seed_assessment(
        db_session_factory,
        grade_release_mode=GradeReleaseMode.IMMEDIATE,
    )

    now = datetime.now(UTC)
    with db_session_factory() as session:
        sub = Submission(
            submission_uuid="submission_immediate_visible",
            assessment_type=AssessmentType.EXAM,
            activity_id=activity_id,
            user_id=student_user.id,
            status=SubmissionStatus.PUBLISHED,
            attempt_number=1,
            answers_json={},
            grading_json=GradingBreakdown(feedback="Well done.").model_dump(),
            auto_score=88,
            final_score=88,
            started_at=now,
            submitted_at=now,
            graded_at=now,
        )
        session.add(sub)
        session.flush()
        session.add(
            GradingEntry(
                entry_uuid="entry_immediate_visible",
                submission_id=sub.id,
                graded_by=1,
                raw_score=88,
                penalty_pct=0,
                final_score=88,
                breakdown=sub.grading_json,
                overall_feedback="Well done.",
                grading_version=1,
                created_at=now,
                published_at=now,
            )
        )
        session.commit()

    app = _make_app(db_session_factory, student_user, monkeypatch)
    client = TestClient(app)

    response = client.get(f"/assessments/{assessment_uuid}/me")

    assert response.status_code == 200
    payload = response.json()
    row = payload[0]
    assert row["is_result_visible"] is True
    assert row["final_score"] == 88


# ---------------------------------------------------------------------------
# Tests: assessment not found
# ---------------------------------------------------------------------------


def test_get_assessment_returns_404_for_unknown_uuid(db_session_factory, student_user, monkeypatch) -> None:
    """GET /assessments/{uuid} returns 404 for an unknown UUID."""
    _seed_assessment(db_session_factory)
    app = _make_app(db_session_factory, student_user, monkeypatch)
    client = TestClient(app)

    response = client.get("/assessments/nonexistent-assessment-uuid")

    assert response.status_code == 404


# ---------------------------------------------------------------------------
# Tests: resubmission after RETURNED
# ---------------------------------------------------------------------------


def test_resubmission_draft_created_from_returned(db_session_factory, student_user, monkeypatch) -> None:
    """A new DRAFT is created when the student resubmits after a RETURNED state."""
    assessment_uuid, activity_id, _ = _seed_assessment(db_session_factory, max_attempts=3)

    now = datetime.now(UTC)
    with db_session_factory() as session:
        returned_sub = Submission(
            submission_uuid="submission_returned_1",
            assessment_type=AssessmentType.EXAM,
            activity_id=activity_id,
            user_id=student_user.id,
            status=SubmissionStatus.RETURNED,
            attempt_number=1,
            answers_json={},
            grading_json={},
            started_at=now,
            submitted_at=now,
        )
        session.add(returned_sub)
        session.commit()

    app = _make_app(db_session_factory, student_user, monkeypatch)
    client = TestClient(app)

    response = client.post(f"/assessments/{assessment_uuid}/start")

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "DRAFT"
    assert payload["attempt_number"] == 2
    assert payload["submission_uuid"] != "submission_returned_1"


def test_attempt_limit_prevents_resubmission(db_session_factory, student_user, monkeypatch) -> None:
    """Resubmit is blocked when max_attempts is already exhausted."""
    assessment_uuid, activity_id, _ = _seed_assessment(db_session_factory, max_attempts=1)

    now = datetime.now(UTC)
    with db_session_factory() as session:
        returned_sub = Submission(
            submission_uuid="submission_returned_limit",
            assessment_type=AssessmentType.EXAM,
            activity_id=activity_id,
            user_id=student_user.id,
            status=SubmissionStatus.RETURNED,
            attempt_number=1,
            answers_json={},
            grading_json={},
            started_at=now,
            submitted_at=now,
        )
        session.add(returned_sub)
        session.commit()

    app = _make_app(db_session_factory, student_user, monkeypatch)
    client = TestClient(app)

    response = client.post(f"/assessments/{assessment_uuid}/start")

    assert response.status_code == 403
