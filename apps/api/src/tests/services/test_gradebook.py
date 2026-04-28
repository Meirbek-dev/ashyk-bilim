from datetime import UTC, datetime

import pytest
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine

from src.db.courses.activities import (
    Activity,
    ActivitySubTypeEnum,
    ActivityTypeEnum,
)
from src.db.courses.chapters import Chapter
from src.db.courses.courses import Course
from src.db.grading.progress import ActivityProgressState
from src.db.grading.submissions import AssessmentType, Submission, SubmissionStatus
from src.db.model_registry import import_orm_models
from src.db.users import PublicUser, User
from src.services.grading import gradebook as gradebook_service
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


@pytest.mark.asyncio
async def test_course_gradebook_returns_student_activity_matrix(
    db_session: Session,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    now = datetime.now(UTC)
    teacher = PublicUser(
        id=99,
        user_uuid="user_teacher",
        username="teacher",
        first_name="Teacher",
        middle_name="",
        last_name="One",
        email="teacher@example.com",
        avatar_image="",
        bio="",
        details={},
        profile={},
        theme="default",
        locale="en-US",
    )
    student = User(
        id=10,
        user_uuid="user_student",
        username="student",
        first_name="Student",
        middle_name="",
        last_name="One",
        email="student@example.com",
        hashed_password="",
    )
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
        course_uuid="course_gradebook",
        creator_id=teacher.id,
    )
    chapter = Chapter(
        id=1,
        name="Chapter",
        chapter_uuid="chapter_gradebook",
        course_id=course.id,
        creator_id=teacher.id,
    )
    assignment = Activity(
        id=1,
        name="Assignment",
        activity_type=ActivityTypeEnum.TYPE_ASSIGNMENT,
        activity_sub_type=ActivitySubTypeEnum.SUBTYPE_ASSIGNMENT_ANY,
        content={},
        details={},
        published=True,
        chapter_id=chapter.id,
        course_id=course.id,
        creator_id=teacher.id,
        activity_uuid="activity_assignment",
        creation_date=now,
        update_date=now,
    )
    document = Activity(
        id=2,
        name="Document",
        activity_type=ActivityTypeEnum.TYPE_DOCUMENT,
        activity_sub_type=ActivitySubTypeEnum.SUBTYPE_DOCUMENT_PDF,
        content={},
        details={},
        published=True,
        chapter_id=chapter.id,
        course_id=course.id,
        creator_id=teacher.id,
        activity_uuid="activity_document",
        creation_date=now,
        update_date=now,
    )
    submission = Submission(
        submission_uuid="submission_gradebook",
        assessment_type=AssessmentType.ASSIGNMENT,
        activity_id=assignment.id,
        user_id=student.id,
        status=SubmissionStatus.PENDING,
        attempt_number=1,
        answers_json={},
        grading_json={},
        submitted_at=now,
        created_at=now,
        updated_at=now,
    )

    db_session.add(student)
    db_session.add(course)
    db_session.add(chapter)
    db_session.add(assignment)
    db_session.add(document)
    db_session.commit()
    progress_submissions.submit_activity(submission, db_session)
    monkeypatch.setattr(
        gradebook_service,
        "_require_gradebook_access",
        lambda *_args, **_kwargs: None,
    )

    gradebook = await gradebook_service.get_course_gradebook(
        course_uuid=course.course_uuid,
        current_user=teacher,
        db_session=db_session,
    )

    assert [activity.name for activity in gradebook.activities] == [
        "Assignment",
        "Document",
    ]
    assert [student.username for student in gradebook.students] == ["student"]
    assert [cell.state for cell in gradebook.cells] == [
        ActivityProgressState.NEEDS_GRADING,
        ActivityProgressState.NOT_STARTED,
    ]
    assert gradebook.summary.needs_grading_count == 1
    assert gradebook.summary.not_started_count == 1
