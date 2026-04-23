from typing import Annotated

from fastapi import APIRouter, Depends, Request, UploadFile
from sqlmodel import Session

from src.db.courses.exams import (
    ExamAttemptRead,
    ExamCreate,
    ExamCreateWithActivity,
    ExamRead,
    ExamUpdate,
    QuestionCreate,
    QuestionRead,
    QuestionUpdate,
)
from src.db.users import AnonymousUser, PublicUser
from src.infra.db.session import get_db_session
from src.security.auth import get_current_user, get_current_user_optional
from src.services.courses.activities.exams import (
    create_exam,
    create_exam_with_activity,
    create_question,
    delete_exam,
    delete_question,
    export_questions_csv,
    get_all_exam_attempts,
    get_user_attempts,
    import_questions_csv,
    read_exam,
    read_exam_from_activity_uuid,
    read_questions,
    record_violation,
    start_exam_attempt,
    submit_exam_attempt,
    update_exam,
    update_question,
)

router = APIRouter()


# Public endpoint to expose exam input limits to frontends
@router.get("/config")
async def api_get_exam_config():
    from src.db.courses.exams import (
        ATTEMPT_LIMIT_MAX,
        ATTEMPT_LIMIT_MIN,
        QUESTION_LIMIT_MIN,
        TIME_LIMIT_MAX,
        TIME_LIMIT_MIN,
        VIOLATION_THRESHOLD_MAX,
        VIOLATION_THRESHOLD_MIN,
    )

    return {
        "time_limit": {"min": TIME_LIMIT_MIN, "max": TIME_LIMIT_MAX},
        "attempt_limit": {"min": ATTEMPT_LIMIT_MIN, "max": ATTEMPT_LIMIT_MAX},
        "violation_threshold": {
            "min": VIOLATION_THRESHOLD_MIN,
            "max": VIOLATION_THRESHOLD_MAX,
        },
        "question_limit": {"min": QUESTION_LIMIT_MIN},
    }


## EXAMS ##


@router.post("")
async def api_create_exam(
    request: Request,
    exam_object: ExamCreate,
    current_user: Annotated[PublicUser, Depends(get_current_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
) -> ExamRead:
    return await create_exam(request, exam_object, current_user, db_session)


@router.post("/with-activity")
async def api_create_exam_with_activity(
    request: Request,
    exam_object: ExamCreateWithActivity,
    current_user: Annotated[PublicUser, Depends(get_current_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
) -> dict:
    return await create_exam_with_activity(
        request, exam_object, current_user, db_session
    )


@router.get("/{exam_uuid}")
async def api_get_exam(
    request: Request,
    exam_uuid: str,
    current_user: Annotated[
        PublicUser | AnonymousUser, Depends(get_current_user_optional)
    ],
    db_session: Annotated[Session, Depends(get_db_session)],
) -> ExamRead:
    return await read_exam(request, exam_uuid, current_user, db_session)


@router.get("/activity/{activity_uuid}")
async def api_get_exam_from_activity(
    request: Request,
    activity_uuid: str,
    current_user: Annotated[
        PublicUser | AnonymousUser, Depends(get_current_user_optional)
    ],
    db_session: Annotated[Session, Depends(get_db_session)],
) -> ExamRead:
    return await read_exam_from_activity_uuid(
        request, activity_uuid, current_user, db_session
    )


@router.put("/{exam_uuid}")
async def api_update_exam(
    request: Request,
    exam_uuid: str,
    exam_object: ExamUpdate,
    current_user: Annotated[PublicUser, Depends(get_current_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
) -> ExamRead:
    return await update_exam(request, exam_uuid, exam_object, current_user, db_session)


@router.delete("/{exam_uuid}")
async def api_delete_exam(
    request: Request,
    exam_uuid: str,
    current_user: Annotated[PublicUser, Depends(get_current_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
) -> dict[str, str]:
    return await delete_exam(request, exam_uuid, current_user, db_session)


## QUESTIONS ##


@router.post("/{exam_uuid}/questions")
async def api_create_question(
    request: Request,
    exam_uuid: str,
    question_object: QuestionCreate,
    current_user: Annotated[PublicUser, Depends(get_current_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
) -> QuestionRead:
    return await create_question(
        request, exam_uuid, question_object, current_user, db_session
    )


@router.get("/{exam_uuid}/questions")
async def api_get_questions(
    request: Request,
    exam_uuid: str,
    current_user: Annotated[PublicUser, Depends(get_current_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
) -> list[QuestionRead]:
    return await read_questions(request, exam_uuid, current_user, db_session)


@router.put("/questions/{question_uuid}")
async def api_update_question(
    request: Request,
    question_uuid: str,
    question_object: QuestionUpdate,
    current_user: Annotated[PublicUser, Depends(get_current_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
) -> QuestionRead:
    return await update_question(
        request, question_uuid, question_object, current_user, db_session
    )


@router.delete("/questions/{question_uuid}")
async def api_delete_question(
    request: Request,
    question_uuid: str,
    current_user: Annotated[PublicUser, Depends(get_current_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
) -> dict[str, str]:
    return await delete_question(request, question_uuid, current_user, db_session)


## EXAM ATTEMPTS ##


@router.post("/{exam_uuid}/attempts/start")
async def api_start_exam_attempt(
    request: Request,
    exam_uuid: str,
    current_user: Annotated[PublicUser, Depends(get_current_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
) -> ExamAttemptRead:
    return await start_exam_attempt(request, exam_uuid, current_user, db_session)


@router.post("/{exam_uuid}/attempts/{attempt_uuid}/submit")
async def api_submit_exam_attempt(
    request: Request,
    exam_uuid: str,
    attempt_uuid: str,
    current_user: Annotated[PublicUser, Depends(get_current_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
) -> ExamAttemptRead:
    # Parse answers from request body
    body = await request.json()
    answers = body if isinstance(body, dict) else {}
    return await submit_exam_attempt(
        request, attempt_uuid, answers, current_user, db_session
    )


@router.post("/{exam_uuid}/attempts/{attempt_uuid}/violations")
async def api_record_violation(
    request: Request,
    exam_uuid: str,
    attempt_uuid: str,
    violation_data: dict,
    current_user: Annotated[PublicUser, Depends(get_current_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
) -> ExamAttemptRead:
    violation_type = violation_data.get("type", "UNKNOWN")
    return await record_violation(
        request, attempt_uuid, violation_type, current_user, db_session
    )


@router.get("/{exam_uuid}/attempts/me")
async def api_get_my_attempts(
    request: Request,
    exam_uuid: str,
    current_user: Annotated[PublicUser, Depends(get_current_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
) -> list[ExamAttemptRead]:
    return await get_user_attempts(request, exam_uuid, current_user, db_session)


@router.get("/attempts/{attempt_uuid}")
async def api_get_attempt_by_uuid(
    request: Request,
    attempt_uuid: str,
    current_user: Annotated[PublicUser, Depends(get_current_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
) -> ExamAttemptRead:
    """
    Get a specific exam attempt by UUID.

    - Students can only access their own attempts
    - Teachers/admins can access any attempt for exams they manage
    """
    from src.services.courses.activities.exams import get_attempt_by_uuid

    return await get_attempt_by_uuid(request, attempt_uuid, current_user, db_session)


@router.get("/{exam_uuid}/attempts/all")
async def api_get_all_attempts(
    request: Request,
    exam_uuid: str,
    current_user: Annotated[PublicUser, Depends(get_current_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
) -> list[dict]:
    """Get all exam attempts for teacher results dashboard"""
    return await get_all_exam_attempts(request, exam_uuid, current_user, db_session)


@router.get("/{exam_uuid}/questions/export-csv")
async def api_export_questions_csv(
    request: Request,
    exam_uuid: str,
    current_user: Annotated[PublicUser, Depends(get_current_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
):
    """Export exam questions to CSV"""
    from fastapi.responses import Response

    csv_content = await export_questions_csv(
        request, exam_uuid, current_user, db_session
    )

    return Response(
        content=csv_content,
        media_type="text/csv",
        headers={
            "Content-Disposition": f"attachment; filename=exam_{exam_uuid}_questions.csv"
        },
    )


@router.post("/{exam_uuid}/questions/import-csv")
async def api_import_questions_csv(
    request: Request,
    exam_uuid: str,
    file: UploadFile,
    current_user: Annotated[PublicUser, Depends(get_current_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
) -> dict:
    """Import exam questions from CSV"""
    csv_content = (await file.read()).decode("utf-8")
    return await import_questions_csv(
        request, exam_uuid, csv_content, current_user, db_session
    )


@router.post("/{exam_uuid}/questions/reorder")
async def api_reorder_questions(
    request: Request,
    exam_uuid: str,
    question_order: list[dict],  # [{"question_uuid": str, "order_index": int}, ...]
    current_user: Annotated[PublicUser, Depends(get_current_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
) -> dict:
    """Bulk update question order"""
    from src.services.courses.activities.exams import reorder_questions

    return await reorder_questions(
        request, exam_uuid, question_order, current_user, db_session
    )
