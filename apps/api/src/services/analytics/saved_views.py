from __future__ import annotations

from datetime import UTC, datetime

from sqlmodel import Session, col, select

from src.db.analytics import AnalyticsSavedView
from src.services.analytics.queries import to_iso
from src.services.analytics.schemas import (
    SavedAnalyticsViewCreate,
    SavedAnalyticsViewListResponse,
    SavedAnalyticsViewRow,
)
from src.services.analytics.scope import TeacherAnalyticsScope
from src.types.narrowing import as_json_object


def _row(saved_view: AnalyticsSavedView) -> SavedAnalyticsViewRow:
    return SavedAnalyticsViewRow(
        id=saved_view.id or 0,
        teacher_user_id=saved_view.teacher_user_id,
        name=saved_view.name,
        view_type=saved_view.view_type,
        query=dict(saved_view.query),
        created_at=saved_view.created_at,
        updated_at=saved_view.updated_at,
    )


def list_saved_analytics_views(db_session: Session, scope: TeacherAnalyticsScope) -> SavedAnalyticsViewListResponse:
    items = list(
        db_session.exec(
            select(AnalyticsSavedView)
            .where(AnalyticsSavedView.teacher_user_id == scope.teacher_user_id)
            .order_by(col(AnalyticsSavedView.updated_at).desc())
        ).all()
    )
    return SavedAnalyticsViewListResponse(
        generated_at=to_iso(datetime.now(tz=UTC)) or "",
        total=len(items),
        items=[_row(item) for item in items],
    )


def save_analytics_view(
    db_session: Session,
    scope: TeacherAnalyticsScope,
    payload: SavedAnalyticsViewCreate,
) -> SavedAnalyticsViewRow:
    now = datetime.now(tz=UTC)
    existing = db_session.exec(
        select(AnalyticsSavedView).where(
            AnalyticsSavedView.teacher_user_id == scope.teacher_user_id,
            AnalyticsSavedView.view_type == payload.view_type,
            AnalyticsSavedView.name == payload.name,
        )
    ).first()
    if existing is None:
        saved_view = AnalyticsSavedView(
            teacher_user_id=scope.teacher_user_id,
            name=payload.name,
            view_type=payload.view_type,
            query=as_json_object(payload.query, field="query"),
            created_at=now,
            updated_at=now,
        )
        db_session.add(saved_view)
    else:
        saved_view = existing
        saved_view.query = as_json_object(payload.query, field="query")
        saved_view.updated_at = now
        db_session.add(saved_view)
    db_session.commit()
    db_session.refresh(saved_view)
    return _row(saved_view)


def delete_analytics_view(db_session: Session, scope: TeacherAnalyticsScope, view_id: int) -> bool:
    saved_view = db_session.get(AnalyticsSavedView, view_id)
    if saved_view is None or saved_view.teacher_user_id != scope.teacher_user_id:
        return False
    db_session.delete(saved_view)
    db_session.commit()
    return True
