"""
Code Challenges Router

API endpoints for the coding activity system with Judge0 integration.
"""

import base64
import logging
from datetime import datetime
from typing import Annotated, Literal

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request
from fastapi.responses import RedirectResponse
from pydantic import ValidationError, field_validator
from sqlmodel import Session, func, select
from ulid import ULID

from src.auth.users import get_optional_public_user, get_public_user
from src.db.assessments import Assessment
from src.db.courses.activities import (
    Activity,
    ActivityCreate,
    ActivityRead,
    ActivitySubTypeEnum,
    ActivityTypeEnum,
)
from src.db.courses.code_challenges import (
    CodeChallengeLeaderboard,
    CodeChallengeSettings,
    CodeSubmission,
    CodeSubmissionCreate,
    CodeSubmissionDetail,
    CodeSubmissionRead,
    CustomTestResponse,
    ExecutionMode,
    GradingStrategy,
    HintUsage,
    InstructorAnalytics,
    Judge0Language,
    LeaderboardEntry,
    StudentAnalytics,
    SubmissionResponse,
    SubmissionStatus,
    TestCase,
    TestCaseResult,
    TestRunResponse,
)
from src.db.courses.courses import Course
from src.db.grading.submissions import (
    AssessmentType,
    Submission,
    SubmissionRead,
)
from src.db.grading.submissions import (
    SubmissionStatus as GradingSubmissionStatus,
)
from src.db.strict_base_model import PydanticStrictBaseModel
from src.db.users import AnonymousUser, PublicUser, User
from src.infra.db.session import get_db_session
from src.security.rbac import (
    AuthenticationRequired,
    PermissionChecker,
    ResourceAccessDenied,
)
from src.services.assessments.settings import (
    CodeAssessmentSettings,
    get_settings,
    put_settings,
)
from src.services.code_challenges.grading import (
    apply_grading_strategy,
    calculate_composite_score,
    calculate_score,
)
from src.services.code_challenges.judge0_service import (
    Judge0Error,
    Judge0Service,
    Judge0UnavailableError,
)
from src.services.code_challenges.sanitize import (
    CodeValidationError,
    sanitize_code,
    sanitize_stderr,
    sanitize_stdout,
)
from src.services.grading.submission import start_submission_v2
from src.services.progress import submissions as progress_submissions

logger = logging.getLogger(__name__)
router = APIRouter()


# Initialize Judge0 service
judge0_service = Judge0Service()


def _assessment_uuid_for_activity(activity_id: int, db_session: Session) -> str | None:
    """Return the canonical assessment_uuid for an activity, or None if not found."""
    assessment = db_session.exec(
        select(Assessment).where(Assessment.activity_id == activity_id)
    ).first()
    return assessment.assessment_uuid if assessment else None


# Helper functions


async def get_activity_or_404(
    activity_uuid: str,
    db_session: Session,
) -> Activity:
    """Get activity by UUID or raise 404"""
    logger.info("Looking for activity with UUID: %s", activity_uuid)

    # Handle both cases: with and without 'activity_' prefix
    # Frontend strips the prefix, but DB stores it with prefix
    if not activity_uuid.startswith("activity_"):
        activity_uuid = f"activity_{activity_uuid}"

    statement = select(Activity).where(Activity.activity_uuid == activity_uuid)
    activity = db_session.exec(statement).first()

    if not activity:
        logger.warning("Activity not found: %s", activity_uuid)
        raise HTTPException(status_code=404, detail="Activity not found")

    logger.info(
        f"Found activity: ID={activity.id}, UUID={activity.activity_uuid}, Type={activity.activity_type}"
    )
    return activity


async def verify_code_challenge_activity(activity: Activity) -> None:
    """Verify activity is a code challenge"""
    if activity.activity_type != ActivityTypeEnum.TYPE_CODE_CHALLENGE:
        raise HTTPException(status_code=400, detail="Activity is not a code challenge")


async def check_challenge_access(
    activity: Activity,
    user: PublicUser | AnonymousUser,
    db_session: Session,
    require_instructor: bool = False,
) -> Course:
    """Check user access to the challenge"""
    course = db_session.get(Course, activity.course_id)
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")

    if course.public and not require_instructor:
        return course

    if isinstance(user, AnonymousUser):
        raise AuthenticationRequired

    checker = PermissionChecker(db_session)
    perm = "course:update" if require_instructor else "course:read"
    checker.require(user.id, perm)

    return course


def get_challenge_settings(
    activity: Activity,
    db_session: Session,
) -> CodeChallengeSettings:
    """Parse challenge settings from canonical Activity.settings."""
    try:
        canonical = get_settings(activity.id, db_session)
        if canonical.kind != "CODE_CHALLENGE":
            return CodeChallengeSettings()
        return CodeChallengeSettings.model_validate(
            canonical.model_dump(mode="json", exclude={"kind"})
        )
    except ValidationError, ValueError:
        return CodeChallengeSettings()


def get_canonical_submission_statuses(
    submission_uuids: list[str],
    db_session: Session,
) -> dict[str, str]:
    """Return user-facing Submission.status values for legacy code rows."""
    if not submission_uuids:
        return {}
    rows = db_session.exec(
        select(Submission).where(Submission.submission_uuid.in_(submission_uuids))
    ).all()
    return {row.submission_uuid: str(row.status) for row in rows}


def code_submission_read(
    submission: CodeSubmission,
    canonical_status: str | None,
) -> CodeSubmissionRead:
    return CodeSubmissionRead.model_validate(submission).model_copy(
        update={
            "uuid": submission.submission_uuid,
            "submission_status": canonical_status,
            "max_score": 100.0,
        }
    )


def code_submission_detail(
    submission: CodeSubmission,
    canonical_status: str | None,
) -> CodeSubmissionDetail:
    return CodeSubmissionDetail.model_validate(submission).model_copy(
        update={
            "uuid": submission.submission_uuid,
            "submission_status": canonical_status,
            "max_score": 100.0,
        }
    )


# Endpoints


@router.get("/languages", response_model=list[Judge0Language])
async def get_available_languages():
    """Get list of available programming languages from Judge0"""
    try:
        return await judge0_service.get_languages()
    except Judge0Error as e:
        raise HTTPException(status_code=503, detail=str(e))


@router.get("/health")
async def check_judge0_health():
    """Check if Judge0 service is available"""
    is_healthy = await judge0_service.health_check()
    return {"healthy": is_healthy}


@router.get("/{activity_uuid}", response_model=ActivityRead)
async def get_code_challenge(
    activity_uuid: str,
    current_user: Annotated[
        PublicUser | AnonymousUser, Depends(get_optional_public_user)
    ],
    db_session: Annotated[Session, Depends(get_db_session)],
):
    """Get code challenge activity details"""
    activity = await get_activity_or_404(activity_uuid, db_session)
    await verify_code_challenge_activity(activity)
    await check_challenge_access(activity, current_user, db_session)

    return ActivityRead.model_validate(activity)


@router.get("/{activity_uuid}/settings")
async def get_challenge_settings_endpoint(
    activity_uuid: str,
    current_user: Annotated[
        PublicUser | AnonymousUser, Depends(get_optional_public_user)
    ],
    db_session: Annotated[Session, Depends(get_db_session)],
):
    """Get code challenge settings (visible tests only for students)"""
    activity = await get_activity_or_404(activity_uuid, db_session)
    await verify_code_challenge_activity(activity)
    course = await check_challenge_access(activity, current_user, db_session)

    settings = get_challenge_settings(activity, db_session)

    # Check if user is instructor
    from src.services.courses.activities.exams import is_course_contributor_or_admin

    is_instructor = False
    if not isinstance(current_user, AnonymousUser):
        is_instructor = await is_course_contributor_or_admin(
            current_user.id, course, db_session
        )

    # For students, hide hidden tests and reference solution
    if not is_instructor:
        settings.hidden_tests = []
        settings.reference_solution = None

    # Convert to dict and add frontend-expected field names
    result = settings.model_dump()
    result["time_limit_ms"] = settings.time_limit * 1000  # seconds -> ms
    result["memory_limit_kb"] = settings.memory_limit * 1024  # MB -> KB

    return result


class SettingsUpdateRequest(PydanticStrictBaseModel):
    """Request model for updating challenge settings"""

    difficulty: str | None = None
    allowed_languages: list[int] | None = None
    time_limit: int | None = None  # seconds
    memory_limit: int | None = None  # MB
    grading_strategy: GradingStrategy | None = None
    execution_mode: ExecutionMode | None = None
    allow_custom_input: bool | None = None
    points: int | None = None
    due_date: str | None = None
    starter_code: dict[str, str] | None = None
    visible_tests: list[dict] | None = None
    hidden_tests: list[dict] | None = None
    hints: list[dict] | None = None
    lifecycle_status: str | None = None
    scheduled_at: str | None = None
    published_at: str | None = None
    archived_at: str | None = None

    @field_validator("grading_strategy", mode="before")
    @classmethod
    def validate_grading_strategy(cls, v):
        if v is None:
            return v
        if isinstance(v, str):
            return GradingStrategy(v)
        return v

    @field_validator("execution_mode", mode="before")
    @classmethod
    def validate_execution_mode(cls, v):
        if v is None:
            return v
        if isinstance(v, str):
            return ExecutionMode(v)
        return v


@router.put("/{activity_uuid}/settings")
async def update_challenge_settings(
    activity_uuid: str,
    settings_update: SettingsUpdateRequest,
    current_user: Annotated[PublicUser, Depends(get_public_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
):
    """Update code challenge settings (instructor only)"""
    activity = await get_activity_or_404(activity_uuid, db_session)
    await verify_code_challenge_activity(activity)
    await check_challenge_access(
        activity, current_user, db_session, require_instructor=True
    )

    # Get current settings
    current_settings = get_challenge_settings(activity, db_session)
    current_dict = current_settings.model_dump()

    # Update with new values (only non-None fields)
    update_dict = settings_update.model_dump(exclude_none=True)

    # Process test cases - convert dicts to TestCase objects
    if update_dict.get("visible_tests"):
        visible_tests = []
        for tc in update_dict["visible_tests"]:
            if not tc.get("id"):
                tc["id"] = f"test_{ULID()}"
            tc["is_visible"] = True
            visible_tests.append(tc)
        update_dict["visible_tests"] = visible_tests

    if update_dict.get("hidden_tests"):
        hidden_tests = []
        for tc in update_dict["hidden_tests"]:
            if not tc.get("id"):
                tc["id"] = f"test_{ULID()}"
            tc["is_visible"] = False
            hidden_tests.append(tc)
        update_dict["hidden_tests"] = hidden_tests

    # Merge settings
    for key, value in update_dict.items():
        current_dict[key] = value

    # Validate the merged settings
    try:
        updated_settings = CodeChallengeSettings.model_validate(current_dict)
    except (ValidationError, ValueError) as e:
        raise HTTPException(status_code=400, detail=f"Invalid settings: {e!s}")

    put_settings(
        activity.id,
        CodeAssessmentSettings.model_validate({
            "kind": "CODE_CHALLENGE",
            **updated_settings.model_dump(mode="json"),
        }),
        db_session,
    )
    db_session.refresh(activity)

    logger.info("Updated challenge settings for activity %s", activity_uuid)

    return {"message": "Settings updated successfully", "settings": activity.details}


@router.post("/{activity_uuid}/start", response_model=SubmissionRead)
async def start_code_challenge(
    activity_uuid: str,
    current_user: Annotated[PublicUser, Depends(get_public_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
):
    """Create or return the canonical DRAFT submission for this challenge."""
    activity = await get_activity_or_404(activity_uuid, db_session)
    await verify_code_challenge_activity(activity)
    await check_challenge_access(activity, current_user, db_session)

    return start_submission_v2(
        activity_id=activity.id,
        assessment_type=AssessmentType.CODE_CHALLENGE,
        current_user=current_user,
        db_session=db_session,
    )


@router.post("/{activity_uuid}/submit", response_model=SubmissionResponse)
async def submit_code_challenge(
    activity_uuid: str,
    submission: CodeSubmissionCreate,
    background_tasks: BackgroundTasks,
    request: Request,
    current_user: Annotated[PublicUser, Depends(get_public_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
):
    """Submit a solution to the code challenge.

    **Deprecated** — use ``POST /api/v1/assessments/{assessment_uuid}/submit`` instead.
    Redirects (308) to the canonical URL when the activity is backed by a unified
    Assessment; falls back to the legacy Judge0 pipeline otherwise.
    """
    activity = await get_activity_or_404(activity_uuid, db_session)
    await verify_code_challenge_activity(activity)
    assessment_uuid = _assessment_uuid_for_activity(activity.id, db_session)
    if assessment_uuid:
        canonical = str(request.url).replace(
            f"/code-challenges/{activity_uuid}/submit",
            f"/assessments/{assessment_uuid}/submit",
        )
        return RedirectResponse(url=canonical, status_code=308)
    await check_challenge_access(activity, current_user, db_session)

    settings = get_challenge_settings(activity, db_session)

    # Validate language is allowed
    if (
        settings.allowed_languages
        and submission.language_id not in settings.allowed_languages
    ):
        raise HTTPException(
            status_code=400, detail="Language not allowed for this challenge"
        )

    # Validate and decode source code
    try:
        source_code = base64.b64decode(submission.source_code).decode("utf-8")
        source_code = sanitize_code(source_code)
    except CodeValidationError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except ValueError, UnicodeDecodeError:
        raise HTTPException(status_code=400, detail="Invalid source code encoding")

    # Get language name
    try:
        languages = await judge0_service.get_languages()
        language_name = next(
            (lang.name for lang in languages if lang.id == submission.language_id),
            f"Language {submission.language_id}",
        )
    except Judge0Error, Judge0UnavailableError:
        language_name = f"Language {submission.language_id}"

    # Canonical state is created at start. CodeSubmission is only the Judge0
    # per-run ledger referenced from Submission.metadata_json.
    now = datetime.now().isoformat()
    draft = start_submission_v2(
        activity_id=activity.id,
        assessment_type=AssessmentType.CODE_CHALLENGE,
        current_user=current_user,
        db_session=db_session,
    )
    canonical_submission = db_session.exec(
        select(Submission).where(Submission.submission_uuid == draft.submission_uuid)
    ).first()
    if canonical_submission is None:
        raise HTTPException(status_code=404, detail="Submission draft not found")
    submission_uuid = canonical_submission.submission_uuid

    # Combine all test cases
    all_tests = settings.visible_tests + settings.hidden_tests

    submitted_at = datetime.now()
    canonical_submission.status = GradingSubmissionStatus.PENDING
    canonical_submission.answers_json = {
        "language_id": submission.language_id,
        "language_name": language_name,
        "code_submission_uuid": submission_uuid,
    }
    canonical_submission.metadata_json = {
        "code_submission_uuid": submission_uuid,
        "ledger_table": "code_submission",
    }
    canonical_submission.submitted_at = submitted_at
    canonical_submission.updated_at = submitted_at

    code_submission = CodeSubmission(
        submission_uuid=submission_uuid,
        activity_id=activity.id,
        user_id=current_user.id,
        language_id=submission.language_id,
        language_name=language_name,
        source_code=submission.source_code,  # Keep base64 encoded
        status=SubmissionStatus.PENDING,
        total_tests=len(all_tests),
        created_at=now,
        updated_at=now,
    )

    db_session.add(canonical_submission)
    db_session.add(code_submission)
    db_session.flush()
    canonical_submission.metadata_json = {
        **canonical_submission.metadata_json,
        "code_submission_id": code_submission.id,
    }
    db_session.commit()
    db_session.refresh(code_submission)
    progress_submissions.sync_code_challenge_submission(code_submission, db_session)

    # Process submission in background
    background_tasks.add_task(
        process_submission,
        code_submission.id,
        source_code,
        submission.language_id,
        all_tests,
        settings,
    )

    return SubmissionResponse(
        submission_uuid=submission_uuid,
        status=SubmissionStatus.PENDING,
        message="Submission created, processing started",
    )


async def process_submission(
    submission_id: int,
    source_code: str,
    language_id: int,
    test_cases: list[TestCase],
    settings: CodeChallengeSettings,
):
    """Background task to process a submission via Judge0 and write back to the
    canonical Submission + GradingEntry tables."""
    from src.db.grading.entries import GradingEntry
    from src.db.grading.submissions import SubmissionStatus as GradingStatus
    from src.infra.db.session import open_db_session
    from ulid import ULID

    db_session = open_db_session()

    try:
        submission = db_session.get(CodeSubmission, submission_id)
        if not submission:
            logger.error("Submission %s not found", submission_id)
            return

        submission.status = SubmissionStatus.PROCESSING
        submission.updated_at = datetime.now().isoformat()
        db_session.commit()
        progress_submissions.sync_code_challenge_submission(submission, db_session)

        if not await judge0_service.health_check():
            submission.status = SubmissionStatus.PENDING_JUDGE0
            submission.updated_at = datetime.now().isoformat()
            db_session.commit()
            progress_submissions.sync_code_challenge_submission(submission, db_session)
            logger.warning(
                "Judge0 unavailable, submission %s marked as pending", submission_id
            )
            return

        stop_on_failure = settings.execution_mode == ExecutionMode.FAST_FEEDBACK

        results = await judge0_service.run_test_cases(
            source_code=source_code,
            language_id=language_id,
            test_cases=test_cases,
            time_limit=settings.time_limit,
            memory_limit=settings.memory_limit,
            stop_on_failure=stop_on_failure,
        )

        score = calculate_score(results, test_cases)
        passed_tests = sum(1 for r in results if r.passed)

        execution_times = [r.time_ms for r in results if r.time_ms]
        memory_usage = [r.memory_kb for r in results if r.memory_kb]

        submission.status = SubmissionStatus.COMPLETED
        submission.score = score
        submission.passed_tests = passed_tests
        submission.total_tests = len(test_cases)
        submission.test_results = {"results": [r.model_dump() for r in results]}
        submission.execution_time_ms = sum(execution_times) if execution_times else None
        submission.memory_kb = max(memory_usage) if memory_usage else None
        submission.updated_at = datetime.now().isoformat()
        db_session.commit()
        progress_submissions.sync_code_challenge_submission(submission, db_session)

        # Write results back to the canonical Submission and append a GradingEntry
        # so the teacher dashboard and audit trail are complete for code challenges.
        canonical = db_session.exec(
            select(Submission).where(
                Submission.submission_uuid == submission.submission_uuid
            )
        ).first()
        if canonical is not None:
            now = datetime.now(UTC)
            run_record = {
                "language_id": language_id,
                "score": score,
                "passed": passed_tests,
                "total": len(test_cases),
                "results": [r.model_dump() for r in results],
            }
            meta = canonical.metadata_json or {}
            meta["runs"] = meta.get("runs", []) + [run_record]
            canonical.metadata_json = meta
            canonical.auto_score = score
            canonical.final_score = score
            canonical.status = GradingStatus.GRADED
            canonical.graded_at = now
            canonical.updated_at = now
            grading_breakdown = {
                "items": [],
                "needs_manual_review": False,
                "auto_graded": True,
                "feedback": f"Score: {score:.1f}% ({passed_tests}/{len(test_cases)} tests passed)",
            }
            canonical.grading_json = grading_breakdown
            db_session.add(canonical)
            if canonical.id is not None:
                db_session.add(
                    GradingEntry(
                        entry_uuid=f"entry_{ULID()}",
                        submission_id=canonical.id,
                        graded_by=canonical.user_id,
                        raw_score=float(score),
                        penalty_pct=0.0,
                        final_score=float(score),
                        breakdown=grading_breakdown,
                        overall_feedback=grading_breakdown["feedback"],
                        grading_version=canonical.grading_version,
                        created_at=now,
                        published_at=now,
                    )
                )
            db_session.commit()

        if passed_tests == len(test_cases) and len(test_cases) > 0:
            award_challenge_xp(submission, db_session)

        logger.info("Submission %s completed with score %s", submission_id, score)

    except Judge0UnavailableError:
        submission = db_session.get(CodeSubmission, submission_id)
        if submission:
            submission.status = SubmissionStatus.PENDING_JUDGE0
            submission.updated_at = datetime.now().isoformat()
            db_session.commit()
            progress_submissions.sync_code_challenge_submission(submission, db_session)
        logger.warning(
            "Judge0 unavailable during processing of submission %s", submission_id
        )

    except Exception:
        logger.exception("Error processing submission %s", submission_id)
        submission = db_session.get(CodeSubmission, submission_id)
        if submission:
            submission.status = SubmissionStatus.FAILED
            submission.updated_at = datetime.now().isoformat()
            db_session.commit()
            progress_submissions.sync_code_challenge_submission(submission, db_session)

    finally:
        db_session.close()


def award_challenge_xp(submission: CodeSubmission, db_session: Session):
    """Award XP for completing a code challenge"""
    try:
        from src.db.gamification import XPSource
        from src.services.gamification import service as gamification_service

        # Check if this is the first completion
        existing_completions = db_session.exec(
            select(CodeSubmission).where(
                CodeSubmission.activity_id == submission.activity_id,
                CodeSubmission.user_id == submission.user_id,
                CodeSubmission.passed_tests == CodeSubmission.total_tests,
                CodeSubmission.id != submission.id,
            )
        ).first()

        if existing_completions:
            # Already completed before, no XP
            return

        # Award XP
        xp_amount = 50  # Base completion XP
        if submission.score >= 100:
            xp_amount = 100  # Perfect score bonus

        # Note: gamification_service.award_xp needs the actual session
        # This is a simplified version - actual implementation would use the full service
        logger.info(
            f"Awarding {xp_amount} XP to user {submission.user_id} for challenge completion"
        )

    except Exception:
        logger.exception("Error awarding XP")


@router.post("/{activity_uuid}/test", response_model=TestRunResponse)
async def run_visible_tests(
    activity_uuid: str,
    submission: CodeSubmissionCreate,
    current_user: Annotated[PublicUser, Depends(get_public_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
):
    """Run visible test cases only (pre-submission testing)"""
    activity = await get_activity_or_404(activity_uuid, db_session)
    await verify_code_challenge_activity(activity)
    await check_challenge_access(activity, current_user, db_session)

    settings = get_challenge_settings(activity, db_session)

    # Decode and validate source code
    try:
        source_code = base64.b64decode(submission.source_code).decode("utf-8")
        source_code = sanitize_code(source_code)
    except CodeValidationError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except ValueError, UnicodeDecodeError:
        raise HTTPException(status_code=400, detail="Invalid source code encoding")

    # Run only visible tests
    try:
        results = await judge0_service.run_test_cases(
            source_code=source_code,
            language_id=submission.language_id,
            test_cases=settings.visible_tests,
            time_limit=settings.time_limit,
            memory_limit=settings.memory_limit,
            stop_on_failure=False,
        )
    except Judge0UnavailableError:
        raise HTTPException(
            status_code=503, detail="Code execution service unavailable"
        )
    except Judge0Error as e:
        raise HTTPException(status_code=500, detail=str(e))

    # Sanitize outputs
    for result in results:
        result.stderr = sanitize_stderr(result.stderr)
        result.stdout = sanitize_stdout(result.stdout)

    execution_time = sum(r.time_ms or 0 for r in results)

    return TestRunResponse(
        results=results,
        passed=sum(1 for r in results if r.passed),
        total=len(results),
        execution_time_ms=execution_time if execution_time > 0 else None,
    )


class CustomTestRequest(PydanticStrictBaseModel):
    """Request model for custom test execution"""

    language_id: int
    source_code: str  # Base64 encoded
    stdin: str = ""  # Base64 encoded


@router.post("/{activity_uuid}/custom-test", response_model=CustomTestResponse)
async def run_custom_test(
    activity_uuid: str,
    request_body: CustomTestRequest,
    current_user: Annotated[PublicUser, Depends(get_public_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
):
    """Run code with custom input (no expected output comparison)"""
    activity = await get_activity_or_404(activity_uuid, db_session)
    await verify_code_challenge_activity(activity)
    await check_challenge_access(activity, current_user, db_session)

    settings = get_challenge_settings(activity, db_session)

    if not settings.allow_custom_input:
        raise ResourceAccessDenied(
            reason="Custom input is not allowed for this challenge",
        )

    # Decode inputs
    try:
        decoded_code = base64.b64decode(request_body.source_code).decode("utf-8")
        decoded_code = sanitize_code(decoded_code)
        decoded_stdin = (
            base64.b64decode(request_body.stdin).decode("utf-8")
            if request_body.stdin
            else ""
        )
    except CodeValidationError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except ValueError, UnicodeDecodeError:
        raise HTTPException(status_code=400, detail="Invalid encoding")

    try:
        result = await judge0_service.run_custom_test(
            source_code=decoded_code,
            language_id=request_body.language_id,
            stdin=decoded_stdin,
            time_limit=settings.time_limit,
            memory_limit=settings.memory_limit,
        )
    except Judge0UnavailableError:
        raise HTTPException(
            status_code=503, detail="Code execution service unavailable"
        )
    except Judge0Error as e:
        raise HTTPException(status_code=500, detail=str(e))

    # Sanitize outputs
    result.stderr = sanitize_stderr(result.stderr)
    result.stdout = sanitize_stdout(result.stdout)

    return result


@router.get("/{activity_uuid}/submissions", response_model=list[CodeSubmissionRead])
async def get_submission_history(
    activity_uuid: str,
    current_user: Annotated[PublicUser, Depends(get_public_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
    limit: Annotated[int, Query(le=100)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
):
    """Get user's submission history for a challenge"""
    activity = await get_activity_or_404(activity_uuid, db_session)
    await verify_code_challenge_activity(activity)
    await check_challenge_access(activity, current_user, db_session)

    statement = (
        select(CodeSubmission)
        .where(
            CodeSubmission.activity_id == activity.id,
            CodeSubmission.user_id == current_user.id,
        )
        .order_by(CodeSubmission.created_at.desc())
        .offset(offset)
        .limit(limit)
    )

    submissions = db_session.exec(statement).all()
    canonical_statuses = get_canonical_submission_statuses(
        [s.submission_uuid for s in submissions],
        db_session,
    )

    return [
        code_submission_read(s, canonical_statuses.get(s.submission_uuid))
        for s in submissions
    ]


@router.get("/submissions/{submission_uuid}", response_model=CodeSubmissionDetail)
async def get_submission_detail(
    submission_uuid: str,
    current_user: Annotated[PublicUser, Depends(get_public_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
):
    """Get detailed submission including source code"""
    statement = select(CodeSubmission).where(
        CodeSubmission.submission_uuid == submission_uuid
    )
    submission = db_session.exec(statement).first()

    if not submission:
        raise HTTPException(status_code=404, detail="Submission not found")

    # Check access
    activity = db_session.get(Activity, submission.activity_id)
    if not activity:
        raise HTTPException(status_code=404, detail="Activity not found")

    course = await check_challenge_access(activity, current_user, db_session)

    # Check if user owns submission or is instructor
    from src.services.courses.activities.exams import is_course_contributor_or_admin

    is_instructor = await is_course_contributor_or_admin(
        current_user.id, course, db_session
    )

    if submission.user_id != current_user.id and not is_instructor:
        raise ResourceAccessDenied(
            reason="You can only view your own submissions",
        )

    canonical_statuses = get_canonical_submission_statuses(
        [submission.submission_uuid],
        db_session,
    )
    return code_submission_detail(
        submission,
        canonical_statuses.get(submission.submission_uuid),
    )


@router.get("/{activity_uuid}/analytics/{user_id}", response_model=StudentAnalytics)
async def get_student_analytics(
    activity_uuid: str,
    user_id: int,
    current_user: Annotated[PublicUser, Depends(get_public_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
):
    """Get analytics for a student on a code challenge"""
    activity = await get_activity_or_404(activity_uuid, db_session)
    await verify_code_challenge_activity(activity)
    course = await check_challenge_access(activity, current_user, db_session)

    # Check if user is viewing own analytics or is instructor
    from src.services.courses.activities.exams import is_course_contributor_or_admin

    is_instructor = await is_course_contributor_or_admin(
        current_user.id, course, db_session
    )

    if user_id != current_user.id and not is_instructor:
        raise ResourceAccessDenied(
            reason="You can only view your own analytics",
        )

    # Get submissions
    statement = select(CodeSubmission).where(
        CodeSubmission.activity_id == activity.id,
        CodeSubmission.user_id == user_id,
    )
    submissions = db_session.exec(statement).all()

    if not submissions:
        return StudentAnalytics(
            total_submissions=0,
            best_score=0.0,
            best_submission_uuid=None,
            average_score=0.0,
            languages_used=[],
            total_time_spent_ms=0.0,
            first_ac_time_ms=None,
            hints_used=0,
            xp_earned=0,
        )

    # Calculate analytics
    best_submission = max(submissions, key=lambda s: s.score)
    scores = [s.score for s in submissions]
    languages = list({s.language_name for s in submissions})
    total_time = sum(s.execution_time_ms or 0 for s in submissions)

    # Find first AC
    first_ac = None
    for s in sorted(submissions, key=lambda x: x.created_at):
        if s.passed_tests == s.total_tests and s.total_tests > 0:
            first_ac = s.execution_time_ms
            break

    # Count hints used
    hint_count = (
        db_session.exec(
            select(func.count(HintUsage.id)).where(
                HintUsage.activity_id == activity.id,
                HintUsage.user_id == user_id,
            )
        ).first()
        or 0
    )

    return StudentAnalytics(
        total_submissions=len(submissions),
        best_score=best_submission.score,
        best_submission_uuid=best_submission.submission_uuid,
        average_score=sum(scores) / len(scores),
        languages_used=languages,
        total_time_spent_ms=total_time,
        first_ac_time_ms=first_ac,
        hints_used=hint_count,
        xp_earned=100
        if best_submission.score >= 100
        else 50
        if best_submission.passed_tests == best_submission.total_tests
        else 0,
    )


@router.get("/{activity_uuid}/analytics", response_model=InstructorAnalytics)
async def get_challenge_analytics(
    activity_uuid: str,
    current_user: Annotated[PublicUser, Depends(get_public_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
):
    """Get analytics for a code challenge (instructor only)"""
    activity = await get_activity_or_404(activity_uuid, db_session)
    await verify_code_challenge_activity(activity)
    await check_challenge_access(
        activity, current_user, db_session, require_instructor=True
    )

    # Get all submissions
    statement = select(CodeSubmission).where(
        CodeSubmission.activity_id == activity.id,
        CodeSubmission.status == SubmissionStatus.COMPLETED,
    )
    submissions = db_session.exec(statement).all()

    if not submissions:
        return InstructorAnalytics(
            total_submissions=0,
            unique_students=0,
            completion_rate=0.0,
            average_score=0.0,
            score_distribution={},
            language_distribution={},
            common_errors=[],
            failing_tests={},
        )

    # Calculate analytics
    unique_users = {s.user_id for s in submissions}
    scores = [s.score for s in submissions]

    # Score distribution
    score_dist = {"0-20": 0, "21-40": 0, "41-60": 0, "61-80": 0, "81-100": 0}
    for score in scores:
        if score <= 20:
            score_dist["0-20"] += 1
        elif score <= 40:
            score_dist["21-40"] += 1
        elif score <= 60:
            score_dist["41-60"] += 1
        elif score <= 80:
            score_dist["61-80"] += 1
        else:
            score_dist["81-100"] += 1

    # Language distribution
    lang_dist: dict[str, int] = {}
    for s in submissions:
        lang_dist[s.language_name] = lang_dist.get(s.language_name, 0) + 1

    # Completion rate (users who got 100%)
    completed_users = {
        s.user_id
        for s in submissions
        if s.passed_tests == s.total_tests and s.total_tests > 0
    }
    completion_rate = (
        (len(completed_users) / len(unique_users)) * 100 if unique_users else 0
    )

    # Common errors and failing tests (simplified)
    failing_tests: dict[str, int] = {}
    common_errors: list[dict] = []

    for s in submissions:
        results = s.test_results.get("results", [])
        for r in results:
            if not r.get("passed", False):
                test_id = r.get("test_case_id", "unknown")
                failing_tests[test_id] = failing_tests.get(test_id, 0) + 1

    return InstructorAnalytics(
        total_submissions=len(submissions),
        unique_students=len(unique_users),
        completion_rate=completion_rate,
        average_score=sum(scores) / len(scores),
        score_distribution=score_dist,
        language_distribution=lang_dist,
        common_errors=common_errors,
        failing_tests=failing_tests,
    )


@router.get("/{activity_uuid}/leaderboard", response_model=CodeChallengeLeaderboard)
async def get_leaderboard(
    activity_uuid: str,
    timeframe: Literal["all", "week", "month"] = "all",
    current_user: Annotated[
        PublicUser | AnonymousUser, Depends(get_public_user)
    ] = None,
    db_session: Annotated[Session, Depends(get_db_session)] = None,
    limit: Annotated[int, Query(le=100)] = 100,
):
    """Get leaderboard for a code challenge"""
    activity = await get_activity_or_404(activity_uuid, db_session)
    await verify_code_challenge_activity(activity)

    # Get best submission per user
    # This is a simplified query - production would use subquery for best per user
    statement = (
        select(CodeSubmission)
        .where(
            CodeSubmission.activity_id == activity.id,
            CodeSubmission.status == SubmissionStatus.COMPLETED,
        )
        .order_by(CodeSubmission.score.desc(), CodeSubmission.created_at.asc())
    )

    submissions = db_session.exec(statement).all()

    # Group by user, keeping best score
    user_best: dict[int, CodeSubmission] = {}
    for s in submissions:
        if s.user_id not in user_best or s.score > user_best[s.user_id].score:
            user_best[s.user_id] = s

    # Sort and create entries
    sorted_users = sorted(
        user_best.values(),
        key=lambda s: (s.score, -len(s.created_at)),  # Higher score, earlier time
        reverse=True,
    )[:limit]

    # Get user info
    entries = []
    for rank, s in enumerate(sorted_users, 1):
        user = db_session.get(User, s.user_id)
        if not user:
            continue

        # Count attempts for this user
        attempt_count = (
            db_session.exec(
                select(func.count(CodeSubmission.id)).where(
                    CodeSubmission.activity_id == activity.id,
                    CodeSubmission.user_id == s.user_id,
                )
            ).first()
            or 1
        )

        composite = calculate_composite_score(
            s.score,
            s.execution_time_ms,
            10000,  # Max time for normalization
            attempt_count,
        )

        entries.append(
            LeaderboardEntry(
                rank=rank,
                user_id=s.user_id,
                username=user.username or f"User {s.user_id}",
                avatar_url=user.avatar_image,
                score=s.score,
                time_to_first_ac_ms=s.execution_time_ms,
                attempts=attempt_count,
                composite_score=composite,
            )
        )

    # Find current user rank
    current_rank = None
    if current_user and not isinstance(current_user, AnonymousUser):
        for entry in entries:
            if entry.user_id == current_user.id:
                current_rank = entry.rank
                break

    return CodeChallengeLeaderboard(
        activity_uuid=activity_uuid,
        entries=entries,
        current_user_rank=current_rank,
        total_participants=len(user_best),
    )
