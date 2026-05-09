"""
Chunked file upload utilities for handling large files.
Bypasses nginx request size limits by streaming file chunks.
"""

import hashlib
import os
import shutil
from pathlib import Path
from typing import Literal

import anyio
from fastapi import HTTPException, UploadFile
from ulid import ULID


class ChunkedUploadSession:
    """Manages a chunked upload session."""

    def __init__(
        self,
        upload_id: str,
        directory: str,
        type_of_dir: Literal["platform", "users"],
        uuid: str,
        filename: str,
        total_chunks: int,
        file_size: int,
    ) -> None:
        self.upload_id = upload_id
        self.directory = directory
        self.type_of_dir = type_of_dir
        self.uuid = uuid
        self.filename = filename
        self.total_chunks = total_chunks
        self.file_size = file_size
        self.chunks_received: set[int] = set()

        # Create temp directory for chunks
        self.temp_dir = Path(f"temp_uploads/{upload_id}")
        self.temp_dir.mkdir(parents=True, exist_ok=True)

    def get_chunk_path(self, chunk_index: int) -> Path:
        """Get the path for a specific chunk."""
        return self.temp_dir / f"chunk_{chunk_index}"

    def is_complete(self) -> bool:
        """Check if all chunks have been received."""
        return len(self.chunks_received) == self.total_chunks

    async def save_chunk(self, chunk_index: int, chunk_data: bytes) -> None:
        """Save a chunk to disk."""
        if chunk_index in self.chunks_received:
            raise HTTPException(
                status_code=400,
                detail=f"Chunk {chunk_index} already received",
            )

        chunk_path = self.get_chunk_path(chunk_index)
        path = anyio.Path(chunk_path)
        await path.write_bytes(chunk_data)

        self.chunks_received.add(chunk_index)

    async def assemble_chunks(self) -> bytes:
        """Assemble all chunks into final file."""
        if not self.is_complete():
            raise HTTPException(
                status_code=400,
                detail=f"Not all chunks received. Got {len(self.chunks_received)}/{self.total_chunks}",
            )

        # Assemble chunks in order
        assembled_data = bytearray()
        for i in range(self.total_chunks):
            chunk_path = self.get_chunk_path(i)
            path = anyio.Path(chunk_path)
            if not await path.exists():
                raise HTTPException(
                    status_code=500,
                    detail=f"Chunk {i} missing during assembly",
                )

            assembled_data.extend(await path.read_bytes())

        # Verify file size
        if len(assembled_data) != self.file_size:
            raise HTTPException(
                status_code=400,
                detail=f"Assembled file size mismatch. Expected {self.file_size}, got {len(assembled_data)}",
            )

        return bytes(assembled_data)

    def cleanup(self) -> None:
        """Clean up temporary files."""
        if self.temp_dir.exists():
            shutil.rmtree(self.temp_dir)


# Global session storage (in production, use Redis or database)
_upload_sessions: dict[str, ChunkedUploadSession] = {}


def create_upload_session(
    directory: str,
    type_of_dir: Literal["platform", "users"],
    uuid: str,
    filename: str,
    total_chunks: int,
    file_size: int,
) -> str:
    """Create a new chunked upload session."""
    upload_id = str(ULID())

    session = ChunkedUploadSession(
        upload_id=upload_id,
        directory=directory,
        type_of_dir=type_of_dir,
        uuid=uuid,
        filename=filename,
        total_chunks=total_chunks,
        file_size=file_size,
    )

    _upload_sessions[upload_id] = session
    return upload_id


def get_upload_session(upload_id: str) -> ChunkedUploadSession:
    """Get an existing upload session."""
    session = _upload_sessions.get(upload_id)
    if not session:
        raise HTTPException(
            status_code=404,
            detail=f"Upload session {upload_id} not found",
        )
    return session


async def process_chunk(
    upload_id: str,
    chunk_index: int,
    chunk_file: UploadFile,
) -> dict:
    """Process a single chunk."""
    session = get_upload_session(upload_id)

    # Read chunk data
    chunk_data = await chunk_file.read()

    # Save chunk
    await session.save_chunk(chunk_index, chunk_data)

    return {
        "upload_id": upload_id,
        "chunk_index": chunk_index,
        "chunks_received": len(session.chunks_received),
        "total_chunks": session.total_chunks,
        "is_complete": session.is_complete(),
    }


async def complete_upload(upload_id: str) -> tuple[bytes, ChunkedUploadSession]:
    """Complete the upload by assembling all chunks."""
    session = get_upload_session(upload_id)

    if not session.is_complete():
        raise HTTPException(
            status_code=400,
            detail=f"Cannot complete upload. Received {len(session.chunks_received)}/{session.total_chunks} chunks",
        )

    # Assemble chunks
    file_data = await session.assemble_chunks()

    return file_data, session


def cleanup_session(upload_id: str) -> None:
    """Clean up an upload session."""
    session = _upload_sessions.pop(upload_id, None)
    if session:
        session.cleanup()


def get_session_status(upload_id: str) -> dict:
    """Get the status of an upload session."""
    session = get_upload_session(upload_id)

    return {
        "upload_id": upload_id,
        "filename": session.filename,
        "chunks_received": len(session.chunks_received),
        "total_chunks": session.total_chunks,
        "is_complete": session.is_complete(),
        "file_size": session.file_size,
    }
