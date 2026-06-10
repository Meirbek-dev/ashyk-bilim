# pyright: reportMissingImports=false, reportUnusedImport=false
import pathlib
import sys
from collections.abc import Callable, Iterator
from datetime import UTC, datetime

import pytest
from sqlmodel import Session, SQLModel

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2]))
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from src.db.courses.activities import Activity
from src.db.courses.courses import Course, ThumbnailType
from src.db.trail_runs import TrailRun
from src.db.trail_steps import TrailStep
from src.db.trails import Trail
from src.db.users import User
from src.infra.db.engine import build_engine, build_session_factory
from src.infra.settings import get_settings
from src.services.trail.trail import _hydrate_trail

_ALL_TABLES = [
    User.__table__,
    Course.__table__,
    Activity.__table__,
    Trail.__table__,
    TrailRun.__table__,
    TrailStep.__table__,
]


@pytest.fixture(name="db_session_factory")
def db_session_factory_fixture() -> Iterator[Callable[[], Session]]:
    engine = build_engine(get_settings())
    SQLModel.metadata.create_all(engine, tables=_ALL_TABLES)
    factory = build_session_factory(engine)
    try:
        yield factory
    finally:
        SQLModel.metadata.drop_all(engine, tables=list(reversed(_ALL_TABLES)))
        engine.dispose()


def test_hydrate_trail_with_datetime_fields(db_session_factory: Callable[[], Session]) -> None:
    with db_session_factory() as session:
        user = User(
            id=1,
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
            creation_date=datetime.now(UTC),
            update_date=datetime.now(UTC),
        )
        session.add(course)
        session.flush()

        trail = Trail(
            id=1,
            user_id=user.id,
            trail_uuid="trail_test_123",
            creation_date=datetime.now(UTC),
            update_date=datetime.now(UTC),
        )
        session.add(trail)
        session.flush()

        trailrun = TrailRun(
            id=1,
            trail_id=trail.id,
            course_id=course.id,
            user_id=user.id,
            creation_date=datetime.now(UTC),
            update_date=datetime.now(UTC),
        )
        session.add(trailrun)
        session.flush()

        trailstep = TrailStep(
            id=1,
            trailrun_id=trailrun.id,
            activity_id=1,
            course_id=course.id,
            trail_id=trail.id,
            complete=True,
            teacher_verified=False,
            grade=0,
            user_id=user.id,
            creation_date=datetime.now(UTC),
            update_date=datetime.now(UTC),
        )
        session.add(trailstep)
        session.commit()

        # Call the private service method which hydrates the trail read.
        # This will trigger the validation if course model_dump contains datetime objects.
        result = _hydrate_trail(trail, user.id, session)
        assert result is not None
        assert result.runs[0].course is not None
        assert result.runs[0].course["name"] == "Test Course"
        # creation_date and update_date inside the course dict should be serialized as strings
        assert isinstance(result.runs[0].course["creation_date"], str)
