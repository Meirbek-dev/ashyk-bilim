# pyright: reportMissingImports=false, reportUnusedImport=false

import pathlib
import sys
from collections.abc import Callable, Iterator
from datetime import UTC, datetime, timedelta

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlmodel import Session, SQLModel, select
from starlette.testclient import TestClient

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
from src.db.grading.entries import GradingEntry
from src.db.grading.progress import (
    AssessmentCompletionRule,
    AssessmentGradingMode,
    AssessmentPolicy,
    GradeReleaseMode,
    LatePolicyNone,
)
from src.db.grading.submissions import AssessmentType, Submission, SubmissionStatus
from src.db.users import PublicUser, User
from src.infra.db.engine import build_engine, build_session_factory
from src.infra.db.session import get_db_session
from src.infra.settings import get_settings
from src.routers.assessments.unified import router
from src.services.assessments import core
from src.services.grading import teacher as teacher_service


@pytest.fixture(name="db_session_factory")
def db_session_factory_fixture() -> Iterator[Callable[[], Session]]:
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
            Submission.__table__,
            GradingEntry.__table__,
        ],
    )
    factory = build_session_factory(engine)
    try:
        yield factory
    finally:
        SQLModel.metadata.drop_all(
            engine,
            tables=[
                GradingEntry.__table__,
                Submission.__table__,
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
        user_uuid="user_teacher_review",
        username="teacher.review",
        first_name="Teacher",
        middle_name="",
        last_name="Review",
        email="teacher.review@example.com",
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
def api_client_fixture(db_session_factory: Callable[[], Session], teacher_user: PublicUser, monkeypatch: pytest.MonkeyPatch) -> TestClient:
    app = FastAPI()
    app.include_router(router, prefix="/assessments")

    def override_get_db_session() -> Iterator[Session]:
        session = db_session_factory()
        try:
            yield session
        finally:
            session.close()

    app.dependency_overrides[get_db_session] = override_get_db_session
    app.dependency_overrides[get_public_user] = lambda: teacher_user
    monkeypatch.setattr(core, "_require_read", lambda *_args, **_kwargs: None)
    monkeypatch.setattr(core, "_require_grade", lambda *_args, **_kwargs: None)
    monkeypatch.setattr(
        teacher_service,
        "recalculate_activity_progress",
        lambda *_args, **_kwargs: None,
    )
    monkeypatch.setattr(
        teacher_service,
        "publish_grading_event",
        lambda *_args, **_kwargs: None,
    )
    monkeypatch.setattr(
        teacher_service,
        "_award_xp_on_publish",
        lambda *_args, **_kwargs: None,
    )
    return TestClient(app)


@pytest.fixture(name="seeded_review_data")
def seeded_review_data_fixture(db_session_factory: Callable[[], Session]) -> dict[str, str]:
    now = datetime.now(UTC)
    with db_session_factory() as session:
        teacher = User(
            id=1,
            user_uuid="user_teacher_review",
            username="teacher.review",
            first_name="Teacher",
            middle_name="",
            last_name="Review",
            email="teacher.review@example.com",
            hashed_password="hashed",
            is_active=True,
            is_superuser=False,
            is_verified=True,
        )
        alice = User(
            id=2,
            user_uuid="user_alice_review",
            username="alice.pending",
            first_name="Alice",
            middle_name="",
            last_name="Pending",
            email="alice.pending@example.com",
            hashed_password="hashed",
            is_active=True,
            is_superuser=False,
            is_verified=True,
        )
        aaron = User(
            id=3,
            user_uuid="user_aaron_review",
            username="aaron.pending",
            first_name="Aaron",
            middle_name="",
            last_name="Pending",
            email="aaron.pending@example.com",
            hashed_password="hashed",
            is_active=True,
            is_superuser=False,
            is_verified=True,
        )
        bella = User(
            id=4,
            user_uuid="user_bella_review",
            username="bella.published",
            first_name="Bella",
            middle_name="",
            last_name="Published",
            email="bella.published@example.com",
            hashed_password="hashed",
            is_active=True,
            is_superuser=False,
            is_verified=True,
        )
        drew = User(
            id=5,
            user_uuid="user_drew_review",
            username="drew.draft",
            first_name="Drew",
            middle_name="",
            last_name="Draft",
            email="drew.draft@example.com",
            hashed_password="hashed",
            is_active=True,
            is_superuser=False,
            is_verified=True,
        )
        session.add_all([teacher, alice, aaron, bella, drew])
        session.flush()

        course = Course(
            name="Review Course",
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
            course_uuid="course_review",
        )
        session.add(course)
        session.flush()

        chapter = Chapter(
            name="Week 1",
            description="",
            thumbnail_image="",
            course_id=course.id,
            chapter_uuid="chapter_review",
            creator_id=teacher.id,
            order=1,
        )
        session.add(chapter)
        session.flush()

        activity = Activity(
            name="ManualAssessment review",
            activity_type=ActivityTypeEnum.TYPE_FILE_SUBMISSION,
            activity_sub_type=ActivitySubTypeEnum.SUBTYPE_FILE_SUBMISSION_STANDARD,
            content={},
            details={},
            settings={},
            published=True,
            chapter_id=chapter.id,
            course_id=course.id,
            creator_id=teacher.id,
            activity_uuid="activity_review",
            order=1,
        )
        other_activity = Activity(
            name="Other review",
            activity_type=ActivityTypeEnum.TYPE_FILE_SUBMISSION,
            activity_sub_type=ActivitySubTypeEnum.SUBTYPE_FILE_SUBMISSION_STANDARD,
            content={},
            details={},
            settings={},
            published=True,
            chapter_id=chapter.id,
            course_id=course.id,
            creator_id=teacher.id,
            activity_uuid="activity_review_other",
            order=2,
        )
        session.add_all([activity, other_activity])
        session.flush()

        policy = AssessmentPolicy(
            policy_uuid="policy_review",
            activity_id=activity.id,
            assessment_type=AssessmentType.EXAM,
            grading_mode=AssessmentGradingMode.MANUAL,
            grade_release_mode=GradeReleaseMode.IMMEDIATE,
            completion_rule=AssessmentCompletionRule.GRADED,
            passing_score=60.0,
            max_attempts=3,
            time_limit_seconds=None,
            due_at=now + timedelta(days=2),
            allow_late=True,
            late_policy_json=LatePolicyNone().model_dump(mode="json"),
            anti_cheat_json={},
            settings_json={},
        )
        other_policy = AssessmentPolicy(
            policy_uuid="policy_review_other",
            activity_id=other_activity.id,
            assessment_type=AssessmentType.EXAM,
            grading_mode=AssessmentGradingMode.MANUAL,
            grade_release_mode=GradeReleaseMode.IMMEDIATE,
            completion_rule=AssessmentCompletionRule.GRADED,
            passing_score=60.0,
            max_attempts=1,
            time_limit_seconds=None,
            due_at=now + timedelta(days=5),
            allow_late=True,
            late_policy_json=LatePolicyNone().model_dump(mode="json"),
            anti_cheat_json={},
            settings_json={},
        )
        session.add_all([policy, other_policy])
        session.flush()

        assessment = Assessment(
            assessment_uuid="assessment_review",
            activity_id=activity.id,
            kind=AssessmentType.EXAM,
            title="Essay Review",
            description="",
            lifecycle=AssessmentLifecycle.PUBLISHED,
            scheduled_at=None,
            published_at=now - timedelta(days=1),
            archived_at=None,
            weight=1.0,
            grading_type=AssessmentGradingType.PERCENTAGE,
            policy_id=policy.id,
        )
        other_assessment = Assessment(
            assessment_uuid="assessment_review_other",
            activity_id=other_activity.id,
            kind=AssessmentType.EXAM,
            title="Other Review",
            description="",
            lifecycle=AssessmentLifecycle.PUBLISHED,
            scheduled_at=None,
            published_at=now - timedelta(days=1),
            archived_at=None,
            weight=1.0,
            grading_type=AssessmentGradingType.PERCENTAGE,
            policy_id=other_policy.id,
        )
        session.add_all([assessment, other_assessment])
        session.flush()

        session.add(
            AssessmentItem(
                item_uuid="item_essay",
                assessment_id=assessment.id,
                order=1,
                kind=ItemKind.OPEN_TEXT,
                title="Essay question",
                body_json={
                    "kind": "OPEN_TEXT",
                    "prompt": "Explain the canonical review flow.",
                    "min_words": 50,
                },
                max_score=10.0,
            )
        )
        session.add(
            AssessmentItem(
                item_uuid="item_other",
                assessment_id=other_assessment.id,
                order=1,
                kind=ItemKind.OPEN_TEXT,
                title="Other question",
                body_json={
                    "kind": "OPEN_TEXT",
                    "prompt": "Other prompt",
                    "min_words": 10,
                },
                max_score=5.0,
            )
        )
        session.flush()

        alice_submission = Submission(
            submission_uuid="submission_alice_review",
            assessment_type=AssessmentType.EXAM,
            activity_id=activity.id,
            assessment_policy_id=policy.id,
            user_id=alice.id,
            answers_json={
                "answers": {
                    "item_essay": {
                        "kind": "OPEN_TEXT",
                        "text": "Alice answer",
                    }
                }
            },
            grading_json={},
            metadata_json={},
            status=SubmissionStatus.PENDING,
            attempt_number=3,
            is_late=True,
            late_penalty_pct=10.0,
            started_at=now - timedelta(hours=4),
            submitted_at=now - timedelta(hours=3),
            created_at=now - timedelta(hours=4),
            updated_at=now - timedelta(hours=3),
        )
        aaron_submission = Submission(
            submission_uuid="submission_aaron_review",
            assessment_type=AssessmentType.EXAM,
            activity_id=activity.id,
            assessment_policy_id=policy.id,
            user_id=aaron.id,
            answers_json={
                "answers": {
                    "item_essay": {
                        "kind": "OPEN_TEXT",
                        "text": "Aaron answer",
                    }
                }
            },
            grading_json={},
            metadata_json={},
            status=SubmissionStatus.PENDING,
            attempt_number=1,
            is_late=False,
            late_penalty_pct=0.0,
            started_at=now - timedelta(hours=2),
            submitted_at=now - timedelta(hours=1, minutes=30),
            created_at=now - timedelta(hours=2),
            updated_at=now - timedelta(hours=1, minutes=30),
        )
        bella_submission = Submission(
            submission_uuid="submission_bella_review",
            assessment_type=AssessmentType.EXAM,
            activity_id=activity.id,
            assessment_policy_id=policy.id,
            user_id=bella.id,
            answers_json={
                "answers": {
                    "item_essay": {
                        "kind": "OPEN_TEXT",
                        "text": "Bella answer",
                    }
                }
            },
            grading_json={"feedback": "Strong work", "items": []},
            metadata_json={},
            auto_score=88.0,
            final_score=92.0,
            status=SubmissionStatus.GRADED,
            attempt_number=2,
            is_late=False,
            late_penalty_pct=0.0,
            started_at=now - timedelta(hours=6),
            submitted_at=now - timedelta(hours=5),
            graded_at=now - timedelta(hours=4),
            created_at=now - timedelta(hours=6),
            updated_at=now - timedelta(hours=4),
        )
        drew_submission = Submission(
            submission_uuid="submission_drew_review",
            assessment_type=AssessmentType.EXAM,
            activity_id=activity.id,
            assessment_policy_id=policy.id,
            user_id=drew.id,
            answers_json={"answers": {}},
            grading_json={},
            metadata_json={},
            status=SubmissionStatus.DRAFT,
            attempt_number=4,
            is_late=False,
            late_penalty_pct=0.0,
            started_at=now - timedelta(minutes=30),
            submitted_at=None,
            created_at=now - timedelta(minutes=30),
            updated_at=now - timedelta(minutes=15),
        )
        session.add_all([
            alice_submission,
            aaron_submission,
            bella_submission,
            drew_submission,
        ])
        session.commit()

        return {
            "assessment_uuid": assessment.assessment_uuid,
            "other_assessment_uuid": other_assessment.assessment_uuid,
            "alice_submission_uuid": alice_submission.submission_uuid,
            "aaron_submission_uuid": aaron_submission.submission_uuid,
            "bella_submission_uuid": bella_submission.submission_uuid,
        }


def test_assessment_review_projection_exposes_native_queue_defaults(
    api_client: TestClient,
    seeded_review_data: dict[str, str],
) -> None:
    response = api_client.get(f"/assessments/{seeded_review_data['assessment_uuid']}")

    assert response.status_code == 200
    payload = response.json()
    assert payload["review_projection"] == {
        "assessment_uuid": seeded_review_data["assessment_uuid"],
        "activity_id": payload["activity_id"],
        "activity_uuid": payload["activity_uuid"],
        "title": "Essay Review",
        "kind": "EXAM",
        "default_filter": "NEEDS_GRADING",
        "supports_search": True,
        "supports_late_only": True,
        "supported_sorts": ["submitted_at", "final_score", "attempt_number"],
    }


def test_assessment_submission_queue_supports_review_filters_and_sorting(
    api_client: TestClient,
    seeded_review_data: dict[str, str],
) -> None:
    filtered = api_client.get(
        f"/assessments/{seeded_review_data['assessment_uuid']}/submissions",
        params={
            "status": "NEEDS_GRADING",
            "late_only": True,
            "search": "alice",
            "sort_by": "attempt_number",
            "sort_dir": "desc",
            "page": 1,
            "page_size": 10,
        },
    )

    assert filtered.status_code == 200
    filtered_payload = filtered.json()
    assert filtered_payload["total"] == 1
    assert filtered_payload["items"][0]["submission_uuid"] == seeded_review_data["alice_submission_uuid"]
    assert filtered_payload["items"][0]["user"]["first_name"] == "Alice"
    assert filtered_payload["items"][0]["status"] == "PENDING"
    assert filtered_payload["items"][0]["is_late"] is True

    sorted_page = api_client.get(
        f"/assessments/{seeded_review_data['assessment_uuid']}/submissions",
        params={
            "sort_by": "attempt_number",
            "sort_dir": "asc",
            "page": 1,
            "page_size": 2,
        },
    )

    assert sorted_page.status_code == 200
    sorted_payload = sorted_page.json()
    assert sorted_payload["total"] == 4
    assert sorted_payload["pages"] == 2
    assert [item["attempt_number"] for item in sorted_payload["items"]] == [1, 2]


def test_assessment_submission_stats_aggregate_non_draft_review_counts(
    api_client: TestClient,
    seeded_review_data: dict[str, str],
) -> None:
    response = api_client.get(f"/assessments/{seeded_review_data['assessment_uuid']}/submissions/stats")

    assert response.status_code == 200
    payload = response.json()
    assert {k: v for k, v in payload.items() if k != "score_distribution"} == {
        "total": 3,
        "graded_count": 1,
        "needs_grading_count": 2,
        "late_count": 1,
        "avg_score": 92.0,
        "pass_rate": 100.0,
    }


def test_assessment_submission_detail_is_scoped_and_hydrates_breakdown(
    api_client: TestClient,
    seeded_review_data: dict[str, str],
) -> None:
    response = api_client.get(
        f"/assessments/{seeded_review_data['assessment_uuid']}/submissions/{seeded_review_data['alice_submission_uuid']}"
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["user"]["first_name"] == "Alice"
    assert payload["grading_json"]["items"] == [
        {
            "item_id": "item_essay",
            "item_text": "Essay question",
            "score": 0.0,
            "max_score": 10.0,
            "correct": None,
            "feedback": "",
            "needs_manual_review": True,
            "user_answer": {"kind": "OPEN_TEXT", "text": "Alice answer"},
            "correct_answer": None,
        }
    ]

    mismatch_response = api_client.get(
        f"/assessments/{seeded_review_data['other_assessment_uuid']}/submissions/{seeded_review_data['alice_submission_uuid']}"
    )
    assert mismatch_response.status_code == 404
    assert mismatch_response.json() == {"detail": "Отправка не найдена"}


def test_assessment_submission_grade_save_honors_if_match(
    api_client: TestClient,
    seeded_review_data: dict[str, str],
) -> None:
    detail = api_client.get(
        f"/assessments/{seeded_review_data['assessment_uuid']}/submissions/{seeded_review_data['alice_submission_uuid']}"
    )
    assert detail.status_code == 200
    current_version = detail.json()["version"]

    response = api_client.patch(
        f"/assessments/{seeded_review_data['assessment_uuid']}/submissions/{seeded_review_data['alice_submission_uuid']}",
        headers={"If-Match": str(current_version + 1)},
        json={
            "final_score": 84,
            "feedback": "Needs a deeper explanation.",
            "status": "GRADED",
            "item_feedback": [],
        },
    )

    assert response.status_code == 412
    assert any(w in response.json()["detail"] for w in ["modified concurrently", "изменена одновременно"])


def test_assessment_submission_publish_transition_updates_state_and_ledger(
    api_client: TestClient,
    db_session_factory: Callable[[], Session],
    seeded_review_data: dict[str, str],
) -> None:
    detail = api_client.get(
        f"/assessments/{seeded_review_data['assessment_uuid']}/submissions/{seeded_review_data['alice_submission_uuid']}"
    )
    assert detail.status_code == 200
    current_version = detail.json()["version"]

    response = api_client.patch(
        f"/assessments/{seeded_review_data['assessment_uuid']}/submissions/{seeded_review_data['alice_submission_uuid']}",
        headers={"If-Match": str(current_version)},
        json={
            "final_score": 80,
            "feedback": "Ready for release.",
            "status": "PUBLISHED",
            "item_feedback": [],
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "PUBLISHED"
    assert payload["final_score"] == 72.0
    assert payload["version"] == current_version + 1
    assert payload["graded_at"] is not None

    with db_session_factory() as session:
        submission = session.exec(
            select(Submission).where(Submission.submission_uuid == seeded_review_data["alice_submission_uuid"])
        ).first()
        assert submission is not None
        assert submission.status == SubmissionStatus.PUBLISHED
        assert submission.final_score == 72.0

        entries = session.exec(select(GradingEntry).where(GradingEntry.submission_id == submission.id)).all()
        assert len(entries) == 1
        assert entries[0].published_at is not None
        assert entries[0].final_score == 72.0
        assert entries[0].overall_feedback == "Ready for release."


@pytest.mark.parametrize(
    ("submission_key", "expected_score"),
    [
        ("aaron_submission_uuid", 67.0),
        ("bella_submission_uuid", 55.0),
    ],
)
def test_assessment_submission_return_flow_supports_pending_and_graded_states(
    api_client: TestClient,
    db_session_factory: Callable[[], Session],
    seeded_review_data: dict[str, str],
    submission_key: str,
    expected_score: float,
) -> None:
    submission_uuid = seeded_review_data[submission_key]
    detail = api_client.get(f"/assessments/{seeded_review_data['assessment_uuid']}/submissions/{submission_uuid}")
    assert detail.status_code == 200
    current_version = detail.json()["version"]

    response = api_client.patch(
        f"/assessments/{seeded_review_data['assessment_uuid']}/submissions/{submission_uuid}",
        headers={"If-Match": str(current_version)},
        json={
            "final_score": expected_score,
            "feedback": "Revise and resubmit.",
            "status": "RETURNED",
            "item_feedback": [],
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "RETURNED"
    assert payload["final_score"] == expected_score
    assert payload["version"] == current_version + 1

    with db_session_factory() as session:
        submission = session.exec(select(Submission).where(Submission.submission_uuid == submission_uuid)).first()
        assert submission is not None
        assert submission.status == SubmissionStatus.RETURNED
        assert submission.final_score == expected_score

        entries = session.exec(select(GradingEntry).where(GradingEntry.submission_id == submission.id)).all()
        assert len(entries) == 1
        assert entries[0].published_at is None
