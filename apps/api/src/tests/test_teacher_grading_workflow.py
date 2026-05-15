# pyright: reportMissingImports=false, reportUnusedImport=false
"""
Integration tests for the core teacher grading workflow.

Covers:
  - Listing submissions (queue) with status filter, search, and pagination
  - Fetching aggregate submission stats
  - Fetching a single submission for detailed review
  - Saving a grade (GRADED state)
  - Publishing a grade immediately (PUBLISHED state)
  - Returning a submission for revision (RETURNED state)
  - Bulk publish grades (batch release mode)
  - Grade on unknown submission returns 404
"""

import pathlib
import sys
from datetime import UTC, datetime, timedelta

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlmodel import SQLModel, select

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2]))
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from src.auth.users import get_optional_public_user, get_public_user
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
from src.db.grading.entries import GradingEntry
from src.db.grading.overrides import StudentPolicyOverride
from src.db.grading.progress import (
    AssessmentCompletionRule,
    AssessmentGradingMode,
    AssessmentPolicy,
    GradeReleaseMode,
    LatePolicyNone,
)
from src.db.grading.submissions import (
    AssessmentType,
    GradingBreakdown,
    Submission,
    SubmissionStatus,
)
from src.db.users import PublicUser, User
from src.infra.db.engine import build_engine, build_session_factory
from src.infra.db.session import get_db_session
from src.infra.settings import get_settings
from src.routers.assessments.unified import router as assessments_router
from src.security.rbac import PermissionChecker
from src.services.assessments import core
from src.services.grading import teacher as teacher_service

# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------

_ALL_TABLES = [
    User.__table__,
    Course.__table__,
    Chapter.__table__,
    Activity.__table__,
    AssessmentPolicy.__table__,
    Assessment.__table__,
    AssessmentItem.__table__,
    StudentPolicyOverride.__table__,
    Submission.__table__,
    GradingEntry.__table__,
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


@pytest.fixture(name="teacher_user")
def teacher_user_fixture() -> PublicUser:
    return PublicUser(
        id=1,
        user_uuid="user_teacher_grade",
        username="teacher.grade",
        first_name="Teacher",
        middle_name="",
        last_name="Grade",
        email="teacher.grade@example.com",
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


@pytest.fixture(name="api_client")
def api_client_fixture(
    db_session_factory, teacher_user, monkeypatch: pytest.MonkeyPatch
):
    app = FastAPI()
    app.include_router(assessments_router, prefix="/assessments")

    def override_get_db_session():
        session = db_session_factory()
        try:
            yield session
        finally:
            session.close()

    app.dependency_overrides[get_db_session] = override_get_db_session
    app.dependency_overrides[get_public_user] = lambda: teacher_user
    app.dependency_overrides[get_optional_public_user] = lambda: teacher_user

    monkeypatch.setattr(core, "_require_read", lambda *_a, **_kw: None)
    monkeypatch.setattr(core, "_require_grade", lambda *_a, **_kw: None)
    monkeypatch.setattr(core, "_require_author", lambda *_a, **_kw: None)
    monkeypatch.setattr(PermissionChecker, "require", lambda *_a, **_kw: None)
    monkeypatch.setattr(PermissionChecker, "check", lambda *_a, **_kw: True)
    monkeypatch.setattr(
        teacher_service, "recalculate_activity_progress", lambda *_a, **_kw: None
    )
    monkeypatch.setattr(
        teacher_service, "publish_grading_event", lambda *_a, **_kw: None
    )
    monkeypatch.setattr(
        teacher_service, "_award_xp_on_publish", lambda *_a, **_kw: None
    )
    return TestClient(app)


# ---------------------------------------------------------------------------
# Seed helpers
# ---------------------------------------------------------------------------


def _seed_course_and_assessment(
    db_session_factory,
    *,
    grade_release_mode: GradeReleaseMode = GradeReleaseMode.IMMEDIATE,
) -> tuple[str, int, str]:
    """
    Create the minimal rows needed for grading tests.

    Returns (assessment_uuid, activity_id, activity_uuid).
    """
    now = datetime.now(UTC)
    with db_session_factory() as session:
        teacher = User(
            id=1,
            user_uuid="user_teacher_grade",
            username="teacher.grade",
            first_name="Teacher",
            middle_name="",
            last_name="Grade",
            email="teacher.grade@example.com",
            hashed_password="hashed",
            is_active=True,
            is_superuser=False,
            is_verified=True,
        )
        alice = User(
            id=2,
            user_uuid="user_alice_grade",
            username="alice.grade",
            first_name="Alice",
            middle_name="",
            last_name="Grade",
            email="alice.grade@example.com",
            hashed_password="hashed",
            is_active=True,
            is_superuser=False,
            is_verified=True,
        )
        bob = User(
            id=3,
            user_uuid="user_bob_grade",
            username="bob.grade",
            first_name="Bob",
            middle_name="",
            last_name="Grade",
            email="bob.grade@example.com",
            hashed_password="hashed",
            is_active=True,
            is_superuser=False,
            is_verified=True,
        )
        session.add_all([teacher, alice, bob])
        session.flush()

        course = Course(
            name="Grade Course",
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
            course_uuid="course_grade",
        )
        session.add(course)
        session.flush()

        chapter = Chapter(
            name="Week 1",
            description="",
            thumbnail_image="",
            course_id=course.id,
            chapter_uuid="chapter_grade",
            creator_id=teacher.id,
            order=1,
        )
        session.add(chapter)
        session.flush()

        activity = Activity(
            name="Graded Assignment",
            activity_type=ActivityTypeEnum.TYPE_FILE_SUBMISSION,
            activity_sub_type=ActivitySubTypeEnum.SUBTYPE_FILE_SUBMISSION_STANDARD,
            content={},
            details={},
            settings={},
            published=True,
            chapter_id=chapter.id,
            course_id=course.id,
            creator_id=teacher.id,
            activity_uuid="activity_grade",
            order=1,
        )
        session.add(activity)
        session.flush()

        policy = AssessmentPolicy(
            policy_uuid="policy_grade",
            activity_id=activity.id,
            assessment_type=AssessmentType.ASSIGNMENT,
            grading_mode=AssessmentGradingMode.MANUAL,
            grade_release_mode=grade_release_mode,
            completion_rule=AssessmentCompletionRule.GRADED,
            passing_score=60.0,
            max_attempts=3,
            time_limit_seconds=None,
            due_at=now + timedelta(days=7),
            allow_late=True,
            late_policy_json=LatePolicyNone().model_dump(mode="json"),
            anti_cheat_json={},
            settings_json={},
        )
        session.add(policy)
        session.flush()

        assessment = Assessment(
            assessment_uuid="assessment_grade",
            activity_id=activity.id,
            kind=AssessmentType.ASSIGNMENT,
            title="Graded Assignment",
            description="",
            lifecycle=AssessmentLifecycle.PUBLISHED,
            scheduled_at=None,
            published_at=now,
            archived_at=None,
            weight=1.0,
            grading_type=AssessmentGradingType.PERCENTAGE,
            policy_id=policy.id,
        )
        session.add(assessment)
        session.flush()

        item = AssessmentItem(
            item_uuid="item_grade_1",
            assessment_id=assessment.id,
            order=1,
            kind=ItemKind.OPEN_TEXT,
            title="Write a summary",
            body_json={"kind": "OPEN_TEXT", "prompt": "Write a summary."},
            max_score=100,
        )
        session.add(item)

        # Alice: PENDING submission (needs grading)
        alice_sub = Submission(
            submission_uuid="submission_alice_grade",
            assessment_type=AssessmentType.ASSIGNMENT,
            activity_id=activity.id,
            user_id=alice.id,
            status=SubmissionStatus.PENDING,
            attempt_number=1,
            answers_json={
                "answers": {
                    "item_grade_1": {"kind": "OPEN_TEXT", "text": "Alice's answer"}
                }
            },
            grading_json=GradingBreakdown().model_dump(),
            started_at=now - timedelta(hours=2),
            submitted_at=now - timedelta(hours=1),
        )
        session.add(alice_sub)

        # Bob: GRADED submission (already graded)
        bob_sub = Submission(
            submission_uuid="submission_bob_grade",
            assessment_type=AssessmentType.ASSIGNMENT,
            activity_id=activity.id,
            user_id=bob.id,
            status=SubmissionStatus.GRADED,
            attempt_number=1,
            answers_json={
                "answers": {
                    "item_grade_1": {"kind": "OPEN_TEXT", "text": "Bob's answer"}
                }
            },
            grading_json=GradingBreakdown(feedback="Good work.").model_dump(),
            auto_score=None,
            final_score=78,
            started_at=now - timedelta(hours=3),
            submitted_at=now - timedelta(hours=2),
            graded_at=now - timedelta(hours=1),
        )
        session.add(bob_sub)

        session.commit()
        session.refresh(activity)
        return assessment.assessment_uuid, activity.id, activity.activity_uuid


# ---------------------------------------------------------------------------
# Tests: submission queue
# ---------------------------------------------------------------------------


def test_get_submissions_returns_all_for_assessment(
    api_client: TestClient, db_session_factory
) -> None:
    """Teacher sees all submissions (PENDING and GRADED) in the queue."""
    assessment_uuid, _, _ = _seed_course_and_assessment(db_session_factory)

    response = api_client.get(f"/assessments/{assessment_uuid}/submissions")

    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 2
    uuids = {s["submission_uuid"] for s in data["items"]}
    assert "submission_alice_grade" in uuids
    assert "submission_bob_grade" in uuids


def test_get_submissions_filters_by_status(
    api_client: TestClient, db_session_factory
) -> None:
    """status=PENDING only returns Alice's not-yet-graded submission."""
    assessment_uuid, _, _ = _seed_course_and_assessment(db_session_factory)

    response = api_client.get(
        f"/assessments/{assessment_uuid}/submissions", params={"status": "PENDING"}
    )

    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 1
    assert data["items"][0]["submission_uuid"] == "submission_alice_grade"
    assert data["items"][0]["status"] == "PENDING"


def test_get_submissions_needs_grading_virtual_filter(
    api_client: TestClient, db_session_factory
) -> None:
    """Virtual filter NEEDS_GRADING maps to PENDING status."""
    assessment_uuid, _, _ = _seed_course_and_assessment(db_session_factory)

    response = api_client.get(
        f"/assessments/{assessment_uuid}/submissions",
        params={"status": "NEEDS_GRADING"},
    )

    assert response.status_code == 200
    assert response.json()["total"] == 1
    assert response.json()["items"][0]["status"] == "PENDING"


def test_get_submissions_search_by_name(
    api_client: TestClient, db_session_factory
) -> None:
    """Search by partial first name narrows the queue to matching students."""
    assessment_uuid, _, _ = _seed_course_and_assessment(db_session_factory)

    response = api_client.get(
        f"/assessments/{assessment_uuid}/submissions", params={"search": "alice"}
    )

    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 1
    assert data["items"][0]["submission_uuid"] == "submission_alice_grade"


def test_get_submissions_invalid_status_returns_400(
    api_client: TestClient, db_session_factory
) -> None:
    """An unrecognised status filter returns 400 Bad Request."""
    assessment_uuid, _, _ = _seed_course_and_assessment(db_session_factory)

    response = api_client.get(
        f"/assessments/{assessment_uuid}/submissions",
        params={"status": "NOT_A_STATUS"},
    )

    assert response.status_code == 400


def test_get_submissions_pagination(api_client: TestClient, db_session_factory) -> None:
    """page_size=1 returns exactly one item per page with correct totals."""
    assessment_uuid, _, _ = _seed_course_and_assessment(db_session_factory)

    page1 = api_client.get(
        f"/assessments/{assessment_uuid}/submissions",
        params={"page": 1, "page_size": 1},
    )
    assert page1.status_code == 200
    data1 = page1.json()
    assert len(data1["items"]) == 1
    assert data1["total"] == 2
    assert data1["pages"] == 2

    page2 = api_client.get(
        f"/assessments/{assessment_uuid}/submissions",
        params={"page": 2, "page_size": 1},
    )
    assert page2.status_code == 200
    data2 = page2.json()
    assert len(data2["items"]) == 1
    # Different submission on each page
    assert data1["items"][0]["submission_uuid"] != data2["items"][0]["submission_uuid"]


# ---------------------------------------------------------------------------
# Tests: submission stats
# ---------------------------------------------------------------------------


def test_get_submission_stats_reflects_seeded_data(
    api_client: TestClient, db_session_factory
) -> None:
    """Stats endpoint aggregates PENDING / GRADED counts correctly."""
    assessment_uuid, _, _ = _seed_course_and_assessment(db_session_factory)

    response = api_client.get(f"/assessments/{assessment_uuid}/submissions/stats")

    assert response.status_code == 200
    stats = response.json()
    assert stats["total"] == 2
    assert stats["needs_grading_count"] == 1
    assert stats["graded_count"] == 1


def test_get_submission_stats_includes_avg_score(
    api_client: TestClient, db_session_factory
) -> None:
    """avg_score is computed only from GRADED/PUBLISHED rows with non-null final_score."""
    assessment_uuid, _, _ = _seed_course_and_assessment(db_session_factory)

    response = api_client.get(f"/assessments/{assessment_uuid}/submissions/stats")

    assert response.status_code == 200
    stats = response.json()
    # Bob's score is 78; Alice is PENDING with no score
    assert stats["avg_score"] == 78.0


# ---------------------------------------------------------------------------
# Tests: fetch single submission
# ---------------------------------------------------------------------------


def test_get_submission_detail_returns_answers(
    api_client: TestClient, db_session_factory
) -> None:
    """Teacher can see the full answers JSON for a specific submission."""
    assessment_uuid, _, _ = _seed_course_and_assessment(db_session_factory)

    response = api_client.get(
        f"/assessments/{assessment_uuid}/submissions/submission_alice_grade"
    )

    assert response.status_code == 200
    data = response.json()
    assert data["submission_uuid"] == "submission_alice_grade"
    assert data["status"] == "PENDING"
    assert "item_grade_1" in str(data.get("answers_json", {}))


def test_get_submission_detail_404_for_unknown(
    api_client: TestClient, db_session_factory
) -> None:
    """Fetching a non-existent submission UUID returns 404."""
    assessment_uuid, _, _ = _seed_course_and_assessment(db_session_factory)

    response = api_client.get(
        f"/assessments/{assessment_uuid}/submissions/does-not-exist"
    )

    assert response.status_code == 404


# ---------------------------------------------------------------------------
# Tests: save grade
# ---------------------------------------------------------------------------


def test_save_grade_transitions_to_graded(
    api_client: TestClient, db_session_factory
) -> None:
    """PATCH grade with status=GRADED marks submission graded (teacher-only)."""
    assessment_uuid, _, _ = _seed_course_and_assessment(db_session_factory)

    response = api_client.patch(
        f"/assessments/{assessment_uuid}/submissions/submission_alice_grade",
        json={"final_score": 85, "feedback": "Well written.", "status": "GRADED"},
    )

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "GRADED"
    assert data["final_score"] == 85


def test_save_grade_and_publish_immediately(
    api_client: TestClient, db_session_factory
) -> None:
    """PATCH grade with status=PUBLISHED makes grade visible to student."""
    assessment_uuid, _, _ = _seed_course_and_assessment(db_session_factory)

    response = api_client.patch(
        f"/assessments/{assessment_uuid}/submissions/submission_alice_grade",
        json={"final_score": 92, "feedback": "Excellent.", "status": "PUBLISHED"},
    )

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "PUBLISHED"
    assert data["final_score"] == 92


def test_save_grade_return_for_revision(
    api_client: TestClient, db_session_factory
) -> None:
    """PATCH grade with status=RETURNED sends submission back to student."""
    assessment_uuid, _, _ = _seed_course_and_assessment(db_session_factory)

    response = api_client.patch(
        f"/assessments/{assessment_uuid}/submissions/submission_alice_grade",
        json={
            "final_score": 0,
            "feedback": "Please revise the introduction.",
            "status": "RETURNED",
        },
    )

    assert response.status_code == 200
    assert response.json()["status"] == "RETURNED"


def test_save_grade_404_for_unknown_submission(
    api_client: TestClient, db_session_factory
) -> None:
    """Grading a non-existent submission returns 404."""
    assessment_uuid, _, _ = _seed_course_and_assessment(db_session_factory)

    response = api_client.patch(
        f"/assessments/{assessment_uuid}/submissions/submission-ghost",
        json={"final_score": 50, "status": "GRADED"},
    )

    assert response.status_code == 404


# ---------------------------------------------------------------------------
# Tests: bulk publish grades
# ---------------------------------------------------------------------------


def test_bulk_publish_grades_stamps_published_at(
    api_client: TestClient, db_session_factory
) -> None:
    """POST publish-grades inserts GradingEntry rows with published_at set."""
    assessment_uuid, _activity_id, _ = _seed_course_and_assessment(
        db_session_factory, grade_release_mode=GradeReleaseMode.BATCH
    )

    now = datetime.now(UTC)
    # First save grade for Alice → GRADED state
    api_client.patch(
        f"/assessments/{assessment_uuid}/submissions/submission_alice_grade",
        json={"final_score": 70, "status": "GRADED"},
    )
    # Bob is already GRADED in seed; also give him a GradingEntry
    with db_session_factory() as session:
        bob_sub = session.exec(
            select(Submission).where(
                Submission.submission_uuid == "submission_bob_grade"
            )
        ).one()
        session.add(
            GradingEntry(
                entry_uuid="entry_bob_grade_bulk",
                submission_id=bob_sub.id,
                graded_by=1,
                raw_score=78,
                penalty_pct=0,
                final_score=78,
                breakdown=bob_sub.grading_json,
                overall_feedback="Good work.",
                grading_version=1,
                created_at=now,
                published_at=None,
            )
        )
        session.commit()

    response = api_client.post(f"/assessments/{assessment_uuid}/publish-grades")

    assert response.status_code == 200
    result = response.json()
    assert result["published_count"] >= 1

    # Verify DB: at least one GradingEntry now has published_at set
    with db_session_factory() as session:
        entries_with_publish = session.exec(
            select(GradingEntry).where(GradingEntry.published_at.is_not(None))
        ).all()
    assert len(entries_with_publish) >= 1


def test_bulk_publish_returns_zero_when_nothing_to_publish(
    api_client: TestClient, db_session_factory
) -> None:
    """Publishing when there are no GRADED submissions returns published_count=0.

    We use the standard seed (alice=PENDING, bob already had grades published) and
    call publish-grades a second time — the second call should find no un-published
    grades and return 0.
    """
    assessment_uuid, _, _ = _seed_course_and_assessment(
        db_session_factory, grade_release_mode=GradeReleaseMode.BATCH
    )

    # First publish — seeds bob's GRADED submission → published_count >= 1
    first = api_client.post(f"/assessments/{assessment_uuid}/publish-grades")
    assert first.status_code == 200

    # Second publish — everything already has published_at set → published_count == 0
    response = api_client.post(f"/assessments/{assessment_uuid}/publish-grades")

    assert response.status_code == 200
    assert response.json()["published_count"] == 0
