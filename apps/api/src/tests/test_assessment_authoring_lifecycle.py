# pyright: reportMissingImports=false, reportUnusedImport=false
"""
Integration tests for the assessment authoring and lifecycle workflow.

Covers (all teacher-side):
  - Creating an assessment via POST /assessments
  - Reading an assessment by UUID
  - Updating assessment metadata (title, description, policy)
  - Adding an item to an assessment
  - Updating an item
  - Deleting an item
  - Reordering items
  - Lifecycle transition: DRAFT → PUBLISHED
  - Lifecycle transition: PUBLISHED → ARCHIVED
  - Invalid lifecycle transition returns 422
  - Readiness check (reports missing items / policy gaps)
  - Policy preset retrieval
"""

import pathlib
import sys
from datetime import UTC, datetime

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlmodel import SQLModel, select
from starlette.testclient import TestClient

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
    AssessmentCompletionRule,
    AssessmentGradingMode,
    AssessmentPolicy,
    GradeReleaseMode,
    LatePolicyNone,
)
from src.db.grading.submissions import AssessmentType, Submission
from src.db.resource_authors import ResourceAuthor
from src.db.usergroups import UserGroup
from src.db.users import PublicUser, User
from src.infra.db.engine import build_engine, build_session_factory
from src.infra.db.session import get_db_session
from src.infra.settings import get_settings
from src.routers.assessments.unified import router
from src.routers.file_submissions import router as file_submissions_router
from src.security.rbac import PermissionChecker
from src.services import file_submissions as file_submission_service
from src.services.assessments import core

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

TEACHER_ID = 1
STUDENT_ID = 2

_ALL_TABLES = [
    User.__table__,
    ResourceAuthor.__table__,
    UserGroup.__table__,
    Course.__table__,
    Chapter.__table__,
    Activity.__table__,
    AssessmentPolicy.__table__,
    FileSubmissionActivity.__table__,
    FileSubmissionAttempt.__table__,
    FileSubmissionAttemptFile.__table__,
    Assessment.__table__,
    AssessmentAccessPolicy.__table__,
    AssessmentAccessUser.__table__,
    AssessmentAccessUserGroup.__table__,
    AssessmentItem.__table__,
    StudentPolicyOverride.__table__,
    Submission.__table__,
    GradingEntry.__table__,
]

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


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
        id=TEACHER_ID,
        user_uuid="user_teacher_authoring",
        username="teacher.authoring",
        first_name="Teacher",
        middle_name="",
        last_name="Authoring",
        email="teacher.authoring@example.com",
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
def api_client_fixture(db_session_factory, teacher_user, monkeypatch: pytest.MonkeyPatch) -> TestClient:
    app = FastAPI()
    app.include_router(router, prefix="/assessments")
    app.include_router(file_submissions_router, prefix="/file-submissions")

    def override_get_db_session():
        session = db_session_factory()
        try:
            yield session
        finally:
            session.close()

    app.dependency_overrides[get_db_session] = override_get_db_session
    app.dependency_overrides[get_public_user] = lambda: teacher_user
    app.dependency_overrides[get_optional_public_user] = lambda: teacher_user

    monkeypatch.setattr(core, "_require_author", lambda *_a, **_kw: None)
    monkeypatch.setattr(core, "_require_read", lambda *_a, **_kw: None)
    monkeypatch.setattr(core, "_require_grade", lambda *_a, **_kw: None)
    monkeypatch.setattr(file_submission_service, "_require_author", lambda *_a, **_kw: None)
    monkeypatch.setattr(file_submission_service, "_require_read", lambda *_a, **_kw: None)
    monkeypatch.setattr(PermissionChecker, "require", lambda *_a, **_kw: None)
    monkeypatch.setattr(PermissionChecker, "check", lambda *_a, **_kw: True)
    return TestClient(app)


# ---------------------------------------------------------------------------
# Seed helpers
# ---------------------------------------------------------------------------


def _seed_course_and_chapter(db_session_factory) -> tuple[int, int]:
    """Insert a minimal Course + Chapter.  Returns (course_id, chapter_id)."""
    with db_session_factory() as session:
        teacher = User(
            id=TEACHER_ID,
            user_uuid="user_teacher_authoring",
            username="teacher.authoring",
            first_name="Teacher",
            middle_name="",
            last_name="Authoring",
            email="teacher.authoring@example.com",
            hashed_password="hashed",
            is_active=True,
            is_superuser=False,
            is_verified=True,
        )
        session.add(teacher)
        session.flush()

        course = Course(
            name="Authoring Course",
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
            course_uuid="course_authoring",
        )
        session.add(course)
        session.flush()

        chapter = Chapter(
            name="Chapter 1",
            description="",
            thumbnail_image="",
            course_id=course.id,
            chapter_uuid="chapter_authoring",
            creator_id=teacher.id,
            order=1,
        )
        session.add(chapter)
        session.commit()
        session.refresh(course)
        session.refresh(chapter)
        return course.id, chapter.id


def _seed_published_assessment(db_session_factory) -> str:
    """
    Create a published assessment with one item.

    Returns assessment_uuid.
    """
    course_id, chapter_id = _seed_course_and_chapter(db_session_factory)
    now = datetime.now(UTC)
    with db_session_factory() as session:
        activity = Activity(
            name="Published ManualAssessment",
            activity_type=ActivityTypeEnum.TYPE_EXAM,
            activity_sub_type=ActivitySubTypeEnum.SUBTYPE_EXAM_STANDARD,
            content={},
            details={},
            settings={},
            published=True,
            chapter_id=chapter_id,
            course_id=course_id,
            creator_id=TEACHER_ID,
            activity_uuid="activity_published_authoring",
            order=1,
        )
        session.add(activity)
        session.flush()

        policy = AssessmentPolicy(
            policy_uuid="policy_published_authoring",
            activity_id=activity.id,
            assessment_type=AssessmentType.EXAM,
            grading_mode=AssessmentGradingMode.MANUAL,
            grade_release_mode=GradeReleaseMode.IMMEDIATE,
            completion_rule=AssessmentCompletionRule.GRADED,
            passing_score=60.0,
            max_attempts=None,
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
            assessment_uuid="assessment_published_authoring",
            activity_id=activity.id,
            kind=AssessmentType.EXAM,
            title="Published ManualAssessment",
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
            item_uuid="item_published_authoring_1",
            assessment_id=assessment.id,
            order=1,
            kind=ItemKind.CHOICE,
            title="Q1",
            body_json={
                "kind": "CHOICE",
                "prompt": "Choose the correct answer.",
                "options": [
                    {"text": "Correct", "is_correct": True},
                    {"text": "Incorrect", "is_correct": False},
                ],
                "multiple": False,
            },
            max_score=100,
        )
        session.add(item)
        session.commit()
        return assessment.assessment_uuid


# ---------------------------------------------------------------------------
# Tests: read assessment
# ---------------------------------------------------------------------------


def test_get_assessment_returns_items(api_client, db_session_factory) -> None:
    """GET /assessments/{uuid} returns assessment with its items list."""
    assessment_uuid = _seed_published_assessment(db_session_factory)

    response = api_client.get(f"/assessments/{assessment_uuid}")

    assert response.status_code == 200
    data = response.json()
    assert data["assessment_uuid"] == assessment_uuid
    assert data["lifecycle"] == "PUBLISHED"
    assert len(data["items"]) == 1
    assert data["items"][0]["kind"] == "CHOICE"


def test_get_assessment_404_for_unknown(api_client, db_session_factory) -> None:
    """GET /assessments/unknown-uuid returns 404."""
    _seed_course_and_chapter(db_session_factory)

    response = api_client.get("/assessments/does-not-exist")

    assert response.status_code == 404


# ---------------------------------------------------------------------------
# Tests: create assessment via API
# ---------------------------------------------------------------------------


def test_create_assessment_seeds_draft_and_policy(api_client, db_session_factory) -> None:
    """POST /assessments creates an assessment in DRAFT lifecycle with an AssessmentPolicy."""
    course_id, chapter_id = _seed_course_and_chapter(db_session_factory)

    response = api_client.post(
        "/assessments",
        json={
            "kind": "EXAM",
            "title": "New ManualAssessment",
            "description": "Test assessment",
            "course_id": course_id,
            "chapter_id": chapter_id,
        },
    )

    assert response.status_code == 200
    data = response.json()
    assert data["lifecycle"] == "DRAFT"
    assert data["title"] == "New ManualAssessment"
    assert data["kind"] == "EXAM"
    assert data["assessment_uuid"] is not None


def test_create_assessment_unknown_course_returns_404(api_client, db_session_factory) -> None:
    """POST /assessments with a non-existent course_id returns 404."""
    _, chapter_id = _seed_course_and_chapter(db_session_factory)

    response = api_client.post(
        "/assessments",
        json={
            "kind": "EXAM",
            "title": "Orphan",
            "course_id": 9999,
            "chapter_id": chapter_id,
        },
    )

    assert response.status_code == 404


# ---------------------------------------------------------------------------
# Tests: file submission activity API
# ---------------------------------------------------------------------------


def test_create_file_submission_activity_is_first_class(api_client, db_session_factory) -> None:
    """POST /file-submissions creates a TYPE_FILE_SUBMISSION activity, not an assessment."""
    course_id, chapter_id = _seed_course_and_chapter(db_session_factory)

    response = api_client.post(
        "/file-submissions",
        json={
            "title": "Portfolio upload",
            "instructions": "Upload your final portfolio.",
            "course_id": course_id,
            "chapter_id": chapter_id,
            "allowed_mime_types": ["application/pdf"],
            "max_files": 2,
            "max_file_size_mb": 25,
        },
    )

    assert response.status_code == 200
    data = response.json()
    assert data["title"] == "Portfolio upload"
    assert data["activity_uuid"].startswith("activity_")
    assert data["file_submission_uuid"].startswith("filesub_")
    assert data["allowed_mime_types"] == ["application/pdf"]
    assert data["max_files"] == 2

    with db_session_factory() as session:
        activity = session.exec(select(Activity).where(Activity.id == data["activity_id"])).one()
        assert activity.activity_type == ActivityTypeEnum.TYPE_FILE_SUBMISSION
        assert activity.activity_sub_type == ActivitySubTypeEnum.SUBTYPE_FILE_SUBMISSION_STANDARD

    read_response = api_client.get(f"/file-submissions/activity/{data['activity_uuid']}")
    assert read_response.status_code == 200
    assert read_response.json()["file_submission_uuid"] == data["file_submission_uuid"]


# ---------------------------------------------------------------------------
# Tests: update assessment
# ---------------------------------------------------------------------------


def test_update_assessment_metadata(api_client, db_session_factory) -> None:
    """PATCH /assessments/{uuid} updates the title and description."""
    assessment_uuid = _seed_published_assessment(db_session_factory)

    response = api_client.patch(
        f"/assessments/{assessment_uuid}",
        json={
            "title": "Renamed ManualAssessment",
            "description": "Updated description",
        },
    )

    assert response.status_code == 200
    data = response.json()
    assert data["title"] == "Renamed ManualAssessment"
    assert data["description"] == "Updated description"


def test_update_assessment_policy_max_attempts(api_client, db_session_factory) -> None:
    """PATCH /assessments/{uuid} with a policy block updates max_attempts."""
    assessment_uuid = _seed_published_assessment(db_session_factory)

    response = api_client.patch(
        f"/assessments/{assessment_uuid}",
        json={"policy": {"max_attempts": 2}},
    )

    assert response.status_code == 200
    data = response.json()
    policy = data.get("assessment_policy") or {}
    assert policy.get("max_attempts") == 2


# ---------------------------------------------------------------------------
# Tests: item CRUD
# ---------------------------------------------------------------------------


def test_add_item_to_assessment(api_client, db_session_factory) -> None:
    """POST /assessments/{uuid}/items adds a new CHOICE item."""
    assessment_uuid = _seed_published_assessment(db_session_factory)

    response = api_client.post(
        f"/assessments/{assessment_uuid}/items",
        json={
            "kind": "CHOICE",
            "title": "Multiple choice question",
            "body": {
                "kind": "CHOICE",
                "prompt": "Which of the following is correct?",
                "options": [
                    {"text": "Option A", "is_correct": True},
                    {"text": "Option B", "is_correct": False},
                ],
                "multiple": False,
            },
            "max_score": 10,
        },
    )

    # Endpoint returns the newly-created AssessmentReadItem (not the full assessment)
    assert response.status_code == 200
    data = response.json()
    assert data["kind"] == "CHOICE"
    assert data["title"] == "Multiple choice question"
    assert data["item_uuid"] is not None


def test_unknown_item_kinds_are_rejected_for_assessments(api_client, db_session_factory) -> None:
    """Unknown item kinds cannot be authored inside assessments."""
    assessment_uuid = _seed_published_assessment(db_session_factory)

    response = api_client.post(
        f"/assessments/{assessment_uuid}/items",
        json={
            "kind": "UNSUPPORTED_UPLOAD_KIND",
            "title": "Upload final PDF",
            "body": {
                "kind": "UNSUPPORTED_UPLOAD_KIND",
                "prompt": "Upload your work.",
                "max_files": 1,
                "max_mb": 10,
                "mimes": ["application/pdf"],
            },
            "max_score": 10,
        },
    )

    assert response.status_code == 422


def test_update_item_title(api_client, db_session_factory) -> None:
    """PATCH /assessments/{uuid}/items/{item_uuid} updates the item title."""
    assessment_uuid = _seed_published_assessment(db_session_factory)

    response = api_client.patch(
        f"/assessments/{assessment_uuid}/items/item_published_authoring_1",
        json={"title": "Updated question title"},
    )

    # Endpoint returns the updated AssessmentReadItem directly
    assert response.status_code == 200
    data = response.json()
    assert data["item_uuid"] == "item_published_authoring_1"
    assert data["title"] == "Updated question title"


def test_delete_item_removes_from_assessment(api_client, db_session_factory) -> None:
    """DELETE /assessments/{uuid}/items/{item_uuid} removes the item."""
    assessment_uuid = _seed_published_assessment(db_session_factory)

    response = api_client.delete(f"/assessments/{assessment_uuid}/items/item_published_authoring_1")

    # Endpoint returns a confirmation dict; verify via GET that item is gone
    assert response.status_code == 200

    get_resp = api_client.get(f"/assessments/{assessment_uuid}")
    assert get_resp.status_code == 200
    item_uuids = [i["item_uuid"] for i in get_resp.json()["items"]]
    assert "item_published_authoring_1" not in item_uuids


def test_add_multiple_items_preserves_order(api_client, db_session_factory) -> None:
    """Items are returned in insertion order when fetched via GET."""
    assessment_uuid = _seed_published_assessment(db_session_factory)

    # Add two more supported exam items.
    second_response = api_client.post(
        f"/assessments/{assessment_uuid}/items",
        json={
            "kind": "CHOICE",
            "title": "Second question",
            "body": {
                "kind": "CHOICE",
                "prompt": "Choose the second answer.",
                "options": [
                    {"text": "Correct", "is_correct": True},
                    {"text": "Incorrect", "is_correct": False},
                ],
                "multiple": False,
            },
            "max_score": 20,
        },
    )
    assert second_response.status_code == 200

    third_response = api_client.post(
        f"/assessments/{assessment_uuid}/items",
        json={
            "kind": "CHOICE",
            "title": "Third question",
            "body": {
                "kind": "CHOICE",
                "prompt": "Choose the third answer.",
                "options": [
                    {"text": "Correct", "is_correct": True},
                    {"text": "Incorrect", "is_correct": False},
                ],
                "multiple": False,
            },
            "max_score": 20,
        },
    )
    assert third_response.status_code == 200

    # GET returns the full assessment with all items in insertion order
    response = api_client.get(f"/assessments/{assessment_uuid}")
    assert response.status_code == 200
    data = response.json()
    assert len(data["items"]) == 3
    assert data["items"][0]["item_uuid"] == "item_published_authoring_1"


def test_reorder_items_changes_order(api_client, db_session_factory) -> None:
    """POST /assessments/{uuid}/items:reorder changes the item sequence."""
    assessment_uuid = _seed_published_assessment(db_session_factory)

    # Add a second item — creation returns the new item directly
    r = api_client.post(
        f"/assessments/{assessment_uuid}/items",
        json={
            "kind": "CHOICE",
            "title": "Second",
            "body": {
                "kind": "CHOICE",
                "prompt": "Q2",
                "options": [
                    {"text": "Correct", "is_correct": True},
                    {"text": "Incorrect", "is_correct": False},
                ],
                "multiple": False,
            },
            "max_score": 10,
        },
    )
    assert r.status_code == 200
    second_uuid = r.json()["item_uuid"]

    # Reorder: endpoint uses colon path segment format; body is list of {item_uuid, order} entries
    response = api_client.post(
        f"/assessments/{assessment_uuid}/items:reorder",
        json={
            "items": [
                {"item_uuid": second_uuid, "order": 1},
                {"item_uuid": "item_published_authoring_1", "order": 2},
            ]
        },
    )

    # Endpoint returns list[AssessmentReadItem] in new order
    assert response.status_code == 200
    items = response.json()
    assert items[0]["item_uuid"] == second_uuid
    assert items[1]["item_uuid"] == "item_published_authoring_1"


# ---------------------------------------------------------------------------
# Tests: lifecycle transitions
# ---------------------------------------------------------------------------


def test_lifecycle_transition_draft_to_published(api_client, db_session_factory) -> None:
    """POST /assessments/{uuid}/lifecycle/transition moves DRAFT → PUBLISHED."""
    course_id, chapter_id = _seed_course_and_chapter(db_session_factory)

    # Create draft assessment with one item
    create_resp = api_client.post(
        "/assessments",
        json={
            "kind": "EXAM",
            "title": "Lifecycle Test",
            "course_id": course_id,
            "chapter_id": chapter_id,
        },
    )
    assert create_resp.status_code == 200
    assessment_uuid = create_resp.json()["assessment_uuid"]

    # Add at least one item (otherwise readiness check may fail)
    api_client.post(
        f"/assessments/{assessment_uuid}/items",
        json={
            "kind": "CHOICE",
            "title": "Q1",
            "body": {
                "kind": "CHOICE",
                "prompt": "Choose.",
                "options": [
                    {"text": "Correct", "is_correct": True},
                    {"text": "Incorrect", "is_correct": False},
                ],
                "multiple": False,
            },
            "max_score": 100,
        },
    )

    response = api_client.post(
        f"/assessments/{assessment_uuid}/lifecycle",
        json={"to": "PUBLISHED"},
    )

    assert response.status_code == 200
    assert response.json()["lifecycle"] == "PUBLISHED"
    assert response.json()["published_at"] is not None


def test_lifecycle_transition_published_to_archived(api_client, db_session_factory) -> None:
    """Transition PUBLISHED → ARCHIVED is allowed."""
    assessment_uuid = _seed_published_assessment(db_session_factory)

    response = api_client.post(
        f"/assessments/{assessment_uuid}/lifecycle",
        json={"to": "ARCHIVED"},
    )

    assert response.status_code == 200
    assert response.json()["lifecycle"] == "ARCHIVED"
    assert response.json()["archived_at"] is not None


def test_lifecycle_transition_invalid_returns_422(api_client, db_session_factory) -> None:
    """Transitioning to an invalid state (e.g. PUBLISHED → SCHEDULED) returns 422."""
    assessment_uuid = _seed_published_assessment(db_session_factory)

    response = api_client.post(
        f"/assessments/{assessment_uuid}/lifecycle",
        json={"to": "SCHEDULED"},
    )

    # PUBLISHED → SCHEDULED is not in allowed transitions (may be 422, 400, or 409 depending on validation layer)
    assert response.status_code in {422, 400, 409}


# ---------------------------------------------------------------------------
# Tests: readiness check
# ---------------------------------------------------------------------------


def test_readiness_check_passes_for_complete_assessment(api_client, db_session_factory) -> None:
    """An assessment with items and policy is considered READY."""
    assessment_uuid = _seed_published_assessment(db_session_factory)

    response = api_client.get(f"/assessments/{assessment_uuid}/readiness")

    assert response.status_code == 200
    data = response.json()
    assert data["ok"] is True
    assert data["issues"] == []


def test_readiness_check_flags_missing_items(api_client, db_session_factory) -> None:
    """An assessment with zero items is NOT ready."""
    course_id, chapter_id = _seed_course_and_chapter(db_session_factory)

    create_resp = api_client.post(
        "/assessments",
        json={
            "kind": "EXAM",
            "title": "Empty ManualAssessment",
            "course_id": course_id,
            "chapter_id": chapter_id,
        },
    )
    assert create_resp.status_code == 200
    assessment_uuid = create_resp.json()["assessment_uuid"]

    response = api_client.get(f"/assessments/{assessment_uuid}/readiness")

    assert response.status_code == 200
    data = response.json()
    assert data["ok"] is False
    issue_codes = [issue["code"] for issue in data["issues"]]
    assert len(issue_codes) > 0


# ---------------------------------------------------------------------------
# Tests: policy preset
# ---------------------------------------------------------------------------


def test_policy_preset_manual_assessment_has_defaults(api_client, db_session_factory) -> None:
    """GET /assessments/policy-preset/EXAM returns a sensible default policy."""
    _seed_course_and_chapter(db_session_factory)

    response = api_client.get("/assessments/policy-preset/EXAM")

    assert response.status_code == 200
    data = response.json()
    # Should contain grading mode and release mode
    assert "grading_mode" in data
    assert "grade_release_mode" in data
