"""
Quiz block service for handling quiz submissions and analytics.
"""

import logging
from datetime import UTC, datetime, timezone

from fastapi import HTTPException, Request, status
from sqlmodel import Session, select
from ulid import ULID

from src.db.courses.activities import Activity
from src.db.courses.blocks import Block
from src.db.courses.quiz import (
    QuizGradingResult,
    QuizQuestionStat,
    QuizSettings,
    QuizSubmissionRequest,
    QuizSubmissionResponse,
)
from src.db.gamification import XPSource
from src.db.grading.submissions import AssessmentType, Submission, SubmissionStatus
from src.db.users import PublicUser
from src.security.rbac import PermissionChecker
from src.services.blocks.block_types.quizBlock.grading import (
    apply_attempt_penalty,
    grade_quiz,
)
from src.services.gamification.service import award_xp
from src.services.progress import submissions as progress_submissions

logger = logging.getLogger(__name__)


def _serialize_quiz_grading(grading_result: dict[str, object]) -> dict[str, object]:
    per_question = grading_result.get("per_question")
    items = (
        [
            {
                "item_id": str(item.get("question_id") or ""),
                "item_text": str(item.get("question_text") or ""),
                "score": float(item.get("score") or 0),
                "max_score": float(item.get("max_score") or 0),
                "correct": item.get("correct"),
                "feedback": str(item.get("feedback") or ""),
                "needs_manual_review": bool(item.get("needs_grading", False)),
                "user_answer": item.get("user_answer"),
                "correct_answer": item.get("correct_answers"),
            }
            for item in per_question
            if isinstance(item, dict)
        ]
        if isinstance(per_question, list)
        else []
    )
    return {
        "items": items,
        "needs_manual_review": any(
            isinstance(item, dict) and item.get("needs_grading")
            for item in (per_question or [])
        ),
        "auto_graded": True,
        "feedback": "",
    }


def _submission_attempt_uuid(submission: Submission) -> str:
    metadata = (
        submission.metadata_json if isinstance(submission.metadata_json, dict) else {}
    )
    attempt_uuid = metadata.get("attempt_uuid")
    if isinstance(attempt_uuid, str) and attempt_uuid:
        return attempt_uuid
    if submission.submission_uuid.startswith("submission_"):
        return submission.submission_uuid.removeprefix("submission_")
    return submission.submission_uuid


def _build_quiz_submission_response(
    submission: Submission,
    *,
    max_attempts_reached: bool,
    violations_exceeded: bool,
) -> QuizSubmissionResponse:
    grading_json = (
        submission.grading_json if isinstance(submission.grading_json, dict) else {}
    )
    items = (
        grading_json.get("items") if isinstance(grading_json.get("items"), list) else []
    )
    score = float(
        submission.final_score
        if submission.final_score is not None
        else submission.auto_score or 0
    )
    per_question = [
        {
            "question_id": item.get("item_id"),
            "question_text": item.get("item_text"),
            "correct": item.get("correct"),
            "score": item.get("score"),
            "max_score": item.get("max_score"),
            "feedback": item.get("feedback"),
            "user_answer": item.get("user_answer"),
            "correct_answers": item.get("correct_answer"),
            "needs_grading": item.get("needs_manual_review", False),
        }
        for item in items
        if isinstance(item, dict)
    ]
    return QuizSubmissionResponse(
        attempt_uuid=_submission_attempt_uuid(submission),
        attempt_number=submission.attempt_number,
        grading_result=QuizGradingResult(
            total_score=score,
            max_score=100.0,
            percentage=score,
            passed=score >= 50.0,
            per_question=per_question,
        ),
        max_attempts_reached=max_attempts_reached,
        violations_exceeded=violations_exceeded,
    )


async def submit_quiz(
    request: Request,
    activity_id: int,
    submission: QuizSubmissionRequest,
    current_user: PublicUser,
    db_session: Session,
) -> QuizSubmissionResponse:
    """
    Submit a quiz attempt and receive grading results.

    Features:
    - Idempotency via idempotency_key
    - Server-side grading
    - Attempt limits and penalties
    - Violation tracking
    - XP awards via gamification
    - Analytics tracking
    """

    # Get activity
    statement = select(Activity).where(Activity.id == activity_id)
    activity = db_session.exec(statement).first()

    if not activity:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Activity not found"
        )

    # Check permissions (students can submit, teachers can view)
    checker = PermissionChecker(db_session)
    checker.require(
        current_user.id,
        "quiz:submit",
        resource_owner_id=activity.creator_id,
        is_assigned=True,
    )

    # Get quiz block to access questions and settings
    statement = (
        select(Block).where(Block.activity_id == activity_id).order_by(Block.id.desc())
    )

    quiz_block = db_session.exec(statement).first()

    if not quiz_block:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Quiz block not found"
        )

    questions = quiz_block.content.get("questions", [])
    settings_data = quiz_block.content.get("settings", {})
    settings = QuizSettings(**settings_data) if settings_data else QuizSettings()

    statement = select(Submission).where(
        Submission.user_id == current_user.id,
        Submission.activity_id == activity_id,
        Submission.assessment_type == AssessmentType.QUIZ,
    )
    previous_attempts = db_session.exec(statement).all()

    if submission.idempotency_key:
        existing = next(
            (
                item
                for item in previous_attempts
                if isinstance(item.metadata_json, dict)
                and item.metadata_json.get("idempotency_key")
                == submission.idempotency_key
            ),
            None,
        )
        if existing is not None:
            return _build_quiz_submission_response(
                existing,
                max_attempts_reached=_check_max_attempts(
                    db_session, current_user.id, activity_id, settings.max_attempts
                ),
                violations_exceeded=bool(
                    isinstance(existing.metadata_json, dict)
                    and int(existing.metadata_json.get("violation_count") or 0)
                    > settings.max_violations
                    and settings.block_on_violations
                ),
            )

    attempt_number = len(previous_attempts) + 1

    if settings.max_attempts and attempt_number > settings.max_attempts:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Maximum attempts ({settings.max_attempts}) reached",
        )

    # Check violations
    if (
        settings.track_violations
        and settings.block_on_violations
        and submission.violation_count > settings.max_violations
    ):
        violations_exceeded = True
    else:
        violations_exceeded = False

    # Calculate timing
    start_ts = submission.start_ts or datetime.now(UTC)
    end_ts = submission.end_ts or datetime.now(UTC)
    duration_seconds = int((end_ts - start_ts).total_seconds())

    # Check time limit
    if settings.time_limit_seconds and duration_seconds > settings.time_limit_seconds:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Time limit ({settings.time_limit_seconds}s) exceeded",
        )

    # Grade the quiz
    grading_result = grade_quiz(
        questions=questions,
        user_answers=submission.answers,
        max_score=100.0,
    )

    # Apply attempt penalty
    final_score = apply_attempt_penalty(
        base_score=grading_result["total_score"],
        attempt_number=attempt_number,
        max_score_penalty_per_attempt=settings.max_score_penalty_per_attempt,
    )

    # Apply violations penalty if exceeded
    if violations_exceeded:
        final_score = 0.0
        grading_result["passed"] = False

    attempt_uuid = f"quiz_attempt_{ULID()}"
    manual_review = any(
        isinstance(item, dict) and item.get("needs_grading")
        for item in grading_result.get("per_question", [])
    )
    canonical_submission = Submission(
        submission_uuid=f"submission_{attempt_uuid}",
        assessment_type=AssessmentType.QUIZ,
        activity_id=activity_id,
        user_id=current_user.id,
        status=SubmissionStatus.PENDING if manual_review else SubmissionStatus.GRADED,
        attempt_number=attempt_number,
        answers_json={"answers": submission.answers},
        grading_json=_serialize_quiz_grading(grading_result),
        metadata_json={
            "attempt_uuid": attempt_uuid,
            "idempotency_key": submission.idempotency_key,
            "duration_seconds": duration_seconds,
            "violation_count": submission.violation_count,
            "violations": [
                {
                    "kind": key,
                    "occurred_at": end_ts,
                    "count": int(value or 0),
                }
                for key, value in submission.violations.items()
                if int(value or 0) > 0
            ],
        },
        auto_score=final_score,
        final_score=None if manual_review else final_score,
        is_late=False,
        started_at=start_ts,
        submitted_at=end_ts,
        graded_at=None if manual_review else end_ts,
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )
    if manual_review:
        progress_submissions.submit_activity(canonical_submission, db_session)
    else:
        progress_submissions.grade_submission(canonical_submission, db_session)

    # Update question statistics
    await _update_question_stats(
        db_session=db_session,
        activity_id=activity_id,
        questions=questions,
        grading_result=grading_result,
    )

    # Award XP if passed and not violated
    xp_awarded = 0
    triggered_level_up = False

    if grading_result["passed"] and not violations_exceeded:
        try:
            xp_result = await award_xp(
                request=request,
                user_id=current_user.id,
                source=XPSource.QUIZ_COMPLETION,
                source_id=attempt_uuid,
                idempotency_key=f"quiz_{attempt_uuid}",
                db_session=db_session,
            )
            xp_awarded = xp_result.get("amount", 0)
            triggered_level_up = xp_result.get("level_up", False)
        except Exception as e:  # noqa: BLE001
            # Log but don't fail the submission
            logger.warning("Failed to award XP: %s", e)

    # Build response
    grading_result["xp_awarded"] = xp_awarded
    grading_result["triggered_level_up"] = triggered_level_up

    return QuizSubmissionResponse(
        attempt_uuid=attempt_uuid,
        attempt_number=attempt_number,
        grading_result=QuizGradingResult(**grading_result),
        max_attempts_reached=settings.max_attempts is not None
        and attempt_number >= settings.max_attempts,
        violations_exceeded=violations_exceeded,
    )


def _check_max_attempts(
    db_session: Session,
    user_id: int,
    activity_id: int,
    max_attempts: int | None,
) -> bool:
    """Check if user has reached maximum attempts."""

    if not max_attempts:
        return False

    statement = select(Submission.id).where(
        Submission.user_id == user_id,
        Submission.activity_id == activity_id,
        Submission.assessment_type == AssessmentType.QUIZ,
    )
    attempts = db_session.exec(statement).all()

    return len(attempts) >= max_attempts


async def _update_question_stats(
    db_session: Session,
    activity_id: int,
    questions: list[dict],
    grading_result: dict,
) -> None:
    """Update per-question statistics."""

    per_question_results = grading_result.get("per_question", [])

    question_ids = [
        r.get("question_id") for r in per_question_results if r.get("question_id")
    ]
    if not question_ids:
        return

    # Batch fetch all existing stats for this activity in one query
    existing_stats = db_session.exec(
        select(QuizQuestionStat).where(
            QuizQuestionStat.activity_id == activity_id,
            QuizQuestionStat.question_id.in_(question_ids),
        )
    ).all()
    stats_by_qid = {s.question_id: s for s in existing_stats}

    for result in per_question_results:
        question_id = result.get("question_id")
        if not question_id:
            continue

        stat = stats_by_qid.get(question_id)
        if not stat:
            stat = QuizQuestionStat(
                activity_id=activity_id,
                question_id=question_id,
                total_attempts=0,
                correct_count=0,
                avg_time_seconds=None,
                creation_date=str(datetime.now(UTC)),
                update_date=str(datetime.now(UTC)),
            )
            db_session.add(stat)
            stats_by_qid[question_id] = stat

        # Update counts
        stat.total_attempts += 1
        if result.get("correct"):
            stat.correct_count += 1

        stat.update_date = str(datetime.now(UTC))

    db_session.commit()
