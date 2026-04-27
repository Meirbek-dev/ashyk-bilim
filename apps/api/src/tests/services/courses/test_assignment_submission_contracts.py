from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine, select

from src.db.courses.activities import (
    Activity,
    ActivitySubTypeEnum,
    ActivityTypeEnum,
)
from src.db.courses.assignments import (
    Assignment,
    AssignmentDraftPatch,
    AssignmentTask,
    AssignmentTaskAnswer,
    AssignmentTaskTypeEnum,
    GradingTypeEnum,
)
from src.db.courses.chapters import Chapter
from src.db.courses.courses import Course
from src.db.grading.submissions import Submission, SubmissionStatus
from src.db.model_registry import import_orm_models
from src.db.users import PublicUser
from src.services.courses.activities import assignments as assignment_service


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


@pytest.fixture()
def current_user() -> PublicUser:
    return PublicUser(
        id=10,
        user_uuid="user_10",
        username="student",
        first_name="Student",
        middle_name="",
        last_name="One",
        email="student@example.com",
        avatar_image="",
        bio="",
        details={},
        profile={},
        theme="default",
        locale="en-US",
    )


def seed_assignment(
    db_session: Session,
) -> tuple[Assignment, AssignmentTask, AssignmentTask]:
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
        course_uuid="course_test",
        creator_id=99,
    )
    chapter = Chapter(
        id=1,
        name="Chapter",
        chapter_uuid="chapter_test",
        course_id=course.id,
        creator_id=99,
    )
    activity = Activity(
        id=1,
        name="Assignment activity",
        activity_type=ActivityTypeEnum.TYPE_ASSIGNMENT,
        activity_sub_type=ActivitySubTypeEnum.SUBTYPE_ASSIGNMENT_ANY,
        content={},
        details={},
        published=True,
        chapter_id=chapter.id,
        course_id=course.id,
        creator_id=99,
        activity_uuid="activity_test",
        creation_date=now,
        update_date=now,
    )
    assignment = Assignment(
        id=1,
        assignment_uuid="assignment_test",
        title="Assignment",
        description="",
        due_date=(now + timedelta(days=1)).date().isoformat(),
        due_at=now + timedelta(days=1),
        published=True,
        grading_type=GradingTypeEnum.PERCENTAGE,
        course_id=course.id,
        chapter_id=chapter.id,
        activity_id=activity.id,
        creation_date=now.isoformat(),
        update_date=now.isoformat(),
    )
    file_task = AssignmentTask(
        id=1,
        assignment_task_uuid="assignmenttask_file",
        title="File task",
        description="",
        hint="",
        reference_file=None,
        assignment_type=AssignmentTaskTypeEnum.FILE_SUBMISSION,
        contents={},
        max_grade_value=40,
        order=0,
        assignment_id=assignment.id,
        course_id=course.id,
        chapter_id=chapter.id,
        activity_id=activity.id,
        creation_date=now.isoformat(),
        update_date=now.isoformat(),
    )
    form_task = AssignmentTask(
        id=2,
        assignment_task_uuid="assignmenttask_form",
        title="Form task",
        description="",
        hint="",
        reference_file=None,
        assignment_type=AssignmentTaskTypeEnum.FORM,
        contents={},
        max_grade_value=60,
        order=1,
        assignment_id=assignment.id,
        course_id=course.id,
        chapter_id=chapter.id,
        activity_id=activity.id,
        creation_date=now.isoformat(),
        update_date=now.isoformat(),
    )

    db_session.add(course)
    db_session.add(chapter)
    db_session.add(activity)
    db_session.add(assignment)
    db_session.add(file_task)
    db_session.add(form_task)
    db_session.commit()

    return assignment, file_task, form_task


@pytest.mark.asyncio
async def test_save_assignment_draft_upserts_single_submission(
    db_session: Session,
    current_user: PublicUser,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    assignment, file_task, form_task = seed_assignment(db_session)
    monkeypatch.setattr(
        assignment_service,
        "_require_assignment_submit_access",
        lambda *_args, **_kwargs: None,
    )

    first = await assignment_service.save_assignment_draft_submission(
        request=None,  # type: ignore[arg-type]
        assignment_uuid=assignment.assignment_uuid,
        draft_patch=AssignmentDraftPatch(
            tasks=[
                AssignmentTaskAnswer(
                    task_uuid=file_task.assignment_task_uuid,
                    content_type="file",
                    file_key="file_1.pdf",
                )
            ]
        ),
        current_user=current_user,
        db_session=db_session,
    )
    second = await assignment_service.save_assignment_draft_submission(
        request=None,  # type: ignore[arg-type]
        assignment_uuid=assignment.assignment_uuid,
        draft_patch=AssignmentDraftPatch(
            tasks=[
                AssignmentTaskAnswer(
                    task_uuid=form_task.assignment_task_uuid,
                    content_type="form",
                    form_data={"blank_1": "answer"},
                )
            ]
        ),
        current_user=current_user,
        db_session=db_session,
    )

    submissions = db_session.exec(select(Submission)).all()
    assert len(submissions) == 1
    assert first.submission_uuid == second.submission_uuid
    assert second.status == SubmissionStatus.DRAFT
    assert second.answers_json == {
        "tasks": [
            {
                "task_uuid": file_task.assignment_task_uuid,
                "content_type": "file",
                "file_key": "file_1.pdf",
            },
            {
                "task_uuid": form_task.assignment_task_uuid,
                "content_type": "form",
                "form_data": {"blank_1": "answer"},
            },
        ]
    }


@pytest.mark.asyncio
async def test_submit_assignment_draft_moves_to_pending_with_breakdown(
    db_session: Session,
    current_user: PublicUser,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    assignment, file_task, _form_task = seed_assignment(db_session)
    monkeypatch.setattr(
        assignment_service,
        "_require_assignment_submit_access",
        lambda *_args, **_kwargs: None,
    )

    submitted = await assignment_service.submit_assignment_draft_submission(
        request=None,  # type: ignore[arg-type]
        assignment_uuid=assignment.assignment_uuid,
        draft_patch=AssignmentDraftPatch(
            tasks=[
                AssignmentTaskAnswer(
                    task_uuid=file_task.assignment_task_uuid,
                    content_type="file",
                    file_key="file_1.pdf",
                )
            ]
        ),
        current_user=current_user,
        db_session=db_session,
    )

    assert submitted.status == SubmissionStatus.PENDING
    assert submitted.submitted_at is not None
    assert submitted.is_late is False
    assert [item.item_id for item in submitted.grading_json.items] == [
        "assignmenttask_file",
        "assignmenttask_form",
    ]
    assert submitted.grading_json.items[0].user_answer == {
        "content_type": "file",
        "file_key": "file_1.pdf",
    }
