"""Routes for first-class file submission activities."""

from datetime import UTC, datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, Header, Query, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlmodel import Session

from src.auth.users import get_optional_public_user, get_public_user
from src.core.http import get_content_disposition_header
from src.db.file_submissions import (
    FileSubmissionAttemptRead,
    FileSubmissionCreate,
    FileSubmissionDraftPatch,
    FileSubmissionGradePatch,
    FileSubmissionRead,
    FileSubmissionReviewQueue,
    FileSubmissionUpdate,
)
from src.db.users import AnonymousUser, PublicUser
from src.infra.db.session import get_db_session
from src.services.file_submissions import (
    build_file_submission_zip,
    create_file_submission,
    export_file_submission_csv,
    get_file_submission,
    get_file_submission_attempt_file_upload,
    get_file_submission_by_activity_uuid,
    get_my_file_submission_draft,
    grade_file_submission_attempt,
    list_file_submission_submissions,
    list_my_file_submission_attempts,
    publish_file_submission,
    read_file_submission_upload_bytes,
    save_file_submission_draft,
    start_file_submission_draft,
    submit_file_submission,
    update_file_submission,
)

router = APIRouter()


class FileSubmissionBulkDownloadRequest(BaseModel):
    attempt_uuids: list[str] = Field(default_factory=list)


class FileSubmissionFileUrlResponse(BaseModel):
    attempt_file_uuid: str
    upload_uuid: str
    get_url: str
    expires_at: datetime


@router.post("", response_model=FileSubmissionRead)
async def api_create_file_submission(
    payload: FileSubmissionCreate,
    current_user: Annotated[PublicUser, Depends(get_public_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
) -> FileSubmissionRead:
    return await create_file_submission(payload, current_user, db_session)


@router.get("/activity/{activity_uuid}", response_model=FileSubmissionRead)
async def api_get_file_submission_by_activity(
    activity_uuid: str,
    current_user: Annotated[PublicUser | AnonymousUser, Depends(get_optional_public_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
) -> FileSubmissionRead:
    return await get_file_submission_by_activity_uuid(activity_uuid, current_user, db_session)


@router.get("/files/{attempt_file_uuid}/url", response_model=FileSubmissionFileUrlResponse)
async def api_get_file_submission_file_url(
    attempt_file_uuid: str,
    request: Request,
    current_user: Annotated[PublicUser, Depends(get_public_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
) -> FileSubmissionFileUrlResponse:
    upload = await get_file_submission_attempt_file_upload(attempt_file_uuid, current_user, db_session)
    expires_at = datetime.now(UTC) + timedelta(hours=1)
    return FileSubmissionFileUrlResponse(
        attempt_file_uuid=attempt_file_uuid,
        upload_uuid=upload.upload_uuid,
        get_url=str(
            request.url_for(
                "api_download_file_submission_file",
                attempt_file_uuid=attempt_file_uuid,
            )
        ),
        expires_at=expires_at,
    )


@router.get("/files/{attempt_file_uuid}/download", response_class=StreamingResponse)
async def api_download_file_submission_file(
    attempt_file_uuid: str,
    current_user: Annotated[PublicUser, Depends(get_public_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
) -> StreamingResponse:
    upload = await get_file_submission_attempt_file_upload(attempt_file_uuid, current_user, db_session)
    body = read_file_submission_upload_bytes(upload, db_session)
    return StreamingResponse(
        iter([body]),
        media_type=upload.content_type or "application/octet-stream",
        headers={"Content-Disposition": get_content_disposition_header(upload.filename)},
    )


@router.get("/{file_submission_uuid}", response_model=FileSubmissionRead)
async def api_get_file_submission(
    file_submission_uuid: str,
    current_user: Annotated[PublicUser | AnonymousUser, Depends(get_optional_public_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
) -> FileSubmissionRead:
    return await get_file_submission(file_submission_uuid, current_user, db_session)


@router.patch("/{file_submission_uuid}", response_model=FileSubmissionRead)
async def api_update_file_submission(
    file_submission_uuid: str,
    payload: FileSubmissionUpdate,
    current_user: Annotated[PublicUser, Depends(get_public_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
) -> FileSubmissionRead:
    return await update_file_submission(file_submission_uuid, payload, current_user, db_session)


@router.post("/{file_submission_uuid}/publish", response_model=FileSubmissionRead)
async def api_publish_file_submission(
    file_submission_uuid: str,
    current_user: Annotated[PublicUser, Depends(get_public_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
) -> FileSubmissionRead:
    return await publish_file_submission(file_submission_uuid, current_user, db_session)


@router.get("/{file_submission_uuid}/draft", response_model=FileSubmissionAttemptRead | None)
async def api_get_file_submission_draft(
    file_submission_uuid: str,
    current_user: Annotated[PublicUser, Depends(get_public_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
) -> FileSubmissionAttemptRead | None:
    return await get_my_file_submission_draft(file_submission_uuid, current_user, db_session)


@router.post("/{file_submission_uuid}/draft", response_model=FileSubmissionAttemptRead)
async def api_start_file_submission_draft(
    file_submission_uuid: str,
    current_user: Annotated[PublicUser, Depends(get_public_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
) -> FileSubmissionAttemptRead:
    return await start_file_submission_draft(file_submission_uuid, current_user, db_session)


@router.patch("/{file_submission_uuid}/draft", response_model=FileSubmissionAttemptRead)
async def api_save_file_submission_draft(
    file_submission_uuid: str,
    payload: FileSubmissionDraftPatch,
    current_user: Annotated[PublicUser, Depends(get_public_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
    if_match: Annotated[str | None, Header(alias="If-Match")] = None,
) -> FileSubmissionAttemptRead:
    return await save_file_submission_draft(
        file_submission_uuid,
        payload,
        current_user,
        db_session,
        if_match=if_match,
    )


@router.post("/{file_submission_uuid}/submit", response_model=FileSubmissionAttemptRead)
async def api_submit_file_submission(
    file_submission_uuid: str,
    payload: FileSubmissionDraftPatch | None = None,
    current_user: Annotated[PublicUser | None, Depends(get_public_user)] = None,
    db_session: Annotated[Session | None, Depends(get_db_session)] = None,
    if_match: Annotated[str | None, Header(alias="If-Match")] = None,
) -> FileSubmissionAttemptRead:
    return await submit_file_submission(
        file_submission_uuid,
        payload,
        current_user,
        db_session,
        if_match=if_match,
    )


@router.get("/{file_submission_uuid}/me", response_model=list[FileSubmissionAttemptRead])
async def api_list_my_file_submission_attempts(
    file_submission_uuid: str,
    current_user: Annotated[PublicUser, Depends(get_public_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
) -> list[FileSubmissionAttemptRead]:
    return await list_my_file_submission_attempts(file_submission_uuid, current_user, db_session)


@router.get("/{file_submission_uuid}/submissions", response_model=FileSubmissionReviewQueue)
async def api_list_file_submission_submissions(
    file_submission_uuid: str,
    current_user: Annotated[PublicUser, Depends(get_public_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
    status_filter: Annotated[str | None, Query(alias="status")] = None,
    search: Annotated[str | None, Query()] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 25,
) -> FileSubmissionReviewQueue:
    return await list_file_submission_submissions(
        file_submission_uuid,
        current_user,
        db_session,
        status_filter=status_filter,
        search=search,
        page=page,
        page_size=page_size,
    )


@router.get("/{file_submission_uuid}/submissions/export", response_class=StreamingResponse)
async def api_export_file_submission_csv(
    file_submission_uuid: str,
    current_user: Annotated[PublicUser, Depends(get_public_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
) -> StreamingResponse:
    csv_body = await export_file_submission_csv(file_submission_uuid, current_user, db_session)
    return StreamingResponse(
        iter([csv_body]),
        media_type="text/csv",
        headers={"Content-Disposition": get_content_disposition_header(f"file-submissions-{file_submission_uuid}.csv")},
    )


@router.post("/{file_submission_uuid}/submissions/download", response_class=StreamingResponse)
async def api_download_file_submission_zip(
    file_submission_uuid: str,
    payload: FileSubmissionBulkDownloadRequest,
    current_user: Annotated[PublicUser, Depends(get_public_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
) -> StreamingResponse:
    body = await build_file_submission_zip(
        file_submission_uuid,
        payload.attempt_uuids,
        current_user,
        db_session,
    )
    return StreamingResponse(
        iter([body]),
        media_type="application/zip",
        headers={"Content-Disposition": get_content_disposition_header(f"file-submissions-{file_submission_uuid}.zip")},
    )


@router.patch(
    "/{file_submission_uuid}/submissions/{attempt_uuid}/grade",
    response_model=FileSubmissionAttemptRead,
)
async def api_grade_file_submission_attempt(
    file_submission_uuid: str,
    attempt_uuid: str,
    payload: FileSubmissionGradePatch,
    current_user: Annotated[PublicUser, Depends(get_public_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
    if_match: Annotated[str | None, Header(alias="If-Match")] = None,
) -> FileSubmissionAttemptRead:
    return await grade_file_submission_attempt(
        file_submission_uuid,
        attempt_uuid,
        payload,
        current_user,
        db_session,
        if_match=if_match,
    )
