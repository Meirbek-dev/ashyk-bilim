# pyright: reportMissingImports=false, reportUnusedImport=false

import pathlib
import sys
from collections.abc import Callable, Iterator
from datetime import UTC, datetime

import pytest
from sqlmodel import Session, SQLModel

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2]))
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from src.db.assessments import (
    Assessment,
    AssessmentGradingType,
    AssessmentItem,
    AssessmentLifecycle,
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
from src.db.users import User
from src.infra.db.engine import build_engine, build_session_factory
from src.infra.settings import get_settings
from src.services.assessments._shared import (
    _get_items,
    _get_policy_for_assessment,
    build_readiness,
)


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


def test_auto_heal_missing_policy(db_session_factory: Callable[[], Session]) -> None:
    with db_session_factory() as session:
        user = User(
            id=1,
            user_uuid="user_teacher_healing",
            username="teacher.healing",
            first_name="Teacher",
            middle_name="",
            last_name="Healing",
            email="teacher.healing@example.com",
            hashed_password="hashed",
            is_active=True,
            is_superuser=False,
            is_verified=True,
        )
        session.add(user)
        session.flush()

        course = Course(
            name="Healing Course",
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
            course_uuid="course_healing",
        )
        session.add(course)
        session.flush()

        chapter = Chapter(
            name="Week 1",
            description="",
            thumbnail_image="",
            course_id=course.id,
            chapter_uuid="chapter_healing",
            creator_id=user.id,
            order=1,
        )
        session.add(chapter)
        session.flush()

        activity = Activity(
            name="Healing Code Challenge",
            activity_type=ActivityTypeEnum.TYPE_CODE_CHALLENGE,
            activity_sub_type=ActivitySubTypeEnum.SUBTYPE_CODE_GENERAL,
            content={},
            details={},
            settings={},
            published=False,
            chapter_id=chapter.id,
            course_id=course.id,
            creator_id=user.id,
            activity_uuid="activity_healing",
            order=1,
        )
        session.add(activity)
        session.flush()

        # Create assessment without policy_id set
        assessment = Assessment(
            assessment_uuid="assessment_healing_code",
            activity_id=activity.id,
            kind=AssessmentType.CODE_CHALLENGE,
            title="Healing Code Challenge",
            description="Challenge description",
            lifecycle=AssessmentLifecycle.DRAFT,
            scheduled_at=None,
            published_at=None,
            archived_at=None,
            weight=1.0,
            grading_type=AssessmentGradingType.PERCENTAGE,
            policy_id=None,  # Missing policy_id
        )
        session.add(assessment)
        session.commit()
        session.refresh(assessment)

        assert assessment.policy_id is None

        # Resolve policy - should automatically create and link policy
        policy = _get_policy_for_assessment(assessment, session)
        assert policy is not None
        assert policy.activity_id == activity.id
        assert policy.assessment_type == AssessmentType.CODE_CHALLENGE

        session.refresh(assessment)
        assert assessment.policy_id == policy.id


def test_auto_heal_empty_code_challenge_items(db_session_factory: Callable[[], Session]) -> None:
    with db_session_factory() as session:
        user = User(
            id=1,
            user_uuid="user_teacher_healing_items",
            username="teacher.healing.items",
            first_name="Teacher",
            middle_name="",
            last_name="Healing",
            email="teacher.healing.items@example.com",
            hashed_password="hashed",
            is_active=True,
            is_superuser=False,
            is_verified=True,
        )
        session.add(user)
        session.flush()

        course = Course(
            name="Healing Course 2",
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
            course_uuid="course_healing_2",
        )
        session.add(course)
        session.flush()

        chapter = Chapter(
            name="Week 1",
            description="",
            thumbnail_image="",
            course_id=course.id,
            chapter_uuid="chapter_healing_2",
            creator_id=user.id,
            order=1,
        )
        session.add(chapter)
        session.flush()

        activity = Activity(
            name="Healing Code Challenge 2",
            activity_type=ActivityTypeEnum.TYPE_CODE_CHALLENGE,
            activity_sub_type=ActivitySubTypeEnum.SUBTYPE_CODE_GENERAL,
            content={},
            details={},
            settings={},
            published=False,
            chapter_id=chapter.id,
            course_id=course.id,
            creator_id=user.id,
            activity_uuid="activity_healing_2",
            order=1,
        )
        session.add(activity)
        session.flush()

        policy = AssessmentPolicy(
            policy_uuid="policy_healing_2",
            activity_id=activity.id,
            assessment_type=AssessmentType.CODE_CHALLENGE,
            grading_mode=AssessmentGradingMode.MANUAL,
            grade_release_mode=GradeReleaseMode.IMMEDIATE,
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
            assessment_uuid="assessment_healing_code_2",
            activity_id=activity.id,
            kind=AssessmentType.CODE_CHALLENGE,
            title="Healing Code Challenge 2",
            description="Challenge description",
            lifecycle=AssessmentLifecycle.DRAFT,
            scheduled_at=None,
            published_at=None,
            archived_at=None,
            weight=1.0,
            grading_type=AssessmentGradingType.PERCENTAGE,
            policy_id=policy.id,
        )
        session.add(assessment)
        session.commit()
        session.refresh(assessment)

        # Get items - should auto-create the CODE item
        items = _get_items(assessment, session)
        assert len(items) == 1
        assert items[0].kind == "CODE"
        assert items[0].title == "Healing Code Challenge 2"
        assert items[0].body_json["kind"] == "CODE"

        # Check readiness - should NOT report assessment.empty and policy.missing
        readiness = build_readiness(assessment, session)
        issue_codes = [issue.code for issue in readiness.issues]
        assert "assessment.empty" not in issue_codes
        assert "policy.missing" not in issue_codes
        assert "code.languages_missing" in issue_codes
        assert "code.tests_missing" in issue_codes
