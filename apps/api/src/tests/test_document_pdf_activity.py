from datetime import datetime
from pathlib import Path

import pytest
from sqlmodel import Session, SQLModel, create_engine

from src.db.courses.activities import Activity
from src.db.courses.chapters import Chapter
from src.db.courses.courses import Course
from src.db.users import PublicUser, User
from src.services.courses.activities import pdf
from src.services.courses.activities.pdf import create_documentpdf_activity


@pytest.mark.asyncio
async def test_create_document_pdf_activity_uses_datetime_fields(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.chdir(tmp_path)
    monkeypatch.setattr(pdf, "require_course_permission", lambda *_args, **_kwargs: None)

    upload_path = tmp_path / "content" / "platform" / "uploads" / "sample.pdf"
    upload_path.parent.mkdir(parents=True)
    upload_path.write_bytes(b"%PDF-1.7\n")

    engine = create_engine("sqlite://")
    SQLModel.metadata.create_all(
        engine,
        tables=[
            User.__table__,
            Course.__table__,
            Chapter.__table__,
            Activity.__table__,
        ],
    )

    with Session(engine) as session:
        course = Course(
            id=1,
            name="Course",
            description="",
            public=False,
            course_uuid="course_1",
            open_to_contributors=False,
            creator_id=1,
        )
        chapter = Chapter(id=1, name="Chapter", course_id=1, creator_id=1)
        session.add(course)
        session.add(chapter)
        session.commit()

        user = PublicUser(
            id=1,
            user_uuid="user_1",
            username="teacher",
            first_name="Teacher",
            middle_name="",
            last_name="User",
            email="teacher@example.com",
            is_active=True,
            is_superuser=False,
            is_verified=True,
        )

        created = await create_documentpdf_activity(
            request=None,  # type: ignore[arg-type]
            name="PDF",
            chapter_id=1,
            current_user=user,
            db_session=session,
            pdf_uploaded_path="uploads/sample.pdf",
        )

        activity = session.get(Activity, created.id)
        assert activity is not None
        assert isinstance(activity.creation_date, datetime)
        assert isinstance(activity.update_date, datetime)
