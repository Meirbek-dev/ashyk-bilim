from collections.abc import Iterator
from datetime import UTC, datetime

import pytest
from sqlmodel import Session, SQLModel

from src.db.courses.activities import Activity, ActivitySubTypeEnum, ActivityTypeEnum
from src.db.courses.chapters import Chapter
from src.db.courses.courses import Course, ThumbnailType
from src.db.file_submissions import FileSubmissionActivity, FileSubmissionAttempt
from src.db.grading.progress import ActivityProgress, ActivityProgressState
from src.db.grading.submissions import AssessmentType, Submission, SubmissionStatus
from src.db.resource_authors import ResourceAuthor
from src.db.users import PublicUser, User
from src.infra.db.engine import build_engine
from src.infra.settings import get_settings
from src.services.work_queue import get_work_queue


@pytest.fixture(name="work_session")
def work_session_fixture() -> Iterator[Session]:
    engine = build_engine(get_settings())
    tables = [
        User.__table__,
        Course.__table__,
        Chapter.__table__,
        Activity.__table__,
        FileSubmissionActivity.__table__,
        FileSubmissionAttempt.__table__,
        Submission.__table__,
        ActivityProgress.__table__,
        ResourceAuthor.__table__,
    ]
    SQLModel.metadata.create_all(engine, tables=tables)
    with Session(engine) as session:
        yield session
    SQLModel.metadata.drop_all(engine, tables=list(reversed(tables)))
    engine.dispose()


def test_work_queue_projects_returned_learner_work_and_teacher_grading(work_session: Session) -> None:
    teacher = User(
        id=1,
        user_uuid="user_teacher_work",
        username="teacher.work",
        first_name="Aigerim",
        middle_name="",
        last_name="Teacher",
        email="teacher.work@example.com",
        hashed_password="hashed",
        is_active=True,
        is_verified=True,
    )
    learner = User(
        id=2,
        user_uuid="user_learner_work",
        username="learner.work",
        first_name="Dias",
        middle_name="",
        last_name="Learner",
        email="learner.work@example.com",
        hashed_password="hashed",
        is_active=True,
        is_verified=True,
    )
    work_session.add_all([teacher, learner])
    work_session.flush()
    course = Course(
        name="Evidence Course",
        description="",
        about="",
        learnings=None,
        tags=None,
        thumbnail_type=ThumbnailType.IMAGE,
        thumbnail_image="",
        thumbnail_video="",
        public=True,
        creator_id=teacher.id,
        course_uuid="course_work_queue",
    )
    work_session.add(course)
    work_session.flush()
    chapter = Chapter(
        name="Portfolio",
        description="",
        thumbnail_image="",
        course_id=course.id,
        creator_id=teacher.id,
        chapter_uuid="chapter_work_queue",
        order=1,
    )
    work_session.add(chapter)
    work_session.flush()
    activity = Activity(
        name="Submit evidence",
        activity_type=ActivityTypeEnum.TYPE_FILE_SUBMISSION,
        activity_sub_type=ActivitySubTypeEnum.SUBTYPE_FILE_SUBMISSION_STANDARD,
        content={},
        details={},
        settings={},
        published=True,
        chapter_id=chapter.id,
        course_id=course.id,
        creator_id=teacher.id,
        activity_uuid="activity_work_queue",
        order=1,
    )
    work_session.add(activity)
    work_session.flush()
    now = datetime.now(UTC)
    work_session.add(
        ActivityProgress(
            course_id=course.id,
            activity_id=activity.id,
            user_id=learner.id,
            state=ActivityProgressState.RETURNED,
            teacher_action_required=True,
            submitted_at=now,
            updated_at=now,
        )
    )
    work_session.commit()

    learner_queue = get_work_queue(PublicUser.model_validate(learner), work_session, role="learner")
    teacher_queue = get_work_queue(PublicUser.model_validate(teacher), work_session, role="teacher")

    assert learner_queue.total == 1
    assert learner_queue.items[0].kind == "returned_for_revision"
    assert learner_queue.items[0].primary_action == "Revise work"
    assert teacher_queue.total == 1
    assert teacher_queue.items[0].kind == "needs_grading"
    assert teacher_queue.items[0].href.endswith("/review")


def test_work_queue_cursor_is_stable_and_does_not_repeat_items(work_session: Session) -> None:
    teacher = User(
        id=10,
        user_uuid="user_teacher_cursor",
        username="teacher.cursor",
        first_name="Teacher",
        middle_name="",
        last_name="Cursor",
        email="teacher.cursor@example.com",
        hashed_password="hashed",
        is_active=True,
        is_verified=True,
    )
    learner = User(
        id=11,
        user_uuid="user_learner_cursor",
        username="learner.cursor",
        first_name="Learner",
        middle_name="",
        last_name="Cursor",
        email="learner.cursor@example.com",
        hashed_password="hashed",
        is_active=True,
        is_verified=True,
    )
    work_session.add_all([teacher, learner])
    work_session.flush()
    course = Course(
        name="Cursor Course",
        description="",
        about="",
        learnings=None,
        tags=None,
        thumbnail_type=ThumbnailType.IMAGE,
        thumbnail_image="",
        thumbnail_video="",
        public=True,
        creator_id=teacher.id,
        course_uuid="course_work_cursor",
    )
    work_session.add(course)
    work_session.flush()
    chapter = Chapter(
        name="Queue",
        description="",
        thumbnail_image="",
        course_id=course.id,
        creator_id=teacher.id,
        chapter_uuid="chapter_work_cursor",
        order=1,
    )
    work_session.add(chapter)
    work_session.flush()
    now = datetime.now(UTC)
    for index in range(3):
        activity = Activity(
            name=f"Task {index}",
            activity_type=ActivityTypeEnum.TYPE_FILE_SUBMISSION,
            activity_sub_type=ActivitySubTypeEnum.SUBTYPE_FILE_SUBMISSION_STANDARD,
            content={},
            details={},
            settings={},
            published=True,
            chapter_id=chapter.id,
            course_id=course.id,
            creator_id=teacher.id,
            activity_uuid=f"activity_work_cursor_{index}",
            order=index,
        )
        work_session.add(activity)
        work_session.flush()
        work_session.add(
            ActivityProgress(
                course_id=course.id,
                activity_id=activity.id,
                user_id=learner.id,
                state=ActivityProgressState.IN_PROGRESS,
                started_at=now,
                updated_at=now,
            )
        )
    work_session.commit()

    user = PublicUser.model_validate(learner)
    first = get_work_queue(user, work_session, role="learner", limit=2)
    second = get_work_queue(user, work_session, role="learner", limit=2, cursor=first.next_cursor)

    assert first.total == 3
    assert first.next_cursor is not None
    assert len(first.items) == 2
    assert len(second.items) == 1
    assert {item.id for item in first.items}.isdisjoint(item.id for item in second.items)


def test_unreleased_grade_is_teacher_work_but_not_learner_feedback(work_session: Session) -> None:
    teacher = User(
        id=20,
        user_uuid="user_teacher_release",
        username="teacher.release",
        first_name="Teacher",
        middle_name="",
        last_name="Release",
        email="teacher.release@example.com",
        hashed_password="hashed",
        is_active=True,
        is_verified=True,
    )
    learner = User(
        id=21,
        user_uuid="user_learner_release",
        username="learner.release",
        first_name="Learner",
        middle_name="",
        last_name="Release",
        email="learner.release@example.com",
        hashed_password="hashed",
        is_active=True,
        is_verified=True,
    )
    work_session.add_all([teacher, learner])
    work_session.flush()
    course = Course(
        name="Release Course",
        description="",
        about="",
        learnings=None,
        tags=None,
        thumbnail_type=ThumbnailType.IMAGE,
        thumbnail_image="",
        thumbnail_video="",
        public=True,
        creator_id=teacher.id,
        course_uuid="course_work_release",
    )
    work_session.add(course)
    work_session.flush()
    chapter = Chapter(
        name="Assessment",
        description="",
        thumbnail_image="",
        course_id=course.id,
        creator_id=teacher.id,
        chapter_uuid="chapter_work_release",
        order=1,
    )
    work_session.add(chapter)
    work_session.flush()
    activity = Activity(
        name="Final exam",
        activity_type=ActivityTypeEnum.TYPE_EXAM,
        activity_sub_type=ActivitySubTypeEnum.SUBTYPE_EXAM_STANDARD,
        content={},
        details={},
        settings={},
        published=True,
        chapter_id=chapter.id,
        course_id=course.id,
        creator_id=teacher.id,
        activity_uuid="activity_work_release",
        order=1,
    )
    work_session.add(activity)
    work_session.flush()
    now = datetime.now(UTC)
    submission = Submission(
        submission_uuid="submission_work_release",
        assessment_type=AssessmentType.EXAM,
        activity_id=activity.id,
        user_id=learner.id,
        status=SubmissionStatus.GRADED,
        attempt_number=1,
        answers_json={},
        grading_json={},
        final_score=88,
        started_at=now,
        submitted_at=now,
        graded_at=now,
    )
    work_session.add(submission)
    work_session.flush()
    work_session.add(
        ActivityProgress(
            course_id=course.id,
            activity_id=activity.id,
            user_id=learner.id,
            state=ActivityProgressState.GRADED,
            latest_submission_id=submission.id,
            submitted_at=now,
            graded_at=now,
            updated_at=now,
        )
    )
    work_session.commit()

    learner_queue = get_work_queue(PublicUser.model_validate(learner), work_session, role="learner")
    teacher_queue = get_work_queue(PublicUser.model_validate(teacher), work_session, role="teacher")

    assert learner_queue.items == []
    assert teacher_queue.items[0].kind == "awaiting_release"
    assert teacher_queue.items[0].href.endswith("?submission=submission_work_release")
