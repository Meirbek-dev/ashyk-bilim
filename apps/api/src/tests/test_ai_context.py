import pathlib
import sys
from collections.abc import Callable, Iterator

import pytest
from sqlmodel import Session, SQLModel

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2]))
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from src.db.assessments import Assessment, AssessmentItem
from src.db.courses.activities import Activity, ActivitySubTypeEnum, ActivityTypeEnum
from src.db.courses.chapters import Chapter
from src.db.courses.courses import Course
from src.db.grading.progress import AssessmentPolicy
from src.db.grading.submissions import Submission
from src.db.users import User
from src.infra.db.engine import build_engine, build_session_factory
from src.infra.settings import get_settings
from src.services.ai.context.course_context import assemble_course_context


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
        ],
    )
    factory = build_session_factory(engine)
    try:
        yield factory
    finally:
        SQLModel.metadata.drop_all(
            engine,
            tables=[
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


def test_assemble_course_context_with_policy(db_session_factory: Callable[[], Session]) -> None:
    with db_session_factory() as session:
        # Create Course
        course = Course(
            id=1,
            course_uuid="course_1",
            name="Test Course",
            description="Test Description",
            about="About Test",
            learnings="Learning Outcomes",
            tags="test, tags",
            published=True,
            public=True,
        )
        session.add(course)

        # Create Chapter
        chapter = Chapter(
            id=1,
            chapter_uuid="chapter_1",
            course_id=1,
            name="Chapter 1",
            order=1,
        )
        session.add(chapter)

        # Create Activity
        activity = Activity(
            id=1,
            activity_uuid="activity_1",
            course_id=1,
            chapter_id=1,
            name="Activity 1",
            activity_type=ActivityTypeEnum.TYPE_EXAM,
            activity_sub_type=ActivitySubTypeEnum.SUBTYPE_EXAM_STANDARD,
            published=True,
            order=1,
            content={},
            details={},
        )
        session.add(activity)

        # Create AssessmentPolicy with settings_json
        policy = AssessmentPolicy(
            id=1,
            policy_uuid="policy_1",
            activity_id=1,
            assessment_type="QUIZ",
            settings_json={"time_limit": 60},
        )
        session.add(policy)
        session.commit()

        # Create Assessment referencing the policy
        assessment = Assessment(
            id=1,
            assessment_uuid="assessment_1",
            activity_id=1,
            kind="QUIZ",
            title="Assessment 1",
            policy_id=policy.id,
        )
        session.add(assessment)
        session.commit()

        # Assemble context
        context = assemble_course_context(session, course, include_unpublished=True)

        # Verify
        assert "Course: Test Course" in context
        assert 'Assessment settings: {"time_limit": 60}' in context


def test_assemble_course_context_without_policy(db_session_factory: Callable[[], Session]) -> None:
    with db_session_factory() as session:
        # Create Course
        course = Course(
            id=1,
            course_uuid="course_1",
            name="Test Course",
            description="Test Description",
            about="About Test",
            learnings="Learning Outcomes",
            tags="test, tags",
            published=True,
            public=True,
        )
        session.add(course)

        # Create Chapter
        chapter = Chapter(
            id=1,
            chapter_uuid="chapter_1",
            course_id=1,
            name="Chapter 1",
            order=1,
        )
        session.add(chapter)

        # Create Activity
        activity = Activity(
            id=1,
            activity_uuid="activity_1",
            course_id=1,
            chapter_id=1,
            name="Activity 1",
            activity_type=ActivityTypeEnum.TYPE_EXAM,
            activity_sub_type=ActivitySubTypeEnum.SUBTYPE_EXAM_STANDARD,
            published=True,
            order=1,
            content={},
            details={},
        )
        session.add(activity)

        # Create Assessment referencing NO policy
        assessment = Assessment(
            id=1,
            assessment_uuid="assessment_1",
            activity_id=1,
            kind="QUIZ",
            title="Assessment 1",
            policy_id=None,
        )
        session.add(assessment)
        session.commit()

        # Assemble context
        context = assemble_course_context(session, course, include_unpublished=True)

        # Verify
        assert "Course: Test Course" in context
        assert "Assessment settings: {}" in context
