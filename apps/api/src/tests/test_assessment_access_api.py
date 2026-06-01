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
from src.db.assessments import Assessment, AssessmentGradingType, AssessmentLifecycle
from src.db.courses.activities import Activity, ActivitySubTypeEnum, ActivityTypeEnum
from src.db.courses.chapters import Chapter
from src.db.courses.courses import Course, ThumbnailType
from src.db.grading.progress import AssessmentPolicy, GradeReleaseMode
from src.db.grading.submissions import AssessmentType, Submission, SubmissionStatus
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
from src.services.assessments._shared import _build_attempt_state, _has_submit_access

TEACHER_ID = 101
STUDENT_ID = 201
OTHER_ID = 202

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
    Submission.__table__,
    AssessmentAccessPolicy.__table__,
    AssessmentAccessUser.__table__,
    AssessmentAccessUserGroup.__table__,
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
        user_uuid="user_teacher_access",
        username="teacher.access",
        first_name="Teacher",
        middle_name="",
        last_name="Access",
        email="teacher.access@example.com",
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

    def override_get_db_session():
        session = db_session_factory()
        try:
            yield session
        finally:
            session.close()

    app.dependency_overrides[get_db_session] = override_get_db_session
    app.dependency_overrides[get_public_user] = lambda: teacher_user
    app.dependency_overrides[get_optional_public_user] = lambda: teacher_user
    monkeypatch.setattr(PermissionChecker, "check", lambda *_args, **_kwargs: True)
    monkeypatch.setattr(PermissionChecker, "require", lambda *_args, **_kwargs: None)
    return TestClient(app)


def test_restricted_access_narrows_course_learners(db_session_factory, api_client, monkeypatch) -> None:
    assessment_uuid, activity_id = _seed_assessment(db_session_factory)
    response = api_client.get(f"/assessments/{assessment_uuid}/access")
    assert response.status_code == 200
    assert response.json()["mode"] == "ALL_COURSE_LEARNERS"

    response = api_client.put(
        f"/assessments/{assessment_uuid}/access",
        json={"mode": "RESTRICTED", "user_ids": [STUDENT_ID], "usergroup_ids": []},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["mode"] == "RESTRICTED"
    assert [user["id"] for user in body["users"]] == [STUDENT_ID]
    assert body["effective_user_count"] == 1

    monkeypatch.setattr(PermissionChecker, "check", lambda *_args, **_kwargs: True)
    with db_session_factory() as session:
        activity = session.get(Activity, activity_id)
        course = session.exec(select(Course)).first()
        student = _public_user(STUDENT_ID)
        other = _public_user(OTHER_ID)
        assert activity is not None
        assert course is not None
        assert _has_submit_access(student, activity, course, session)
        assert not _has_submit_access(other, activity, course, session)


def test_course_author_can_test_after_previous_attempt_when_access_restricted(
    db_session_factory,
) -> None:
    _assessment_uuid, activity_id = _seed_assessment(db_session_factory)
    now = datetime.now(UTC)

    with db_session_factory() as session:
        activity = session.get(Activity, activity_id)
        course = session.exec(select(Course)).first()
        assessment = session.exec(select(Assessment)).first()
        policy = session.exec(select(AssessmentPolicy)).first()
        assert activity is not None
        assert course is not None
        assert assessment is not None
        assert policy is not None

        policy.max_attempts = 1
        session.add(policy)
        session.add(
            AssessmentAccessPolicy(
                assessment_id=assessment.id,
                mode="RESTRICTED",
            )
        )
        session.flush()
        access_policy = session.exec(select(AssessmentAccessPolicy)).one()
        session.add(
            AssessmentAccessUser(
                policy_id=access_policy.id,
                user_id=STUDENT_ID,
            )
        )
        session.add(
            Submission(
                submission_uuid="submission_teacher_preview_done",
                assessment_type=AssessmentType.EXAM,
                activity_id=activity.id,
                user_id=TEACHER_ID,
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

        teacher = _public_user(TEACHER_ID)
        assert _has_submit_access(teacher, activity, course, session)

        state = _build_attempt_state(assessment, activity, teacher, session)
        assert state["active_submission"] is None
        assert state["can_edit"] is True
        assert state["can_start"] is True
        assert state["effective_policy"].max_attempts is None
        disabled_action_reasons = state["disabled_action_reasons"]
        assert isinstance(disabled_action_reasons, list)
        assert "MAX_ATTEMPTS_REACHED" not in disabled_action_reasons


def _seed_assessment(db_session_factory) -> tuple[str, int]:
    now = datetime.now(UTC)
    with db_session_factory() as session:
        session.add(_user(TEACHER_ID, "teacher.access"))
        session.add(_user(STUDENT_ID, "student.allowed"))
        session.add(_user(OTHER_ID, "student.blocked"))
        course = Course(
            id=301,
            course_uuid="course_access",
            name="Access course",
            description="",
            public=False,
            open_to_contributors=False,
            paid=False,
            price=0,
            thumbnail="",
            thumbnail_type=ThumbnailType.IMAGE,
            creator_id=TEACHER_ID,
            creation_date=now,
            update_date=now,
        )
        session.add(course)
        chapter = Chapter(id=401, chapter_uuid="chapter_access", name="Chapter", course_id=course.id)
        session.add(chapter)
        activity = Activity(
            id=501,
            activity_uuid="activity_access",
            name="Access exam",
            activity_type=ActivityTypeEnum.TYPE_EXAM,
            activity_sub_type=ActivitySubTypeEnum.SUBTYPE_EXAM_STANDARD,
            content={},
            details={},
            settings={},
            published=True,
            chapter_id=chapter.id,
            course_id=course.id,
            order=1,
            creator_id=TEACHER_ID,
            creation_date=now,
            update_date=now,
        )
        session.add(activity)
        policy = AssessmentPolicy(
            id=601,
            policy_uuid="policy_access",
            activity_id=activity.id,
            assessment_type=AssessmentType.EXAM,
            grade_release_mode=GradeReleaseMode.IMMEDIATE,
        )
        session.add(policy)
        assessment = Assessment(
            id=701,
            assessment_uuid="assessment_access",
            activity_id=activity.id,
            kind=AssessmentType.EXAM,
            title="Access exam",
            description="",
            lifecycle=AssessmentLifecycle.PUBLISHED,
            weight=1.0,
            grading_type=AssessmentGradingType.PERCENTAGE,
            policy_id=policy.id,
            created_at=now,
            updated_at=now,
        )
        session.add(assessment)
        session.commit()
        return assessment.assessment_uuid, activity.id or 0


def _user(user_id: int, username: str) -> User:
    return User(
        id=user_id,
        user_uuid=f"user_{user_id}",
        username=username,
        first_name=username,
        middle_name="",
        last_name="",
        email=f"{username}@example.com",
        hashed_password="hashed",
        is_active=True,
        is_superuser=False,
        is_verified=True,
    )


def _public_user(user_id: int) -> PublicUser:
    return PublicUser(
        id=user_id,
        user_uuid=f"user_{user_id}",
        username=f"user.{user_id}",
        first_name="User",
        middle_name="",
        last_name=str(user_id),
        email=f"user.{user_id}@example.com",
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
