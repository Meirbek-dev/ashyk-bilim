from __future__ import annotations

from collections import defaultdict
from datetime import UTC, date

from sqlalchemy import select
from sqlmodel import Session

from src.db.analytics import LearnerRiskSnapshot, TeacherIntervention
from src.services.analytics.filters import AnalyticsFilters
from src.services.analytics.queries import (
    AnalyticsContext,
    assignment_is_graded,
    assignment_is_reviewable,
    assignment_score,
    assessment_pass_threshold,
    build_activity_events,
    cohort_names_for_user,
    cohort_user_ids,
    display_name,
    load_analytics_context,
    now_utc,
    progress_snapshots,
    to_iso,
)
from src.services.analytics.schemas import AtRiskLearnerRow, AtRiskLearnersResponse
from src.services.analytics.scope import TeacherAnalyticsScope

_RISK_LEVEL_WEIGHT = {"low": 0, "medium": 1, "high": 2}


def _risk_trend(
    current_level: str, current_score: float, previous: LearnerRiskSnapshot | None
) -> tuple[str, float | None, float | None]:
    if previous is None:
        return ("newly_at_risk" if current_level in {"medium", "high"} else "stable", None, None)
    previous_score = float(previous.risk_score)
    delta = round(current_score - previous_score, 1)
    previous_weight = _RISK_LEVEL_WEIGHT.get(previous.risk_level, 0)
    current_weight = _RISK_LEVEL_WEIGHT.get(current_level, 0)
    if current_weight == 0 and previous_weight > 0:
        trend = "recovered"
    elif current_weight > previous_weight or delta >= 10:
        trend = "worsening"
    elif current_weight < previous_weight or delta <= -10:
        trend = "improving"
    else:
        trend = "stable"
    return trend, previous_score, delta


def _top_factor(components: dict[str, float]) -> str | None:
    positive = {key: value for key, value in components.items() if value > 0}
    if not positive:
        return None
    return max(positive.items(), key=lambda item: item[1])[0]


def _confidence_level(
    *,
    risk_score: float,
    reason_codes: list[str],
    days_since_last_activity: int | None,
) -> str:
    if risk_score >= 70 and len(reason_codes) >= 2:
        return "high"
    if days_since_last_activity is None and len(reason_codes) <= 1:
        return "low"
    return "medium"


def _why_now(reason_codes: list[str], top_factor: str | None) -> str:
    if "grading_block" in reason_codes:
        return "Open teacher grading is currently blocking progress."
    if "inactive_7d" in reason_codes:
        return "Recent inactivity crossed the seven-day intervention threshold."
    if "repeated_failures" in reason_codes:
        return "Recent assessment outcomes show repeated failures."
    if "missing_required_assessments" in reason_codes:
        return "Required assessments are now missing for this learner."
    if top_factor == "progress":
        return "Progress is materially behind the course baseline."
    return "Multiple risk signals are active in the current analytics window."


def _previous_snapshots(
    db_session: Session,
    pairs: set[tuple[int, int]],
    before_date: date,
) -> dict[tuple[int, int], LearnerRiskSnapshot]:
    if not pairs:
        return {}
    course_ids = sorted({course_id for course_id, _user_id in pairs})
    user_ids = sorted({user_id for _course_id, user_id in pairs})
    rows = list(
        db_session.exec(
            select(LearnerRiskSnapshot)
            .where(
                LearnerRiskSnapshot.snapshot_date < before_date,
                LearnerRiskSnapshot.course_id.in_(course_ids),
                LearnerRiskSnapshot.user_id.in_(user_ids),
            )
            .order_by(LearnerRiskSnapshot.snapshot_date.desc())
        ).all()
    )
    latest: dict[tuple[int, int], LearnerRiskSnapshot] = {}
    for row in rows:
        key = (row.course_id, row.user_id)
        if key in pairs and key not in latest:
            latest[key] = row
    return latest


def _interventions_by_pair(
    db_session: Session, scope: TeacherAnalyticsScope
) -> dict[tuple[int, int], list[TeacherIntervention]]:
    if not scope.course_ids:
        return {}
    rows = list(
        db_session.exec(
            select(TeacherIntervention)
            .where(
                TeacherIntervention.teacher_user_id == scope.teacher_user_id,
                TeacherIntervention.course_id.in_(scope.course_ids),
            )
            .order_by(TeacherIntervention.created_at.desc())
        ).all()
    )
    grouped: dict[tuple[int, int], list[TeacherIntervention]] = defaultdict(list)
    for row in rows:
        grouped[(row.course_id, row.user_id)].append(row)
    return dict(grouped)


def enrich_risk_rows(
    db_session: Session,
    scope: TeacherAnalyticsScope,
    rows: list[AtRiskLearnerRow],
    *,
    generated_date: date,
) -> list[AtRiskLearnerRow]:
    pairs = {(row.course_id, row.user_id) for row in rows}
    previous_by_pair = _previous_snapshots(db_session, pairs, generated_date)
    interventions = _interventions_by_pair(db_session, scope)
    enriched: list[AtRiskLearnerRow] = []
    for row in rows:
        key = (row.course_id, row.user_id)
        trend, previous_score, delta = _risk_trend(
            row.risk_level, row.risk_score, previous_by_pair.get(key)
        )
        learner_interventions = interventions.get(key, [])
        latest_intervention = learner_interventions[0] if learner_interventions else None
        enriched.append(
            row.model_copy(
                update={
                    "risk_trend": trend,
                    "previous_risk_score": previous_score,
                    "risk_score_delta": delta,
                    "intervention_count": len(learner_interventions),
                    "last_intervention_type": latest_intervention.intervention_type
                    if latest_intervention is not None
                    else None,
                    "last_intervention_at": to_iso(latest_intervention.created_at)
                    if latest_intervention is not None
                    else None,
                    "last_intervention_outcome": latest_intervention.outcome
                    if latest_intervention is not None
                    else None,
                }
            )
        )
    return enriched


def build_risk_rows(
    context: AnalyticsContext, filters: AnalyticsFilters
) -> list[AtRiskLearnerRow]:
    allowed_user_ids = cohort_user_ids(context, filters.cohort_ids)
    snapshots = progress_snapshots(context, allowed_user_ids)
    activity_events = build_activity_events(context, allowed_user_ids)
    last_activity_by_pair = {
        (event.course_id, event.user_id): event.ts for event in activity_events
    }
    for event in activity_events:
        key = (event.course_id, event.user_id)
        current = last_activity_by_pair.get(key)
        if current is None or event.ts > current:
            last_activity_by_pair[key] = event.ts

    failed_assessments: dict[tuple[int, int], int] = defaultdict(int)
    missing_assessments: dict[tuple[int, int], int] = defaultdict(int)
    open_grading_blocks: dict[tuple[int, int], int] = defaultdict(int)

    course_assignment_ids: dict[int, set[int]] = defaultdict(set)
    for assignment in context.assignments:
        if assignment.id is not None:
            course_assignment_ids[assignment.course_id].add(assignment.id)

    course_exam_ids: dict[int, set[int]] = defaultdict(set)
    exam_thresholds: dict[int, float] = {}
    for exam in context.exams:
        if exam.id is not None:
            course_exam_ids[exam.course_id].add(exam.id)
            exam_thresholds[exam.id] = assessment_pass_threshold(exam.settings)

    course_code_ids: dict[int, set[int]] = defaultdict(set)
    for activity in context.activities_by_id.values():
        if activity.course_id is None:
            continue
        if activity.activity_type.value == "TYPE_CODE_CHALLENGE":
            course_code_ids[activity.course_id].add(activity.id)

    assignment_seen: dict[tuple[int, int], set[int]] = defaultdict(set)
    for submission, assignment in context.assignment_submissions:
        if allowed_user_ids is not None and submission.user_id not in allowed_user_ids:
            continue
        key = (assignment.course_id, submission.user_id)
        assignment_seen[key].add(assignment.id)
        if assignment_is_reviewable(submission):
            open_grading_blocks[key] += 1
        score = assignment_score(submission)
        if assignment_is_graded(submission) and score is not None and score < 60:
            failed_assessments[key] += 1

    exam_seen: dict[tuple[int, int], set[int]] = defaultdict(set)
    for attempt, exam in context.exam_attempts:
        if allowed_user_ids is not None and attempt.user_id not in allowed_user_ids:
            continue
        if attempt.is_preview:
            continue
        key = (exam.course_id, attempt.user_id)
        exam_seen[key].add(exam.id)
        if attempt.score is None or attempt.max_score in (None, 0):
            continue
        percentage = (float(attempt.score) / float(attempt.max_score)) * 100
        if percentage < exam_thresholds.get(exam.id or 0, 60):
            failed_assessments[key] += 1

    code_success_by_pair: dict[tuple[int, int], set[int]] = defaultdict(set)
    for submission, activity in context.code_submissions:
        if allowed_user_ids is not None and submission.user_id not in allowed_user_ids:
            continue
        if activity.course_id is None:
            continue
        key = (activity.course_id, submission.user_id)
        if submission.score >= 60:
            code_success_by_pair[key].add(activity.id)
        elif submission.status.value == "COMPLETED":
            failed_assessments[key] += 1

    rows: list[AtRiskLearnerRow] = []
    now = now_utc().astimezone(UTC)
    for (course_id, user_id), snapshot in snapshots.items():
        course = context.courses_by_id.get(course_id)
        user = context.users_by_id.get(user_id)
        if course is None:
            continue

        pair = (course_id, user_id)
        last_activity = last_activity_by_pair.get(pair)
        days_since_last_activity = None
        if last_activity is not None:
            days_since_last_activity = max(
                0, (now - last_activity.astimezone(UTC)).days
            )

        missing = 0
        missing += len(
            course_assignment_ids.get(course_id, set())
            - assignment_seen.get(pair, set())
        )
        missing += len(
            course_exam_ids.get(course_id, set()) - exam_seen.get(pair, set())
        )
        missing += len(
            course_code_ids.get(course_id, set())
            - code_success_by_pair.get(pair, set())
        )
        missing_assessments[pair] = missing

        inactivity_component = min(40, (days_since_last_activity or 0) * 2)
        progress_component = max(0, round((100 - snapshot.progress_pct) * 0.3, 1))
        failure_component = min(24, failed_assessments[pair] * 8)
        missing_component = min(24, missing * 6)
        grading_component = min(12, open_grading_blocks[pair] * 4)
        risk_score = round(
            inactivity_component
            + progress_component
            + failure_component
            + missing_component
            + grading_component,
            1,
        )

        if risk_score >= 70:
            risk_level = "high"
        elif risk_score >= 40:
            risk_level = "medium"
        else:
            risk_level = "low"

        reason_codes: list[str] = []
        if (days_since_last_activity or 0) >= 7:
            reason_codes.append("inactive_7d")
        if snapshot.progress_pct < 50:
            reason_codes.append("low_progress")
        if failed_assessments[pair] > 0:
            reason_codes.append("repeated_failures")
        if missing > 0:
            reason_codes.append("missing_required_assessments")
        if open_grading_blocks[pair] > 0:
            reason_codes.append("grading_block")

        if not reason_codes:
            continue

        recommended_action = "Отправьте персональное сообщение учащемуся и проверьте следующее заблокированное задание."
        if "grading_block" in reason_codes:
            recommended_action = "Сначала проверьте отправки этого учащегося, чтобы разблокировать его прогресс."
        elif "inactive_7d" in reason_codes:
            recommended_action = "Свяжитесь с учащимся на этой неделе и согласуйте план возвращения в обучение."
        elif "repeated_failures" in reason_codes:
            recommended_action = "Предложите точечную помощь по самому слабому для учащегося направлению оценивания."
        elif "missing_required_assessments" in reason_codes:
            recommended_action = (
                "Напомните учащемуся о пропущенных обязательных работах и сроках сдачи."
            )
        elif "low_progress" in reason_codes:
            recommended_action = "Назначьте встречу, чтобы обсудить темп прохождения и вовлеченность по главам."

        risk_components = {
            "inactivity": float(inactivity_component),
            "progress": float(progress_component),
            "failures": float(failure_component),
            "missing": float(missing_component),
            "grading": float(grading_component),
        }
        top_factor = _top_factor(risk_components)
        confidence_level = _confidence_level(
            risk_score=risk_score,
            reason_codes=reason_codes,
            days_since_last_activity=days_since_last_activity,
        )

        rows.append(
            AtRiskLearnerRow(
                user_id=user_id,
                course_id=course_id,
                course_uuid=getattr(course, "course_uuid", None),
                course_name=course.name,
                user_display_name=display_name(user),
                cohort_name=", ".join(
                    cohort_names_for_user(context, user_id, filters.cohort_ids)
                )
                or None,
                progress_pct=round(snapshot.progress_pct, 1),
                days_since_last_activity=days_since_last_activity,
                open_grading_blocks=open_grading_blocks[pair],
                failed_assessments=failed_assessments[pair],
                missing_required_assessments=missing,
                risk_score=risk_score,
                risk_level=risk_level,
                risk_components=risk_components,
                reason_codes=reason_codes,
                top_contributing_factor=top_factor,
                confidence_level=confidence_level,
                why_now=_why_now(reason_codes, top_factor),
                recommended_action=recommended_action,
            )
        )

    rows.sort(key=lambda row: (-row.risk_score, row.course_name, row.user_display_name))
    return rows


def get_at_risk_learners(
    db_session: Session,
    scope: TeacherAnalyticsScope,
    filters: AnalyticsFilters,
) -> AtRiskLearnersResponse:
    context = load_analytics_context(db_session, scope.course_ids)
    rows = enrich_risk_rows(
        db_session,
        scope,
        build_risk_rows(context, filters),
        generated_date=context.generated_at.date(),
    )
    paged_rows = rows[filters.offset : filters.offset + filters.page_size]
    return AtRiskLearnersResponse(
        generated_at=to_iso(context.generated_at) or "",
        total=len(rows),
        page=filters.page,
        page_size=filters.page_size,
        items=paged_rows,
        course_options=[
            {"label": context.courses_by_id[course_id].name, "value": str(course_id)}
            for course_id in sorted(context.courses_by_id)
            if course_id in scope.course_ids
        ],
        cohort_options=[
            {"label": name, "value": str(group_id)}
            for group_id, name in sorted(
                context.usergroup_names_by_id.items(), key=lambda item: item[1].lower()
            )
        ],
    )
