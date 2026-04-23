from typing import Annotated

from fastapi import APIRouter, Depends, Form, Request, UploadFile

from src.db.courses.activities import (
    ActivityCreate,
    ActivityRead,
    ActivityReadWithPermissions,
    ActivityUpdate,
)
from src.db.strict_base_model import PydanticStrictBaseModel
from src.db.users import AnonymousUser, PublicUser
from src.infra.db.session import get_db_session
from src.security.auth import get_current_user, get_current_user_optional
from src.services.courses.activities.activities import (
    create_activity,
    delete_activity,
    get_activity,
    update_activity,
)
from src.services.courses.activities.pdf import create_documentpdf_activity
from src.services.courses.activities.video import (
    ExternalVideo,
    create_external_video_activity,
    create_video_activity,
)

router = APIRouter()


class ActivityDetailResponse(PydanticStrictBaseModel):
    detail: str


@router.post("")
async def api_create_activity(
    request: Request,
    activity_object: ActivityCreate,
    current_user: Annotated[PublicUser, Depends(get_current_user)],
    db_session=Depends(get_db_session),
) -> ActivityRead:
    return await create_activity(request, activity_object, current_user, db_session)


@router.get("/{activity_uuid}")
async def api_get_activity(
    request: Request,
    activity_uuid: str,
    current_user: Annotated[
        PublicUser | AnonymousUser, Depends(get_current_user_optional)
    ],
    db_session=Depends(get_db_session),
) -> ActivityReadWithPermissions:
    return await get_activity(
        request, activity_uuid, current_user=current_user, db_session=db_session
    )


@router.patch("/{activity_uuid}")
async def api_update_activity(
    request: Request,
    activity_object: ActivityUpdate,
    activity_uuid: str,
    current_user: Annotated[PublicUser, Depends(get_current_user)],
    db_session=Depends(get_db_session),
) -> ActivityRead:
    return await update_activity(
        request, activity_object, activity_uuid, current_user, db_session
    )


@router.delete("/{activity_uuid}", response_model=ActivityDetailResponse)
async def api_delete_activity(
    request: Request,
    activity_uuid: str,
    current_user: Annotated[PublicUser, Depends(get_current_user)],
    db_session=Depends(get_db_session),
) -> dict:
    return await delete_activity(request, activity_uuid, current_user, db_session)


# Video activity


@router.post("/video")
async def api_create_video_activity(
    request: Request,
    name: Annotated[str, Form()],
    chapter_id: Annotated[int, Form()],
    current_user: Annotated[PublicUser, Depends(get_current_user)],
    db_session=Depends(get_db_session),
    details: Annotated[str, Form()] = "{}",
    video_file: UploadFile | None = None,
    video_uploaded_path: Annotated[str | None, Form()] = None,
    subtitle_files: list[UploadFile] | None = None,
) -> ActivityRead:
    if subtitle_files is None:
        subtitle_files = []
    return await create_video_activity(
        request,
        name,
        chapter_id,
        current_user,
        db_session,
        video_file,
        details=details,
        subtitle_files=subtitle_files,
        video_uploaded_path=video_uploaded_path,
    )


@router.post("/external_video")
async def api_create_external_video_activity(
    request: Request,
    external_video: ExternalVideo,
    current_user: Annotated[PublicUser, Depends(get_current_user)],
    db_session=Depends(get_db_session),
) -> ActivityRead:
    return await create_external_video_activity(
        request, current_user, external_video, db_session
    )


@router.post("/documentpdf")
async def api_create_documentpdf_activity(
    request: Request,
    name: Annotated[str, Form()],
    chapter_id: Annotated[int, Form()],
    current_user: Annotated[PublicUser, Depends(get_current_user)],
    db_session=Depends(get_db_session),
    pdf_file: UploadFile | None = None,
    pdf_uploaded_path: Annotated[str | None, Form()] = None,
) -> ActivityRead:
    return await create_documentpdf_activity(
        request,
        name,
        chapter_id,
        current_user,
        db_session,
        pdf_file,
        pdf_uploaded_path=pdf_uploaded_path,
    )
