from collections.abc import Iterator

import pytest
from fastapi import HTTPException, Request
from sqlmodel import Session, SQLModel, select

from src.db.courses.courses import Course
from src.db.usergroup_resources import UserGroupResource
from src.db.usergroups import UserGroup
from src.db.users import PublicUser, User
from src.infra.db.engine import build_engine, build_session_factory
from src.infra.settings import get_settings
from src.services.users.usergroups import add_resources_to_usergroup

USER_ID = 1
USERGROUP_ID = 10
COURSE_UUIDS = ("course_alpha", "course_beta")

TABLES = [
    User.__table__,
    Course.__table__,
    UserGroup.__table__,
    UserGroupResource.__table__,
]


@pytest.fixture(name="db_session")
def db_session_fixture() -> Iterator[Session]:
    engine = build_engine(get_settings())
    SQLModel.metadata.create_all(engine, tables=TABLES)
    factory = build_session_factory(engine)
    session = factory()
    try:
        session.add(
            User(
                id=USER_ID,
                user_uuid="user_resource_owner",
                username="resource.owner",
                first_name="Resource",
                last_name="Owner",
                email="resource.owner@example.com",
            )
        )
        session.add(
            UserGroup(
                id=USERGROUP_ID,
                usergroup_uuid="usergroup_resources",
                name="Resource group",
                description="Resource validation tests",
                creator_id=USER_ID,
            )
        )
        for index, course_uuid in enumerate(COURSE_UUIDS, start=1):
            session.add(
                Course(
                    id=100 + index,
                    course_uuid=course_uuid,
                    name=course_uuid,
                    public=False,
                    creator_id=USER_ID,
                )
            )
        session.commit()
        yield session
    finally:
        session.close()
        SQLModel.metadata.drop_all(engine, tables=list(reversed(TABLES)))
        engine.dispose()


@pytest.fixture(name="current_user")
def current_user_fixture() -> PublicUser:
    return PublicUser(
        id=USER_ID,
        user_uuid="user_resource_owner",
        username="resource.owner",
        first_name="Resource",
        last_name="Owner",
        email="resource.owner@example.com",
    )


def _request() -> Request:
    return Request({"type": "http"})


def _granted_uuids(db_session: Session) -> list[str]:
    return [
        resource.resource_uuid
        for resource in db_session.exec(select(UserGroupResource).order_by(UserGroupResource.resource_uuid)).all()
    ]


async def test_adds_valid_course_resource(db_session: Session, current_user: PublicUser) -> None:
    await add_resources_to_usergroup(_request(), db_session, current_user, USERGROUP_ID, COURSE_UUIDS[0])

    assert _granted_uuids(db_session) == [COURSE_UUIDS[0]]


async def test_deduplicates_resource_uuids(db_session: Session, current_user: PublicUser) -> None:
    await add_resources_to_usergroup(
        _request(), db_session, current_user, USERGROUP_ID, f"{COURSE_UUIDS[0]},{COURSE_UUIDS[0]}"
    )

    assert _granted_uuids(db_session) == [COURSE_UUIDS[0]]


async def test_trims_resource_uuid_whitespace(db_session: Session, current_user: PublicUser) -> None:
    await add_resources_to_usergroup(
        _request(), db_session, current_user, USERGROUP_ID, f"  {COURSE_UUIDS[0]} , {COURSE_UUIDS[1]}  "
    )

    assert _granted_uuids(db_session) == sorted(COURSE_UUIDS)


async def test_rejects_mixed_valid_and_unknown_batch(db_session: Session, current_user: PublicUser) -> None:
    with pytest.raises(HTTPException) as exc_info:
        await add_resources_to_usergroup(
            _request(), db_session, current_user, USERGROUP_ID, f"{COURSE_UUIDS[0]},course_missing"
        )

    assert exc_info.value.status_code == 404
    assert _granted_uuids(db_session) == []


async def test_failed_batch_preserves_existing_grants(db_session: Session, current_user: PublicUser) -> None:
    db_session.add(UserGroupResource(usergroup_id=USERGROUP_ID, resource_uuid=COURSE_UUIDS[0]))
    db_session.commit()

    with pytest.raises(HTTPException):
        await add_resources_to_usergroup(
            _request(), db_session, current_user, USERGROUP_ID, f"{COURSE_UUIDS[1]},course_missing"
        )

    assert _granted_uuids(db_session) == [COURSE_UUIDS[0]]
