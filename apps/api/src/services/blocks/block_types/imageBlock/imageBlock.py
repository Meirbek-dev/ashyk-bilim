from fastapi import HTTPException, Request, UploadFile, status
from sqlmodel import Session, select
from ulid import ULID

from src.core.timezone import utcnow
from src.db.courses.blocks import Block, BlockRead, BlockTypeEnum
from src.db.users import AnonymousUser, PublicUser
from src.services.blocks.utils.upload_files import upload_file_and_return_file_object
from src.services.courses._utils import (
    _get_activity_by_uuid_or_404,
    _get_course_for_activity_or_404,
)


async def create_image_block(
    request: Request, image_file: UploadFile, activity_uuid: str, db_session: Session
) -> BlockRead:
    activity = _get_activity_by_uuid_or_404(activity_uuid, db_session)
    course = _get_course_for_activity_or_404(activity, db_session)

    # get block id
    block_uuid = f"block_{ULID()}"

    block_data = await upload_file_and_return_file_object(
        request,
        image_file,
        activity_uuid,
        block_uuid,
        ["jpg", "jpeg", "png", "gif", "webp", "avif"],
        "imageBlock",
        str(course.course_uuid),
    )

    # create block
    current_time = utcnow()
    block = Block(
        activity_id=activity.id or 0,
        block_type=BlockTypeEnum.BLOCK_IMAGE,
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


async def get_image_block(
    request: Request, block_uuid: str, current_user: PublicUser | AnonymousUser, db_session: Session
) -> BlockRead:
    statement = select(Block).where(Block.block_uuid == block_uuid)
    block = db_session.exec(statement).first()

    if block:
        return BlockRead.model_validate(block)

    raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Image block does not exist")
