"""
Chunked upload endpoints for large file uploads.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, UploadFile

from src.db.strict_base_model import PydanticStrictBaseModel
from src.db.users import PublicUser
from src.security.auth import get_current_user
from src.services.utils.chunked_upload import (
    cleanup_session,
    complete_upload,
    create_upload_session,
    get_session_status,
    process_chunk,
)
from src.services.utils.upload_content import upload_content

router = APIRouter()


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


@router.post("/initiate", response_model=ChunkedUploadInitiateResponse)
async def initiate_chunked_upload(
    directory: Annotated[str, Form()],
    type_of_dir: Annotated[str, Form()],
    uuid: Annotated[str, Form()],
    filename: Annotated[str, Form()],
    total_chunks: Annotated[int, Form()],
    file_size: Annotated[int, Form()],
    current_user: Annotated[PublicUser, Depends(get_current_user)] = None,
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
    current_user: Annotated[PublicUser, Depends(get_current_user)] = None,
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
    current_user: Annotated[PublicUser, Depends(get_current_user)] = None,
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
    current_user: Annotated[PublicUser, Depends(get_current_user)] = None,
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
    current_user: Annotated[PublicUser, Depends(get_current_user)] = None,
):
    """
    Cancel an upload and clean up temporary files.

    Args:
        upload_id: Upload session ID

    Returns:
        Confirmation message
    """
    cleanup_session(upload_id)

    return {
        "success": True,
        "message": "Upload cancelled and cleaned up",
    }
