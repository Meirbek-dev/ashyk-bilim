import logging

from fastapi import UploadFile

from src.services.utils.upload_content import upload_content

logger = logging.getLogger(__name__)


async def upload_pdf(pdf_file: UploadFile, activity_uuid: str, course_uuid: str) -> dict[str, str] | None:
    contents = await pdf_file.read()
    pdf_format = (pdf_file.filename or "document.pdf").split(".")[-1]

    try:
        await upload_content(
            f"courses/{course_uuid}/activities/{activity_uuid}/documentpdf",
            "platform",
            None,
            contents,
            f"documentpdf.{pdf_format}",
        )

    except Exception:
        logger.exception("Failed to upload PDF for activity %s", activity_uuid)
        return {"message": "There was an error uploading the file"}
    return None
