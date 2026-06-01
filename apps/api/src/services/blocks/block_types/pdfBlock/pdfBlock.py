from fastapi import HTTPException, Request, UploadFile, status
from sqlmodel import Session, select
from ulid import ULID

from src.core.timezone import utcnow
from src.db.courses.blocks import Block, BlockRead, BlockTypeEnum
from src.services.blocks.utils.upload_files import upload_file_and_return_file_object
from src.services.courses._utils import (
    _get_activity_by_uuid_or_404,
    _get_course_for_activity_or_404,
)
from src.services.users.users import PublicUser


async def create_pdf_block(request: Request, pdf_file: UploadFile, activity_uuid: str, db_session: Session):
    activity = _get_activity_by_uuid_or_404(activity_uuid, db_session)
    course = _get_course_for_activity_or_404(activity, db_session)

    # get block id
    block_uuid = f"block_{ULID()}"

    block_data = await upload_file_and_return_file_object(
        request,
        pdf_file,
        activity_uuid,
        block_uuid,
        ["pdf"],
        "pdfBlock",
        str(course.course_uuid),
    )

    # create block
    current_time = utcnow()
    block = Block(
        activity_id=activity.id or 0,
        block_type=BlockTypeEnum.BLOCK_DOCUMENT_PDF,
        content=block_data.model_dump(),
        course_id=course.id or 0,
        block_uuid=block_uuid,
        creation_date=current_time,
        update_date=current_time,
    )

    # insert block
    db_session.add(block)
    db_session.commit()
    db_session.refresh(block)

    return BlockRead.model_validate(block)


async def get_pdf_block(request: Request, block_uuid: str, current_user: PublicUser, db_session: Session):
    statement = select(Block).where(Block.block_uuid == block_uuid)
    block = db_session.exec(statement).first()

    if not block:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="PDF file does not exist")

    return BlockRead.model_validate(block)
