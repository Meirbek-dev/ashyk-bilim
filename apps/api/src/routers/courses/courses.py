from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Form, Request, Response, UploadFile
from sqlmodel import Session

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
from src.db.users import AnonymousUser, PublicUser
from src.infra.db.session import get_db_session
from src.security.auth import get_current_user, get_current_user_optional
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
    count_editable_courses,
    create_course,
    delete_course,
    get_course,
    get_course_meta,
    get_course_user_rights,
    get_courses,
    get_editable_courses,
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

router = APIRouter()


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
    grade_assignments: bool
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


# ---------------------------------------------------------------------------
# Course CRUD Endpoints
# ---------------------------------------------------------------------------


@router.post("")
async def api_create_course(
    request: Request,
    name: Annotated[str, Form()],
    description: Annotated[str, Form()],
    public: Annotated[bool, Form()],
    learnings: Annotated[str | None, Form()] = None,
    tags: Annotated[str | None, Form()] = None,
    about: Annotated[str | None, Form()] = None,
    thumbnail_type: Annotated[ThumbnailType, Form()] = ThumbnailType.IMAGE,
    thumbnail: UploadFile | None = None,
    template: Annotated[str | None, Form()] = None,
    current_user: Annotated[PublicUser, Depends(get_current_user)] = None,
    checker: PermissionCheckerDep = None,
    db_session=Depends(get_db_session),
) -> CourseRead:
    """
    Create new Course

    **Required Permission**: `course:create:platform`

    Pass ``template=starter`` to automatically seed two default chapters.
    """
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
    current_user: Annotated[PublicUser, Depends(get_current_user)] = None,
    db_session=Depends(get_db_session),
) -> CourseRead:
    """
    Update Course Thumbnail (Image or Video)
    """
    return await update_course_thumbnail(
        request,
        course_uuid,
        current_user,
        db_session,
        thumbnail,
        thumbnail_type,
        last_known_update_date=last_known_update_date,
    )


@router.get("/{course_uuid}")
async def api_get_course(
    request: Request,
    course_uuid: str,
    db_session: Annotated[Session, Depends(get_db_session)],
    current_user: Annotated[
        PublicUser | AnonymousUser, Depends(get_current_user_optional)
    ],
    checker: PermissionCheckerDep,
) -> CourseRead:
    """
    Get single Course by course_uuid
    """
    return await get_course(
        request,
        course_uuid,
        current_user=current_user,
        db_session=db_session,
        checker=checker,
    )


@router.get("/{course_uuid}/meta")
async def api_get_course_meta(
    request: Request,
    response: Response,
    course_uuid: str,
    with_unpublished_activities: bool = False,
    current_user: Annotated[
        PublicUser | AnonymousUser, Depends(get_current_user_optional)
    ] = None,
    db_session=Depends(get_db_session),
    checker: PermissionCheckerDep = None,
) -> FullCourseRead:
    """
    Get single Course Metadata (chapters, activities) by course_uuid.

    Returns ``X-Structure-Version`` header (latest chapter update_date ISO string).
    Clients should send this back as ``If-Match`` on reorder requests to detect
    concurrent edits.
    """
    result = await get_course_meta(
        request,
        course_uuid,
        with_unpublished_activities,
        current_user=current_user,
        db_session=db_session,
        checker=checker,
    )

    # Emit the structure version so clients can detect concurrent edits
    try:
        from sqlalchemy import func as _func
        from sqlmodel import select as _select

        from src.db.courses.chapters import Chapter as _Chapter

        latest_chapter_update = db_session.exec(
            _select(_func.max(_Chapter.update_date)).where(
                _Chapter.course_id == result.id
            )
        ).one_or_none()

        if latest_chapter_update:
            if hasattr(latest_chapter_update, "isoformat"):
                version_str = latest_chapter_update.isoformat()
            else:
                version_str = str(latest_chapter_update)
            response.headers["X-Structure-Version"] = version_str
            response.headers["Access-Control-Expose-Headers"] = "X-Structure-Version"
    except Exception:
        pass

    return result


@router.get("/page/{page}/limit/{limit}")
async def api_get_platform_courses(
    request: Request,
    response: Response,
    page: int,
    limit: int,
    current_user: Annotated[
        PublicUser | AnonymousUser, Depends(get_current_user_optional)
    ] = None,
    db_session=Depends(get_db_session),
) -> list[CourseReadWithPermissions]:
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
            response.headers["Last-Modified"] = latest.strftime(
                "%a, %d %b %Y %H:%M:%S GMT"
            )

            ims = request.headers.get("If-Modified-Since")
            if ims:
                try:
                    from email.utils import parsedate_to_datetime

                    ims_dt = parsedate_to_datetime(ims)
                    if ims_dt >= latest:
                        return Response(status_code=304)
                except Exception:
                    pass
    except Exception:
        pass

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
    current_user: Annotated[PublicUser, Depends(get_current_user)] = None,
    db_session=Depends(get_db_session),
) -> list[CourseReadWithPermissions]:
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
    current_user: Annotated[PublicUser, Depends(get_current_user)] = None,
    db_session=Depends(get_db_session),
) -> list[CourseRead]:
    return await search_courses(request, current_user, query, db_session, page, limit)


@router.put("/{course_uuid}/metadata")
async def api_update_course_metadata(
    request: Request,
    course_uuid: str,
    metadata_object: CourseMetadataUpdate,
    db_session: Annotated[Session, Depends(get_db_session)],
    current_user: Annotated[PublicUser, Depends(get_current_user)],
) -> CourseRead:
    return await update_course_metadata(
        request, course_uuid, metadata_object, current_user, db_session
    )


@router.put("/{course_uuid}/access")
async def api_update_course_access(
    request: Request,
    course_uuid: str,
    access_object: CourseAccessUpdate,
    db_session: Annotated[Session, Depends(get_db_session)],
    current_user: Annotated[PublicUser, Depends(get_current_user)],
) -> CourseRead:
    return await update_course_access(
        request, course_uuid, access_object, current_user, db_session
    )


@router.delete("/{course_uuid}", response_model=CourseDetailResponse)
async def api_delete_course(
    request: Request,
    course_uuid: str,
    db_session: Annotated[Session, Depends(get_db_session)],
    current_user: Annotated[PublicUser, Depends(get_current_user)],
):
    """
    Delete Course by ID

    **Required Permission**: `course:delete:own` or `course:delete:platform`
    """
    return await delete_course(request, course_uuid, current_user, db_session)


@router.post("/{course_uuid}/apply-contributor")
async def api_apply_course_contributor(
    request: Request,
    course_uuid: str,
    db_session: Annotated[Session, Depends(get_db_session)],
    current_user: Annotated[PublicUser, Depends(get_current_user)],
):
    """
    Apply to be a contributor for a course
    """
    return await apply_course_contributor(
        request, course_uuid, current_user, db_session
    )


@router.get("/{course_uuid}/updates")
async def api_get_course_updates(
    request: Request,
    course_uuid: str,
    db_session: Annotated[Session, Depends(get_db_session)],
    current_user: Annotated[PublicUser, Depends(get_current_user)],
) -> list[CourseUpdateRead]:
    """
    Get Course Updates by course_uuid
    """
    return await get_updates_by_course_uuid(
        request, course_uuid, current_user, db_session
    )


@router.post("/{course_uuid}/updates")
async def api_create_course_update(
    request: Request,
    course_uuid: str,
    update_object: CourseUpdateCreate,
    db_session: Annotated[Session, Depends(get_db_session)],
    current_user: Annotated[PublicUser, Depends(get_current_user)],
) -> CourseUpdateRead:
    """
    Create new Course Update
    """
    return await create_update(
        request, course_uuid, update_object, current_user, db_session
    )


@router.put("/{course_uuid}/update/{courseupdate_uuid}")
async def api_update_course_update(
    request: Request,
    course_uuid: str,
    courseupdate_uuid: str,
    update_object: CourseUpdateUpdate,
    db_session: Annotated[Session, Depends(get_db_session)],
    current_user: Annotated[PublicUser, Depends(get_current_user)],
) -> CourseUpdateRead:
    """
    Update Course Update by courseupdate_uuid
    """
    return await update_update(
        request, courseupdate_uuid, update_object, current_user, db_session
    )


@router.delete("/{course_uuid}/update/{courseupdate_uuid}")
async def api_delete_course_update(
    request: Request,
    course_uuid: str,
    courseupdate_uuid: str,
    db_session: Annotated[Session, Depends(get_db_session)],
    current_user: Annotated[PublicUser, Depends(get_current_user)],
):
    """
    Delete Course Update by courseupdate_uuid
    """
    return await delete_update(request, courseupdate_uuid, current_user, db_session)


@router.get("/{course_uuid}/contributors")
async def api_get_course_contributors(
    request: Request,
    course_uuid: str,
    db_session: Annotated[Session, Depends(get_db_session)],
    current_user: Annotated[PublicUser, Depends(get_current_user)],
):
    """
    Get all contributors for a course
    """
    return await get_course_contributors(request, course_uuid, current_user, db_session)


@router.put("/{course_uuid}/contributors/{contributor_user_id}")
async def api_update_course_contributor(
    request: Request,
    course_uuid: str,
    contributor_user_id: int,
    authorship: ResourceAuthorshipEnum,
    authorship_status: ResourceAuthorshipStatusEnum,
    db_session: Annotated[Session, Depends(get_db_session)],
    current_user: Annotated[PublicUser, Depends(get_current_user)],
):
    """
    Update a course contributor's role and status

    **Required Permission**: `course:manage:own` or `course:manage:platform`
    """
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
    db_session: Annotated[Session, Depends(get_db_session)],
    current_user: Annotated[PublicUser, Depends(get_current_user)],
):
    """
    Add multiple contributors to a course by their usernames

    **Required Permission**: `course:manage:own` or `course:manage:platform`
    """
    return await add_bulk_course_contributors(
        request, course_uuid, usernames, current_user, db_session
    )


@router.delete("/{course_uuid}/bulk-remove-contributors")
async def api_remove_bulk_course_contributors(
    request: Request,
    course_uuid: str,
    usernames: list[str],
    db_session: Annotated[Session, Depends(get_db_session)],
    current_user: Annotated[PublicUser, Depends(get_current_user)],
):
    """
    Remove multiple contributors from a course by their usernames
    """
    return await remove_bulk_course_contributors(
        request, course_uuid, usernames, current_user, db_session
    )


@router.get("/{course_uuid}/rights", response_model=CourseUserRightsResponse)
async def api_get_course_user_rights(
    request: Request,
    course_uuid: str,
    db_session: Annotated[Session, Depends(get_db_session)],
    current_user: Annotated[PublicUser, Depends(get_current_user)],
) -> dict:
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
            "grade_assignments": true,
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
    - `create_content`: Can create activities, assignments, chapters, etc.
    - `update_content`: Can update course content
    - `delete_content`: Can delete course content
    - `manage_contributors`: Can add/remove contributors
    - `manage_access`: Can change course access settings (public, open_to_contributors)
    - `grade_assignments`: Can grade student assignments
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
    return await get_course_user_rights(request, course_uuid, current_user, db_session)
