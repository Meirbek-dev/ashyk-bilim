# pyright: reportMissingImports=false, reportUnusedImport=false
import pathlib
import sys
from collections.abc import Callable
from datetime import UTC, datetime
from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlmodel import Session, SQLModel, select

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2]))
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from src.auth.users import get_optional_public_user, get_public_user
from src.db.courses.activities import Activity, ActivitySubTypeEnum, ActivityTypeEnum
from src.db.courses.chapters import Chapter
from src.db.courses.courses import Course, ThumbnailType
from src.db.file_submissions import (
    FileSubmissionActivity,
    FileSubmissionAttempt,
    FileSubmissionAttemptFile,
    FileSubmissionAttemptStatus,
    FileSubmissionLifecycle,
)
from src.db.grading.progress import ActivityProgress, CourseProgress
from src.db.uploads import Upload
from src.db.users import PublicUser, User
from src.infra.db.engine import build_engine, build_session_factory
from src.infra.db.session import get_db_session
from src.infra.settings import get_settings
from src.routers.file_submissions import router as file_submissions_router

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

_ALL_TABLES = [
    User.__table__,
    Course.__table__,
    Chapter.__table__,
    Activity.__table__,
    FileSubmissionActivity.__table__,
    FileSubmissionAttempt.__table__,
    Upload.__table__,
    FileSubmissionAttemptFile.__table__,
    ActivityProgress.__table__,
    CourseProgress.__table__,
]


@pytest.fixture(name="db_session_factory")
def db_session_factory_fixture():
    engine = build_engine(get_settings())
    SQLModel.metadata.create_all(engine, tables=_ALL_TABLES)
    factory = build_session_factory(engine)
    try:
        yield factory
    finally:
        SQLModel.metadata.drop_all(engine, tables=list(reversed(_ALL_TABLES)))
        engine.dispose()


@pytest.fixture(name="student_user")
def student_user_fixture() -> PublicUser:
    return PublicUser(
        id=2,
        user_uuid="user_student_filesub",
        username="student.filesub",
        first_name="Student",
        middle_name="",
        last_name="Filesub",
        email="student.filesub@example.com",
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


def _make_app(db_session_factory: Callable[[], Session], current_user: PublicUser, monkeypatch: pytest.MonkeyPatch) -> FastAPI:
    app = FastAPI()
    app.include_router(file_submissions_router, prefix="/file-submissions")

    def override_get_db_session():
        session = db_session_factory()
        try:
            yield session
        finally:
            session.close()

    app.dependency_overrides[get_db_session] = override_get_db_session
    app.dependency_overrides[get_public_user] = lambda: current_user
    app.dependency_overrides[get_optional_public_user] = lambda: current_user

    from src.services import file_submissions

    monkeypatch.setattr(file_submissions, "_require_submit_access", lambda *_a, **_kw: None)
    monkeypatch.setattr(file_submissions, "recalculate_course_progress", lambda *_a, **_kw: None)

    return app


def _seed_file_submission(
    db_session_factory: Callable[[], Session],
    *,
    max_attempts: int | None = 1,
    lifecycle: FileSubmissionLifecycle = FileSubmissionLifecycle.PUBLISHED,
) -> str:
    with db_session_factory() as session:
        teacher = User(
            id=1,
            user_uuid="user_teacher_filesub",
            username="teacher.filesub",
            first_name="Teacher",
            middle_name="",
            last_name="Filesub",
            email="teacher.filesub@example.com",
            hashed_password="hashed",
            is_active=True,
            is_superuser=False,
            is_verified=True,
        )
        student = User(
            id=2,
            user_uuid="user_student_filesub",
            username="student.filesub",
            first_name="Student",
            middle_name="",
            last_name="Filesub",
            email="student.filesub@example.com",
            hashed_password="hashed",
            is_active=True,
            is_superuser=False,
            is_verified=True,
        )
        session.add_all([teacher, student])
        session.flush()

        course = Course(
            name="Filesub Course",
            description="",
            about="",
            learnings=None,
            tags=None,
            thumbnail_type=ThumbnailType.IMAGE,
            thumbnail_image="",
            thumbnail_video="",
            public=True,
            open_to_contributors=False,
            creator_id=teacher.id,
            course_uuid="course_filesub",
        )
        session.add(course)
        session.flush()

        chapter = Chapter(
            name="Week 1",
            description="",
            thumbnail_image="",
            course_id=course.id,
            chapter_uuid="chapter_filesub",
            creator_id=teacher.id,
            order=1,
        )
        session.add(chapter)
        session.flush()

        activity = Activity(
            name="File Submission Activity",
            activity_type=ActivityTypeEnum.TYPE_FILE_SUBMISSION,
            activity_sub_type=ActivitySubTypeEnum.SUBTYPE_FILE_SUBMISSION_STANDARD,
            content={},
            details={},
            settings={},
            published=(lifecycle == FileSubmissionLifecycle.PUBLISHED),
            chapter_id=chapter.id,
            course_id=course.id,
            creator_id=teacher.id,
            activity_uuid="activity_filesub",
            order=1,
        )
        session.add(activity)
        session.flush()

        file_submission = FileSubmissionActivity(
            file_submission_uuid="filesub_01KRKR3H1CJPZMCPT9H4FBG2DX",
            activity_id=activity.id,
            instructions="Submit your work.",
            max_attempts=max_attempts,
            lifecycle=lifecycle,
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        )
        session.add(file_submission)
        session.commit()
        return file_submission.file_submission_uuid


def test_start_draft_when_returned_and_max_attempts_reached(db_session_factory: Callable[[], Session], student_user: PublicUser, monkeypatch: pytest.MonkeyPatch) -> None:
    """Reproduce 409 Conflict when a student tries to start a draft
    after an attempt has been RETURNED and max_attempts=1.
    """
    file_submission_uuid = _seed_file_submission(db_session_factory, max_attempts=1)

    # Pre-seed a RETURNED attempt
    with db_session_factory() as session:
        file_sub = session.exec(
            select(FileSubmissionActivity).where(FileSubmissionActivity.file_submission_uuid == file_submission_uuid)
        ).one()
        activity = session.get(Activity, file_sub.activity_id)

        now = datetime.now(UTC)
        attempt = FileSubmissionAttempt(
            attempt_uuid="filesub_attempt_returned",
            file_submission_id=file_sub.id,
            activity_id=activity.id,
            user_id=student_user.id,
            status=FileSubmissionAttemptStatus.RETURNED,
            attempt_number=1,
            started_at=now,
            submitted_at=now,
            created_at=now,
            updated_at=now,
        )
        session.add(attempt)
        session.commit()

    app = _make_app(db_session_factory, student_user, monkeypatch)
    client = TestClient(app)

    # This should return the existing RETURNED attempt (or a new DRAFT if we decide so),
    # but currently it raises 409 because it counts the RETURNED attempt as completed.
    response = client.post(f"/file-submissions/{file_submission_uuid}/draft")

    assert response.status_code == 200
    assert response.json()["status"] == "RETURNED"


def test_save_draft_when_returned_and_max_attempts_reached(db_session_factory: Callable[[], Session], student_user: PublicUser, monkeypatch: pytest.MonkeyPatch) -> None:
    """Ensure student can save a draft (patch files) on a RETURNED attempt
    even when max_attempts=1.
    """
    file_submission_uuid = _seed_file_submission(db_session_factory, max_attempts=1)

    with db_session_factory() as session:
        file_sub = session.exec(
            select(FileSubmissionActivity).where(FileSubmissionActivity.file_submission_uuid == file_submission_uuid)
        ).one()
        activity = session.get(Activity, file_sub.activity_id)

        now = datetime.now(UTC)
        attempt = FileSubmissionAttempt(
            attempt_uuid="filesub_attempt_returned_save",
            file_submission_id=file_sub.id,
            activity_id=activity.id,
            user_id=student_user.id,
            status=FileSubmissionAttemptStatus.RETURNED,
            attempt_number=1,
            started_at=now,
            submitted_at=now,
            created_at=now,
            updated_at=now,
        )
        session.add(attempt)
        session.commit()

    app = _make_app(db_session_factory, student_user, monkeypatch)
    client = TestClient(app)

    # Patch with no files (just to check if it proceeds)
    response = client.patch(f"/file-submissions/{file_submission_uuid}/draft", json={"files": []})

    assert response.status_code == 200
    assert response.json()["status"] == "RETURNED"


def test_submit_when_returned_and_max_attempts_reached(db_session_factory: Callable[[], Session], student_user: PublicUser, monkeypatch: pytest.MonkeyPatch) -> None:
    """Ensure student can re-submit a RETURNED attempt
    even when max_attempts=1.
    """
    file_submission_uuid = _seed_file_submission(db_session_factory, max_attempts=1)

    with db_session_factory() as session:
        file_sub = session.exec(
            select(FileSubmissionActivity).where(FileSubmissionActivity.file_submission_uuid == file_submission_uuid)
        ).one()
        activity = session.get(Activity, file_sub.activity_id)

        # We need at least one file to submit
        session.exec(select(User).where(User.id == 1)).one()
        upload = Upload(
            upload_uuid="upload_1",
            user_id=student_user.id,
            filename="test.txt",
            content_type="text/plain",
            size_bytes=100,
            status="FINALIZED",
            created_at=datetime.now(UTC),
        )
        session.add(upload)
        session.flush()

        now = datetime.now(UTC)
        attempt = FileSubmissionAttempt(
            attempt_uuid="filesub_attempt_returned_submit",
            file_submission_id=file_sub.id,
            activity_id=activity.id,
            user_id=student_user.id,
            status=FileSubmissionAttemptStatus.RETURNED,
            attempt_number=1,
            started_at=now,
            submitted_at=now,
            created_at=now,
            updated_at=now,
        )
        session.add(attempt)
        session.flush()

        # Add a file to the attempt
        from src.db.file_submissions import FileSubmissionAttemptFile

        session.add(
            FileSubmissionAttemptFile(
                attempt_file_uuid="file_1",
                attempt_id=attempt.id,
                upload_id=upload.id,
                display_name="test.txt",
                content_type="text/plain",
                size_bytes=100,
                position=0,
                created_at=now,
            )
        )
        session.commit()

    app = _make_app(db_session_factory, student_user, monkeypatch)
    client = TestClient(app)

    # Stub out event bus
    from src.services import events

    class MockBus:
        async def emit(self, event: Any) -> None:
            pass

    monkeypatch.setattr(events, "get_event_bus", MockBus)

    response = client.post(
        f"/file-submissions/{file_submission_uuid}/submit",
        json={"files": [{"upload_uuid": "upload_1", "display_name": "test.txt"}]},
    )

    if response.status_code != 200:
        print(f"ERROR: {response.json()}")

    assert response.status_code == 200
    assert response.json()["status"] == "SUBMITTED"
