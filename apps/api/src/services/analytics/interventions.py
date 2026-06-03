from __future__ import annotations

from collections import defaultdict
from datetime import UTC, datetime

from sqlalchemy import select
from sqlmodel import Session, col

from src.db.analytics import LearnerRiskSnapshot, TeacherIntervention
from src.infra.db.execute import sa_execute
from src.services.analytics.queries import to_iso
from src.services.analytics.schemas import (
    InterventionSummary,
    TeacherInterventionCreate,
    TeacherInterventionListResponse,
    TeacherInterventionRow,
)
from src.services.analytics.scope import TeacherAnalyticsScope, ensure_course_in_scope


def _row_from_model(item: TeacherIntervention) -> TeacherInterventionRow:
    return TeacherInterventionRow(
        id=item.id or 0,
        teacher_user_id=item.teacher_user_id,
        user_id=item.user_id,
        course_id=item.course_id,
        intervention_type=item.intervention_type,
        status=item.status,
        outcome=item.outcome,
        notes=item.notes,
        risk_score_before=float(item.risk_score_before) if item.risk_score_before is not None else None,
        risk_score_after=float(item.risk_score_after) if item.risk_score_after is not None else None,
        created_at=item.created_at,
        updated_at=item.updated_at,
        resolved_at=item.resolved_at,
    )


def _latest_risk_score(db_session: Session, *, user_id: int, course_id: int) -> float | None:
    snapshot = (
        sa_execute(
            db_session,
            select(LearnerRiskSnapshot)
            .where(
                col(LearnerRiskSnapshot.user_id) == user_id,
                col(LearnerRiskSnapshot.course_id) == course_id,
            )
            .order_by(col(LearnerRiskSnapshot.snapshot_date).desc())
            .limit(1),
        )
        .scalars()
        .first()
    )
    return float(snapshot.risk_score) if snapshot is not None else None


def create_teacher_intervention(
    db_session: Session,
    scope: TeacherAnalyticsScope,
    payload: TeacherInterventionCreate,
) -> TeacherInterventionRow:
    ensure_course_in_scope(scope, payload.course_id)
    now = datetime.now(tz=UTC)
    current_risk = _latest_risk_score(db_session, user_id=payload.user_id, course_id=payload.course_id)
    resolved_at = now if payload.status == "resolved" else None
    intervention = TeacherIntervention(
        teacher_user_id=scope.teacher_user_id,
        user_id=payload.user_id,
        course_id=payload.course_id,
        intervention_type=payload.intervention_type,
        status=payload.status,
        outcome=payload.outcome,
        notes=payload.notes,
        risk_score_before=current_risk,
        risk_score_after=current_risk if payload.status == "resolved" else None,
        payload=payload.payload,
        created_at=now,
        updated_at=now,
        resolved_at=resolved_at,
    )
    db_session.add(intervention)
    db_session.commit()
    db_session.refresh(intervention)
    return _row_from_model(intervention)


def list_teacher_interventions(
    db_session: Session,
    scope: TeacherAnalyticsScope,
    *,
    user_id: int | None = None,
    course_id: int | None = None,
    limit: int = 100,
) -> TeacherInterventionListResponse:
    if course_id is not None:
        ensure_course_in_scope(scope, course_id)
    statement = select(TeacherIntervention).where(
        col(TeacherIntervention.teacher_user_id) == scope.teacher_user_id,
        col(TeacherIntervention.course_id).in_(scope.course_ids),
    )
    if user_id is not None:
        statement = statement.where(col(TeacherIntervention.user_id) == user_id)
    if course_id is not None:
        statement = statement.where(col(TeacherIntervention.course_id) == course_id)
    rows = list(
        sa_execute(db_session, statement.order_by(col(TeacherIntervention.created_at).desc()).limit(limit))
        .scalars()
        .all()
    )
    return TeacherInterventionListResponse(
        generated_at=to_iso(datetime.now(tz=UTC)) or "",
        total=len(rows),
        items=[_row_from_model(item) for item in rows],
    )


def intervention_rows_by_learner(
    db_session: Session, scope: TeacherAnalyticsScope
) -> dict[tuple[int, int], list[TeacherIntervention]]:
    if not scope.course_ids:
        return {}
    rows = list(
        sa_execute(
            db_session,
            select(TeacherIntervention)
            .where(
                col(TeacherIntervention.teacher_user_id) == scope.teacher_user_id,
                col(TeacherIntervention.course_id).in_(scope.course_ids),
            )
            .order_by(col(TeacherIntervention.created_at).desc()),
        )
        .scalars()
        .all()
    )
    grouped: dict[tuple[int, int], list[TeacherIntervention]] = defaultdict(list)
    for row in rows:
        grouped[row.course_id, row.user_id].append(row)
    return dict(grouped)


def summarize_interventions(db_session: Session, scope: TeacherAnalyticsScope) -> InterventionSummary:
    grouped = intervention_rows_by_learner(db_session, scope)
    rows = [row for items in grouped.values() for row in items]
    deltas = [
        float(row.risk_score_after) - float(row.risk_score_before)
        for row in rows
        if row.risk_score_after is not None and row.risk_score_before is not None
    ]
    return InterventionSummary(
        total=len(rows),
        open=sum(1 for row in rows if row.status in {"planned", "completed"}),
        resolved=sum(1 for row in rows if row.status == "resolved"),
        recovered_learners=sum(1 for row in rows if row.intervention_type == "learner_recovered"),
        avg_risk_delta_after_intervention=round(sum(deltas) / len(deltas), 1) if deltas else None,
    )
