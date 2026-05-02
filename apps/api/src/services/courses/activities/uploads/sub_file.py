"""Legacy upload_submission_file shim.

Delegates to the new Upload pipeline so that any code still calling this
function writes through the canonical, PII-free storage path and gets a proper
Upload record in return.
"""

import hashlib
from datetime import UTC, datetime, timedelta
from pathlib import Path

from sqlmodel import Session
from ulid import ULID

from src.db.uploads import Upload, UploadStatus
from src.services.utils.upload_content import upload_content


def _upload_key(upload: Upload, sha256: str, user_uuid: str) -> str:
    suffix = Path(upload.filename).suffix.lower() or ".bin"
    year = upload.created_at.strftime("%Y")
    month = upload.created_at.strftime("%m")
    return f"uploads/{user_uuid}/{year}/{month}/{upload.upload_id}/{sha256}{suffix}"


async def upload_submission_file(
    file,
    name_in_disk: str,
    activity_uuid: str,
    course_uuid: str,
    assignment_uuid: str,
    assignment_task_uuid: str,
    *,
    db_session: Session | None = None,
    user_id: int | None = None,
    user_uuid: str | None = None,
) -> str:
    """Upload a submission file via the canonical Upload pipeline.

    Returns the ``upload_id`` string so callers can store it as a file reference.
    Falls back to the legacy object-storage path when no ``db_session`` is provided.
    """
    contents = file.file.read()
    sha256 = hashlib.sha256(contents).hexdigest()

    if db_session is not None and user_id is not None:
        now = datetime.now(UTC)
        upload = Upload(
            upload_id=f"ul_{ULID()}",
            user_id=user_id,
            filename=name_in_disk,
            content_type=getattr(file, "content_type", None) or "application/octet-stream",
            size=len(contents),
            sha256=sha256,
            status=UploadStatus.FINALIZED,
            expires_at=now + timedelta(days=365),
            finalized_at=now,
            updated_at=now,
        )
        effective_uuid = user_uuid or str(user_id)
        key = _upload_key(upload, sha256, effective_uuid)
        key_parts = key.rsplit("/", 1)
        await upload_content(
            directory=key_parts[0],
            type_of_dir="users",
            uuid=effective_uuid,
            file_binary=contents,
            file_and_format=key_parts[1],
            allowed_formats=None,
        )
        upload.key = key
        db_session.add(upload)
        db_session.commit()
        db_session.refresh(upload)
        return upload.upload_id

    # --- Legacy fallback (no db_session) ---
    await upload_content(
        f"courses/{course_uuid}/activities/{activity_uuid}/assignments/{assignment_uuid}/tasks/{assignment_task_uuid}/subs",
        "platform",
        None,
        contents,
        name_in_disk,
        ["pdf", "docx", "mkv", "mp4", "jpg", "jpeg", "png", "pptx", "zip"],
    )
    return name_in_disk

