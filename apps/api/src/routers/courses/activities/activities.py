from typing import Annotated

from fastapi import APIRouter, Depends, Form, Request, UploadFile
from sqlmodel import Session

from src.auth.users import get_optional_public_user, get_public_user
from src.db.courses.activities import (
    ActivityCreate,
    ActivityRead,
    ActivityReadWithPermissions,
    ActivityUpdate,
)
from src.db.strict_base_model import PydanticStrictBaseModel
from src.db.users import AnonymousUser, PublicUser
from src.infra.db.session import get_db_session
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


@router.post("", response_model=ActivityRead)
async def api_create_activity(
    request: Request,
    activity_object: ActivityCreate,
    current_user: Annotated[PublicUser, Depends(get_public_user)],
    db_session: Annotated[Session | None, Depends(get_db_session)] = None,
) -> ActivityRead:
    assert db_session is not None
    return await create_activity(request, activity_object, current_user, db_session)


@router.get("/{activity_uuid}", response_model=ActivityReadWithPermissions)
async def api_get_activity(
    request: Request,
    activity_uuid: str,
    current_user: Annotated[PublicUser | AnonymousUser, Depends(get_optional_public_user)],
    db_session: Annotated[Session | None, Depends(get_db_session)] = None,
) -> ActivityReadWithPermissions:
    assert db_session is not None
    return await get_activity(request, activity_uuid, current_user=current_user, db_session=db_session)


@router.patch("/{activity_uuid}", response_model=ActivityRead)
async def api_update_activity(
    request: Request,
    activity_object: ActivityUpdate,
    activity_uuid: str,
    current_user: Annotated[PublicUser, Depends(get_public_user)],
    db_session: Annotated[Session | None, Depends(get_db_session)] = None,
) -> ActivityRead:
    assert db_session is not None
    return await update_activity(request, activity_object, activity_uuid, current_user, db_session)


@router.delete("/{activity_uuid}", response_model=ActivityDetailResponse)
async def api_delete_activity(
    request: Request,
    activity_uuid: str,
    current_user: Annotated[PublicUser, Depends(get_public_user)],
    db_session: Annotated[Session | None, Depends(get_db_session)] = None,
) -> ActivityDetailResponse:
    assert db_session is not None
    return ActivityDetailResponse.model_validate(await delete_activity(request, activity_uuid, current_user, db_session))


# Video activity


@router.post("/video", response_model=ActivityRead)
async def api_create_video_activity(
    request: Request,
    name: Annotated[str, Form()],
    chapter_id: Annotated[int, Form()],
    current_user: Annotated[PublicUser, Depends(get_public_user)],
    db_session: Annotated[Session | None, Depends(get_db_session)] = None,
    details: Annotated[str, Form()] = "{}",
    video_file: UploadFile | None = None,
    video_uploaded_path: Annotated[str | None, Form()] = None,
    subtitle_files: list[UploadFile] | None = None,
) -> ActivityRead:
    assert db_session is not None
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


@router.post("/external_video", response_model=ActivityRead)
async def api_create_external_video_activity(
    request: Request,
    external_video: ExternalVideo,
    current_user: Annotated[PublicUser, Depends(get_public_user)],
    db_session: Annotated[Session | None, Depends(get_db_session)] = None,
) -> ActivityRead:
    assert db_session is not None
    return await create_external_video_activity(request, current_user, external_video, db_session)


@router.post("/documentpdf", response_model=ActivityRead)
async def api_create_documentpdf_activity(
    request: Request,
    name: Annotated[str, Form()],
    chapter_id: Annotated[int, Form()],
    current_user: Annotated[PublicUser, Depends(get_public_user)],
    db_session: Annotated[Session | None, Depends(get_db_session)] = None,
    pdf_file: UploadFile | None = None,
    pdf_uploaded_path: Annotated[str | None, Form()] = None,
) -> ActivityRead:
    assert db_session is not None
    return await create_documentpdf_activity(
        request,
        name,
        chapter_id,
        current_user,
        db_session,
        pdf_file,
        pdf_uploaded_path=pdf_uploaded_path,
    )
