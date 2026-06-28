from fastapi import HTTPException, UploadFile

from src.services.utils.upload_content import upload_content


async def upload_thumbnail(thumbnail_file: UploadFile, name_in_disk: str, course_id: int | str) -> None:
    contents = thumbnail_file.file.read()
    try:
        await upload_content(
            f"courses/{course_id}/thumbnails",
            "platform",
            None,
            contents,
            f"{name_in_disk}",
        )
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail="Произошла ошибка при загрузке файла",
        ) from exc
