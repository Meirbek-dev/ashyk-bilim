# pyright: reportMissingImports=false, reportUnusedImport=false
import pathlib
import sys
from collections.abc import Callable
from datetime import datetime

import pytest
from fastapi import FastAPI
from sqlmodel import Session, SQLModel
from starlette.testclient import TestClient

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2]))
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from src.auth.users import get_optional_public_user, get_public_user
from src.db.collections import Collection
from src.db.collections_courses import CollectionCourse
from src.db.courses.courses import Course, ThumbnailType
from src.db.users import PublicUser, User
from src.infra.db.engine import build_engine, build_session_factory
from src.infra.db.session import get_db_session
from src.infra.settings import get_settings
from src.routers.courses.collections import router
from src.security.rbac import PermissionChecker

USER_ID = 1

_ALL_TABLES = [
    User.__table__,
    Course.__table__,
    Collection.__table__,
    CollectionCourse.__table__,
]


@pytest.fixture(name="db_session_factory")
def db_session_factory_fixture():
    engine = build_engine(get_settings())
    SQLModel.metadata.create_all(engine, tables=_ALL_TABLES)
    factory = build_session_factory(engine)
    try:
        yield factory
    finally:
        SQLModel.metadata.drop_all(engine, tables=list(reversed(_ALL_TABLES)))
        engine.dispose()


@pytest.fixture(name="test_user")
def test_user_fixture() -> PublicUser:
    return PublicUser(
        id=USER_ID,
        user_uuid="user_test",
        username="test.user",
        first_name="Test",
        middle_name="",
        last_name="User",
        email="test.user@example.com",
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
def api_client_fixture(db_session_factory: Callable[[], Session], test_user: PublicUser, monkeypatch: pytest.MonkeyPatch) -> TestClient:
    app = FastAPI()
    app.include_router(router, prefix="/collections")

    def override_get_db_session():
        session = db_session_factory()
        try:
            yield session
        finally:
            session.close()

    app.dependency_overrides[get_db_session] = override_get_db_session
    app.dependency_overrides[get_public_user] = lambda: test_user
    app.dependency_overrides[get_optional_public_user] = lambda: test_user

    # Bypass RBAC permission checks
    monkeypatch.setattr(PermissionChecker, "require", lambda *_a, **_kw: None)
    monkeypatch.setattr(PermissionChecker, "check", lambda *_a, **_kw: True)
    return TestClient(app)


def test_collections_list_returns_full_course_objects(api_client: TestClient, db_session_factory: Callable[[], Session]) -> None:
    """GET /collections/page/1/limit/20 returns collections with list of CourseRead objects instead of integers."""
    with db_session_factory() as session:
        user = User(
            id=USER_ID,
            user_uuid="user_test",
            username="test.user",
            first_name="Test",
            last_name="User",
            email="test.user@example.com",
            hashed_password="hashed",
            is_active=True,
            is_superuser=False,
            is_verified=True,
        )
        session.add(user)
        session.flush()

        course = Course(
            id=101,
            name="Test Course",
            description="A course to test collections",
            about="About testing",
            thumbnail_type=ThumbnailType.IMAGE,
            thumbnail_image="thumb.jpg",
            thumbnail_video="",
            public=True,
            creator_id=user.id,
            course_uuid="course_test_123",
        )
        session.add(course)
        session.flush()

        collection = Collection(
            id=201,
            name="My Test Collection",
            public=True,
            description="Testing CollectionRead courses parsing",
            creator_id=user.id,
            collection_uuid="collection_test_123",
            creation_date=datetime.now(),
            update_date=datetime.now(),
        )
        session.add(collection)
        session.flush()

        cc = CollectionCourse(
            collection_id=collection.id,
            course_id=course.id,
            creation_date=datetime.now(),
            update_date=datetime.now(),
        )
        session.add(cc)
        session.commit()

    # Call endpoint
    response = api_client.get("/collections/page/1/limit/20")
    assert response.status_code == 200
    data = response.json()

    assert len(data) == 1
    assert data[0]["name"] == "My Test Collection"
    assert data[0]["collection_uuid"] == "collection_test_123"

    # Verify that courses contains full CourseRead object details and not integers
    courses_field = data[0]["courses"]
    assert len(courses_field) == 1
    assert isinstance(courses_field[0], dict)
    assert courses_field[0]["name"] == "Test Course"
    assert courses_field[0]["course_uuid"] == "course_test_123"
    assert courses_field[0]["thumbnail_image"] == "thumb.jpg"
