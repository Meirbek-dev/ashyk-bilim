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
    QuizAttempt,
    QuizAttemptRead,
    QuizGradingResult,
    QuizQuestionStat,
    QuizQuestionStatRead,
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

    # Check for idempotency
    if submission.idempotency_key:
        statement = select(QuizAttempt).where(
            QuizAttempt.idempotency_key == submission.idempotency_key
        )
        existing = db_session.exec(statement).first()

        if existing:
            progress_submissions.sync_quiz_attempt(existing, db_session)
            # Return existing result
            return QuizSubmissionResponse(
                attempt_uuid=existing.attempt_uuid,
                attempt_number=existing.attempt_number,
                grading_result=QuizGradingResult(**existing.grading_result),
                max_attempts_reached=_check_max_attempts(
                    db_session, current_user.id, activity_id, settings.max_attempts
                ),
            )

    # Check attempt limits
    statement = select(QuizAttempt).where(
        QuizAttempt.user_id == current_user.id,
        QuizAttempt.activity_id == activity_id,
    )
    previous_attempts = db_session.exec(statement).all()
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

    # Legacy adapter: write the canonical Submission before the QuizAttempt
    # compatibility row. New features should not write QuizAttempt directly.
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
        grading_json={},
        auto_score=final_score,
        final_score=None if manual_review else final_score,
        is_late=False,
        started_at=start_ts,
        submitted_at=end_ts,
        graded_at=None if manual_review else end_ts,
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )

    quiz_attempt = QuizAttempt(
        user_id=current_user.id,
        activity_id=activity_id,
        attempt_uuid=attempt_uuid,
        attempt_number=attempt_number,
        start_ts=start_ts,
        end_ts=end_ts,
        duration_seconds=duration_seconds,
        score=final_score,
        max_score=grading_result["max_score"],
        max_attempts=settings.max_attempts,
        time_limit_seconds=settings.time_limit_seconds,
        max_score_penalty_per_attempt=settings.max_score_penalty_per_attempt,
        violation_count=submission.violation_count,
        violations=submission.violations,
        answers={"answers": submission.answers},
        grading_result=grading_result,
        idempotency_key=submission.idempotency_key,
        creation_date=str(datetime.now(UTC)),
        update_date=str(datetime.now(UTC)),
    )

    db_session.add(canonical_submission)
    db_session.add(quiz_attempt)
    db_session.commit()
    db_session.refresh(quiz_attempt)
    progress_submissions.sync_quiz_attempt(quiz_attempt, db_session)

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
            logger.warning(f"Failed to award XP: {e}")

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


async def get_quiz_attempts(
    request: Request,
    activity_id: int,
    current_user: PublicUser,
    db_session: Session,
    user_id: int | None = None,
) -> list[QuizAttemptRead]:
    """
    Get quiz attempts for an activity.

    Teachers can see all attempts, students can only see their own.
    """

    # Get activity
    statement = select(Activity).where(Activity.id == activity_id)
    activity = db_session.exec(statement).first()

    if not activity:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Activity not found"
        )

    # Check permissions
    checker = PermissionChecker(db_session)
    checker.require(
        current_user.id,
        "quiz:read",
        is_assigned=True,
        resource_owner_id=activity.creator_id,
    )

    # Build query
    statement = select(QuizAttempt).where(QuizAttempt.activity_id == activity_id)

    # Check if user can view all attempts (instructor/admin) or just their own
    can_view_all = checker.check(
        current_user.id,
        "quiz:update",
        resource_owner_id=activity.creator_id,
    )

    # If not instructor/admin, only show own attempts
    if not can_view_all:
        if user_id:
            statement = statement.where(QuizAttempt.user_id == user_id)
        elif not current_user.is_anonymous:
            statement = statement.where(QuizAttempt.user_id == current_user.id)

    attempts = db_session.exec(statement).all()

    return [QuizAttemptRead.model_validate(attempt) for attempt in attempts]


async def get_quiz_stats(
    request: Request,
    activity_id: int,
    current_user: PublicUser,
    db_session: Session,
) -> list[QuizQuestionStatRead]:
    """
    Get per-question statistics for a quiz.

    Only accessible to teachers/admins.
    """

    # Get activity
    statement = select(Activity).where(Activity.id == activity_id)
    activity = db_session.exec(statement).first()

    if not activity:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Activity not found"
        )

    # Check permissions (teacher/admin only)
    checker = PermissionChecker(db_session)
    checker.require(
        current_user.id,
        "quiz:read",
        resource_owner_id=activity.creator_id,
    )

    # Get stats
    statement = select(QuizQuestionStat).where(
        QuizQuestionStat.activity_id == activity_id
    )
    stats = db_session.exec(statement).all()

    return [QuizQuestionStatRead.model_validate(stat) for stat in stats]


def _check_max_attempts(
    db_session: Session,
    user_id: int,
    activity_id: int,
    max_attempts: int | None,
) -> bool:
    """Check if user has reached maximum attempts."""

    if not max_attempts:
        return False

    statement = select(QuizAttempt).where(
        QuizAttempt.user_id == user_id,
        QuizAttempt.activity_id == activity_id,
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
