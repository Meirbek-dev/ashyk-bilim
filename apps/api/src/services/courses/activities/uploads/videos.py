import logging

from fastapi import UploadFile

from src.services.utils.upload_content import upload_content

logger = logging.getLogger(__name__)


async def upload_video(video_file: UploadFile, activity_uuid: str, course_uuid: str) -> dict[str, str] | None:
    contents = await video_file.read()
    video_format = (video_file.filename or "video.bin").split(".")[-1]

    try:
        await upload_content(
            f"courses/{course_uuid}/activities/{activity_uuid}/video",
            "platform",
            None,
            contents,
            f"video.{video_format}",
        )

    except Exception:
        logger.exception("Failed to upload video for activity %s", activity_uuid)
        return {"message": "There was an error uploading the file"}
    return None


async def upload_subtitle(
    subtitle_file: UploadFile,
    activity_uuid: str,
    course_uuid: str,
    language: str,
    subtitle_id: str | None = None,
) -> dict[str, object]:
    """Upload subtitle file to storage in the same directory as video."""
    contents = await subtitle_file.read()
    subtitle_format = (subtitle_file.filename or "subtitle.vtt").split(".")[-1]

    try:
        await upload_content(
            f"courses/{course_uuid}/activities/{activity_uuid}/video",
            "platform",
            None,
            contents,
            f"subtitle.{language}.{subtitle_format}",
        )
        return {"success": True, "filename": f"subtitle.{language}.{subtitle_format}"}

    except Exception as e:
        logger.warning("Error uploading subtitle for activity %s: %s", activity_uuid, e)
        return {"success": False, "message": f"Error uploading subtitle: {e!s}"}
