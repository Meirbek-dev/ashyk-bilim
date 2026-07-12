from collections.abc import Iterator

import pytest
from fastapi import Request
from sqlmodel import Session, SQLModel, select

from src.app.exceptions import ValidationAppError
from src.db.assessments import Assessment
from src.db.audit import AuditEvent
from src.db.courses.activities import Activity, ActivitySubTypeEnum, ActivityTypeEnum
from src.db.courses.certifications import Certifications
from src.db.courses.chapters import Chapter
from src.db.courses.courses import (
    Course,
    CourseAccessUpdate,
    CourseLifecycleUpdate,
    ThumbnailType,
)
from src.db.file_submissions import FileSubmissionActivity
from src.db.resource_authors import ResourceAuthor
from src.db.usergroup_resources import UserGroupResource
from src.db.usergroup_user import UserGroupUser
from src.db.usergroups import UserGroup
from src.db.users import PublicUser, User
from src.infra.db.engine import build_engine
from src.infra.settings import get_settings
from src.services.courses.courses import update_course_access, update_course_lifecycle


@pytest.fixture(name="course_session")
def course_session_fixture() -> Iterator[Session]:
    engine = build_engine(get_settings())
    tables = [
        User.__table__,
        AuditEvent.__table__,
        Course.__table__,
        Chapter.__table__,
        Activity.__table__,
        Assessment.__table__,
        FileSubmissionActivity.__table__,
        Certifications.__table__,
        ResourceAuthor.__table__,
        UserGroup.__table__,
        UserGroupResource.__table__,
        UserGroupUser.__table__,
    ]
    SQLModel.metadata.create_all(engine, tables=tables)
    with Session(engine) as session:
        yield session
    SQLModel.metadata.drop_all(engine, tables=list(reversed(tables)))
    engine.dispose()


@pytest.fixture(name="course_owner")
def course_owner_fixture(course_session: Session) -> PublicUser:
    user = User(
        id=1,
        user_uuid="user_course_owner",
        username="course.owner",
        first_name="Course",
        middle_name="",
        last_name="Owner",
        email="course.owner@example.com",
        hashed_password="hashed",
        is_active=True,
        is_superuser=False,
        is_verified=True,
    )
    course_session.add(user)
    course_session.commit()
    return PublicUser.model_validate(user)


def seed_course(course_session: Session) -> Course:
    course = Course(
        name="Trustworthy Course",
        description="A complete description.",
        about="",
        learnings=None,
        tags=None,
        thumbnail_type=ThumbnailType.IMAGE,
        thumbnail_image="",
        thumbnail_video="",
        public=False,
        open_to_contributors=False,
        creator_id=1,
        course_uuid="course_readiness_contract",
    )
    course_session.add(course)
    course_session.commit()
    course_session.refresh(course)
    return course


@pytest.mark.asyncio
async def test_generic_access_patch_cannot_bypass_course_lifecycle(
    course_session: Session, course_owner: PublicUser
) -> None:
    course = seed_course(course_session)
    request = Request({"type": "http", "method": "PUT", "path": "/", "headers": []})

    with pytest.raises(ValidationAppError) as error:
        await update_course_access(
            request,
            course.course_uuid,
            CourseAccessUpdate(public=True),
            course_owner,
            course_session,
        )

    assert error.value.code == "COURSE_LIFECYCLE_ENDPOINT_REQUIRED"
    assert course_session.exec(select(Course).where(Course.id == course.id)).one().public is False


@pytest.mark.asyncio
async def test_publish_rechecks_readiness_and_rejects_a_course_without_visible_content(
    course_session: Session, course_owner: PublicUser
) -> None:
    course = seed_course(course_session)

    with pytest.raises(ValidationAppError) as error:
        await update_course_lifecycle(
            course.course_uuid,
            CourseLifecycleUpdate(action="PUBLISH"),
            course_owner,
            course_session,
        )

    assert error.value.code == "COURSE_NOT_READY"
    issue_codes = {issue["code"] for issue in error.value.details["issues"]}
    assert "COURSE_NO_LEARNER_VISIBLE_ACTIVITIES" in issue_codes
    assert course_session.exec(select(Course).where(Course.id == course.id)).one().public is False


@pytest.mark.asyncio
async def test_publish_allows_non_blocking_thumbnail_certificate_and_contributor_warnings(
    course_session: Session, course_owner: PublicUser
) -> None:
    course = seed_course(course_session)
    chapter = Chapter(
        name="Start",
        description="",
        thumbnail_image="",
        course_id=course.id,
        chapter_uuid="chapter_readiness",
        creator_id=course_owner.id,
        order=1,
    )
    course_session.add(chapter)
    course_session.flush()
    course_session.add(
        Activity(
            name="Welcome",
            activity_type=ActivityTypeEnum.TYPE_DYNAMIC,
            activity_sub_type=ActivitySubTypeEnum.SUBTYPE_DYNAMIC_PAGE,
            content={"markdown": "Welcome"},
            details={},
            settings={"required": True},
            published=True,
            chapter_id=chapter.id,
            course_id=course.id,
            creator_id=course_owner.id,
            activity_uuid="activity_readiness",
            order=1,
        )
    )
    course_session.commit()

    result = await update_course_lifecycle(
        course.course_uuid,
        CourseLifecycleUpdate(action="PUBLISH"),
        course_owner,
        course_session,
    )

    assert result.course.public is True
    assert result.previous_public is False
    assert result.current_public is True
    assert result.audit_event_uuid.startswith("audit_")
    assert result.readiness.ready is True
    assert {issue.severity for issue in result.readiness.issues} == {"warning"}
