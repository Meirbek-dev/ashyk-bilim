# pyright: reportMissingImports=false, reportUnusedImport=false

import pathlib
import sys
from datetime import UTC, datetime, timedelta

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlmodel import SQLModel

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2]))
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from src.auth.users import get_public_user
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
from src.db.grading.progress import (
    AssessmentCompletionRule,
    AssessmentGradingMode,
    AssessmentPolicy,
    GradeReleaseMode,
    LatePolicyNone,
)
from src.db.grading.submissions import AssessmentType
from src.db.users import PublicUser, User
from src.infra.db.engine import build_engine, build_session_factory
from src.infra.db.session import get_db_session
from src.infra.settings import get_settings
from src.routers.assessments.unified import router
from src.services.assessments import core


@pytest.fixture(name="db_session_factory")
def db_session_factory_fixture():
    engine = build_engine(get_settings())
    SQLModel.metadata.create_all(
        engine,
        tables=[
            User.__table__,
            Course.__table__,
            Chapter.__table__,
            Activity.__table__,
            AssessmentPolicy.__table__,
            Assessment.__table__,
            AssessmentItem.__table__,
        ],
    )
    factory = build_session_factory(engine)
    try:
        yield factory
    finally:
        SQLModel.metadata.drop_all(
            engine,
            tables=[
                AssessmentItem.__table__,
                Assessment.__table__,
                AssessmentPolicy.__table__,
                Activity.__table__,
                Chapter.__table__,
                Course.__table__,
                User.__table__,
            ],
        )
        engine.dispose()


@pytest.fixture(name="teacher_user")
def teacher_user_fixture() -> PublicUser:
    return PublicUser(
        id=1,
        user_uuid="user_teacher_readiness",
        username="teacher.readiness",
        first_name="Teacher",
        middle_name="",
        last_name="Readiness",
        email="teacher.readiness@example.com",
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
    app.include_router(router, prefix="/assessments")

    def override_get_db_session():
        session = db_session_factory()
        try:
            yield session
        finally:
            session.close()

    app.dependency_overrides[get_db_session] = override_get_db_session
    app.dependency_overrides[get_public_user] = lambda: teacher_user
    monkeypatch.setattr(core, "_require_author", lambda *_args, **_kwargs: None)
    monkeypatch.setattr(core, "_require_publish", lambda *_args, **_kwargs: None)
    return TestClient(app)


def _seed_assessment(
    db_session_factory,
    *,
    kind: AssessmentType,
    title: str,
    scheduled_at: datetime | None,
    policy_kwargs: dict | None = None,
    items: list[dict] | None = None,
) -> Assessment:
    with db_session_factory() as session:
        user = User(
            id=1,
            user_uuid="user_teacher_readiness",
            username="teacher.readiness",
            first_name="Teacher",
            middle_name="",
            last_name="Readiness",
            email="teacher.readiness@example.com",
            hashed_password="hashed",
            is_active=True,
            is_superuser=False,
            is_verified=True,
        )
        session.add(user)
        session.flush()

        course = Course(
            name="Readiness Course",
            description="",
            about="",
            learnings=None,
            tags=None,
            thumbnail_type=ThumbnailType.IMAGE,
            thumbnail_image="",
            thumbnail_video="",
            public=False,
            open_to_contributors=False,
            creator_id=user.id,
            course_uuid="course_readiness",
        )
        session.add(course)
        session.flush()

        chapter = Chapter(
            name="Week 1",
            description="",
            thumbnail_image="",
            course_id=course.id,
            chapter_uuid="chapter_readiness",
            creator_id=user.id,
            order=1,
        )
        session.add(chapter)
        session.flush()

        activity_type_by_kind = {
            AssessmentType.EXAM: ActivityTypeEnum.TYPE_FILE_SUBMISSION,
            AssessmentType.EXAM: ActivityTypeEnum.TYPE_EXAM,
            AssessmentType.QUIZ: ActivityTypeEnum.TYPE_CUSTOM,
            AssessmentType.CODE_CHALLENGE: ActivityTypeEnum.TYPE_CODE_CHALLENGE,
        }
        activity_sub_type_by_kind = {
            AssessmentType.EXAM: ActivitySubTypeEnum.SUBTYPE_FILE_SUBMISSION_STANDARD,
            AssessmentType.EXAM: ActivitySubTypeEnum.SUBTYPE_EXAM_STANDARD,
            AssessmentType.QUIZ: ActivitySubTypeEnum.SUBTYPE_CUSTOM,
            AssessmentType.CODE_CHALLENGE: ActivitySubTypeEnum.SUBTYPE_CODE_GENERAL,
        }
        activity_type = activity_type_by_kind[kind]
        activity_sub_type = activity_sub_type_by_kind[kind]
        activity = Activity(
            name="Assessment Activity",
            activity_type=activity_type,
            activity_sub_type=activity_sub_type,
            content={},
            details={},
            settings={},
            published=False,
            chapter_id=chapter.id,
            course_id=course.id,
            creator_id=user.id,
            activity_uuid="activity_readiness",
            order=1,
        )
        session.add(activity)
        session.flush()

        policy_payload = {
            "policy_uuid": "policy_readiness",
            "activity_id": activity.id,
            "assessment_type": kind,
            "grading_mode": AssessmentGradingMode.MANUAL,
            "grade_release_mode": GradeReleaseMode.IMMEDIATE,
            "completion_rule": AssessmentCompletionRule.GRADED,
            "passing_score": 60.0,
            "max_attempts": 1,
            "time_limit_seconds": None,
            "due_at": None,
            "allow_late": True,
            "late_policy_json": LatePolicyNone().model_dump(mode="json"),
            "anti_cheat_json": {},
            "settings_json": {},
        }
        policy_payload.update(policy_kwargs or {})
        policy = AssessmentPolicy(**policy_payload)
        session.add(policy)
        session.flush()

        assessment = Assessment(
            assessment_uuid=f"assessment_{kind.lower()}",
            activity_id=activity.id,
            kind=kind,
            title=title,
            description="",
            lifecycle=AssessmentLifecycle.DRAFT,
            scheduled_at=scheduled_at,
            published_at=None,
            archived_at=None,
            weight=1.0,
            grading_type=AssessmentGradingType.PERCENTAGE,
            policy_id=policy.id,
        )
        session.add(assessment)
        session.flush()

        for index, item in enumerate(items or [], start=1):
            session.add(
                AssessmentItem(
                    item_uuid=f"item_{index}",
                    assessment_id=assessment.id,
                    order=index,
                    kind=item["kind"],
                    title=item.get("title", ""),
                    body_json=item.get("body_json", {}),
                    max_score=item.get("max_score", 0.0),
                )
            )

        session.commit()
        session.refresh(assessment)
        return assessment


def test_readiness_endpoint_returns_new_policy_and_item_codes(
    api_client: TestClient,
    db_session_factory,
) -> None:
    assessment = _seed_assessment(
        db_session_factory,
        kind=AssessmentType.EXAM,
        title="  ",
        scheduled_at=datetime.now(UTC) + timedelta(days=3),
        policy_kwargs={
            "max_attempts": 0,
            "time_limit_seconds": 0,
            "due_at": datetime.now(UTC) + timedelta(days=2),
            "anti_cheat_json": {"violation_threshold": 0},
        },
        items=[
            {
                "kind": ItemKind.CHOICE,
                "title": " ",
                "max_score": 0,
                "body_json": {
                    "kind": "CHOICE",
                    "prompt": "",
                    "multiple": False,
                    "options": [
                        {"id": "a", "text": "", "is_correct": False},
                        {"id": "b", "text": "Same", "is_correct": True},
                        {"id": "c", "text": "same", "is_correct": False},
                    ],
                },
            },
            {
                "kind": ItemKind.FORM,
                "title": "Profile",
                "max_score": 5,
                "body_json": {
                    "kind": "FORM",
                    "prompt": "Collect details",
                    "fields": [
                        {
                            "id": "name",
                            "label": "",
                            "field_type": "text",
                            "required": True,
                        },
                        {
                            "id": "NAME",
                            "label": "Name again",
                            "field_type": "text",
                            "required": False,
                        },
                    ],
                },
            },
        ],
    )

    response = api_client.get(f"/assessments/{assessment.assessment_uuid}/readiness")

    assert response.status_code == 200
    payload = response.json()
    assert payload["ok"] is False
    issue_codes = {issue["code"] for issue in payload["issues"]}
    assert {
        "assessment.title_missing",
        "policy.max_attempts_invalid",
        "policy.time_limit_invalid",
        "policy.violation_threshold_invalid",
        "schedule.after_due_at",
        "item.title_missing",
        "item.max_score_invalid",
        "choice.prompt_missing",
        "choice.option_text_missing",
        "choice.option_duplicate",
        "form.field_label_missing",
        "form.field_id_duplicate",
    } <= issue_codes


def test_code_challenge_readiness_accepts_title_as_legacy_blank_prompt_fallback(
    api_client: TestClient,
    db_session_factory,
) -> None:
    assessment = _seed_assessment(
        db_session_factory,
        kind=AssessmentType.CODE_CHALLENGE,
        title="FizzBuzz",
        scheduled_at=None,
        items=[
            {
                "kind": ItemKind.CODE,
                "title": "Write FizzBuzz",
                "max_score": 100,
                "body_json": {
                    "kind": "CODE",
                    "prompt": "",
                    "languages": [71],
                    "starter_code": {"71": "print('')"},
                    "tests": [
                        {
                            "id": "sample",
                            "input": "3",
                            "expected_output": "Fizz",
                            "is_visible": True,
                            "weight": 1,
                        },
                    ],
                    "time_limit_seconds": 5,
                    "memory_limit_mb": 256,
                },
            }
        ],
    )

    response = api_client.get(f"/assessments/{assessment.assessment_uuid}/readiness")

    assert response.status_code == 200
    payload = response.json()
    assert payload["ok"] is True
    assert payload["issues"] == []


def test_readiness_endpoint_and_publish_block_forbidden_exam_item_kind(
    api_client: TestClient,
    db_session_factory,
) -> None:
    assessment = _seed_assessment(
        db_session_factory,
        kind=AssessmentType.EXAM,
        title="Midterm",
        scheduled_at=None,
        policy_kwargs={
            "max_attempts": 1,
            "time_limit_seconds": 3600,
        },
        items=[
            {
                "kind": ItemKind.OPEN_TEXT,
                "title": "Essay",
                "max_score": 10,
                "body_json": {
                    "kind": "OPEN_TEXT",
                    "prompt": "Explain the theorem.",
                    "min_words": 50,
                },
            },
        ],
    )

    readiness_response = api_client.get(
        f"/assessments/{assessment.assessment_uuid}/readiness"
    )

    assert readiness_response.status_code == 200
    readiness_payload = readiness_response.json()
    assert readiness_payload["ok"] is False
    assert readiness_payload["issues"][0]["code"] == "item.kind_forbidden"
    assert readiness_payload["issues"][0]["item_uuid"] == "item_1"

    lifecycle_response = api_client.post(
        f"/assessments/{assessment.assessment_uuid}/lifecycle",
        json={"to": "PUBLISHED"},
    )

    assert lifecycle_response.status_code == 422
    lifecycle_payload = lifecycle_response.json()
    assert lifecycle_payload["detail"]["issues"] == readiness_payload["issues"]


def test_exam_item_create_rejects_unsupported_runtime_kind(
    api_client: TestClient,
    db_session_factory,
) -> None:
    assessment = _seed_assessment(
        db_session_factory,
        kind=AssessmentType.EXAM,
        title="Midterm",
        scheduled_at=None,
    )

    response = api_client.post(
        f"/assessments/{assessment.assessment_uuid}/items",
        json={
            "kind": "OPEN_TEXT",
            "title": "Essay",
            "max_score": 10,
            "body": {
                "kind": "OPEN_TEXT",
                "prompt": "Explain the theorem.",
                "min_words": 50,
            },
        },
    )

    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "ITEM_KIND_UNSUPPORTED"
    assert response.json()["detail"]["supported_kinds"] == ["CHOICE", "MATCHING"]


def test_item_metadata_is_persisted_on_create_and_patch(
    api_client: TestClient,
    db_session_factory,
) -> None:
    assessment = _seed_assessment(
        db_session_factory,
        kind=AssessmentType.EXAM,
        title="Midterm",
        scheduled_at=None,
    )

    create_response = api_client.post(
        f"/assessments/{assessment.assessment_uuid}/items",
        json={
            "kind": "CHOICE",
            "title": "Capital",
            "max_score": 1,
            "metadata": {
                "section_label": "Geography",
                "difficulty": "easy",
                "tags": ["Maps", "maps", "  capitals  "],
                "outcome_ids": ["geo-1"],
                "estimated_minutes": 2,
            },
            "body": {
                "kind": "CHOICE",
                "prompt": "Capital of Kazakhstan?",
                "multiple": False,
                "options": [
                    {"id": "a", "text": "Astana", "is_correct": True},
                    {"id": "b", "text": "Almaty", "is_correct": False},
                ],
            },
        },
    )

    assert create_response.status_code == 200
    created = create_response.json()
    assert created["metadata"] == {
        "section_label": "Geography",
        "difficulty": "easy",
        "tags": ["Maps", "capitals"],
        "outcome_ids": ["geo-1"],
        "estimated_minutes": 2,
    }

    patch_response = api_client.patch(
        f"/assessments/{assessment.assessment_uuid}/items/{created['item_uuid']}",
        json={
            "metadata": {
                "section_label": "Final section",
                "difficulty": "hard",
                "tags": [],
                "outcome_ids": [],
                "estimated_minutes": None,
            }
        },
    )

    assert patch_response.status_code == 200
    assert patch_response.json()["metadata"]["section_label"] == "Final section"
    assert patch_response.json()["metadata"]["difficulty"] == "hard"


def test_validate_code_challenge_endpoint(
    api_client: TestClient,
    db_session_factory,
    monkeypatch,
) -> None:
    from src.db.code_execution import CodeRunStatus
    from src.services.code_execution.service import CodeExecutionCaseResult

    assessment = _seed_assessment(
        db_session_factory,
        kind=AssessmentType.CODE_CHALLENGE,
        title="Python challenge",
        scheduled_at=None,
        items=[
            {
                "kind": ItemKind.CODE,
                "title": "Two Sum",
                "max_score": 100,
                "body_json": {
                    "kind": "CODE",
                    "prompt": "Find sum.",
                    "languages": [71],
                    "starter_code": {"71": "def f(): pass"},
                    "reference_solutions": {"71": "def f(): return 4"},
                    "tests": [
                        {
                            "id": "t1",
                            "input": "2",
                            "expected_output": "4",
                            "is_visible": True,
                            "weight": 1,
                            "match_mode": "EXACT",
                        }
                    ],
                },
            }
        ],
    )

    class FakeResult:
        run_uuid = "run_123"
        status = CodeRunStatus.ACCEPTED
        passed = 1
        total = 1
        score = 100.0
        compile_output = "compiled ok"
        error_message = None
        details = [
            CodeExecutionCaseResult(
                test_id="t1",
                passed=True,
                is_visible=True,
                stdin="2",
                expected="4",
                actual="4",
                stdout="4",
                stderr=None,
                compile_output=None,
                message=None,
                status_id=3,
                status_description="Accepted",
                judge0_token="token",
                time=0.01,
                memory=1024,
                weight=1.0,
                description="",
            )
        ]

    async def mock_run(*args, **kwargs):
        return FakeResult()

    from src.services.code_execution.service import CodeExecutionService

    monkeypatch.setattr(CodeExecutionService, "run", mock_run)

    response = api_client.post(
        f"/assessments/{assessment.assessment_uuid}/code-challenge/validate"
    )

    assert response.status_code == 200
    payload = response.json()
    assert "results" in payload
    assert "71" in payload["results"]
    assert payload["results"]["71"]["ok"] is True
    assert payload["results"]["71"]["passed"] == 1
