# pyright: reportMissingImports=false, reportUnusedImport=false

from starlette.testclient import TestClient
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
from src.db.resource_authors import ResourceAuthor
from src.db.usergroup_resources import UserGroupResource
from src.db.usergroup_user import UserGroupUser
from src.db.usergroups import UserGroup
from src.db.users import PublicUser, User
from src.infra.db.engine import build_engine, build_session_factory
from src.infra.db.session import get_db_session
from src.infra.settings import get_settings
from src.routers.assessments.unified import router
from src.services.assessments import core


@pytest.fixture(name="db_session_factory")
def db_session_factory_fixture():
    engine = build_engine(get_settings())
    tables = [
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
        AssessmentItem.__table__,
        StudentPolicyOverride.__table__,
        Submission.__table__,
        GradingEntry.__table__,
        AssessmentAccessPolicy.__table__,
        AssessmentAccessUser.__table__,
        AssessmentAccessUserGroup.__table__,
    ]
    SQLModel.metadata.create_all(engine, tables=tables)
    factory = build_session_factory(engine)
    try:
        yield factory
    finally:
        SQLModel.metadata.drop_all(engine, tables=list(reversed(tables)))
        engine.dispose()


@pytest.fixture(name="student_user")
def student_user_fixture() -> PublicUser:
    return PublicUser(
        id=2,
        user_uuid="user_student_phase0",
        username="student.phase0",
        first_name="Student",
        middle_name="",
        last_name="Phase0",
        email="student.phase0@example.com",
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
def api_client_fixture(db_session_factory, student_user, monkeypatch: pytest.MonkeyPatch) -> TestClient:
    app = FastAPI()
    app.include_router(router, prefix="/assessments")

    def override_get_db_session():
        session = db_session_factory()
        try:
            yield session
        finally:
            session.close()

    app.dependency_overrides[get_db_session] = override_get_db_session
    app.dependency_overrides[get_public_user] = lambda: student_user
    app.dependency_overrides[get_optional_public_user] = lambda: student_user
    monkeypatch.setattr(core, "_require_submit_access", lambda *_args, **_kwargs: None)
    monkeypatch.setattr(core, "_has_submit_access", lambda *_args, **_kwargs: True)
    monkeypatch.setattr(core, "_require_read", lambda *_args, **_kwargs: None)
    monkeypatch.setattr(core, "_require_author", lambda *_args, **_kwargs: None)
    return TestClient(app)


def _seed_base(db_session_factory, *, lifecycle: AssessmentLifecycle):
    with db_session_factory() as session:
        teacher = User(
            id=1,
            user_uuid="user_teacher_phase0",
            username="teacher.phase0",
            first_name="Teacher",
            middle_name="",
            last_name="Phase0",
            email="teacher.phase0@example.com",
            hashed_password="hashed",
            is_active=True,
            is_superuser=False,
            is_verified=True,
        )
        student = User(
            id=2,
            user_uuid="user_student_phase0",
            username="student.phase0",
            first_name="Student",
            middle_name="",
            last_name="Phase0",
            email="student.phase0@example.com",
            hashed_password="hashed",
            is_active=True,
            is_superuser=False,
            is_verified=True,
        )
        session.add(teacher)
        session.add(student)
        session.flush()

        course = Course(
            name="Phase 0 Course",
            description="",
            about="",
            learnings=None,
            tags=None,
            thumbnail_type=ThumbnailType.IMAGE,
            thumbnail_image="",
            thumbnail_video="",
            public=False,
            open_to_contributors=False,
            creator_id=teacher.id,
            course_uuid="course_phase0",
        )
        session.add(course)
        session.flush()

        chapter = Chapter(
            name="Week 1",
            description="",
            thumbnail_image="",
            course_id=course.id,
            chapter_uuid="chapter_phase0",
            creator_id=teacher.id,
            order=1,
        )
        session.add(chapter)
        session.flush()

        activity = Activity(
            name="Phase 0 Assessment",
            activity_type=ActivityTypeEnum.TYPE_FILE_SUBMISSION,
            activity_sub_type=ActivitySubTypeEnum.SUBTYPE_FILE_SUBMISSION_STANDARD,
            content={},
            details={},
            settings={},
            published=lifecycle == AssessmentLifecycle.PUBLISHED,
            chapter_id=chapter.id,
            course_id=course.id,
            creator_id=teacher.id,
            activity_uuid="activity_phase0",
            order=1,
        )
        session.add(activity)
        session.flush()

        policy = AssessmentPolicy(
            policy_uuid="policy_phase0",
            activity_id=activity.id,
            assessment_type=AssessmentType.EXAM,
            grading_mode=AssessmentGradingMode.MANUAL,
            grade_release_mode=GradeReleaseMode.BATCH,
            completion_rule=AssessmentCompletionRule.GRADED,
            passing_score=60.0,
            max_attempts=1,
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
            assessment_uuid="assessment_phase0",
            activity_id=activity.id,
            kind=AssessmentType.EXAM,
            title="Phase 0 Assessment",
            description="",
            lifecycle=lifecycle,
            scheduled_at=None,
            published_at=(datetime.now(UTC) if lifecycle == AssessmentLifecycle.PUBLISHED else None),
            archived_at=(datetime.now(UTC) if lifecycle == AssessmentLifecycle.ARCHIVED else None),
            weight=1.0,
            grading_type=AssessmentGradingType.PERCENTAGE,
            policy_id=policy.id,
        )
        session.add(assessment)
        session.flush()

        item = AssessmentItem(
            item_uuid="item_phase0",
            assessment_id=assessment.id,
            order=1,
            kind=ItemKind.OPEN_TEXT,
            title="Response",
            body_json={"kind": "OPEN_TEXT", "prompt": "Explain."},
            max_score=100,
        )
        session.add(item)
        session.commit()
        session.refresh(assessment)
        return assessment.assessment_uuid, activity.activity_uuid


def test_canonical_student_me_masks_unpublished_batch_grade(
    api_client: TestClient,
    db_session_factory,
) -> None:
    assessment_uuid, _activity_uuid = _seed_base(db_session_factory, lifecycle=AssessmentLifecycle.PUBLISHED)
    with db_session_factory() as session:
        activity = session.exec(select(Activity).where(Activity.activity_uuid == "activity_phase0")).one()
        submission = Submission(
            submission_uuid="submission_hidden",
            assessment_type=AssessmentType.EXAM,
            activity_id=activity.id,
            user_id=2,
            status=SubmissionStatus.GRADED,
            attempt_number=1,
            answers_json={"answers": {"item_phase0": {"kind": "OPEN_TEXT", "text": "A"}}},
            grading_json=GradingBreakdown(feedback="Hidden feedback").model_dump(),
            auto_score=82,
            final_score=82,
            started_at=datetime.now(UTC),
            submitted_at=datetime.now(UTC),
            graded_at=datetime.now(UTC),
        )
        session.add(submission)
        session.flush()
        session.add(
            GradingEntry(
                entry_uuid="entry_hidden",
                submission_id=submission.id,
                graded_by=1,
                raw_score=82,
                penalty_pct=0,
                final_score=82,
                breakdown=submission.grading_json,
                overall_feedback="Hidden feedback",
                grading_version=1,
                created_at=datetime.now(UTC),
                published_at=None,
            )
        )
        session.commit()

    response = api_client.get(f"/assessments/{assessment_uuid}/me")

    assert response.status_code == 200
    payload = response.json()
    assert payload[0]["release_state"] == "AWAITING_RELEASE"
    assert payload[0]["is_result_visible"] is False
    assert payload[0]["auto_score"] is None
    assert payload[0]["final_score"] is None
    assert payload[0]["grading_json"] == {
        "items": [],
        "needs_manual_review": False,
        "auto_graded": False,
        "feedback": "",
    }
    assert payload[0]["graded_at"] is None


def test_start_is_blocked_when_assessment_is_not_published(
    api_client: TestClient,
    db_session_factory,
) -> None:
    assessment_uuid, _activity_uuid = _seed_base(db_session_factory, lifecycle=AssessmentLifecycle.DRAFT)

    response = api_client.post(f"/assessments/{assessment_uuid}/start")

    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "NOT_PUBLISHED"


def test_activity_lookup_does_not_create_canonical_assessment_rows(
    api_client: TestClient,
    db_session_factory,
) -> None:
    with db_session_factory() as session:
        teacher = User(
            id=1,
            user_uuid="user_teacher_lookup",
            username="teacher.lookup",
            first_name="Teacher",
            middle_name="",
            last_name="Lookup",
            email="teacher.lookup@example.com",
            hashed_password="hashed",
            is_active=True,
            is_superuser=False,
            is_verified=True,
        )
        session.add(teacher)
        session.flush()
        course = Course(
            name="Lookup Course",
            description="",
            about="",
            learnings=None,
            tags=None,
            thumbnail_type=ThumbnailType.IMAGE,
            thumbnail_image="",
            thumbnail_video="",
            public=False,
            open_to_contributors=False,
            creator_id=teacher.id,
            course_uuid="course_lookup",
        )
        session.add(course)
        session.flush()
        chapter = Chapter(
            name="Week 1",
            description="",
            thumbnail_image="",
            course_id=course.id,
            chapter_uuid="chapter_lookup",
            creator_id=teacher.id,
            order=1,
        )
        session.add(chapter)
        session.flush()
        session.add(
            Activity(
                name="Legacy ManualAssessment",
                activity_type=ActivityTypeEnum.TYPE_FILE_SUBMISSION,
                activity_sub_type=ActivitySubTypeEnum.SUBTYPE_FILE_SUBMISSION_STANDARD,
                content={},
                details={},
                settings={},
                published=True,
                chapter_id=chapter.id,
                course_id=course.id,
                creator_id=teacher.id,
                activity_uuid="activity_legacy_lookup",
                order=1,
            )
        )
        session.commit()

    response = api_client.get("/assessments/activity/legacy_lookup")

    assert response.status_code == 404
    assert response.json()["detail"]["code"] == "ASSESSMENT_NOT_FOUND"
    with db_session_factory() as session:
        assert session.exec(select(Assessment)).all() == []


def test_published_assessment_with_submissions_rejects_item_edits(
    api_client: TestClient,
    db_session_factory,
) -> None:
    assessment_uuid, _activity_uuid = _seed_base(db_session_factory, lifecycle=AssessmentLifecycle.PUBLISHED)
    with db_session_factory() as session:
        activity = session.exec(select(Activity).where(Activity.activity_uuid == "activity_phase0")).one()
        session.add(
            Submission(
                submission_uuid="submission_existing",
                assessment_type=AssessmentType.EXAM,
                activity_id=activity.id,
                user_id=2,
                status=SubmissionStatus.DRAFT,
                attempt_number=1,
                answers_json={},
                grading_json={},
                started_at=datetime.now(UTC),
            )
        )
        session.commit()

    response = api_client.patch(
        f"/assessments/{assessment_uuid}/items/item_phase0",
        json={
            "title": "Edited",
            "kind": "OPEN_TEXT",
            "body": {"kind": "OPEN_TEXT", "prompt": "Edited"},
            "max_score": 100,
        },
    )

    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "PUBLISHED_ASSESSMENT_HAS_SUBMISSIONS"
