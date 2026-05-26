from datetime import datetime

from fastapi import HTTPException, Request, UploadFile, status
from sqlmodel import Session, select
from ulid import ULID

from src.db.courses.activities import Activity
from src.db.courses.blocks import Block, BlockRead, BlockTypeEnum
from src.db.courses.courses import Course
from src.services.blocks.utils.upload_files import upload_file_and_return_file_object
from src.services.courses._utils import (
    _get_activity_by_uuid_or_404,
    _get_course_for_activity_or_404,
)
from src.services.users.users import PublicUser


async def create_video_block(
    request: Request, video_file: UploadFile, activity_uuid: str, db_session: Session
):
    activity = _get_activity_by_uuid_or_404(activity_uuid, db_session)
    course = _get_course_for_activity_or_404(activity, db_session)

    # get block id
    block_uuid = f"block_{ULID()}"

    block_data = await upload_file_and_return_file_object(
        request,
        video_file,
        activity_uuid,
        block_uuid,
        ["mkv", "mp4", "webm", "ogg"],
        "videoBlock",
        str(course.course_uuid),
    )

    # create block
    block = Block(
        activity_id=activity.id or 0,
        block_type=BlockTypeEnum.BLOCK_VIDEO,
        content=block_data.model_dump(),
        course_id=course.id or 0,
        block_uuid=block_uuid,
        creation_date=str(datetime.now()),
        update_date=str(datetime.now()),
    )

    # insert block
    db_session.add(block)
    db_session.commit()
    db_session.refresh(block)

    return BlockRead.model_validate(block)


async def get_video_block(
    request: Request, block_uuid: str, current_user: PublicUser, db_session: Session
):
    statement = select(Block).where(Block.block_uuid == block_uuid)
    block = db_session.exec(statement).first()

    if not block:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Video file does not exist"
        )

    return BlockRead.model_validate(block)
