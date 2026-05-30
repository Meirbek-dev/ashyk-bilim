"""Assessment service — teacher review queue."""

from collections import defaultdict

from fastapi import HTTPException, status
from sqlalchemy import asc, desc, func, or_
from sqlmodel import Session, select

from src.db.assessments import (
    AssessmentItem,
    AssessmentPolicyPreset,
    ReviewQueueRead,
    StudentPolicyOverrideCreate,
    StudentPolicyOverrideRead,
    StudentPolicyOverrideUpdate,
    TeacherSubmissionRead,
)
from src.db.grading.overrides import StudentPolicyOverride
from src.db.grading.progress import (
    AssessmentCompletionRule,
    AssessmentGradingMode,
    GradeReleaseMode,
)
from src.db.grading.schemas import BulkPublishGradesResponse
from src.db.grading.submissions import (
    AssessmentType,
    GradingBreakdown,
    ItemAnalytics,
    ScoreDistributionBucket,
    Submission,
    SubmissionStats,
    SubmissionStatus,
    TeacherGradeInput,
)
from src.db.users import PublicUser, User
from src.services.assessments._shared import (
    _REVIEW_SORT_MAP,
    _batch_fetch_users,
    _build_override_read,
    _build_teacher_submission_read,
    _get_activity_and_course,
    _get_assessment_by_uuid_or_404,
    _get_assessment_submission_or_404,
    _get_policy_for_assessment,
    _parse_if_match_version,
    _require_grade,
    _submission_user,
)
from src.services.grading.teacher import _save_teacher_grade, bulk_publish_grades

# ── Policy override ceilings ──────────────────────────────────────────────────
# Hard limits that no override may exceed — prevents accidental misconfiguration.
_MAX_ATTEMPTS_CEILING: int = 10
_MAX_TIME_LIMIT_MINUTES: int = 480  # 8 hours
_MAX_TIME_LIMIT_SECONDS: int = _MAX_TIME_LIMIT_MINUTES * 60


def _validate_policy_override_ceilings(
    max_attempts: int | None,
    time_limit_override_seconds: int | None,
) -> None:
    """Raise HTTP 422 if override values exceed hard ceilings."""
    errors: list[dict] = []
    if max_attempts is not None and max_attempts > _MAX_ATTEMPTS_CEILING:
        errors.append({
            "field": "max_attempts_override",
            "code": "EXCEEDS_CEILING",
            "message": f"max_attempts_override не может превышать {_MAX_ATTEMPTS_CEILING}.",
            "ceiling": _MAX_ATTEMPTS_CEILING,
            "provided": max_attempts,
        })
    if time_limit_override_seconds is not None and time_limit_override_seconds > _MAX_TIME_LIMIT_SECONDS:
        errors.append({
            "field": "time_limit_override_seconds",
            "code": "EXCEEDS_CEILING",
            "message": (
                f"time_limit_override_seconds не может превышать {_MAX_TIME_LIMIT_SECONDS} "
                f"({_MAX_TIME_LIMIT_MINUTES} минут)."
            ),
            "ceiling": _MAX_TIME_LIMIT_SECONDS,
            "provided": time_limit_override_seconds,
        })
    if errors:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"code": "POLICY_OVERRIDE_CEILING_EXCEEDED", "errors": errors},
        )


async def get_assessment_submissions(
    assessment_uuid: str,
    current_user: PublicUser,
    db_session: Session,
    *,
    status_filter: str | None = None,
    late_only: bool = False,
    search: str | None = None,
    sort_by: str = "submitted_at",
    sort_dir: str = "desc",
    page: int = 1,
    page_size: int = 25,
) -> ReviewQueueRead:
    assessment = _get_assessment_by_uuid_or_404(assessment_uuid, db_session)
    activity, course = _get_activity_and_course(assessment, db_session)
    _require_grade(current_user, course, db_session)

    query = select(Submission).join(User, User.id == Submission.user_id).where(Submission.activity_id == activity.id)
    if status_filter:
        if status_filter == "NEEDS_GRADING":
            query = query.where(Submission.status == SubmissionStatus.PENDING)
        else:
            try:
                query = query.where(Submission.status == SubmissionStatus(status_filter))
            except ValueError as exc:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Недопустимый статус '{status_filter}'",
                ) from exc

    if late_only:
        query = query.where(Submission.is_late)

    if search:
        term = f"%{search}%"
        query = query.where(
            or_(
                User.first_name.ilike(term),
                User.last_name.ilike(term),
                User.username.ilike(term),
                User.email.ilike(term),
            )
        )

    total = db_session.exec(select(func.count()).select_from(query.subquery())).one()
    sort_col = _REVIEW_SORT_MAP.get(sort_by, Submission.submitted_at)
    order_fn = desc if sort_dir == "desc" else asc
    offset = max(page - 1, 0) * page_size
    rows = db_session.exec(
        query.order_by(order_fn(sort_col), desc(Submission.created_at)).offset(offset).limit(page_size)
    ).all()
    users = _batch_fetch_users({row.user_id for row in rows}, db_session)

    items = []
    for submission in rows:
        read = _build_teacher_submission_read(submission, assessment, db_session)
        user = users.get(submission.user_id)
        if user is not None:
            read.user = _submission_user(user)
        items.append(read)

    pages = max(1, -(-total // page_size)) if page_size else 1
    return ReviewQueueRead(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        pages=pages,
    )


async def get_assessment_submission_stats(
    assessment_uuid: str,
    current_user: PublicUser,
    db_session: Session,
) -> SubmissionStats:
    assessment = _get_assessment_by_uuid_or_404(assessment_uuid, db_session)
    activity, course = _get_activity_and_course(assessment, db_session)
    _require_grade(current_user, course, db_session)

    status_rows = db_session.exec(
        select(Submission.status, func.count().label("cnt"))
        .where(
            Submission.activity_id == activity.id,
            Submission.status != SubmissionStatus.DRAFT,
        )
        .group_by(Submission.status)
    ).all()

    status_counts = dict(status_rows)
    total = sum(status_counts.values())
    pending_count = status_counts.get(SubmissionStatus.PENDING, 0)
    graded_count = status_counts.get(SubmissionStatus.GRADED, 0) + status_counts.get(SubmissionStatus.PUBLISHED, 0)

    late_count = db_session.exec(
        select(func.count()).where(
            Submission.activity_id == activity.id,
            Submission.status != SubmissionStatus.DRAFT,
            Submission.is_late,
        )
    ).one()

    graded_scores = db_session.exec(
        select(Submission.final_score).where(
            Submission.activity_id == activity.id,
            Submission.status.in_([
                SubmissionStatus.GRADED,
                SubmissionStatus.PUBLISHED,
            ]),
            Submission.final_score.is_not(None),
        )
    ).all()

    avg_score = round(sum(graded_scores) / len(graded_scores), 2) if graded_scores else None
    passing = [score for score in graded_scores if score >= 50.0]
    pass_rate = round(len(passing) / len(graded_scores) * 100, 1) if graded_scores else None

    # Build 10-point score distribution buckets (0–10, 10–20, … 90–100)
    bucket_counts = [0] * 10
    for score in graded_scores:
        idx = min(int(score // 10), 9)
        bucket_counts[idx] += 1
    score_distribution = [
        ScoreDistributionBucket(range=f"{i * 10}–{i * 10 + 10}", count=bucket_counts[i]) for i in range(10)
    ]

    return SubmissionStats(
        total=total,
        graded_count=graded_count,
        needs_grading_count=pending_count,
        late_count=late_count,
        avg_score=avg_score,
        pass_rate=pass_rate,
        score_distribution=score_distribution,
    )


async def get_assessment_submission(
    assessment_uuid: str,
    submission_uuid: str,
    current_user: PublicUser,
    db_session: Session,
) -> TeacherSubmissionRead:
    assessment = _get_assessment_by_uuid_or_404(assessment_uuid, db_session)
    activity, course = _get_activity_and_course(assessment, db_session)
    _require_grade(current_user, course, db_session)

    submission = db_session.exec(
        select(Submission).where(
            Submission.submission_uuid == submission_uuid,
            Submission.activity_id == activity.id,
        )
    ).first()
    if submission is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Отправка не найдена",
        )

    result = _build_teacher_submission_read(submission, assessment, db_session)
    users = _batch_fetch_users({submission.user_id}, db_session)
    user = users.get(submission.user_id)
    if user is not None:
        result.user = _submission_user(user)
    return result


async def save_assessment_grade(
    assessment_uuid: str,
    submission_uuid: str,
    payload: TeacherGradeInput,
    current_user: PublicUser,
    db_session: Session,
    *,
    if_match: str | None = None,
) -> TeacherSubmissionRead:
    assessment = _get_assessment_by_uuid_or_404(assessment_uuid, db_session)
    activity, course = _get_activity_and_course(assessment, db_session)
    _require_grade(current_user, course, db_session)

    submission = _get_assessment_submission_or_404(
        activity_id=activity.id,
        submission_uuid=submission_uuid,
        db_session=db_session,
    )
    expected_version = _parse_if_match_version(if_match)
    saved = await _save_teacher_grade(
        submission=submission,
        grade_input=payload,
        submission_uuid=submission_uuid,
        current_user=current_user,
        db_session=db_session,
        expected_version=expected_version,
    )
    refreshed = db_session.exec(select(Submission).where(Submission.submission_uuid == saved.submission_uuid)).first()
    if refreshed is None:
        raise HTTPException(status_code=500, detail="Отправка не была сохранена")
    return _build_teacher_submission_read(refreshed, assessment, db_session)


async def publish_assessment_grades(
    assessment_uuid: str,
    current_user: PublicUser,
    db_session: Session,
) -> BulkPublishGradesResponse:
    assessment = _get_assessment_by_uuid_or_404(assessment_uuid, db_session)
    activity, course = _get_activity_and_course(assessment, db_session)
    _require_grade(current_user, course, db_session)
    return await bulk_publish_grades(activity.id, current_user, db_session)


def get_policy_preset(kind: AssessmentType) -> AssessmentPolicyPreset:
    """Return kind-appropriate default policy settings."""

    presets: dict[AssessmentType, AssessmentPolicyPreset] = {
        AssessmentType.EXAM: AssessmentPolicyPreset(
            kind=AssessmentType.EXAM,
            grade_release_mode=GradeReleaseMode.BATCH,
            grading_mode=AssessmentGradingMode.AUTO_THEN_MANUAL,
            completion_rule=AssessmentCompletionRule.PASSED,
            passing_score=60.0,
            max_attempts=1,
            time_limit_seconds=3600,
            allow_late=False,
            anti_cheat_enabled=True,
            review_visibility="SCORE_ONLY",
        ),
        AssessmentType.QUIZ: AssessmentPolicyPreset(
            kind=AssessmentType.QUIZ,
            grade_release_mode=GradeReleaseMode.IMMEDIATE,
            grading_mode=AssessmentGradingMode.AUTO,
            completion_rule=AssessmentCompletionRule.PASSED,
            passing_score=60.0,
            max_attempts=None,
            time_limit_seconds=None,
            allow_late=True,
            anti_cheat_enabled=False,
            review_visibility="FULL",
        ),
        AssessmentType.CODE_CHALLENGE: AssessmentPolicyPreset(
            kind=AssessmentType.CODE_CHALLENGE,
            grade_release_mode=GradeReleaseMode.IMMEDIATE,
            grading_mode=AssessmentGradingMode.AUTO,
            completion_rule=AssessmentCompletionRule.PASSED,
            passing_score=60.0,
            max_attempts=None,
            time_limit_seconds=None,
            allow_late=True,
            anti_cheat_enabled=False,
            review_visibility="SCORE_ONLY",
        ),
    }
    return presets[kind]


# ── Phase 2: Student policy override management ───────────────────────────────


async def list_student_policy_overrides(
    assessment_uuid: str,
    current_user: PublicUser,
    db_session: Session,
) -> list[StudentPolicyOverrideRead]:
    assessment = _get_assessment_by_uuid_or_404(assessment_uuid, db_session)
    _activity, course = _get_activity_and_course(assessment, db_session)
    _require_grade(current_user, course, db_session)
    policy = _get_policy_for_assessment(assessment, db_session)
    if policy is None:
        return []
    overrides = db_session.exec(select(StudentPolicyOverride).where(StudentPolicyOverride.policy_id == policy.id)).all()
    return [_build_override_read(o) for o in overrides]


async def create_student_policy_override(
    assessment_uuid: str,
    payload: StudentPolicyOverrideCreate,
    current_user: PublicUser,
    db_session: Session,
) -> StudentPolicyOverrideRead:
    assessment = _get_assessment_by_uuid_or_404(assessment_uuid, db_session)
    _activity, course = _get_activity_and_course(assessment, db_session)
    _require_grade(current_user, course, db_session)
    policy = _get_policy_for_assessment(assessment, db_session)
    if policy is None or policy.id is None:
        raise HTTPException(status_code=404, detail="Политика оценивания не найдена")

    _validate_policy_override_ceilings(payload.max_attempts_override, payload.time_limit_override_seconds)

    existing = db_session.exec(
        select(StudentPolicyOverride).where(
            StudentPolicyOverride.policy_id == policy.id,
            StudentPolicyOverride.user_id == payload.user_id,
        )
    ).first()
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Исключение для этого студента уже существует. Используйте PATCH для обновления.",
        )

    override = StudentPolicyOverride(
        policy_id=policy.id,
        user_id=payload.user_id,
        max_attempts_override=payload.max_attempts_override,
        due_at_override=payload.due_at_override,
        waive_late_penalty=payload.waive_late_penalty,
        note=payload.note,
        expires_at=payload.expires_at,
        granted_by=current_user.id,
    )
    db_session.add(override)
    db_session.commit()
    db_session.refresh(override)
    return _build_override_read(override)


async def update_student_policy_override(
    assessment_uuid: str,
    user_id: int,
    payload: StudentPolicyOverrideUpdate,
    current_user: PublicUser,
    db_session: Session,
) -> StudentPolicyOverrideRead:
    assessment = _get_assessment_by_uuid_or_404(assessment_uuid, db_session)
    _activity, course = _get_activity_and_course(assessment, db_session)
    _require_grade(current_user, course, db_session)
    policy = _get_policy_for_assessment(assessment, db_session)
    if policy is None or policy.id is None:
        raise HTTPException(status_code=404, detail="Политика оценивания не найдена")

    override = db_session.exec(
        select(StudentPolicyOverride).where(
            StudentPolicyOverride.policy_id == policy.id,
            StudentPolicyOverride.user_id == user_id,
        )
    ).first()
    if override is None:
        raise HTTPException(status_code=404, detail="Исключение не найдено")

    _validate_policy_override_ceilings(
        payload.max_attempts_override,
        payload.time_limit_override_seconds,
    )

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(override, field, value)
    override.granted_by = current_user.id
    db_session.add(override)
    db_session.commit()
    db_session.refresh(override)
    return _build_override_read(override)


async def delete_student_policy_override(
    assessment_uuid: str,
    user_id: int,
    current_user: PublicUser,
    db_session: Session,
) -> dict[str, str]:
    assessment = _get_assessment_by_uuid_or_404(assessment_uuid, db_session)
    _activity, course = _get_activity_and_course(assessment, db_session)
    _require_grade(current_user, course, db_session)
    policy = _get_policy_for_assessment(assessment, db_session)
    if policy is None or policy.id is None:
        raise HTTPException(status_code=404, detail="Политика оценивания не найдена")

    override = db_session.exec(
        select(StudentPolicyOverride).where(
            StudentPolicyOverride.policy_id == policy.id,
            StudentPolicyOverride.user_id == user_id,
        )
    ).first()
    if override is None:
        raise HTTPException(status_code=404, detail="Исключение не найдено")
    db_session.delete(override)
    db_session.commit()
    return {"detail": "Исключение удалено"}


async def get_item_analytics(
    assessment_uuid: str,
    current_user: PublicUser,
    db_session: Session,
) -> list[ItemAnalytics]:
    """Compute per-item answer statistics for graded/published submissions."""
    assessment = _get_assessment_by_uuid_or_404(assessment_uuid, db_session)
    activity, course = _get_activity_and_course(assessment, db_session)
    _require_grade(current_user, course, db_session)

    # Load all assessment items ordered by their position
    items = db_session.exec(
        select(AssessmentItem).where(AssessmentItem.assessment_id == assessment.id).order_by(asc(AssessmentItem.order))
    ).all()

    if not items:
        return []

    # Load graded / published submissions (those with grading_json populated)
    graded_submissions = db_session.exec(
        select(Submission).where(
            Submission.activity_id == activity.id,
            Submission.status.in_([
                SubmissionStatus.GRADED,
                SubmissionStatus.PUBLISHED,
            ]),
        )
    ).all()

    if not graded_submissions:
        return [
            ItemAnalytics(
                item_uuid=item.item_uuid,
                title=item.title,
                kind=item.kind,
                max_score=item.max_score,
                response_count=0,
                avg_score_pct=None,
                correct_pct=None,
                discrimination_index=None,
            )
            for item in items
        ]

    # Build a map: item_uuid → list[graded_item_score_pct]
    item_scores: dict[str, list[float]] = defaultdict(list)
    item_correct: dict[str, list[bool]] = defaultdict(list)
    submission_total_scores: list[float] = []

    for submission in graded_submissions:
        # grading_json is stored as plain dict in the ORM model; deserialize it
        raw = submission.grading_json  # type: ignore[attr-defined]
        grading = GradingBreakdown.model_validate(raw) if isinstance(raw, dict) else raw
        if submission.final_score is not None:
            submission_total_scores.append(submission.final_score)
        for graded_item in grading.items:
            iid: str = graded_item.item_id or ""
            score: float = graded_item.score or 0.0
            max_s: float = graded_item.max_score or 0.0
            correct: bool | None = graded_item.correct
            if iid:
                pct = (score / max_s * 100) if max_s > 0 else 0.0
                item_scores[iid].append(pct)
                if correct is not None:
                    item_correct[iid].append(correct)

    # Compute discrimination index per item
    # Split submissions into top 27% and bottom 27% by total score
    disc_by_item: dict[str, float | None] = {}
    if len(submission_total_scores) >= 6:
        cutoff = max(1, int(len(submission_total_scores) * 0.27))
        sorted_subs = sorted(graded_submissions, key=lambda s: s.final_score or 0)
        bottom_subs = {s.submission_uuid for s in sorted_subs[:cutoff]}
        top_subs = {s.submission_uuid for s in sorted_subs[-cutoff:]}

        # Rebuild per-item correct maps for top/bottom groups
        top_correct: dict[str, int] = defaultdict(int)
        bot_correct: dict[str, int] = defaultdict(int)
        for submission in graded_submissions:
            uuid = submission.submission_uuid
            raw2 = submission.grading_json  # type: ignore[attr-defined]
            grading2 = GradingBreakdown.model_validate(raw2) if isinstance(raw2, dict) else raw2
            for graded_item in grading2.items:
                iid = graded_item.item_id or ""
                correct = graded_item.correct
                if iid and correct is not None:
                    if uuid in top_subs:
                        top_correct[iid] += 1 if correct else 0
                    if uuid in bottom_subs:
                        bot_correct[iid] += 1 if correct else 0

        for item in items:
            iid = item.item_uuid
            if iid in top_correct or iid in bot_correct:
                disc = (top_correct.get(iid, 0) - bot_correct.get(iid, 0)) / cutoff
                disc_by_item[iid] = round(disc, 3)
            else:
                disc_by_item[iid] = None
    else:
        for item in items:
            disc_by_item[item.item_uuid] = None

    result: list[ItemAnalytics] = []
    for item in items:
        iid = item.item_uuid
        scores = item_scores.get(iid, [])
        corrects = item_correct.get(iid, [])
        result.append(
            ItemAnalytics(
                item_uuid=iid,
                title=item.title,
                kind=item.kind,
                max_score=item.max_score,
                response_count=len(scores),
                avg_score_pct=round(sum(scores) / len(scores), 1) if scores else None,
                correct_pct=round(sum(corrects) / len(corrects) * 100, 1) if corrects else None,
                discrimination_index=disc_by_item.get(iid),
            )
        )
    return result
