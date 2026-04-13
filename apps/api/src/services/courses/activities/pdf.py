import shutil
from datetime import datetime
from pathlib import Path

from fastapi import HTTPException, Request, UploadFile, status
from sqlmodel import Session, select
from ulid import ULID

from src.db.courses.activities import (
    Activity,
    ActivityRead,
    ActivitySubTypeEnum,
    ActivityTypeEnum,
)
from src.db.courses.chapters import Chapter
from src.db.courses.courses import Course
from src.db.users import AnonymousUser, PublicUser
from src.security.file_validation import validate_upload
from src.security.rbac import PermissionChecker
from src.services.courses.activities.uploads.pdfs import upload_pdf

MAX_DOCUMENT_PDF_SIZE = 100 * 1024 * 1024


def validate_pdf_file(pdf_file: UploadFile | None) -> str:
    if not pdf_file or not pdf_file.filename:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Pdf : No pdf file provided",
        )

    if "." not in pdf_file.filename:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Pdf : No pdf file provided",
        )

    validate_upload(pdf_file, ["document"], max_size=MAX_DOCUMENT_PDF_SIZE)
    return pdf_file.filename.rsplit(".", 1)[-1].lower()


def validate_uploaded_pdf_path(pdf_uploaded_path: str) -> tuple[str, Path]:
    storage_root = Path("content/platform").resolve()
    uploaded_path = (storage_root / pdf_uploaded_path).resolve()

    try:
        uploaded_path.relative_to(storage_root)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Pdf : Invalid upload path",
        ) from exc

    if not uploaded_path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Pdf : Uploaded pdf not found",
        )

    pdf_format = uploaded_path.suffix.lstrip(".").lower()
    if pdf_format != "pdf":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Pdf : Wrong pdf format",
        )

    file_size = uploaded_path.stat().st_size
    if file_size > MAX_DOCUMENT_PDF_SIZE:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File too large ({file_size / 1024 / 1024:.1f}MB > {MAX_DOCUMENT_PDF_SIZE / 1024 / 1024:.1f}MB)",
        )

    with uploaded_path.open("rb") as uploaded_pdf:
        if uploaded_pdf.read(5) != b"%PDF-":
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Pdf : Wrong pdf format",
            )

    return pdf_format, uploaded_path


def _next_activity_order(chapter_id: int, db_session: Session) -> int:
    result = db_session.exec(
        select(Activity)
        .where(Activity.chapter_id == chapter_id)
        .order_by(Activity.order.desc())
    ).first()
    return (result.order if result else 0) + 1


async def create_documentpdf_activity(
    request: Request,
    name: str,
    chapter_id: int,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
    pdf_file: UploadFile | None = None,
    pdf_uploaded_path: str | None = None,
):
    chapter = db_session.exec(select(Chapter).where(Chapter.id == chapter_id)).first()
    if not chapter:
        raise HTTPException(status_code=404, detail="Chapter not found")

    course = db_session.exec(
        select(Course).where(Course.id == chapter.course_id)
    ).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")

    checker = PermissionChecker(db_session)
    checker.require(
        current_user.id, "activity:create", resource_owner_id=course.creator_id
    )

    temp_path: Path | None = None

    if pdf_file:
        pdf_format = validate_pdf_file(pdf_file)
    elif pdf_uploaded_path:
        pdf_format, temp_path = validate_uploaded_pdf_path(pdf_uploaded_path)
    else:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Pdf : No pdf file provided"
        )

    activity_uuid = f"activity_{ULID()}"

    activity = Activity(
        name=name,
        activity_type=ActivityTypeEnum.TYPE_DOCUMENT,
        activity_sub_type=ActivitySubTypeEnum.SUBTYPE_DOCUMENT_PDF,
        content={
            "filename": f"documentpdf.{pdf_format}",
            "activity_uuid": activity_uuid,
        },
        chapter_id=chapter.id,
        course_id=chapter.course_id,  # keep legacy column in sync
        activity_uuid=activity_uuid,
        creation_date=str(datetime.now()),
        update_date=str(datetime.now()),
        order=_next_activity_order(chapter_id, db_session),
        creator_id=current_user.id,
    )

    db_session.add(activity)
    db_session.commit()
    db_session.refresh(activity)

    if pdf_file:
        await upload_pdf(pdf_file, activity.activity_uuid, course.course_uuid)
    elif temp_path:
        final_path = Path(
            f"content/platform/courses/{course.course_uuid}/activities/{activity.activity_uuid}/documentpdf/documentpdf.{pdf_format}"
        )
        final_path.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(temp_path), str(final_path))
        if temp_path.parent.exists():
            shutil.rmtree(temp_path.parent, ignore_errors=True)

    return ActivityRead.model_validate(activity)
