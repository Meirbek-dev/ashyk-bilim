# pyright: reportMissingImports=false

import pathlib
import sys
from collections.abc import Callable
from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlmodel import Session, SQLModel

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2]))
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from src.auth.users import get_public_user
from src.db.analytics import AnalyticsSavedView, LearnerRiskSnapshot, TeacherIntervention
from src.db.courses.courses import Course, ThumbnailType
from src.db.users import PublicUser, User
from src.infra.db.engine import build_engine, build_session_factory
from src.infra.db.session import get_db_session
from src.infra.settings import get_settings
from src.routers import analytics as analytics_router_module
from src.routers.analytics import router
from src.services.analytics.scope import TeacherAnalyticsScope


@pytest.fixture(name="db_session_factory")
def db_session_factory_fixture():
    engine = build_engine(get_settings())
    SQLModel.metadata.create_all(
        engine,
        tables=[
            User.__table__,
            Course.__table__,
            AnalyticsSavedView.__table__,
            TeacherIntervention.__table__,
            LearnerRiskSnapshot.__table__,
        ],
    )
    factory = build_session_factory(engine)
    try:
        yield factory
    finally:
        SQLModel.metadata.drop_all(
            engine,
            tables=[
                LearnerRiskSnapshot.__table__,
                TeacherIntervention.__table__,
                AnalyticsSavedView.__table__,
                Course.__table__,
                User.__table__,
            ],
        )
        engine.dispose()


@pytest.fixture(name="teacher_user")
def teacher_user_fixture() -> PublicUser:
    return PublicUser(
        id=1,
        user_uuid="teacher_analytics",
        username="teacher.analytics",
        first_name="Teacher",
        middle_name="",
        last_name="Analytics",
        email="teacher.analytics@example.com",
        avatar_image="",
        bio="",
        details={},
        profile={},
        theme="default",
        locale="en-US",
        auth_provider="local",
        is_active=True,
        is_superuser=False,
        is_verified=True,
    )


@pytest.fixture(name="api_client")
def api_client_fixture(db_session_factory: Callable[[], Session], teacher_user: PublicUser, monkeypatch: pytest.MonkeyPatch) -> TestClient:
    app = FastAPI()
    app.include_router(router, prefix="/analytics")

    def override_get_db_session():
        session = db_session_factory()
        try:
            yield session
        finally:
            session.close()

    app.dependency_overrides[get_db_session] = override_get_db_session
    app.dependency_overrides[get_public_user] = lambda: teacher_user

    async def fake_scope_for(*_args: Any, **_kwargs: Any) -> TeacherAnalyticsScope:
        return TeacherAnalyticsScope(
            teacher_user_id=teacher_user.id,
            course_ids=[1],
            cohort_ids=[],
            has_platform_scope=False,
        )

    monkeypatch.setattr(analytics_router_module, "_scope_for", fake_scope_for)
    return TestClient(app)


def test_teacher_saved_views_lifecycle(api_client: TestClient, db_session_factory: Callable[[], Session]) -> None:
    # 1. Initially saved-views list should be empty
    response = api_client.get("/analytics/teacher/saved-views")
    assert response.status_code == 200
    payload = response.json()
    assert payload["total"] == 0
    assert payload["items"] == []

    # 2. Create a new saved view
    view_data = {
        "name": "My Custom View",
        "view_type": "overview",
        "query": {"window": "28d", "compare": "previous_period"},
    }
    response = api_client.post("/analytics/teacher/saved-views", json=view_data)
    assert response.status_code == 200
    created_view = response.json()
    assert created_view["name"] == "My Custom View"
    assert created_view["view_type"] == "overview"
    assert created_view["query"] == {"window": "28d", "compare": "previous_period"}
    assert "created_at" in created_view
    assert "updated_at" in created_view
    view_id = created_view["id"]

    # 3. List again, should contain the new view
    response = api_client.get("/analytics/teacher/saved-views")
    assert response.status_code == 200
    payload = response.json()
    assert payload["total"] == 1
    assert len(payload["items"]) == 1
    assert payload["items"][0]["id"] == view_id
    assert payload["items"][0]["name"] == "My Custom View"

    # 4. Delete the saved view
    response = api_client.delete(f"/analytics/teacher/saved-views/{view_id}")
    assert response.status_code == 204

    # 5. List again, should be empty
    response = api_client.get("/analytics/teacher/saved-views")
    assert response.status_code == 200
    assert response.json()["total"] == 0


def test_teacher_interventions_lifecycle(api_client: TestClient, db_session_factory: Callable[[], Session]) -> None:
    # Seed a course
    with db_session_factory() as session:
        course = Course(
            id=1,
            name="Test Course",
            description="",
            about="",
            learnings=None,
            tags=None,
            thumbnail_type=ThumbnailType.IMAGE,
            thumbnail_image="",
            thumbnail_video="",
            public=False,
            open_to_contributors=False,
            creator_id=1,
            course_uuid="course_test",
        )
        session.add(course)
        session.commit()

    # 1. Initially interventions list should be empty
    response = api_client.get("/analytics/teacher/interventions")
    assert response.status_code == 200
    payload = response.json()
    assert payload["total"] == 0
    assert payload["items"] == []

    # 2. Create a new intervention
    intervention_data: dict[str, Any] = {
        "user_id": 2,
        "course_id": 1,
        "intervention_type": "message_sent",
        "status": "completed",
        "notes": "Sent a welcome message.",
        "payload": {},
    }
    response = api_client.post("/analytics/teacher/interventions", json=intervention_data)
    assert response.status_code == 200
    created_item = response.json()
    assert created_item["user_id"] == 2
    assert created_item["course_id"] == 1
    assert created_item["intervention_type"] == "message_sent"
    assert created_item["status"] == "completed"
    assert created_item["notes"] == "Sent a welcome message."
    assert "created_at" in created_item
    assert "updated_at" in created_item
    intervention_id = created_item["id"]

    # 3. List again, should contain the new intervention
    response = api_client.get("/analytics/teacher/interventions")
    assert response.status_code == 200
    payload = response.json()
    assert payload["total"] == 1
    assert len(payload["items"]) == 1
    assert payload["items"][0]["id"] == intervention_id
    assert payload["items"][0]["intervention_type"] == "message_sent"
