import asyncio
import json
from datetime import datetime
from typing import Literal

from fastapi import HTTPException, Request, UploadFile, status
from sqlmodel import Session, select
from ulid import ULID

from src.db.courses.activities import (
    Activity,
    ActivityRead,
    ActivitySubTypeEnum,
    ActivityTypeEnum,
)
from src.db.courses.chapters import Chapter
from src.db.courses.courses import Course
from src.db.strict_base_model import PydanticStrictBaseModel
from src.db.users import AnonymousUser, PublicUser
from src.security.rbac import PermissionChecker
from src.services.courses.activities.uploads.videos import upload_subtitle, upload_video


def _get_language_label(language_code: str) -> str:
    language_map = {
        "en": "English",
        "ru": "Russian",
        "kz": "Kazakh",
        "fr": "French",
        "es": "Spanish",
        "de": "German",
    }
    return language_map.get(language_code, language_code.upper())


def validate_video_file(video_file: UploadFile | None) -> str:
    if not video_file:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Video : No video file provided",
        )
    if video_file.content_type not in ["video/mp4", "video/webm", "video/x-matroska"]:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Video : Wrong video format",
        )
    video_format = (
        video_file.filename.rsplit(".", 1)[-1]
        if video_file.filename and "." in video_file.filename
        else None
    )
    if not video_format:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Video : No video file provided or invalid filename",
        )
    return video_format


def _next_activity_order(chapter_id: int, db_session: Session) -> int:
    result = db_session.exec(
        select(Activity)
        .where(Activity.chapter_id == chapter_id)
        .order_by(Activity.order.desc())
    ).first()
    return (result.order if result else 0) + 1


async def create_video_activity(
    request: Request,
    name: str,
    chapter_id: int,
    current_user: PublicUser,
    db_session: Session,
    video_file: UploadFile | None = None,
    details: str = "{}",
    subtitle_files: list[UploadFile] | None = None,
    video_uploaded_path: str | None = None,
):
    chapter = db_session.exec(select(Chapter).where(Chapter.id == chapter_id)).first()
    if not chapter:
        raise HTTPException(status_code=404, detail="Chapter not found")

    course = db_session.exec(
        select(Course).where(Course.id == chapter.course_id)
    ).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")

    checker = PermissionChecker(db_session)
    checker.require(
        current_user.id, "activity:create", resource_owner_id=course.creator_id
    )

    details_dict = json.loads(details) if isinstance(details, str) else details

    activity_uuid = f"activity_{ULID()}"

    if video_file:
        video_format = validate_video_file(video_file)
    elif video_uploaded_path:
        video_format = video_uploaded_path.split(".")[-1]
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Either video_file or video_uploaded_path must be provided",
        )

    activity = Activity(
        name=name,
        activity_type=ActivityTypeEnum.TYPE_VIDEO,
        activity_sub_type=ActivitySubTypeEnum.SUBTYPE_VIDEO_HOSTED,
        activity_uuid=activity_uuid,
        chapter_id=chapter.id,
        course_id=chapter.course_id,  # keep legacy column in sync
        content={"filename": f"video.{video_format}", "activity_uuid": activity_uuid},
        details=details_dict
        if isinstance(details_dict, dict)
        else json.loads(details_dict),
        creation_date=str(datetime.now()),
        update_date=str(datetime.now()),
        order=_next_activity_order(chapter_id, db_session),
        creator_id=current_user.id,
    )

    db_session.add(activity)
    db_session.commit()
    db_session.refresh(activity)

    if video_file:
        await upload_video(video_file, activity.activity_uuid, course.course_uuid)
    elif video_uploaded_path:
        import shutil
        from pathlib import Path

        temp_path = Path(f"content/platform/{video_uploaded_path}")
        final_path = Path(
            f"content/platform/courses/{course.course_uuid}/activities/{activity.activity_uuid}/video/video.{video_format}"
        )
        final_path.parent.mkdir(parents=True, exist_ok=True)
        if temp_path.exists():
            shutil.move(str(temp_path), str(final_path))
            if temp_path.parent.exists():
                shutil.rmtree(temp_path.parent, ignore_errors=True)

    if subtitle_files:
        subtitle_info = []
        valid_subtitles: list[tuple] = []
        for subtitle_file in subtitle_files:
            if subtitle_file.filename and subtitle_file.size > 0:
                if not subtitle_file.filename.endswith((".srt", ".vtt")):
                    continue
                filename_parts = subtitle_file.filename.split(".")
                language = "en"
                if len(filename_parts) >= 2:
                    potential_lang = filename_parts[-2].lower()
                    if 2 <= len(potential_lang) <= 3 and potential_lang.isalpha():
                        language = potential_lang
                valid_subtitles.append((subtitle_file, language))

        if valid_subtitles:
            upload_results = await asyncio.gather(
                *[
                    upload_subtitle(
                        subtitle_file,
                        activity.activity_uuid,
                        course.course_uuid,
                        language,
                        None,
                    )
                    for subtitle_file, language in valid_subtitles
                ]
            )
            for (_, language), upload_result in zip(
                valid_subtitles, upload_results, strict=False
            ):
                if upload_result.get("success"):
                    subtitle_info.append(
                        {
                            "language": language,
                            "filename": upload_result.get("filename"),
                            "label": _get_language_label(language),
                            "url": f"/content/platform/courses/{course.course_uuid}/activities/{activity.activity_uuid}/video/{upload_result.get('filename')}",
                        }
                    )

        if subtitle_info:
            updated_details = (
                details_dict.copy() if isinstance(details_dict, dict) else {}
            )
            updated_details["subtitles"] = subtitle_info
            activity.details = updated_details
            db_session.add(activity)
            db_session.commit()
            db_session.refresh(activity)

    return ActivityRead.model_validate(activity)


class ExternalVideo(PydanticStrictBaseModel):
    name: str
    uri: str
    type: Literal["youtube", "vimeo"]
    chapter_id: int
    details: str = "{}"


class ExternalVideoInDB(PydanticStrictBaseModel):
    activity_id: int


async def create_external_video_activity(
    request: Request,
    current_user: PublicUser | AnonymousUser,
    data: ExternalVideo,
    db_session: Session,
):
    chapter = db_session.exec(
        select(Chapter).where(Chapter.id == data.chapter_id)
    ).first()
    if not chapter:
        raise HTTPException(status_code=404, detail="Chapter not found")

    course = db_session.exec(
        select(Course).where(Course.id == chapter.course_id)
    ).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")

    checker = PermissionChecker(db_session)
    checker.require(
        current_user.id, "activity:create", resource_owner_id=course.creator_id
    )

    activity_uuid = f"activity_{ULID()}"
    details = json.loads(data.details)

    activity = Activity(
        name=data.name,
        activity_type=ActivityTypeEnum.TYPE_VIDEO,
        activity_sub_type=ActivitySubTypeEnum.SUBTYPE_VIDEO_YOUTUBE,
        activity_uuid=activity_uuid,
        chapter_id=chapter.id,
        course_id=chapter.course_id,
        content={"uri": data.uri, "type": data.type, "activity_uuid": activity_uuid},
        details=details,
        creation_date=str(datetime.now()),
        update_date=str(datetime.now()),
        order=_next_activity_order(data.chapter_id, db_session),
        creator_id=current_user.id,
    )

    db_session.add(activity)
    db_session.commit()
    db_session.refresh(activity)

    return ActivityRead.model_validate(activity)
