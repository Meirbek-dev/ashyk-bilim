"""Upload endpoints for assessment files and legacy chunked uploads."""

import hashlib
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from sqlmodel import Session, select
from ulid import ULID

from src.auth.users import get_public_user
from src.db.strict_base_model import PydanticStrictBaseModel
from src.db.uploads import (
    Upload,
    UploadCreate,
    UploadCreateResponse,
    UploadFinalize,
    UploadRead,
    UploadStatus,
)
from src.db.users import PublicUser
from src.infra.db.session import get_db_session
from src.services.utils.chunked_upload import (
    cleanup_session,
    complete_upload,
    create_upload_session,
    get_session_status,
    process_chunk,
)
from src.services.utils.upload_content import upload_content

router = APIRouter()
_TEMP_UPLOAD_ROOT = Path("temp_uploads/assessment")


class ChunkedUploadInitiateResponse(PydanticStrictBaseModel):
    upload_id: str
    message: str


class ChunkedUploadChunkResponse(PydanticStrictBaseModel):
    success: bool
    upload_id: str
    chunk_index: int
    chunks_received: int
    total_chunks: int
    is_complete: bool


class ChunkedUploadCompleteResponse(PydanticStrictBaseModel):
    success: bool
    filename: str
    file_size: int
    message: str


class ChunkedUploadStatusResponse(PydanticStrictBaseModel):
    upload_id: str
    filename: str
    chunks_received: int
    total_chunks: int
    is_complete: bool
    file_size: int


class ChunkedUploadCancelResponse(PydanticStrictBaseModel):
    success: bool
    message: str


def _temp_upload_path(upload_id: str) -> Path:
    return _TEMP_UPLOAD_ROOT / upload_id / "bytes"


def _read_upload(upload_id: str, db_session: Session) -> Upload | None:
    return db_session.exec(select(Upload).where(Upload.upload_id == upload_id)).first()


def _owned_upload(upload_id: str, user_id: int, db_session: Session) -> Upload:
    upload = _read_upload(upload_id, db_session)
    if upload is None or upload.user_id != user_id:
        raise HTTPException(status_code=404, detail="Upload not found")
    return upload


def _upload_key(upload: Upload, sha256: str, user_uuid: str) -> str:
    """Return the PII-free object-storage key for a finalised upload.

    Format: uploads/{user_uuid}/{yyyy}/{mm}/{upload_id}/{sha256}.{ext}
    The user's email is never embedded in the key.
    """
    suffix = Path(upload.filename).suffix.lower()
    if not suffix:
        suffix = ".bin"
    year = upload.created_at.strftime("%Y")
    month = upload.created_at.strftime("%m")
    return f"uploads/{user_uuid}/{year}/{month}/{upload.upload_id}/{sha256}{suffix}"


@router.post("", response_model=UploadCreateResponse)
async def create_assessment_upload(
    payload: UploadCreate,
    request: Request,
    current_user: Annotated[PublicUser, Depends(get_public_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
) -> UploadCreateResponse:
    upload = Upload(
        upload_id=f"ul_{ULID()}",
        user_id=current_user.id,
        filename=payload.filename,
        content_type=payload.content_type,
        size=payload.size,
        expires_at=datetime.now(UTC) + timedelta(hours=24),
    )
    db_session.add(upload)
    db_session.commit()
    db_session.refresh(upload)
    put_url = str(
        request.url_for("put_assessment_upload_bytes", upload_id=upload.upload_id)
    )
    return UploadCreateResponse(
        upload_id=upload.upload_id,
        put_url=put_url,
        expires_at=upload.expires_at,
    )


@router.put("/{upload_id}/bytes", response_model=UploadRead)
async def put_assessment_upload_bytes(
    upload_id: str,
    request: Request,
    current_user: Annotated[PublicUser, Depends(get_public_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
) -> UploadRead:
    upload = _owned_upload(upload_id, current_user.id, db_session)
    if upload.status in {UploadStatus.FINALIZED, UploadStatus.CANCELLED}:
        raise HTTPException(status_code=409, detail="Upload is already closed")
    if upload.expires_at < datetime.now(UTC):
        raise HTTPException(status_code=410, detail="Upload has expired")

    content = await request.body()
    temp_path = _temp_upload_path(upload.upload_id)
    temp_path.parent.mkdir(parents=True, exist_ok=True)
    temp_path.write_bytes(content)

    upload.status = UploadStatus.RECEIVING
    upload.size = len(content)
    upload.content_type = request.headers.get("content-type", upload.content_type)
    upload.updated_at = datetime.now(UTC)
    db_session.add(upload)
    db_session.commit()
    db_session.refresh(upload)
    return UploadRead.model_validate(upload)


@router.post("/{upload_id}/finalize", response_model=UploadRead)
async def finalize_assessment_upload(
    upload_id: str,
    payload: UploadFinalize,
    current_user: Annotated[PublicUser, Depends(get_public_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
) -> UploadRead:
    upload = _owned_upload(upload_id, current_user.id, db_session)
    if upload.status == UploadStatus.FINALIZED:
        return UploadRead.model_validate(upload)
    if upload.status == UploadStatus.CANCELLED:
        raise HTTPException(status_code=409, detail="Upload is cancelled")

    temp_path = _temp_upload_path(upload.upload_id)
    if not temp_path.exists():
        raise HTTPException(status_code=400, detail="Upload bytes are missing")
    content = temp_path.read_bytes()
    sha256 = hashlib.sha256(content).hexdigest()
    if sha256.lower() != payload.sha256.lower():
        raise HTTPException(status_code=422, detail="Upload sha256 mismatch")

    user_uuid = current_user.user_uuid or str(current_user.id)
    key = _upload_key(upload, sha256, user_uuid)
    # Split key into directory + filename for the upload_content helper
    key_parts = key.rsplit("/", 1)
    await upload_content(
        directory=key_parts[0],
        type_of_dir="users",
        uuid=user_uuid,
        file_binary=content,
        file_and_format=key_parts[1],
        allowed_formats=None,
    )

    upload.status = UploadStatus.FINALIZED
    upload.sha256 = sha256
    upload.content_type = payload.content_type or upload.content_type
    upload.size = len(content)
    upload.key = key
    upload.finalized_at = datetime.now(UTC)
    upload.updated_at = upload.finalized_at
    db_session.add(upload)
    db_session.commit()
    db_session.refresh(upload)
    temp_path.unlink(missing_ok=True)
    return UploadRead.model_validate(upload)


@router.delete("/{upload_id}", status_code=204)
async def delete_assessment_upload(
    upload_id: str,
    current_user: Annotated[PublicUser, Depends(get_public_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
) -> None:
    """Cancel and delete an upload that has not yet been referenced by a submission."""
    upload = _owned_upload(upload_id, current_user.id, db_session)
    if upload.referenced_count > 0:
        raise HTTPException(
            status_code=409,
            detail="Upload is referenced by a submission and cannot be deleted",
        )
    upload.status = UploadStatus.CANCELLED
    upload.updated_at = datetime.now(UTC)
    db_session.add(upload)
    db_session.commit()


class UploadUrlResponse(PydanticStrictBaseModel):
    upload_id: str
    get_url: str
    expires_at: datetime


@router.get("/{upload_id}/url", response_model=UploadUrlResponse)
async def get_assessment_upload_url(
    upload_id: str,
    current_user: Annotated[PublicUser, Depends(get_public_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
    request: Request,
) -> UploadUrlResponse:
    """Return a short-lived signed URL to read a finalised upload."""
    upload = _owned_upload(upload_id, current_user.id, db_session)
    if upload.status != UploadStatus.FINALIZED:
        raise HTTPException(status_code=409, detail="Upload is not finalised")
    # In development / without a real object-store, return the finalize URL as a
    # placeholder.  In production this would be replaced with a presigned S3 GET URL.
    get_url = str(request.url_for("put_assessment_upload_bytes", upload_id=upload_id))
    expires_at = datetime.now(UTC) + timedelta(hours=1)
    return UploadUrlResponse(
        upload_id=upload_id, get_url=get_url, expires_at=expires_at
    )


@router.post("/initiate", response_model=ChunkedUploadInitiateResponse)
async def initiate_chunked_upload(
    directory: Annotated[str, Form()],
    type_of_dir: Annotated[str, Form()],
    uuid: Annotated[str, Form()],
    filename: Annotated[str, Form()],
    total_chunks: Annotated[int, Form()],
    file_size: Annotated[int, Form()],
    current_user: Annotated[PublicUser, Depends(get_public_user)] = None,
):
    """
    Initiate a chunked upload session.

    Args:
        directory: Target directory (e.g., "courses/xxx/activities/yyy/video")
        type_of_dir: "platform" or "users"
        uuid: Platform or user UUID
        filename: Final filename for the assembled file
        total_chunks: Total number of chunks that will be uploaded
        file_size: Total file size in bytes

    Returns:
        upload_id: Unique identifier for this upload session
    """
    upload_id = create_upload_session(
        directory=directory,
        type_of_dir=type_of_dir,
        uuid=uuid,
        filename=filename,
        total_chunks=total_chunks,
        file_size=file_size,
    )

    return {
        "upload_id": upload_id,
        "message": "Upload session initiated",
    }


@router.post("/chunk", response_model=ChunkedUploadChunkResponse)
async def upload_chunk(
    upload_id: Annotated[str, Form()],
    chunk_index: Annotated[int, Form()],
    chunk: Annotated[UploadFile, File()],
    current_user: Annotated[PublicUser, Depends(get_public_user)] = None,
):
    """
    Upload a single chunk.

    Args:
        upload_id: Upload session ID from initiate endpoint
        chunk_index: Zero-based index of this chunk
        chunk: The chunk file data

    Returns:
        Status of the upload including progress
    """
    result = await process_chunk(upload_id, chunk_index, chunk)

    return {
        "success": True,
        "upload_id": result["upload_id"],
        "chunk_index": result["chunk_index"],
        "chunks_received": result["chunks_received"],
        "total_chunks": result["total_chunks"],
        "is_complete": result["is_complete"],
    }


@router.post("/complete", response_model=ChunkedUploadCompleteResponse)
async def complete_chunked_upload(
    upload_id: Annotated[str, Form()],
    current_user: Annotated[PublicUser, Depends(get_public_user)] = None,
):
    """
    Complete the chunked upload by assembling all chunks.

    Args:
        upload_id: Upload session ID

    Returns:
        Final filename and upload details
    """
    try:
        # Assemble chunks
        file_data, session = await complete_upload(upload_id)

        # Upload the assembled file
        await upload_content(
            directory=session.directory,
            type_of_dir=session.type_of_dir,
            uuid=session.uuid,
            file_binary=file_data,
            file_and_format=session.filename,
            allowed_formats=None,  # Already validated during initiation
        )

        # Clean up
        cleanup_session(upload_id)

        return {
            "success": True,
            "filename": session.filename,
            "file_size": session.file_size,
            "message": "Upload completed successfully",
        }

    except Exception:
        # Clean up on error
        cleanup_session(upload_id)
        raise


@router.get("/status/{upload_id}", response_model=ChunkedUploadStatusResponse)
async def get_upload_status(
    upload_id: str,
    current_user: Annotated[PublicUser, Depends(get_public_user)] = None,
):
    """
    Get the status of an upload session.

    Args:
        upload_id: Upload session ID

    Returns:
        Upload progress and details
    """
    return get_session_status(upload_id)


@router.delete("/{upload_id}", response_model=ChunkedUploadCancelResponse)
async def cancel_upload(
    upload_id: str,
    current_user: Annotated[PublicUser, Depends(get_public_user)] = None,
    db_session: Annotated[Session, Depends(get_db_session)] = None,
):
    """
    Cancel an upload and clean up temporary files.

    Args:
        upload_id: Upload session ID

    Returns:
        Confirmation message
    """
    if db_session is not None and current_user is not None:
        upload = _read_upload(upload_id, db_session)
        if upload is not None:
            if upload.user_id != current_user.id:
                raise HTTPException(status_code=404, detail="Upload not found")
            upload.status = UploadStatus.CANCELLED
            upload.updated_at = datetime.now(UTC)
            db_session.add(upload)
            db_session.commit()
            temp_path = _temp_upload_path(upload_id)
            temp_path.unlink(missing_ok=True)
            cleanup_session(upload_id)
            return {
                "success": True,
                "message": "Upload cancelled and cleaned up",
            }

    cleanup_session(upload_id)

    return {
        "success": True,
        "message": "Upload cancelled and cleaned up",
    }
