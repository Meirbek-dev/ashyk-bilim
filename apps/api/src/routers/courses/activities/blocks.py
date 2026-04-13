from typing import Annotated

from fastapi import APIRouter, Depends, Form, Request, UploadFile

from src.db.courses.blocks import BlockRead
from src.db.courses.quiz import (
    QuizAttemptRead,
    QuizQuestionStatRead,
    QuizSubmissionRequest,
    QuizSubmissionResponse,
)
from src.infra.db.session import get_db_session
from src.security.auth import get_current_user
from src.services.blocks.block_types.imageBlock.imageBlock import (
    create_image_block,
    get_image_block,
)
from src.services.blocks.block_types.pdfBlock.pdfBlock import (
    create_pdf_block,
    get_pdf_block,
)
from src.services.blocks.block_types.quizBlock.quizBlock import (
    get_quiz_attempts,
    get_quiz_stats,
    submit_quiz,
)
from src.services.blocks.block_types.videoBlock.videoBlock import (
    create_video_block,
    get_video_block,
)
from src.services.users.users import PublicUser

router = APIRouter()

####################
# Image Block
####################


@router.post("/image", response_model=BlockRead)
async def api_create_image_file_block(
    request: Request,
    file_object: UploadFile,
    activity_uuid: Annotated[str, Form()],
    db_session=Depends(get_db_session),
    current_user: Annotated[PublicUser, Depends(get_current_user)] = None,
) -> BlockRead:
    """
    Create new image file
    """
    return await create_image_block(request, file_object, activity_uuid, db_session)


@router.get("/image", response_model=BlockRead)
async def api_get_image_file_block(
    request: Request,
    block_uuid: str,
    db_session=Depends(get_db_session),
    current_user: Annotated[PublicUser, Depends(get_current_user)] = None,
) -> BlockRead:
    """
    Get image file
    """
    return await get_image_block(request, block_uuid, current_user, db_session)


####################
# Video Block
####################


@router.post("/video", response_model=BlockRead)
async def api_create_video_file_block(
    request: Request,
    file_object: UploadFile,
    activity_uuid: Annotated[str, Form()],
    db_session=Depends(get_db_session),
    current_user: Annotated[PublicUser, Depends(get_current_user)] = None,
) -> BlockRead:
    """
    Create new video file
    """
    return await create_video_block(request, file_object, activity_uuid, db_session)


@router.get("/video", response_model=BlockRead)
async def api_get_video_file_block(
    request: Request,
    block_uuid: str,
    db_session=Depends(get_db_session),
    current_user: Annotated[PublicUser, Depends(get_current_user)] = None,
) -> BlockRead:
    """
    Get video file
    """
    return await get_video_block(request, block_uuid, current_user, db_session)


####################
# PDF Block
####################


@router.post("/pdf", response_model=BlockRead)
async def api_create_pdf_file_block(
    request: Request,
    file_object: UploadFile,
    activity_uuid: Annotated[str, Form()],
    db_session=Depends(get_db_session),
    current_user: Annotated[PublicUser, Depends(get_current_user)] = None,
) -> BlockRead:
    """
    Create new pdf file
    """
    return await create_pdf_block(request, file_object, activity_uuid, db_session)


@router.get("/pdf", response_model=BlockRead)
async def api_get_pdf_file_block(
    request: Request,
    block_uuid: str,
    db_session=Depends(get_db_session),
    current_user: Annotated[PublicUser, Depends(get_current_user)] = None,
) -> BlockRead:
    """
    Get pdf file
    """
    return await get_pdf_block(request, block_uuid, current_user, db_session)


####################
# Quiz Block
####################


@router.post("/quiz/{activity_id}", response_model=QuizSubmissionResponse)
async def api_submit_quiz(
    request: Request,
    activity_id: int,
    submission: QuizSubmissionRequest,
    db_session=Depends(get_db_session),
    current_user: Annotated[PublicUser, Depends(get_current_user)] = None,
):
    """
    Submit a quiz attempt and receive grading results.
    """
    return await submit_quiz(
        request=request,
        activity_id=activity_id,
        submission=submission,
        current_user=current_user,
        db_session=db_session,
    )


@router.get("/quiz/{activity_id}/attempts", response_model=list[QuizAttemptRead])
async def api_get_quiz_attempts(
    request: Request,
    activity_id: int,
    user_id: int | None = None,
    db_session=Depends(get_db_session),
    current_user: Annotated[PublicUser, Depends(get_current_user)] = None,
):
    """
    Get quiz attempts for an activity.
    """
    return await get_quiz_attempts(
        request=request,
        activity_id=activity_id,
        current_user=current_user,
        db_session=db_session,
        user_id=user_id,
    )


@router.get("/quiz/{activity_id}/stats", response_model=list[QuizQuestionStatRead])
async def api_get_quiz_stats(
    request: Request,
    activity_id: int,
    db_session=Depends(get_db_session),
    current_user: Annotated[PublicUser, Depends(get_current_user)] = None,
):
    """
    Get per-question statistics for a quiz (teachers only).
    """
    return await get_quiz_stats(
        request=request,
        activity_id=activity_id,
        current_user=current_user,
        db_session=db_session,
    )
