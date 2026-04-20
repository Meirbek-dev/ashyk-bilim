from fastapi import HTTPException, Request, UploadFile, status
from ulid import ULID

from src.services.blocks.schemas.files import BlockFile
from src.services.utils.upload_content import upload_file


async def upload_file_and_return_file_object(
    request: Request,
    file: UploadFile,
    activity_uuid: str,
    block_id: str,
    list_of_allowed_file_formats: list,
    type_of_block: str,
    course_uuid: str,
):
    """Upload file for blocks."""
    file_id = str(ULID())

    # Map legacy format list to type system
    allowed_types = []
    if any(
        fmt in ["jpg", "jpeg", "png", "gif", "webp", "avif"]
        for fmt in list_of_allowed_file_formats
    ):
        allowed_types.append("image")
    if any(fmt in ["mp4", "webm", "mkv", "mov", "avi", "flv"] for fmt in list_of_allowed_file_formats):
        allowed_types.append("video")
    if any(fmt in ["mp3", "wav", "ogg", "m4a", "opus", "oga"] for fmt in list_of_allowed_file_formats):
        allowed_types.append("audio")
    if any(fmt in ["pdf", "pptx", "docx", "zip", "srt", "vtt", "txt"] for fmt in list_of_allowed_file_formats):
        allowed_types.append("document")

    if not allowed_types:
        raise HTTPException(status_code=400, detail="No valid file types specified")

    # Upload file
    filename = await upload_file(
        file=file,
        directory=f"courses/{course_uuid}/activities/{activity_uuid}/dynamic/blocks/{type_of_block}/{block_id}",
        type_of_dir="platform",
        uuid=None,
        allowed_types=allowed_types,
        filename_prefix=f"block_{file_id}",
        max_size=50 * 1024 * 1024,  # 50MB
    )

    # Get file metadata
    file.file.seek(0)
    content = await file.read()
    ext = filename.split(".")[-1] if "." in filename else "bin"

    # Use the actual saved filename (without extension) as file_id so frontend can
    # construct the correct public URL (it expects <file_id>.<ext>)
    saved_basename = filename.rsplit(".", 1)[0]

    return BlockFile(
        file_id=saved_basename,
        file_format=ext,
        file_name=file.filename,
        file_size=len(content),
        file_type=file.content_type,
        activity_uuid=activity_uuid,
    )
