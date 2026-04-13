from datetime import datetime

from fastapi import Request, UploadFile
from sqlmodel import Session

from src.db.platform import PlatformRead, PlatformUpdate
from src.db.users import AnonymousUser, PublicUser
from src.services.platform import get_platform
from src.services.utils.upload_content import upload_file


async def upload_platform_logo(logo_file: UploadFile) -> str:
    return await upload_file(
        file=logo_file,
        directory="logos",
        type_of_dir="platform",
        uuid=None,
        allowed_types=["image"],
        filename_prefix="logo",
        max_size=5 * 1024 * 1024,
    )


async def upload_platform_thumbnail(thumbnail_file: UploadFile) -> str:
    return await upload_file(
        file=thumbnail_file,
        directory="thumbnails",
        type_of_dir="platform",
        uuid=None,
        allowed_types=["image"],
        filename_prefix="thumbnail",
        max_size=5 * 1024 * 1024,
    )


async def upload_platform_preview(file: UploadFile) -> str:
    return await upload_file(
        file=file,
        directory="previews",
        type_of_dir="platform",
        uuid=None,
        allowed_types=["image"],
        filename_prefix="preview",
        max_size=5 * 1024 * 1024,
    )


async def upload_platform_landing_content(file: UploadFile) -> str:
    return await upload_file(
        file=file,
        directory="landing",
        type_of_dir="platform",
        uuid=None,
        allowed_types=["image", "video", "document"],
        filename_prefix="landing",
        max_size=50 * 1024 * 1024,
    )


def update_platform(
    request: Request,
    platform_object: PlatformUpdate,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
) -> PlatformRead:
    platform_record = get_platform(db_session)

    update_data = platform_object.model_dump(exclude_unset=True)
    update_data.pop("slug", None)
    for field, value in update_data.items():
        if value is not None:
            setattr(platform_record, field, value)

    platform_record.update_date = str(datetime.now())

    db_session.add(platform_record)
    db_session.commit()
    db_session.refresh(platform_record)

    return PlatformRead.model_validate(platform_record)


async def update_platform_logo(
    request: Request,
    logo_file: UploadFile,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
):
    platform_record = get_platform(db_session)

    filename = await upload_platform_logo(logo_file)
    platform_record.logo_image = filename
    platform_record.update_date = str(datetime.now())

    db_session.add(platform_record)
    db_session.commit()
    db_session.refresh(platform_record)

    return {"detail": "Logo updated"}


async def update_platform_thumbnail(
    request: Request,
    thumbnail_file: UploadFile,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
):
    platform_record = get_platform(db_session)

    filename = await upload_platform_thumbnail(thumbnail_file)
    platform_record.thumbnail_image = filename
    platform_record.update_date = str(datetime.now())

    db_session.add(platform_record)
    db_session.commit()
    db_session.refresh(platform_record)

    return {"detail": "Thumbnail updated"}


async def update_platform_preview(
    request: Request,
    preview_file: UploadFile,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
):
    filename = await upload_platform_preview(preview_file)
    return {"name_in_disk": filename}


def update_platform_landing(
    request: Request,
    landing_object: dict,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
):
    platform_record = get_platform(db_session)

    platform_record.landing = landing_object
    platform_record.update_date = str(datetime.now())

    db_session.add(platform_record)
    db_session.commit()
    db_session.refresh(platform_record)

    return {"detail": "Landing object updated"}


async def upload_platform_landing_content_service(
    request: Request,
    content_file: UploadFile,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
) -> dict:
    filename = await upload_platform_landing_content(content_file)
    return {"detail": "Landing content uploaded successfully", "filename": filename}
