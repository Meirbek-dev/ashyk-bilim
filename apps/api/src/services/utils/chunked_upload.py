"""Chunked file upload utilities for handling large files.

Chunks are stored under the app's persistent content directory so resumable
uploads survive process restarts and can be cleaned up by a startup sweep.
"""

import shutil
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Literal

import anyio
from fastapi import HTTPException, UploadFile
from ulid import ULID

from src.types import JsonObject

_CHUNKED_UPLOAD_ROOT = Path("content/chunked_uploads")
_CHUNKED_UPLOAD_ROOT.mkdir(parents=True, exist_ok=True)
_DEFAULT_SESSION_TTL = timedelta(hours=24)


class ChunkedUploadSession:
    """Manages a chunked upload session."""

    def __init__(
        self,
        upload_id: str,
        owner_user_id: int,
        directory: str,
        type_of_dir: Literal["platform", "users"],
        uuid: str | None,
        filename: str,
        total_chunks: int,
        file_size: int,
    ) -> None:
        self.upload_id = upload_id
        self.owner_user_id = owner_user_id
        self.directory = directory
        self.type_of_dir = type_of_dir
        self.uuid = uuid
        self.filename = filename
        self.total_chunks = total_chunks
        self.file_size = file_size
        self.chunks_received: set[int] = set()
        self.created_at = datetime.now(UTC)

        # Create durable temp directory for chunks.
        self.temp_dir = _CHUNKED_UPLOAD_ROOT / upload_id
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
                detail=f"Часть {chunk_index} уже получена",
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
                detail=f"Получены не все части. Получено {len(self.chunks_received)}/{self.total_chunks}",
            )

        # Assemble chunks in order
        assembled_data = bytearray()
        for i in range(self.total_chunks):
            chunk_path = self.get_chunk_path(i)
            path = anyio.Path(chunk_path)
            if not await path.exists():
                raise HTTPException(
                    status_code=500,
                    detail=f"Часть {i} отсутствует при сборке",
                )

            assembled_data.extend(await path.read_bytes())

        # Verify file size
        if len(assembled_data) != self.file_size:
            raise HTTPException(
                status_code=400,
                detail=f"Несоответствие размера собранного файла. Ожидалось {self.file_size}, получено {len(assembled_data)}",
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
    uuid: str | None,
    owner_user_id: int,
    filename: str,
    total_chunks: int,
    file_size: int,
) -> str:
    """Create a new chunked upload session."""
    upload_id = str(ULID())

    session = ChunkedUploadSession(
        upload_id=upload_id,
        owner_user_id=owner_user_id,
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
            detail=f"Сессия загрузки {upload_id} не найдена",
        )
    return session


async def process_chunk(
    upload_id: str,
    chunk_index: int,
    chunk_file: UploadFile,
) -> JsonObject:
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
            detail=f"Не удалось завершить загрузку. Получено {len(session.chunks_received)}/{session.total_chunks} частей",
        )

    # Assemble chunks
    file_data = await session.assemble_chunks()

    return file_data, session


def cleanup_session(upload_id: str) -> None:
    """Clean up an upload session."""
    session = _upload_sessions.pop(upload_id, None)
    if session:
        session.cleanup()


def cleanup_stale_sessions(*, max_age: timedelta = _DEFAULT_SESSION_TTL) -> int:
    """Remove orphaned chunk directories that are no longer tracked in memory."""
    if not _CHUNKED_UPLOAD_ROOT.exists():
        return 0

    now = datetime.now(UTC)
    removed = 0
    for entry in _CHUNKED_UPLOAD_ROOT.iterdir():
        if not entry.is_dir():
            continue
        if entry.name in _upload_sessions:
            continue
        try:
            created_at = datetime.fromtimestamp(entry.stat().st_mtime, UTC)
        except FileNotFoundError:
            continue
        if now - created_at < max_age:
            continue
        shutil.rmtree(entry, ignore_errors=True)
        removed += 1
    return removed


def get_session_status(upload_id: str) -> JsonObject:
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
