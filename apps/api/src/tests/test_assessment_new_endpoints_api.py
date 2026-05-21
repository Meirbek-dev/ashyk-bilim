# pyright: reportMissingImports=false, reportUnusedImport=false
"""
Tests for new assessment endpoints added in the world-class LMS plan:
  - GET  /assessments/{uuid}/attempt-state
  - GET  /assessments/policy-preset/{kind}
  - GET  /assessments/{uuid}/overrides
  - POST /assessments/{uuid}/overrides
  - PATCH /assessments/{uuid}/overrides/{user_id}
  - DELETE /assessments/{uuid}/overrides/{user_id}
"""

import pathlib
import sys
from datetime import UTC, datetime

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlmodel import SQLModel

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
    Submission,
    SubmissionStatus,
)
from src.db.resource_authors import ResourceAuthor
from src.db.usergroup_resources import UserGroupResource
from src.db.usergroup_user import UserGroupUser
from src.db.usergroups import UserGroup
from src.db.users import PublicUser, User
from src.infra.db.engine import build_engine, build_session_factory
from src.infra.db.session import get_db_session
from src.infra.settings import get_settings
from src.routers.assessments.unified import router
from src.security.rbac import PermissionChecker
from src.services.assessments import core

# ── Fixtures ──────────────────────────────────────────────────────────────────

TEACHER_ID = 10
STUDENT_ID = 20

TABLES = [
    User.__table__,
    ResourceAuthor.__table__,
    UserGroup.__table__,
    UserGroupUser.__table__,
    UserGroupResource.__table__,
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
]


@pytest.fixture(name="db_session_factory")
def db_session_factory_fixture():
    engine = build_engine(get_settings())
    SQLModel.metadata.create_all(engine, tables=TABLES)
    factory = build_session_factory(engine)
    try:
        yield factory
    finally:
        SQLModel.metadata.drop_all(engine, tables=list(reversed(TABLES)))
        engine.dispose()


@pytest.fixture(name="teacher_user")
def teacher_user_fixture() -> PublicUser:
    return PublicUser(
        id=TEACHER_ID,
        user_uuid="user_teacher_new",
        username="teacher.new",
        first_name="Teacher",
        middle_name="",
        last_name="New",
        email="teacher.new@example.com",
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


@pytest.fixture(name="student_user")
def student_user_fixture() -> PublicUser:
    return PublicUser(
        id=STUDENT_ID,
        user_uuid="user_student_new",
        username="student.new",
        first_name="Student",
        middle_name="",
        last_name="New",
        email="student.new@example.com",
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


def _make_api_client(db_session_factory, user: PublicUser, monkeypatch):
    app = FastAPI()
    app.include_router(router, prefix="/assessments")

    def override_get_db_session():
        session = db_session_factory()
        try:
            yield session
        finally:
            session.close()

    app.dependency_overrides[get_db_session] = override_get_db_session
    app.dependency_overrides[get_public_user] = lambda: user
    app.dependency_overrides[get_optional_public_user] = lambda: user
    monkeypatch.setattr(core, "_require_read", lambda *_args, **_kwargs: None)
    monkeypatch.setattr(core, "_require_author", lambda *_args, **_kwargs: None)
    monkeypatch.setattr(core, "_require_grade", lambda *_args, **_kwargs: None)
    monkeypatch.setattr(core, "_has_submit_access", lambda *_args, **_kwargs: True)
    monkeypatch.setattr(core, "_require_submit_access", lambda *_args, **_kwargs: None)
    monkeypatch.setattr(PermissionChecker, "check", lambda *_args, **_kwargs: True)
    monkeypatch.setattr(PermissionChecker, "require", lambda *_args, **_kwargs: None)
    return TestClient(app)


def _seed_assessment(db_session_factory) -> tuple[str, int]:
    """Returns (assessment_uuid, policy_id)."""
    with db_session_factory() as session:
        teacher = User(
            id=TEACHER_ID,
            user_uuid="user_teacher_new",
            username="teacher.new",
            first_name="Teacher",
            middle_name="",
            last_name="New",
            email="teacher.new@example.com",
            hashed_password="hashed",
            is_active=True,
            is_superuser=False,
            is_verified=True,
        )
        student = User(
            id=STUDENT_ID,
            user_uuid="user_student_new",
            username="student.new",
            first_name="Student",
            middle_name="",
            last_name="New",
            email="student.new@example.com",
            hashed_password="hashed",
            is_active=True,
            is_superuser=False,
            is_verified=True,
        )
        session.add_all([teacher, student])
        session.flush()

        course = Course(
            id=1,
            name="Course",
            description="",
            about="",
            learnings=None,
            tags=None,
            thumbnail_type=ThumbnailType.IMAGE,
            thumbnail_image="",
            thumbnail_video="",
            public=False,
            open_to_contributors=False,
            creator_id=TEACHER_ID,
            course_uuid="course_new_ep",
        )
        session.add(course)
        session.flush()

        chapter = Chapter(
            id=1,
            name="Chapter",
            description="",
            thumbnail_image="",
            course_id=1,
            chapter_uuid="chapter_new_ep",
            creator_id=TEACHER_ID,
            order=1,
        )
        session.add(chapter)
        session.flush()

        activity = Activity(
            id=1,
            name="Activity",
            activity_type=ActivityTypeEnum.TYPE_FILE_SUBMISSION,
            activity_sub_type=ActivitySubTypeEnum.SUBTYPE_FILE_SUBMISSION_STANDARD,
            content={},
            details={},
            settings={},
            published=True,
            chapter_id=1,
            course_id=1,
            creator_id=TEACHER_ID,
            activity_uuid="activity_new_ep",
            order=1,
        )
        session.add(activity)
        session.flush()

        policy = AssessmentPolicy(
            policy_uuid="policy_new_ep",
            activity_id=1,
            assessment_type=AssessmentType.EXAM,
            grading_mode=AssessmentGradingMode.MANUAL,
            grade_release_mode=GradeReleaseMode.BATCH,
            completion_rule=AssessmentCompletionRule.GRADED,
            passing_score=60.0,
            max_attempts=3,
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
            assessment_uuid="assess_new_ep",
            activity_id=1,
            kind=AssessmentType.EXAM,
            title="New EP Assessment",
            description="",
            lifecycle=AssessmentLifecycle.PUBLISHED,
            scheduled_at=None,
            published_at=datetime.now(UTC),
            archived_at=None,
            weight=1.0,
            grading_type=AssessmentGradingType.PERCENTAGE,
            policy_id=policy.id,
        )
        session.add(assessment)
        session.flush()
        uuid = assessment.assessment_uuid
        pid = policy.id
        session.commit()
        return uuid, pid


# ── attempt-state ─────────────────────────────────────────────────────────────


class TestAttemptState:
    def test_returns_attempt_state(self, db_session_factory, student_user, monkeypatch):
        uuid, _ = _seed_assessment(db_session_factory)
        client = _make_api_client(db_session_factory, student_user, monkeypatch)

        resp = client.get(f"/assessments/{uuid}/attempt-state")
        assert resp.status_code == 200, resp.text

        data = resp.json()
        # Must include the base fields
        assert "assessment_uuid" in data
        assert "can_start" in data
        assert "recommended_action" in data
        assert "primary_button_label_key" in data

    def test_404_for_unknown_uuid(self, db_session_factory, student_user, monkeypatch):
        _seed_assessment(db_session_factory)
        client = _make_api_client(db_session_factory, student_user, monkeypatch)

        resp = client.get("/assessments/nonexistent_uuid/attempt-state")
        assert resp.status_code == 404


# ── policy-preset ─────────────────────────────────────────────────────────────


class TestPolicyPreset:
    @pytest.mark.parametrize("kind", ["EXAM", "QUIZ", "EXAM", "CODE_CHALLENGE"])
    def test_returns_preset_for_kind(
        self, db_session_factory, teacher_user, monkeypatch, kind
    ):
        client = _make_api_client(db_session_factory, teacher_user, monkeypatch)
        resp = client.get(f"/assessments/policy-preset/{kind}")
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert "kind" in data
        assert data["kind"] == kind
        assert "max_attempts" in data

    def test_404_for_unknown_kind(self, db_session_factory, teacher_user, monkeypatch):
        client = _make_api_client(db_session_factory, teacher_user, monkeypatch)
        resp = client.get("/assessments/policy-preset/UNKNOWN_KIND")
        assert resp.status_code in {400, 404}


# ── student overrides CRUD ────────────────────────────────────────────────────


class TestStudentOverrides:
    def test_list_empty(self, db_session_factory, teacher_user, monkeypatch):
        uuid, _ = _seed_assessment(db_session_factory)
        client = _make_api_client(db_session_factory, teacher_user, monkeypatch)

        resp = client.get(f"/assessments/{uuid}/overrides")
        assert resp.status_code == 200
        assert resp.json() == []

    def test_create_override(self, db_session_factory, teacher_user, monkeypatch):
        uuid, _ = _seed_assessment(db_session_factory)
        client = _make_api_client(db_session_factory, teacher_user, monkeypatch)

        payload = {
            "user_id": STUDENT_ID,
            "max_attempts_override": 5,
            "waive_late_penalty": True,
        }
        resp = client.post(f"/assessments/{uuid}/overrides", json=payload)
        assert resp.status_code == 201, resp.text
        data = resp.json()
        assert data["user_id"] == STUDENT_ID
        assert data["max_attempts_override"] == 5
        assert data["waive_late_penalty"] is True

    def test_list_after_create(self, db_session_factory, teacher_user, monkeypatch):
        uuid, _ = _seed_assessment(db_session_factory)
        client = _make_api_client(db_session_factory, teacher_user, monkeypatch)

        client.post(
            f"/assessments/{uuid}/overrides",
            json={"user_id": STUDENT_ID, "waive_late_penalty": True},
        )
        resp = client.get(f"/assessments/{uuid}/overrides")
        assert resp.status_code == 200
        assert len(resp.json()) == 1

    def test_update_override(self, db_session_factory, teacher_user, monkeypatch):
        uuid, _ = _seed_assessment(db_session_factory)
        client = _make_api_client(db_session_factory, teacher_user, monkeypatch)

        client.post(
            f"/assessments/{uuid}/overrides",
            json={"user_id": STUDENT_ID, "max_attempts_override": 2},
        )
        resp = client.patch(
            f"/assessments/{uuid}/overrides/{STUDENT_ID}",
            json={"max_attempts_override": 10},
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["max_attempts_override"] == 10

    def test_delete_override(self, db_session_factory, teacher_user, monkeypatch):
        uuid, _ = _seed_assessment(db_session_factory)
        client = _make_api_client(db_session_factory, teacher_user, monkeypatch)

        client.post(f"/assessments/{uuid}/overrides", json={"user_id": STUDENT_ID})
        del_resp = client.delete(f"/assessments/{uuid}/overrides/{STUDENT_ID}")
        assert del_resp.status_code == 200

        list_resp = client.get(f"/assessments/{uuid}/overrides")
        assert list_resp.json() == []

    def test_404_assessment_not_found(
        self, db_session_factory, teacher_user, monkeypatch
    ):
        _seed_assessment(db_session_factory)
        client = _make_api_client(db_session_factory, teacher_user, monkeypatch)

        resp = client.get("/assessments/nonexistent/overrides")
        assert resp.status_code == 404
