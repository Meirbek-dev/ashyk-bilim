# pyright: reportMissingImports=false

import pathlib
import sys
from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlmodel import Session, SQLModel
from starlette.testclient import TestClient

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2]))
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from src.auth.users import get_public_user
from src.db.assessments import (
    Assessment,
    AssessmentGradingType,
    AssessmentLifecycle,
)
from src.db.courses.activities import Activity, ActivitySubTypeEnum, ActivityTypeEnum
from src.db.courses.chapters import Chapter
from src.db.courses.courses import Course, ThumbnailType
from src.db.grading.bulk_actions import BulkAction, BulkActionStatus, BulkActionType
from src.db.grading.entries import GradingEntry
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
from src.db.users import PublicUser, User
from src.infra.db.engine import build_engine, build_session_factory
from src.infra.db.session import get_db_session
from src.infra.settings import get_settings
from src.routers import analytics as analytics_router_module
from src.routers.analytics import router
from src.services.analytics.assessments import build_assessment_rows
from src.services.analytics.overview import _build_grading_slo_alerts
from src.services.analytics.queries import (
    AnalyticsContext,
    AssessmentAnalyticsRow,
    ProgressSnapshot,
)
from src.services.analytics.schemas import (
    GradingBacklogItem,
    TeacherWorkloadSummary,
    WorkloadAgingBuckets,
)
from src.services.analytics.scope import TeacherAnalyticsScope


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
            Submission.__table__,
            GradingEntry.__table__,
            BulkAction.__table__,
        ],
    )
    factory = build_session_factory(engine)
    try:
        yield factory
    finally:
        SQLModel.metadata.drop_all(
            engine,
            tables=[
                BulkAction.__table__,
                GradingEntry.__table__,
                Submission.__table__,
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
        user_uuid="teacher_analytics",
        username="teacher.analytics",
        first_name="Teacher",
        middle_name="",
        last_name="Analytics",
        email="teacher.analytics@example.com",
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
    app.include_router(router, prefix="/analytics")

    def override_get_db_session():
        session = db_session_factory()
        try:
            yield session
        finally:
            session.close()

    app.dependency_overrides[get_db_session] = override_get_db_session
    app.dependency_overrides[get_public_user] = lambda: teacher_user

    async def fake_scope_for(*_args: Any, **_kwargs: Any) -> TeacherAnalyticsScope:
        return TeacherAnalyticsScope(
            teacher_user_id=teacher_user.id,
            course_ids=[1],
            cohort_ids=[],
            has_platform_scope=False,
        )

    monkeypatch.setattr(analytics_router_module, "_assessment_scope_for", fake_scope_for)
    return TestClient(app)


def _seed_users(session: Session) -> dict[str, User]:
    users = {
        "teacher": User(
            id=1,
            user_uuid="teacher_analytics",
            username="teacher.analytics",
            first_name="Teacher",
            middle_name="",
            last_name="Analytics",
            email="teacher.analytics@example.com",
            hashed_password="hashed",
            is_active=True,
            is_superuser=False,
            is_verified=True,
        ),
        "learner_a": User(
            id=2,
            user_uuid="learner_a",
            username="learner.a",
            first_name="Amina",
            middle_name="",
            last_name="A",
            email="amina@example.com",
            hashed_password="hashed",
            is_active=True,
            is_superuser=False,
            is_verified=True,
        ),
        "learner_b": User(
            id=3,
            user_uuid="learner_b",
            username="learner.b",
            first_name="Baur",
            middle_name="",
            last_name="B",
            email="baur@example.com",
            hashed_password="hashed",
            is_active=True,
            is_superuser=False,
            is_verified=True,
        ),
        "learner_c": User(
            id=4,
            user_uuid="learner_c",
            username="learner.c",
            first_name="Cholpon",
            middle_name="",
            last_name="C",
            email="cholpon@example.com",
            hashed_password="hashed",
            is_active=True,
            is_superuser=False,
            is_verified=True,
        ),
        "learner_d": User(
            id=5,
            user_uuid="learner_d",
            username="learner.d",
            first_name="Dana",
            middle_name="",
            last_name="D",
            email="dana@example.com",
            hashed_password="hashed",
            is_active=True,
            is_superuser=False,
            is_verified=True,
        ),
    }
    session.add_all(users.values())
    session.flush()
    return users


def _seed_course_stack(
    session: Session,
    *,
    name: str,
    activity_type: ActivityTypeEnum,
    activity_sub_type: ActivitySubTypeEnum,
):
    course = Course(
        id=1,
        name=name,
        description="",
        about="",
        learnings=None,
        tags=None,
        thumbnail_type=ThumbnailType.IMAGE,
        thumbnail_image="",
        thumbnail_video="",
        public=False,
        open_to_contributors=False,
        creator_id=1,
        course_uuid=f"course_{name.lower().replace(' ', '_')}",
    )
    session.add(course)
    session.flush()

    chapter = Chapter(
        id=1,
        name="Week 1",
        description="",
        thumbnail_image="",
        course_id=course.id,
        chapter_uuid=f"chapter_{course.id}",
        creator_id=1,
        order=1,
    )
    session.add(chapter)
    session.flush()

    activity = Activity(
        id=1,
        name=f"{name} activity",
        activity_type=activity_type,
        activity_sub_type=activity_sub_type,
        content={},
        details={},
        settings={},
        published=False,
        chapter_id=chapter.id,
        course_id=course.id,
        creator_id=1,
        activity_uuid=f"activity_{course.id}",
        order=1,
    )
    session.add(activity)
    session.flush()

    policy = AssessmentPolicy(
        id=1,
        policy_uuid=f"policy_{course.id}",
        activity_id=activity.id,
        assessment_type=AssessmentType.EXAM,
        grading_mode=AssessmentGradingMode.MANUAL,
        grade_release_mode=GradeReleaseMode.IMMEDIATE,
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

    return course, chapter, activity, policy


def _make_context_for_manual_assessment(session: Session, assessment_id: int) -> AnalyticsContext:
    course = session.get(Course, 1)
    activity = session.get(Activity, 1)
    assessment = session.get(Assessment, assessment_id)
    submissions = [session.get(Submission, submission_id) for submission_id in [1, 2, 3, 4]]
    users = session.execute(select(User)).scalars().all()
    users_by_id = {user.id: user for user in users if user.id is not None}
    manual_assessment_row = AssessmentAnalyticsRow(
        id=assessment.id,
        activity_id=activity.id,
        course_id=course.id,
        title=assessment.title,
        settings={},
    )
    return AnalyticsContext(
        generated_at=datetime(2026, 5, 5, 12, 0, tzinfo=UTC),
        courses_by_id={course.id: course},
        activities_by_id={activity.id: activity},
        chapters_by_id={},
        course_chapters=[],
        chapter_activities=[],
        trail_runs=[],
        trail_steps=[],
        activity_progress=[],
        course_progress=[],
        certificates=[],
        manual_assessments=[manual_assessment_row],
        manual_assessment_submissions=[
            (submission, manual_assessment_row) for submission in submissions if submission is not None
        ],
        exams=[],
        exam_attempts=[],
        quiz_submissions=[],
        quiz_question_stats=[],
        code_submissions=[],
        users_by_id=users_by_id,
        usergroup_names_by_id={10: "Alpha Cohort", 20: "Beta Cohort"},
        cohort_ids_by_user={2: {10}, 3: {10}, 4: {20}, 5: {20}},
    )


def _make_context_for_quiz(session: Session) -> AnalyticsContext:
    course = session.get(Course, 1)
    activity = session.get(Activity, 1)
    quiz_submission = session.get(Submission, 1)
    users = session.execute(select(User)).scalars().all()
    users_by_id = {user.id: user for user in users if user.id is not None}
    return AnalyticsContext(
        generated_at=datetime(2026, 5, 5, 12, 0, tzinfo=UTC),
        courses_by_id={course.id: course},
        activities_by_id={activity.id: activity},
        chapters_by_id={},
        course_chapters=[],
        chapter_activities=[],
        trail_runs=[],
        trail_steps=[],
        activity_progress=[],
        course_progress=[],
        certificates=[],
        manual_assessments=[],
        manual_assessment_submissions=[],
        exams=[],
        exam_attempts=[],
        quiz_submissions=[(quiz_submission, activity)],
        quiz_question_stats=[],
        code_submissions=[],
        users_by_id=users_by_id,
        usergroup_names_by_id={10: "Alpha Cohort"},
        cohort_ids_by_user={2: {10}},
    )


def test_assessment_rows_accept_progress_snapshot_mapping(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    course = Course(
        id=1,
        name="Snapshot Course",
        description="",
        about="",
        learnings=None,
        tags=None,
        thumbnail_type=ThumbnailType.IMAGE,
        thumbnail_image="",
        thumbnail_video="",
        public=False,
        open_to_contributors=False,
        creator_id=1,
        course_uuid="course_snapshot",
    )
    code_activity = Activity(
        id=3,
        name="Code challenge",
        activity_type=ActivityTypeEnum.TYPE_CODE_CHALLENGE,
        activity_sub_type=ActivitySubTypeEnum.SUBTYPE_CUSTOM,
        content={},
        details={},
        settings={},
        published=True,
        chapter_id=1,
        course_id=1,
        creator_id=1,
        activity_uuid="activity_code",
        order=1,
    )
    manual_assessment = AssessmentAnalyticsRow(
        id=1,
        activity_id=1,
        course_id=1,
        title="ManualAssessment",
        settings={},
    )
    exam = AssessmentAnalyticsRow(
        id=2,
        activity_id=2,
        course_id=1,
        title="Exam",
        settings={},
    )
    context = AnalyticsContext(
        generated_at=datetime(2026, 5, 5, 12, 0, tzinfo=UTC),
        courses_by_id={1: course},
        activities_by_id={3: code_activity},
        chapters_by_id={},
        course_chapters=[],
        chapter_activities=[],
        trail_runs=[],
        trail_steps=[],
        activity_progress=[],
        course_progress=[],
        certificates=[],
        manual_assessments=[manual_assessment],
        manual_assessment_submissions=[],
        exams=[exam],
        exam_attempts=[],
        quiz_submissions=[],
        quiz_question_stats=[],
        code_submissions=[],
        users_by_id={},
        usergroup_names_by_id={},
        cohort_ids_by_user={},
    )
    snapshots = {
        (1, 2): ProgressSnapshot(
            course_id=1,
            user_id=2,
            completed_steps=0,
            total_steps=1,
            progress_pct=0.0,
            is_completed=False,
            has_certificate=False,
            last_activity_at=None,
            trailrun_id=None,
        )
    }
    monkeypatch.setattr(
        "src.services.analytics.assessments.progress_snapshots",
        lambda _context, _allowed_user_ids: snapshots,
    )

    rows = build_assessment_rows(context)

    assert [row.assessment_type for row in rows] == [
        "manual_assessment",
        "exam",
        "code_challenge",
    ]


def test_manual_assessment_detail_endpoint_returns_operational_fields(
    api_client: TestClient,
    db_session_factory: Callable[[], Session],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    with db_session_factory() as session:
        _seed_users(session)
        _course, _chapter, activity, policy = _seed_course_stack(
            session,
            name="Analytics ManualAssessment",
            activity_type=ActivityTypeEnum.TYPE_FILE_SUBMISSION,
            activity_sub_type=ActivitySubTypeEnum.SUBTYPE_FILE_SUBMISSION_STANDARD,
        )
        assessment = Assessment(
            id=1,
            assessment_uuid="assessment_manual_assessment_analytics",
            activity_id=activity.id,
            kind=AssessmentType.EXAM,
            title="Operational manual_assessment",
            description="",
            lifecycle=AssessmentLifecycle.PUBLISHED,
            scheduled_at=None,
            published_at=datetime(2026, 5, 1, 8, 0, tzinfo=UTC),
            archived_at=None,
            weight=1.0,
            grading_type=AssessmentGradingType.PERCENTAGE,
            policy_id=policy.id,
        )
        session.add(assessment)
        session.flush()

        now = datetime(2026, 5, 5, 12, 0, tzinfo=UTC)
        session.add_all([
            Submission(
                id=1,
                submission_uuid="submission_pending",
                assessment_type=AssessmentType.EXAM,
                activity_id=activity.id,
                assessment_policy_id=policy.id,
                user_id=2,
                status=SubmissionStatus.PENDING,
                attempt_number=1,
                is_late=True,
                answers_json={},
                grading_json={},
                metadata_json={
                    "violations": [
                        {
                            "kind": "TAB_SWITCH",
                            "occurred_at": now.isoformat(),
                            "count": 1,
                        }
                    ]
                },
                submitted_at=now - timedelta(hours=80),
                created_at=now - timedelta(hours=82),
                updated_at=now - timedelta(hours=79),
            ),
            Submission(
                id=2,
                submission_uuid="submission_graded",
                assessment_type=AssessmentType.EXAM,
                activity_id=activity.id,
                assessment_policy_id=policy.id,
                user_id=3,
                status=SubmissionStatus.GRADED,
                attempt_number=1,
                final_score=74.0,
                answers_json={},
                grading_json={},
                metadata_json={},
                submitted_at=now - timedelta(hours=30),
                graded_at=now - timedelta(hours=20),
                created_at=now - timedelta(hours=31),
                updated_at=now - timedelta(hours=20),
            ),
            Submission(
                id=3,
                submission_uuid="submission_returned",
                assessment_type=AssessmentType.EXAM,
                activity_id=activity.id,
                assessment_policy_id=policy.id,
                user_id=4,
                status=SubmissionStatus.RETURNED,
                attempt_number=1,
                answers_json={},
                grading_json={},
                metadata_json={},
                submitted_at=now - timedelta(hours=12),
                created_at=now - timedelta(hours=13),
                updated_at=now - timedelta(hours=11),
            ),
            Submission(
                id=4,
                submission_uuid="submission_published",
                assessment_type=AssessmentType.EXAM,
                activity_id=activity.id,
                assessment_policy_id=policy.id,
                user_id=5,
                status=SubmissionStatus.PUBLISHED,
                attempt_number=1,
                final_score=91.0,
                answers_json={},
                grading_json={},
                metadata_json={},
                submitted_at=now - timedelta(hours=24),
                graded_at=now - timedelta(hours=12),
                created_at=now - timedelta(hours=25),
                updated_at=now - timedelta(hours=12),
            ),
        ])
        session.flush()

        session.add(
            GradingEntry(
                id=1,
                entry_uuid="entry_published",
                submission_id=4,
                graded_by=1,
                raw_score=91.0,
                penalty_pct=0.0,
                final_score=91.0,
                breakdown={},
                overall_feedback="Strong work",
                grading_version=1,
                created_at=now - timedelta(hours=12),
                published_at=now - timedelta(hours=11),
            )
        )
        session.add(
            BulkAction(
                id=1,
                action_uuid="bulk_release_1",
                performed_by=1,
                action_type=BulkActionType.RELEASE_GRADES,
                params={"release_mode": "immediate"},
                target_user_ids=[4, 5],
                activity_id=activity.id,
                status=BulkActionStatus.COMPLETED,
                affected_count=2,
                error_log="",
                created_at=now - timedelta(hours=5),
                completed_at=now - timedelta(hours=4),
            )
        )
        session.commit()

    monkeypatch.setattr(
        "src.services.analytics.assessments.load_analytics_context",
        lambda db_session, _course_ids: _make_context_for_manual_assessment(db_session, 1),
    )
    monkeypatch.setattr(
        "src.services.analytics.assessments.progress_snapshots",
        lambda _context, _allowed_user_ids: {(1, 2), (1, 3), (1, 4), (1, 5)},
    )

    response = api_client.get("/analytics/teacher/assessments/manual_assessment/1")

    assert response.status_code == 200
    payload = response.json()
    assert payload["diagnostics"] == {
        "manual_grading_required": True,
        "total_attempt_records": 4,
        "draft_attempts": 0,
        "awaiting_grading": 1,
        "graded_not_released": 1,
        "returned_for_resubmission": 1,
        "released": 1,
        "late_submissions": 1,
        "stale_backlog": 1,
        "suspicious_attempts": 1,
        "missing_scores": 2,
        "note": "ManualAssessments use canonical submission states and grading ledger history.",
    }
    assert payload["slo"]["status"] == "breached"
    assert payload["migration"]["compatibility_mode"] == "canonical"
    assert payload["migration"]["canonical_row_count"] == 4
    assert payload["support"]["alerts"][0]["code"] == "grading_slo_breached"
    assert payload["support"]["scoped_cohort_count"] == 2
    assert payload["cohort_analytics"][0]["cohort_name"] == "Beta Cohort"
    assert payload["item_analytics"][0]["item_key"] == "awaiting_grading"
    assert [event["source"] for event in payload["audit_history"][:2]] == [
        "bulk_action",
        "grading_entry",
    ]


def test_quiz_detail_endpoint_uses_canonical_submission_rows(
    api_client: TestClient,
    db_session_factory: Callable[[], Session],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    with db_session_factory() as session:
        _seed_users(session)
        _course, _chapter, activity, policy = _seed_course_stack(
            session,
            name="Analytics Quiz",
            activity_type=ActivityTypeEnum.TYPE_CUSTOM,
            activity_sub_type=ActivitySubTypeEnum.SUBTYPE_CUSTOM,
        )
        activity.name = "Legacy quiz activity"
        session.add(
            Submission(
                id=1,
                submission_uuid="submission_quiz_canonical",
                assessment_type=AssessmentType.QUIZ,
                activity_id=activity.id,
                assessment_policy_id=policy.id,
                user_id=2,
                status=SubmissionStatus.PUBLISHED,
                attempt_number=1,
                final_score=88.0,
                answers_json={},
                grading_json={
                    "items": [
                        {
                            "item_id": "q1",
                            "item_text": "Question 1",
                            "score": 88.0,
                            "max_score": 100.0,
                            "correct": True,
                            "feedback": "Correct",
                            "needs_manual_review": False,
                            "user_answer": ["a"],
                            "correct_answer": ["a"],
                        }
                    ],
                    "needs_manual_review": False,
                    "auto_graded": True,
                    "feedback": "",
                },
                metadata_json={
                    "attempt_uuid": "quiz_attempt_1",
                    "duration_seconds": 1800,
                    "violation_count": 2,
                    "violations": [
                        {
                            "kind": "TAB_SWITCH",
                            "occurred_at": "2026-05-05T09:00:00Z",
                            "count": 2,
                        }
                    ],
                },
                submitted_at=datetime(2026, 5, 5, 9, 0, tzinfo=UTC),
                graded_at=datetime(2026, 5, 5, 9, 0, tzinfo=UTC),
                started_at=datetime(2026, 5, 5, 8, 30, tzinfo=UTC),
                created_at=datetime(2026, 5, 5, 9, 0, tzinfo=UTC),
                updated_at=datetime(2026, 5, 5, 9, 0, tzinfo=UTC),
            )
        )
        session.commit()

    monkeypatch.setattr(
        "src.services.analytics.assessments.load_analytics_context",
        lambda db_session, _course_ids: _make_context_for_quiz(db_session),
    )
    monkeypatch.setattr(
        "src.services.analytics.assessments.progress_snapshots",
        lambda _context, _allowed_user_ids: {(1, 2)},
    )

    response = api_client.get("/analytics/teacher/assessments/quiz/1")

    assert response.status_code == 200
    payload = response.json()
    assert payload["diagnostics"]["released"] == 1
    assert payload["diagnostics"]["suspicious_attempts"] == 1
    assert payload["slo"]["status"] == "not_applicable"
    assert payload["migration"] == {
        "is_canonical": True,
        "canonical_row_count": 1,
        "cutover_ready": True,
        "compatibility_mode": "canonical",
        "note": "Assessment analytics detail is backed by canonical submission and grading records.",
    }
    assert payload["support"]["cutover_blockers"] == []
    assert payload["cohort_analytics"][0]["cohort_name"] == "Alpha Cohort"
    assert payload["audit_history"] == []


def test_overview_grading_slo_alerts_surface_breached_manual_assessments() -> None:
    workload = TeacherWorkloadSummary(
        backlog_total=4,
        sla_breaches=3,
        median_feedback_latency_hours=61.0,
        aging_buckets=WorkloadAgingBuckets(),
        forecast_backlog_7d=5,
        backlog_by_manual_assessment=[
            GradingBacklogItem(
                course_id=1,
                course_name="Analytics ManualAssessment",
                assessment_id=7,
                assessment_type="manual_assessment",
                title="Operational manual_assessment",
                awaiting_review=4,
                oldest_submitted_at="2026-05-02T10:00:00Z",
                age_hours=80.0,
                sla_breaches=3,
            )
        ],
    )

    alerts = _build_grading_slo_alerts(workload)

    assert len(alerts) == 1
    assert alerts[0].type == "grading_slo"
    assert alerts[0].severity == "critical"
    assert alerts[0].assessment_id == 7
    assert alerts[0].href == "/dash/analytics/assessments/manual_assessment/7"
    assert "72" in alerts[0].body
