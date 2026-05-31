"""
Courses Router
"""

import logging
from datetime import datetime
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Form, Request, Response, UploadFile
from sqlmodel import Session

from src.auth.users import get_optional_public_user, get_public_user
from src.db.courses.course_updates import (
    CourseUpdateCreate,
    CourseUpdateRead,
    CourseUpdateUpdate,
)
from src.db.courses.courses import (
    CourseAccessUpdate,
    CourseCreate,
    CourseMetadataUpdate,
    CourseRead,
    FullCourseRead,
    ThumbnailType,
)
from src.db.courses.enhanced_responses import CourseReadWithPermissions
from src.db.resource_authors import ResourceAuthorshipEnum, ResourceAuthorshipStatusEnum
from src.db.strict_base_model import PydanticStrictBaseModel
from src.db.student_activity_runtime import (
    StudentActivityActionRequest,
    StudentActivityRuntime,
)
from src.db.users import AnonymousUser, PublicUser
from src.infra.db.session import get_db_session
from src.security.rbac import PermissionCheckerDep
from src.services.courses.contributors import (
    add_bulk_course_contributors,
    apply_course_contributor,
    get_course_contributors,
    remove_bulk_course_contributors,
    update_course_contributor,
)
from src.services.courses.courses import (
    count_courses,
    create_course,
    delete_course,
    get_course,
    get_course_meta,
    get_course_user_rights,
    get_courses,
    list_editable_courses,
    search_courses,
    update_course_access,
    update_course_metadata,
    update_course_thumbnail,
)
from src.services.courses.updates import (
    create_update,
    delete_update,
    get_updates_by_course_uuid,
    update_update,
)
from src.services.student_activity_runtime import (
    get_student_activity_runtime,
    run_student_activity_action,
)


def _get_timestamp(v: datetime | str | None) -> float:
    if not v:
        return 0.0
    if isinstance(v, datetime):
        return v.timestamp()
    try:
        value = v.strip()
        if value.endswith("Z"):
            value = f"{value[:-1]}+00:00"
        return datetime.fromisoformat(value).timestamp()
    except ValueError:
        return 0.0


router = APIRouter()
logger = logging.getLogger(__name__)


class CourseDetailResponse(PydanticStrictBaseModel):
    detail: str


class CourseUserRightsPermissions(PydanticStrictBaseModel):
    read: bool
    create: bool
    update: bool
    delete: bool
    create_content: bool
    update_content: bool
    delete_content: bool
    manage_contributors: bool
    manage_access: bool
    assessment_grade: bool
    mark_activities_done: bool
    create_certifications: bool


class CourseUserRightsOwnership(PydanticStrictBaseModel):
    is_owner: bool
    is_creator: bool
    is_maintainer: bool
    is_contributor: bool
    authorship_status: ResourceAuthorshipStatusEnum | None = None


class CourseUserRightsRoles(PydanticStrictBaseModel):
    is_admin: bool
    is_maintainer_role: bool
    is_instructor: bool
    is_user: bool


class CourseUserRightsResponse(PydanticStrictBaseModel):
    course_uuid: str
    user_id: int
    is_anonymous: bool
    permissions: CourseUserRightsPermissions
    ownership: CourseUserRightsOwnership
    roles: CourseUserRightsRoles


@router.get(
    "/{course_uuid}/activities/{activity_uuid}/runtime",
    response_model=StudentActivityRuntime,
)
async def api_get_student_activity_runtime(
    request: Request,
    course_uuid: str,
    activity_uuid: str,
    current_user: Annotated[PublicUser | AnonymousUser | None, Depends(get_optional_public_user)] = None,
    db_session: Annotated[Session | None, Depends(get_db_session)] = None,
) -> StudentActivityRuntime:
    assert db_session is not None
    assert current_user is not None
    return await get_student_activity_runtime(
        request,
        course_uuid=course_uuid,
        activity_uuid=activity_uuid,
        current_user=current_user,
        db_session=db_session,
    )


@router.post(
    "/{course_uuid}/activities/{activity_uuid}/actions",
    response_model=StudentActivityRuntime,
)
async def api_run_student_activity_action(
    request: Request,
    course_uuid: str,
    activity_uuid: str,
    action: StudentActivityActionRequest,
    current_user: Annotated[PublicUser | None, Depends(get_public_user)] = None,
    db_session: Annotated[Session | None, Depends(get_db_session)] = None,
) -> StudentActivityRuntime:
    assert db_session is not None
    assert current_user is not None
    return await run_student_activity_action(
        request,
        course_uuid=course_uuid,
        activity_uuid=activity_uuid,
        action=action,
        current_user=current_user,
        db_session=db_session,
    )


# ---------------------------------------------------------------------------
# Course CRUD Endpoints
# ---------------------------------------------------------------------------


@router.post("")
async def api_create_course(
    request: Request,
    name: Annotated[str | None, Form()] = None,
    description: Annotated[str | None, Form()] = None,
    public: Annotated[bool | None, Form()] = None,
    learnings: Annotated[str | None, Form()] = None,
    tags: Annotated[str | None, Form()] = None,
    about: Annotated[str | None, Form()] = None,
    thumbnail_type: Annotated[ThumbnailType, Form()] = ThumbnailType.IMAGE,
    thumbnail: UploadFile | None = None,
    template: Annotated[str | None, Form()] = None,
    current_user: Annotated[PublicUser | None, Depends(get_public_user)] = None,
    db_session: Annotated[Session | None, Depends(get_db_session)] = None,
) -> CourseRead:
    """
    Create new Course

    **Required Permission**: `course:create:platform`

    Pass ``template=starter`` to automatically seed two default chapters.
    """
    assert db_session is not None
    assert current_user is not None
    course = CourseCreate(
        name=name,
        description=description,
        public=public,
        learnings=learnings,
        tags=tags,
        about=about,
        thumbnail_type=thumbnail_type,
        template=template,
    )
    return await create_course(
        request,
        course,
        current_user,
        db_session,
        thumbnail,
    )


@router.put("/{course_uuid}/thumbnail")
async def api_create_course_thumbnail(
    request: Request,
    course_uuid: str,
    thumbnail_type: Annotated[ThumbnailType, Form()] = ThumbnailType.IMAGE,
    last_known_update_date: Annotated[datetime | None, Form()] = None,
    thumbnail: UploadFile | None = None,
    current_user: Annotated[PublicUser | None, Depends(get_public_user)] = None,
    db_session: Annotated[Session | None, Depends(get_db_session)] = None,
) -> CourseRead:
    """
    Update Course Thumbnail (Image or Video)
    """
    assert db_session is not None
    assert current_user is not None
    return await update_course_thumbnail(
        request,
        course_uuid,
        current_user,
        db_session,
        thumbnail,
        thumbnail_type,
        last_known_update_date=last_known_update_date,
    )


@router.get("/{course_uuid}", response_model=CourseRead)
async def api_get_course(
    request: Request,
    response: Response,
    course_uuid: str,
    db_session: Annotated[Session | None, Depends(get_db_session)] = None,
    current_user: Annotated[PublicUser | AnonymousUser | None, Depends(get_optional_public_user)] = None,
    checker: PermissionCheckerDep = None,
) -> CourseRead | Response:
    """
    Get single Course by course_uuid
    """
    assert db_session is not None
    assert current_user is not None
    assert checker is not None
    course = await get_course(
        request,
        course_uuid,
        current_user=current_user,
        db_session=db_session,
        checker=checker,
    )

    up_time = _get_timestamp(getattr(course, "update_date", None))
    etag = f'W/"{course.id}-{up_time}"'

    if request.headers.get("if-none-match") == etag:
        return Response(status_code=304)

    response.headers["ETag"] = etag
    response.headers["Cache-Control"] = "public, max-age=60, stale-while-revalidate=120"
    return course


@router.get("/{course_uuid}/meta", response_model=FullCourseRead)
async def api_get_course_meta(
    request: Request,
    response: Response,
    course_uuid: str,
    with_unpublished_activities: bool = False,
    current_user: Annotated[PublicUser | AnonymousUser | None, Depends(get_optional_public_user)] = None,
    db_session: Annotated[Session | None, Depends(get_db_session)] = None,
    checker: PermissionCheckerDep = None,
) -> FullCourseRead | Response:
    """
    Get single Course Metadata (chapters, activities) by course_uuid.

    Returns ``X-Structure-Version`` header (latest chapter update_date ISO string).
    Clients should send this back as ``If-Match`` on reorder requests to detect
    concurrent edits.
    """
    assert db_session is not None
    assert current_user is not None
    assert checker is not None
    result = await get_course_meta(
        request,
        course_uuid,
        with_unpublished_activities,
        current_user=current_user,
        db_session=db_session,
        checker=checker,
    )

    # Emit the structure version so clients can detect concurrent edits
    latest_chapter_update = None
    try:
        from sqlalchemy import func as _func
        from sqlmodel import select as _select

        from src.db.courses.chapters import Chapter as _Chapter

        latest_chapter_update = db_session.exec(
            _select(_func.max(_Chapter.update_date)).where(_Chapter.course_id == result.id)
        ).one_or_none()

        if latest_chapter_update:
            if hasattr(latest_chapter_update, "isoformat"):
                version_str = latest_chapter_update.isoformat()
            else:
                version_str = str(latest_chapter_update)
            response.headers["X-Structure-Version"] = version_str
            response.headers["Access-Control-Expose-Headers"] = "X-Structure-Version"
    except Exception:
        logger.debug("Не удалось передать версию структуры", exc_info=True)

    up_time = _get_timestamp(getattr(result, "update_date", None))
    struct_time = _get_timestamp(latest_chapter_update)
    etag = f'W/"{result.id}-{up_time}-{struct_time}"'

    if request.headers.get("if-none-match") == etag:
        return Response(status_code=304)

    response.headers["ETag"] = etag
    response.headers["Cache-Control"] = "public, max-age=60, stale-while-revalidate=120"

    return result


@router.get("/page/{page}/limit/{limit}", response_model=list[CourseReadWithPermissions])
async def api_get_platform_courses(
    request: Request,
    response: Response,
    page: int,
    limit: int,
    current_user: Annotated[PublicUser | AnonymousUser | None, Depends(get_optional_public_user)] = None,
    db_session: Annotated[Session | None, Depends(get_db_session)] = None,
) -> list[CourseReadWithPermissions] | Response:
    assert db_session is not None
    assert current_user is not None
    courses = await get_courses(request, current_user, db_session, page, limit)

    total_count = await count_courses(current_user, db_session)
    response.headers["X-Total-Count"] = str(total_count)
    response.headers["Access-Control-Expose-Headers"] = "X-Total-Count"
    response.headers["Cache-Control"] = "public, max-age=60, stale-while-revalidate=120"

    try:
        latest = None
        for c in courses:
            ud = getattr(c, "update_date", None)
            if ud and (latest is None or ud > latest):
                latest = ud
        if latest:
            response.headers["Last-Modified"] = latest.strftime("%a, %d %b %Y %H:%M:%S GMT")

            ims = request.headers.get("If-Modified-Since")
            if ims:
                try:
                    from email.utils import parsedate_to_datetime

                    ims_dt = parsedate_to_datetime(ims)
                    if ims_dt >= latest:
                        return Response(status_code=304)
                except Exception:
                    logger.debug(
                        "Не удалось разобрать заголовок If-Modified-Since",
                        exc_info=True,
                    )
    except Exception:
        logger.debug("Не удалось установить заголовок Last-Modified", exc_info=True)

    return courses


@router.get("/editable/page/{page}/limit/{limit}")
async def api_get_platform_editable_courses(
    request: Request,
    response: Response,
    page: int,
    limit: int,
    query: str | None = None,
    sort_by: str | None = "updated",
    preset: str | None = "all",
    current_user: Annotated[PublicUser | None, Depends(get_public_user)] = None,
    db_session: Annotated[Session | None, Depends(get_db_session)] = None,
) -> list[CourseReadWithPermissions]:
    assert db_session is not None
    assert current_user is not None
    courses, total_count, summary = await list_editable_courses(
        request,
        current_user,
        db_session,
        page,
        limit,
        query,
        sort_by,
        preset,
    )
    response.headers["X-Total-Count"] = str(total_count)
    response.headers["X-Summary-Total"] = str(summary["total"])
    response.headers["X-Summary-Ready"] = str(summary["ready"])
    response.headers["X-Summary-Private"] = str(summary["private"])
    response.headers["X-Summary-Attention"] = str(summary["attention"])
    response.headers["Access-Control-Expose-Headers"] = (
        "X-Total-Count, X-Summary-Total, X-Summary-Ready, X-Summary-Private, X-Summary-Attention"
    )

    return courses


@router.get("/search")
async def api_search_platform_courses(
    request: Request,
    query: str,
    page: int = 1,
    limit: int = 20,
    current_user: Annotated[PublicUser | AnonymousUser | None, Depends(get_optional_public_user)] = None,
    db_session: Annotated[Session | None, Depends(get_db_session)] = None,
) -> list[CourseRead]:
    assert db_session is not None
    assert current_user is not None
    return await search_courses(request, current_user, query, db_session, page, limit)


@router.put("/{course_uuid}/metadata")
async def api_update_course_metadata(
    request: Request,
    course_uuid: str,
    metadata_object: CourseMetadataUpdate,
    db_session: Annotated[Session | None, Depends(get_db_session)] = None,
    current_user: Annotated[PublicUser | None, Depends(get_public_user)] = None,
) -> CourseRead:
    assert db_session is not None
    assert current_user is not None
    return await update_course_metadata(request, course_uuid, metadata_object, current_user, db_session)


@router.put("/{course_uuid}/access")
async def api_update_course_access(
    request: Request,
    course_uuid: str,
    access_object: CourseAccessUpdate,
    db_session: Annotated[Session | None, Depends(get_db_session)] = None,
    current_user: Annotated[PublicUser | None, Depends(get_public_user)] = None,
) -> CourseRead:
    assert db_session is not None
    assert current_user is not None
    return await update_course_access(request, course_uuid, access_object, current_user, db_session)


@router.delete("/{course_uuid}", response_model=CourseDetailResponse)
async def api_delete_course(
    request: Request,
    course_uuid: str,
    db_session: Annotated[Session | None, Depends(get_db_session)] = None,
    current_user: Annotated[PublicUser | None, Depends(get_public_user)] = None,
) -> Any:
    """
    Delete Course by ID

    **Required Permission**: `course:delete:own` or `course:delete:platform`
    """
    assert db_session is not None
    assert current_user is not None
    return await delete_course(request, course_uuid, current_user, db_session)


@router.post("/{course_uuid}/apply-contributor")
async def api_apply_course_contributor(
    request: Request,
    course_uuid: str,
    db_session: Annotated[Session | None, Depends(get_db_session)] = None,
    current_user: Annotated[PublicUser | None, Depends(get_public_user)] = None,
) -> Any:
    """
    Apply to be a contributor for a course
    """
    assert db_session is not None
    assert current_user is not None
    return await apply_course_contributor(request, course_uuid, current_user, db_session)


@router.get("/{course_uuid}/updates")
async def api_get_course_updates(
    request: Request,
    course_uuid: str,
    db_session: Annotated[Session | None, Depends(get_db_session)] = None,
    current_user: Annotated[PublicUser | None, Depends(get_public_user)] = None,
) -> list[CourseUpdateRead]:
    """
    Get Course Updates by course_uuid
    """
    assert db_session is not None
    assert current_user is not None
    return await get_updates_by_course_uuid(request, course_uuid, current_user, db_session)


@router.post("/{course_uuid}/updates")
async def api_create_course_update(
    request: Request,
    course_uuid: str,
    update_object: CourseUpdateCreate,
    db_session: Annotated[Session | None, Depends(get_db_session)] = None,
    current_user: Annotated[PublicUser | None, Depends(get_public_user)] = None,
) -> CourseUpdateRead:
    """
    Create new Course Update
    """
    assert db_session is not None
    assert current_user is not None
    return await create_update(request, course_uuid, update_object, current_user, db_session)


@router.put("/{course_uuid}/update/{courseupdate_uuid}")
async def api_update_course_update(
    request: Request,
    course_uuid: str,
    courseupdate_uuid: str,
    update_object: CourseUpdateUpdate,
    db_session: Annotated[Session | None, Depends(get_db_session)] = None,
    current_user: Annotated[PublicUser | None, Depends(get_public_user)] = None,
) -> CourseUpdateRead:
    """
    Update Course Update by courseupdate_uuid
    """
    assert db_session is not None
    assert current_user is not None
    return await update_update(request, courseupdate_uuid, update_object, current_user, db_session)


@router.delete("/{course_uuid}/update/{courseupdate_uuid}")
async def api_delete_course_update(
    request: Request,
    course_uuid: str,
    courseupdate_uuid: str,
    db_session: Annotated[Session | None, Depends(get_db_session)] = None,
    current_user: Annotated[PublicUser | None, Depends(get_public_user)] = None,
) -> Any:
    """
    Delete Course Update by courseupdate_uuid
    """
    assert db_session is not None
    assert current_user is not None
    return await delete_update(request, courseupdate_uuid, current_user, db_session)


@router.get("/{course_uuid}/contributors")
async def api_get_course_contributors(
    request: Request,
    course_uuid: str,
    db_session: Annotated[Session | None, Depends(get_db_session)] = None,
    current_user: Annotated[PublicUser | AnonymousUser | None, Depends(get_optional_public_user)] = None,
) -> Any:
    """
    Get all contributors for a specific course
    """
    assert db_session is not None
    assert current_user is not None
    return await get_course_contributors(request, course_uuid, current_user, db_session)


@router.put("/{course_uuid}/contributors/{contributor_user_id}")
async def api_update_course_contributor(
    request: Request,
    course_uuid: str,
    contributor_user_id: int,
    authorship: ResourceAuthorshipEnum,
    authorship_status: ResourceAuthorshipStatusEnum,
    db_session: Annotated[Session | None, Depends(get_db_session)] = None,
    current_user: Annotated[PublicUser | None, Depends(get_public_user)] = None,
) -> Any:
    """
    Update a course contributor's role and status

    **Required Permission**: `course:manage:own` or `course:manage:platform`
    """
    assert db_session is not None
    assert current_user is not None
    return await update_course_contributor(
        request,
        course_uuid,
        contributor_user_id,
        authorship,
        authorship_status,
        current_user,
        db_session,
    )


@router.post("/{course_uuid}/bulk-add-contributors")
async def api_add_bulk_course_contributors(
    request: Request,
    course_uuid: str,
    usernames: list[str],
    db_session: Annotated[Session | None, Depends(get_db_session)] = None,
    current_user: Annotated[PublicUser | None, Depends(get_public_user)] = None,
) -> Any:
    """
    Add multiple contributors to a course by their usernames

    **Required Permission**: `course:manage:own` or `course:manage:platform`
    """
    assert db_session is not None
    assert current_user is not None
    return await add_bulk_course_contributors(request, course_uuid, usernames, current_user, db_session)


@router.delete("/{course_uuid}/bulk-remove-contributors")
async def api_remove_bulk_course_contributors(
    request: Request,
    course_uuid: str,
    usernames: list[str],
    db_session: Annotated[Session | None, Depends(get_db_session)] = None,
    current_user: Annotated[PublicUser | None, Depends(get_public_user)] = None,
) -> Any:
    """
    Remove multiple contributors from a course by their usernames
    """
    assert db_session is not None
    assert current_user is not None
    return await remove_bulk_course_contributors(request, course_uuid, usernames, current_user, db_session)


@router.get("/{course_uuid}/rights", response_model=CourseUserRightsResponse)
async def api_get_course_user_rights(
    request: Request,
    course_uuid: str,
    db_session: Annotated[Session | None, Depends(get_db_session)] = None,
    current_user: Annotated[PublicUser | AnonymousUser | None, Depends(get_optional_public_user)] = None,
) -> dict[str, Any]:
    """
    Get detailed user rights for a specific course.

    This endpoint returns comprehensive rights information that can be used
    by the UI to enable/disable features based on user permissions.



    **Response Structure:**
    ```json
    {
        "course_uuid": "course_123",
        "user_id": 456,
        "is_anonymous": false,
        "permissions": {
            "read": true,
            "create": false,
            "update": true,
            "delete": false,
            "create_content": true,
            "update_content": true,
            "delete_content": true,
            "manage_contributors": true,
            "manage_access": true,
            "assessment_grade": true,
            "mark_activities_done": true,
            "create_certifications": true
        },
        "ownership": {
            "is_owner": true,
            "is_creator": true,
            "is_maintainer": false,
            "is_contributor": false,
            "authorship_status": "ACTIVE"
        },
        "roles": {
            "is_admin": false,
            "is_maintainer_role": false,
            "is_instructor": true,
            "is_user": true
        }
    }
    ```

    **Permissions Explained:**
    - `read`: Can read the course content
    - `create`: Can create new courses (instructor role or higher)
    - `update`: Can update course settings (title, description, etc.)
    - `delete`: Can delete the course
    - `create_content`: Can create activities, assessments, chapters, etc.
    - `update_content`: Can update course content
    - `delete_content`: Can delete course content
    - `manage_contributors`: Can add/remove contributors
    - `manage_access`: Can change course access settings (public, open_to_contributors)
    - `assessment_grade`: Can grade student assessment work
    - `mark_activities_done`: Can mark activities as done for other users
    - `create_certifications`: Can create course certifications

    **Ownership Information:**
    - `is_owner`: Is course owner (CREATOR, MAINTAINER, or CONTRIBUTOR)
    - `is_creator`: Is course creator
    - `is_maintainer`: Is course maintainer
    - `is_contributor`: Is course contributor
    - `authorship_status`: Current authorship status (ACTIVE, PENDING, INACTIVE)

    **Role Information:**
    - `is_admin`: Has admin role (role 1)
    - `is_maintainer_role`: Has maintainer role (role 2)
    - `is_instructor`: Has instructor role (role 3)
    - `is_user`: Has basic user role (role 4)

    **Security Notes:**
    - Returns rights based on course ownership and user roles
    - Safe to expose to UI as it only returns permission information
    - Anonymous users can only read public courses
    - All permissions are calculated based on current user context
    """
    assert db_session is not None
    assert current_user is not None
    return await get_course_user_rights(request, course_uuid, current_user, db_session)
