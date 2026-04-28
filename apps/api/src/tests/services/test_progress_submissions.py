from __future__ import annotations

from datetime import UTC, datetime

import pytest
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine, select

from src.db.courses.activities import (
    Activity,
    ActivitySubTypeEnum,
    ActivityTypeEnum,
)
from src.db.courses.chapters import Chapter
from src.db.courses.courses import Course
from src.db.grading.progress import (
    ActivityProgress,
    ActivityProgressState,
    AssessmentPolicy,
    CourseProgress,
)
from src.db.grading.submissions import AssessmentType, Submission, SubmissionStatus
from src.db.model_registry import import_orm_models
from src.services.progress import submissions as progress_submissions


@pytest.fixture()
def db_session() -> Session:
    import_orm_models()
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        yield session


def seed_activity(db_session: Session) -> Activity:
    now = datetime.now(UTC)
    course = Course(
        id=1,
        name="Course",
        description="",
        about="",
        learnings="",
        tags="",
        thumbnail_image="",
        public=True,
        open_to_contributors=False,
        course_uuid="course_progress",
        creator_id=99,
    )
    chapter = Chapter(
        id=1,
        name="Chapter",
        chapter_uuid="chapter_progress",
        course_id=course.id,
        creator_id=99,
    )
    activity = Activity(
        id=1,
        name="Assignment",
        activity_type=ActivityTypeEnum.TYPE_ASSIGNMENT,
        activity_sub_type=ActivitySubTypeEnum.SUBTYPE_ASSIGNMENT_ANY,
        content={},
        details={},
        published=True,
        chapter_id=chapter.id,
        course_id=course.id,
        creator_id=99,
        activity_uuid="activity_progress",
        creation_date=now,
        update_date=now,
    )
    db_session.add(course)
    db_session.add(chapter)
    db_session.add(activity)
    db_session.commit()
    return activity


def add_second_published_activity(db_session: Session) -> Activity:
    now = datetime.now(UTC)
    activity = Activity(
        id=2,
        name="Document",
        activity_type=ActivityTypeEnum.TYPE_DOCUMENT,
        activity_sub_type=ActivitySubTypeEnum.SUBTYPE_DOCUMENT_PDF,
        content={},
        details={},
        published=True,
        chapter_id=1,
        course_id=1,
        creator_id=99,
        activity_uuid="activity_progress_document",
        creation_date=now,
        update_date=now,
    )
    db_session.add(activity)
    db_session.commit()
    return activity


def make_submission(
    activity: Activity,
    *,
    status: SubmissionStatus,
    score: float | None = None,
) -> Submission:
    now = datetime.now(UTC)
    return Submission(
        submission_uuid=f"submission_{status.value.lower()}",
        assessment_type=AssessmentType.ASSIGNMENT,
        activity_id=activity.id,
        user_id=10,
        status=status,
        attempt_number=1,
        answers_json={},
        grading_json={},
        final_score=score,
        started_at=now,
        submitted_at=now if status != SubmissionStatus.DRAFT else None,
        graded_at=now
        if status in {SubmissionStatus.GRADED, SubmissionStatus.PUBLISHED}
        else None,
        created_at=now,
        updated_at=now,
    )


def test_submission_write_projects_activity_and_course_progress(
    db_session: Session,
) -> None:
    activity = seed_activity(db_session)
    submission = make_submission(activity, status=SubmissionStatus.PENDING)

    progress_submissions.submit_activity(submission, db_session)

    policy = db_session.exec(select(AssessmentPolicy)).one()
    progress = db_session.exec(select(ActivityProgress)).one()
    course_progress = db_session.exec(select(CourseProgress)).one()

    assert submission.assessment_policy_id == policy.id
    assert progress.state == ActivityProgressState.NEEDS_GRADING
    assert progress.teacher_action_required is True
    assert progress.attempt_count == 1
    assert progress.latest_submission_id == submission.id
    assert course_progress.total_required_count == 1
    assert course_progress.needs_grading_count == 1


def test_publish_grade_recalculates_completion(
    db_session: Session,
) -> None:
    activity = seed_activity(db_session)
    submission = make_submission(
        activity,
        status=SubmissionStatus.PUBLISHED,
        score=85,
    )

    progress_submissions.publish_grade(submission, db_session)

    progress = db_session.exec(select(ActivityProgress)).one()
    course_progress = db_session.exec(select(CourseProgress)).one()

    assert progress.state == ActivityProgressState.PASSED
    assert progress.completed_at is not None
    assert progress.score == 85
    assert course_progress.completed_required_count == 1
    assert course_progress.progress_pct == 100


def test_course_progress_counts_unstarted_published_activities(
    db_session: Session,
) -> None:
    activity = seed_activity(db_session)
    add_second_published_activity(db_session)
    submission = make_submission(activity, status=SubmissionStatus.PENDING)

    progress_submissions.submit_activity(submission, db_session)

    progress_rows = db_session.exec(
        select(ActivityProgress).order_by(ActivityProgress.activity_id)
    ).all()
    course_progress = db_session.exec(select(CourseProgress)).one()

    assert [row.state for row in progress_rows] == [
        ActivityProgressState.NEEDS_GRADING,
        ActivityProgressState.NOT_STARTED,
    ]
    assert course_progress.total_required_count == 2
    assert course_progress.missing_required_count == 2
    assert course_progress.progress_pct == 0


def test_backfill_activity_progress_is_rerunnable(
    db_session: Session,
) -> None:
    activity = seed_activity(db_session)
    db_session.add(make_submission(activity, status=SubmissionStatus.PENDING))
    db_session.commit()

    first = progress_submissions.backfill_activity_progress(db_session)
    second = progress_submissions.backfill_activity_progress(db_session)

    progress_rows = db_session.exec(select(ActivityProgress)).all()
    policy_rows = db_session.exec(select(AssessmentPolicy)).all()

    assert first == {"activities": 1, "progress_rows_repaired": 1}
    assert second == {"activities": 1, "progress_rows_repaired": 1}
    assert len(progress_rows) == 1
    assert len(policy_rows) == 1
    assert progress_rows[0].state == ActivityProgressState.NEEDS_GRADING
