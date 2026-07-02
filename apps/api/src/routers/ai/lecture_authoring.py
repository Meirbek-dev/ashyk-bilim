from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, col, select

from src.auth.users import get_public_user
from src.db.ai_lecture_review import AILectureReview, AILectureReviewRead
from src.db.courses.courses import Course
from src.db.strict_base_model import PydanticStrictBaseModel
from src.db.users import PublicUser
from src.infra.db.session import get_db_session
from src.services.ai.operations import run_lecture_review
from src.services.ai.policy import require_ai_course_update
from src.types import JsonObject

router = APIRouter(prefix="/lecture-authoring")


class LectureReviewRequest(PydanticStrictBaseModel):
    activity_uuid: str | None = None
    language: str = "auto"


class DismissSuggestionRequest(PydanticStrictBaseModel):
    suggestion_id: str


@router.post("/{course_uuid}/critique", response_model=AILectureReviewRead)
async def api_critique_lecture(
    course_uuid: str,
    payload: LectureReviewRequest,
    current_user: Annotated[PublicUser, Depends(get_public_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
) -> AILectureReview:
    return await run_lecture_review(
        db_session,
        course_uuid,
        current_user,
        activity_uuid=payload.activity_uuid,
        language=payload.language,
    )


@router.get("/{course_id}/reviews", response_model=list[AILectureReviewRead])
async def api_list_lecture_reviews(
    course_id: int,
    current_user: Annotated[PublicUser, Depends(get_public_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
) -> list[AILectureReview]:
    course = db_session.get(Course, course_id)
    if course is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Курс не найден")
    require_ai_course_update(db_session, course, current_user)
    return list(
        db_session.exec(
            select(AILectureReview)
            .where(AILectureReview.course_id == course_id, AILectureReview.status == "active")
            .order_by(col(AILectureReview.created_at).desc())
        ).all()
    )


@router.post("/reviews/{review_uuid}/dismiss", response_model=AILectureReviewRead)
async def api_dismiss_lecture_suggestion(
    review_uuid: str,
    payload: DismissSuggestionRequest,
    current_user: Annotated[PublicUser, Depends(get_public_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
) -> AILectureReview:
    review = db_session.exec(select(AILectureReview).where(AILectureReview.review_uuid == review_uuid)).first()
    if review is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Обзор лекции не найден")
    course = db_session.get(Course, review.course_id)
    if course is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Курс не найден")
    require_ai_course_update(db_session, course, current_user)
    dismissed: JsonObject = dict(review.dismissed_json or {})
    dismissed[payload.suggestion_id] = True
    review.dismissed_json = dismissed
    db_session.add(review)
    db_session.commit()
    db_session.refresh(review)
    return review
