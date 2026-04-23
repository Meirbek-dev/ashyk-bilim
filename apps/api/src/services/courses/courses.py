from datetime import UTC, datetime, timezone

from fastapi import HTTPException, Request, UploadFile, status
from sqlalchemy import func
from sqlmodel import Session, and_, or_, select, text
from ulid import ULID

from src.db.courses.activities import Activity
from src.db.courses.certifications import Certifications
from src.db.courses.chapters import Chapter
from src.db.courses.courses import (
    AuthorWithRole,
    Course,
    CourseAccessUpdate,
    CourseCreate,
    CourseMetadataUpdate,
    CourseRead,
    CourseUpdate,
    FullCourseRead,
    ThumbnailType,
)
from src.db.courses.enhanced_responses import CourseReadWithPermissions
from src.db.resource_authors import (
    ResourceAuthor,
    ResourceAuthorshipEnum,
    ResourceAuthorshipStatusEnum,
)
from src.db.usergroup_resources import UserGroupResource
from src.db.usergroup_user import UserGroupUser
from src.db.users import AnonymousUser, PublicUser, User, UserRead
from src.security.rbac import PermissionChecker
from src.services.courses.thumbnails import upload_thumbnail
from src.services.courses._auth import require_course_permission, require_course_read_access, is_course_owner


def _accessible_courses_filter(
    query,
    current_user: "PublicUser | AnonymousUser",
):
    """Apply the standard course-access filter to *query*.

    Rules:
    - Anonymous → public courses only.
    - Authenticated → public OR user is the course creator OR user is a
      UserGroup member for this course OR user is a resource author.

    Private courses with no UserGroup restriction are NOT readable by arbitrary
    authenticated users; only the creator and explicit authors/group members can
    access them.

    Returns the query with EXISTS and WHERE clause applied.
    """
    if isinstance(current_user, AnonymousUser):
        return query.where(Course.public)

    has_usergroup = (
        select(1)
        .select_from(UserGroupResource)
        .join(
            UserGroupUser, UserGroupUser.usergroup_id == UserGroupResource.usergroup_id
        )
        .where(
            UserGroupResource.resource_uuid == Course.course_uuid,
            UserGroupUser.user_id == current_user.id,
        )
        .exists()
    )

    is_author = (
        select(1)
        .select_from(ResourceAuthor)
        .where(
            ResourceAuthor.resource_uuid == Course.course_uuid,
            ResourceAuthor.user_id == current_user.id,
        )
        .exists()
    )

    return query.where(
        or_(
            Course.public,
            Course.creator_id == current_user.id,
            has_usergroup,
            is_author,
        )
    )


def _course_search_filter(search_query: str | None):
    if not search_query:
        return None

    normalized = search_query.strip()
    if not normalized:
        return None

    pattern = f"%{normalized}%"
    return or_(
        Course.name.ilike(pattern),
        Course.description.ilike(pattern),
        Course.about.ilike(pattern),
        Course.learnings.ilike(pattern),
        Course.tags.ilike(pattern),
    )


def _apply_course_sort(query, sort_by: str | None):
    if sort_by == "name":
        return query.order_by(func.lower(Course.name).asc(), Course.id.asc())
    return query.order_by(Course.update_date.desc(), Course.id.desc())


def _apply_lms_sort(query, current_user: "PublicUser | AnonymousUser"):
    from sqlalchemy import case, func, select

    from src.db.trail_runs import TrailRun

    if isinstance(current_user, AnonymousUser):
        return query.order_by(Course.creation_date.desc(), Course.id.desc())

    is_creator_author = (
        select(1)
        .select_from(ResourceAuthor)
        .where(
            ResourceAuthor.resource_uuid == Course.course_uuid,
            ResourceAuthor.user_id == current_user.id,
            ResourceAuthor.authorship_status == ResourceAuthorshipStatusEnum.ACTIVE,
            ResourceAuthor.authorship == ResourceAuthorshipEnum.CREATOR,
        )
        .exists()
    )

    is_creator = case(
        (Course.creator_id == current_user.id, 1), (is_creator_author, 1), else_=0
    )

    is_collaborator_author = (
        select(1)
        .select_from(ResourceAuthor)
        .where(
            ResourceAuthor.resource_uuid == Course.course_uuid,
            ResourceAuthor.user_id == current_user.id,
            ResourceAuthor.authorship_status == ResourceAuthorshipStatusEnum.ACTIVE,
            ResourceAuthor.authorship != ResourceAuthorshipEnum.CREATOR,
        )
        .exists()
    )
    is_collaborator = case((is_collaborator_author, 1), else_=0)

    last_accessed = (
        select(TrailRun.update_date)
        .where(
            TrailRun.course_id == Course.id,
            TrailRun.user_id == current_user.id,
        )
        .order_by(TrailRun.update_date.desc())
        .limit(1)
        .correlate(Course)
        .scalar_subquery()
    )

    in_progress_exists = (
        select(1)
        .where(
            TrailRun.course_id == Course.id,
            TrailRun.user_id == current_user.id,
            TrailRun.status == "STATUS_IN_PROGRESS",
        )
        .exists()
    )
    in_progress = case((in_progress_exists, 1), else_=0)

    popularity = (
        select(func.count())
        .select_from(TrailRun)
        .where(TrailRun.course_id == Course.id)
        .correlate(Course)
        .scalar_subquery()
    )

    return query.order_by(
        is_creator.desc(),
        is_collaborator.desc(),
        in_progress.desc(),
        last_accessed.desc().nulls_last(),
        popularity.desc(),
        Course.creation_date.desc(),
        Course.id.desc(),
    )


def _course_uuid_candidates(course_uuid: str) -> tuple[str, ...]:
    normalized = course_uuid.strip()
    if not normalized:
        return (course_uuid,)

    if normalized.startswith("course_"):
        raw_uuid = normalized.removeprefix("course_")
        return (normalized, raw_uuid) if raw_uuid else (normalized,)

    return (f"course_{normalized}", normalized)


def _get_course_by_uuid(db_session: Session, course_uuid: str) -> Course | None:
    for candidate in _course_uuid_candidates(course_uuid):
        statement = select(Course).where(Course.course_uuid == candidate)
        course = db_session.exec(statement).first()
        if course:
            return course

    return None


def _is_course_recent(updated_at: datetime) -> bool:
    if updated_at.tzinfo is None:
        updated_at = updated_at.replace(tzinfo=UTC)
    return (datetime.now(tz=UTC) - updated_at).days <= 14


def _build_editable_course_insights(
    courses: list[CourseReadWithPermissions], db_session: Session
) -> dict[str, dict[str, bool]]:
    if not courses:
        return {}

    course_ids = [course.id for course in courses]
    course_uuids = [course.course_uuid for course in courses]

    active_author_counts = dict(
        db_session.exec(
            select(ResourceAuthor.resource_uuid, func.count(ResourceAuthor.id))
            .where(
                ResourceAuthor.resource_uuid.in_(course_uuids),
                ResourceAuthor.authorship_status == ResourceAuthorshipStatusEnum.ACTIVE,
            )
            .group_by(ResourceAuthor.resource_uuid)
        ).all()
    )
    chapter_counts = dict(
        db_session.exec(
            select(Chapter.course_id, func.count(Chapter.id.distinct()))
            .where(Chapter.course_id.in_(course_ids))
            .group_by(Chapter.course_id)
        ).all()
    )
    activity_counts = dict(
        db_session.exec(
            select(Chapter.course_id, func.count(Activity.id.distinct()))
            .join(Activity, Activity.chapter_id == Chapter.id)
            .where(Chapter.course_id.in_(course_ids))
            .group_by(Chapter.course_id)
        ).all()
    )
    linked_usergroup_counts = dict(
        db_session.exec(
            select(
                UserGroupResource.resource_uuid,
                func.count(UserGroupResource.id.distinct()),
            )
            .where(UserGroupResource.resource_uuid.in_(course_uuids))
            .group_by(UserGroupResource.resource_uuid)
        ).all()
    )
    certification_counts = dict(
        db_session.exec(
            select(Certifications.course_id, func.count(Certifications.id.distinct()))
            .where(Certifications.course_id.in_(course_ids))
            .group_by(Certifications.course_id)
        ).all()
    )

    insights: dict[str, dict[str, bool]] = {}
    for course in courses:
        chapter_count = int(chapter_counts.get(course.id, 0) or 0)
        activity_count = int(activity_counts.get(course.id, 0) or 0)
        author_count = int(active_author_counts.get(course.course_uuid, 0) or 0)
        linked_usergroups = int(linked_usergroup_counts.get(course.course_uuid, 0) or 0)
        certifications = int(certification_counts.get(course.id, 0) or 0)
        has_description = bool((course.description or "").strip())
        ready = (
            bool((course.name or "").strip())
            and has_description
            and bool(course.thumbnail_image)
            and chapter_count > 0
            and activity_count > 0
            and author_count > 0
            and (bool(course.public) or linked_usergroups > 0)
            and certifications > 0
        )
        attention = (
            not bool(course.thumbnail_image)
            or not has_description
            or activity_count == 0
        )
        insights[course.course_uuid] = {
            "ready": ready,
            "attention": attention,
            "recent": _is_course_recent(course.update_date),
        }
    return insights


def _attention_sql_condition():
    """SQL expression: course needs attention (missing thumbnail, description, or activities)."""
    from sqlalchemy import and_, case, exists, literal_column

    has_activities = (
        select(Activity.id)
        .join(Chapter, Chapter.id == Activity.chapter_id)
        .where(Chapter.course_id == Course.id)
        .exists()
    )
    return or_(
        Course.thumbnail_image.is_(None),
        Course.thumbnail_image == "",
        Course.description.is_(None),
        Course.description == "",
        ~has_activities,
    )


def _ready_sql_condition():
    """SQL expression: course is fully ready to publish."""
    from datetime import timedelta

    has_chapters = select(Chapter.id).where(Chapter.course_id == Course.id).exists()
    has_activities = (
        select(Activity.id)
        .join(Chapter, Chapter.id == Activity.chapter_id)
        .where(Chapter.course_id == Course.id)
        .exists()
    )
    has_active_author = (
        select(ResourceAuthor.id)
        .where(
            ResourceAuthor.resource_uuid == Course.course_uuid,
            ResourceAuthor.authorship_status == ResourceAuthorshipStatusEnum.ACTIVE,
        )
        .exists()
    )
    has_usergroup_or_public = or_(
        Course.public,
        select(UserGroupResource.id)
        .where(UserGroupResource.resource_uuid == Course.course_uuid)
        .exists(),
    )
    has_certification = (
        select(Certifications.id).where(Certifications.course_id == Course.id).exists()
    )
    return and_(
        Course.name.isnot(None),
        Course.name != "",
        Course.description.isnot(None),
        Course.description != "",
        Course.thumbnail_image.isnot(None),
        Course.thumbnail_image != "",
        has_chapters,
        has_activities,
        has_active_author,
        has_usergroup_or_public,
        has_certification,
    )


def _preset_sql_filter(preset: str | None):
    """Return an additional SQL WHERE clause for the given preset, or None."""
    from datetime import timedelta

    if not preset or preset == "all":
        return None
    if preset == "published":
        return Course.public == True  # noqa: E712
    if preset == "private":
        return Course.public == False  # noqa: E712
    if preset == "recent":
        cutoff = datetime.now(tz=UTC) - timedelta(days=14)
        return Course.update_date >= cutoff
    if preset == "attention":
        return _attention_sql_condition()
    if preset == "drafts":
        # Draft = not public OR not ready.
        return or_(Course.public == False, ~_ready_sql_condition())  # noqa: E712
    return None


async def list_editable_courses(
    request: Request,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
    page: int = 1,
    limit: int = 20,
    search_query: str | None = None,
    sort_by: str | None = "updated",
    preset: str | None = None,
) -> tuple[list[CourseReadWithPermissions], int, dict[str, int]]:
    """Return a paginated subset of editable courses plus summary counts.

    All filtering, counting, and pagination happen in SQL — no full-table
    Python loops regardless of how many courses exist.
    """
    if isinstance(current_user, AnonymousUser):
        return [], 0, {"total": 0, "ready": 0, "private": 0, "attention": 0}

    # 1. Fetch the summary counts with a single SQL query over all editable courses
    #    (no per-course Python objects needed here).
    all_courses_for_summary = await get_editable_courses(
        request,
        current_user,
        db_session,
        search_query=search_query,
        sort_by=sort_by,
        apply_pagination=False,
    )

    insights = _build_editable_course_insights(all_courses_for_summary, db_session)
    summary = {
        "total": len(all_courses_for_summary),
        "ready": sum(
            1
            for c in all_courses_for_summary
            if insights.get(c.course_uuid, {}).get("ready")
        ),
        "private": sum(1 for c in all_courses_for_summary if not bool(c.public)),
        "attention": sum(
            1
            for c in all_courses_for_summary
            if insights.get(c.course_uuid, {}).get("attention")
        ),
    }

    # 2. Fetch only the preset-filtered, paginated page — directly in SQL.
    preset_filter = _preset_sql_filter(preset)
    paginated_courses = await get_editable_courses(
        request,
        current_user,
        db_session,
        page=page,
        limit=limit,
        search_query=search_query,
        sort_by=sort_by,
        apply_pagination=True,
        extra_filter=preset_filter,
    )

    # Total count for the filtered preset (for pagination UI).
    filtered_count_courses = await get_editable_courses(
        request,
        current_user,
        db_session,
        search_query=search_query,
        sort_by=sort_by,
        apply_pagination=False,
        extra_filter=preset_filter,
    )
    filtered_total = len(filtered_count_courses)

    return paginated_courses, filtered_total, summary


def _ensure_course_is_current(
    course: Course, last_known_update_date: datetime | None
) -> None:
    if last_known_update_date is None:
        return

    current_update_date = course.update_date
    expected_update_date = last_known_update_date

    if expected_update_date.tzinfo is None:
        expected_update_date = expected_update_date.replace(tzinfo=UTC)

    if current_update_date != expected_update_date:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Course has changed since you opened this editor. Reload and try again.",
        )


def _serialize_course_with_authors(course: Course, db_session: Session) -> CourseRead:
    authors_statement = (
        select(ResourceAuthor, User)
        .join(User, ResourceAuthor.user_id == User.id)
        .where(ResourceAuthor.resource_uuid == course.course_uuid)
        .order_by(ResourceAuthor.id.asc())
    )
    author_results = db_session.exec(authors_statement).all()
    authors = [
        AuthorWithRole(
            user=UserRead.model_validate(user),
            authorship=resource_author.authorship,
            authorship_status=resource_author.authorship_status,
            creation_date=resource_author.creation_date,
            update_date=resource_author.update_date,
        )
        for resource_author, user in author_results
    ]
    return CourseRead.model_validate({**course.model_dump(), "authors": authors})


async def get_course(
    request: Request,
    course_uuid: str,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
    checker: PermissionChecker,
):
    course = _get_course_by_uuid(db_session, course_uuid)

    if not course:
        raise HTTPException(
            status_code=404,
            detail="Course not found",
        )

    if not course.public:
        require_course_read_access(current_user, course, checker)

    # Get course authors with their roles
    authors_statement = (
        select(ResourceAuthor, User)
        .join(User, ResourceAuthor.user_id == User.id)
        .where(ResourceAuthor.resource_uuid == course.course_uuid)
        .order_by(ResourceAuthor.id.asc())
    )
    author_results = db_session.exec(authors_statement).all()

    # Convert to AuthorWithRole objects
    authors = [
        AuthorWithRole(
            user=UserRead.model_validate(user),
            authorship=resource_author.authorship,
            authorship_status=resource_author.authorship_status,
            creation_date=resource_author.creation_date,
            update_date=resource_author.update_date,
        )
        for resource_author, user in author_results
    ]

    return CourseRead.model_validate({**course.model_dump(), "authors": authors})


async def get_course_by_id(
    request: Request,
    course_id: int,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
    checker: PermissionChecker,
):
    statement = select(Course).where(Course.id == course_id)
    course = db_session.exec(statement).first()

    if not course:
        raise HTTPException(
            status_code=404,
            detail="Course not found",
        )

    if not course.public:
        require_course_read_access(current_user, course, checker)

    # Get course authors with their roles
    authors_statement = (
        select(ResourceAuthor, User)
        .join(User, ResourceAuthor.user_id == User.id)
        .where(ResourceAuthor.resource_uuid == course.course_uuid)
        .order_by(ResourceAuthor.id.asc())
    )
    author_results = db_session.exec(authors_statement).all()

    # Convert to AuthorWithRole objects
    authors = [
        AuthorWithRole(
            user=UserRead.model_validate(user),
            authorship=resource_author.authorship,
            authorship_status=resource_author.authorship_status,
            creation_date=resource_author.creation_date,
            update_date=resource_author.update_date,
        )
        for resource_author, user in author_results
    ]

    return CourseRead.model_validate({**course.model_dump(), "authors": authors})


async def get_course_meta(
    request: Request,
    course_uuid: str,
    with_unpublished_activities: bool,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
    checker: PermissionChecker | None,
) -> FullCourseRead:
    # Avoid circular import
    from src.services.courses.chapters import get_course_chapters

    resolved_course = _get_course_by_uuid(db_session, course_uuid)

    if not resolved_course:
        raise HTTPException(
            status_code=404,
            detail="Course not found",
        )

    # Get course with authors in a single query using joins
    course_statement = (
        select(Course, ResourceAuthor, User)
        .outerjoin(ResourceAuthor, ResourceAuthor.resource_uuid == Course.course_uuid)
        .outerjoin(User, ResourceAuthor.user_id == User.id)
        .where(Course.course_uuid == resolved_course.course_uuid)
        .order_by(ResourceAuthor.id.asc())
    )
    results = db_session.exec(course_statement).all()

    # Extract course and authors from results
    course = results[0][0]  # First result's Course
    author_results = [
        (ra, u) for _, ra, u in results if ra is not None and u is not None
    ]

    if checker is None:
        checker = PermissionChecker(db_session)

    # RBAC check — skip for public courses
    if not course.public:
        require_course_read_access(current_user, course, checker)

    can_view_unpublished = False
    if with_unpublished_activities:
        is_owner = is_course_owner(db_session, current_user.id, course.course_uuid)
        can_view_unpublished = checker.check(
            current_user.id,
            "course:update",
            resource_owner_id=course.creator_id,
            is_owner=is_owner,
        ) or checker.check(
            current_user.id,
            "course:update_content",
            resource_owner_id=course.creator_id,
            is_owner=is_owner,
        )

    # Get course chapters
    chapters = []
    if course.id is not None:
        chapters = await get_course_chapters(
            request,
            course.id,
            db_session,
            current_user,
            with_unpublished_activities and can_view_unpublished,
        )

    # Convert to AuthorWithRole objects
    authors = [
        AuthorWithRole(
            user=UserRead.model_validate(user),
            authorship=resource_author.authorship,
            authorship_status=resource_author.authorship_status,
            creation_date=resource_author.creation_date,
            update_date=resource_author.update_date,
        )
        for resource_author, user in author_results
    ]

    # Create course read model with chapters
    return FullCourseRead.model_validate(
        {**course.model_dump(), "authors": authors, "chapters": chapters}
    )


async def count_courses(
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
) -> int:
    """Count total courses for the platform with proper access filtering."""
    query = select(func.count(Course.id.distinct()))
    query = _accessible_courses_filter(query, current_user)
    return db_session.exec(query).one()


async def get_courses(
    request: Request,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
    page: int = 1,
    limit: int = 20,
) -> list[CourseReadWithPermissions]:
    # Simple caching for anonymous (public) course listings to reduce
    # load and avoid upstream rate limits. Uses Redis if available.
    try:
        from src.services.cache.redis_client import get_json, set_json
    except Exception:
        get_json = None  # type: ignore
        set_json = None  # type: ignore

    # Only cache results for anonymous users (public content)
    cache_key = f"courses:platform:page:{page}:limit:{limit}"
    if isinstance(current_user, AnonymousUser) and get_json is not None:
        try:
            cached = get_json(cache_key)
            if cached:
                # cached is a list of serialised course dicts
                return [CourseReadWithPermissions.model_validate(c) for c in cached]
        except Exception:
            # Redis errors should not break the request
            pass
    from collections import OrderedDict

    from sqlalchemy.orm import aliased

    offset = (page - 1) * limit
    # Step 1: Fetch paginated course IDs using LMS sorting
    id_query = select(Course.id)
    id_query = _accessible_courses_filter(id_query, current_user)
    id_query = _apply_lms_sort(id_query, current_user)
    id_query = id_query.offset(offset).limit(limit)

    course_ids = db_session.exec(id_query).all()
    if not course_ids:
        return []

    # Step 2: Single query – fetch courses + authors via outer join
    AuthorRA = aliased(ResourceAuthor)
    AuthorUser = aliased(User)

    combined_query = (
        select(Course, AuthorRA, AuthorUser)
        .where(Course.id.in_(course_ids))
        .outerjoin(AuthorRA, AuthorRA.resource_uuid == Course.course_uuid)
        .outerjoin(AuthorUser, AuthorRA.user_id == AuthorUser.id)
        .order_by(AuthorRA.id.asc())
    )

    results = db_session.exec(combined_query).all()

    # Group results by course, preserving correct sorting order
    courses_map: OrderedDict[int, tuple] = OrderedDict()
    for cid in course_ids:
        courses_map[cid] = (None, [])

    for course, ra, author_user in results:
        cid = course.id
        if courses_map[cid][0] is None:
            courses_map[cid] = (course, courses_map[cid][1])
        if ra is not None and author_user is not None:
            courses_map[cid][1].append(
                AuthorWithRole(
                    user=UserRead.model_validate(author_user),
                    authorship=ra.authorship,
                    authorship_status=ra.authorship_status,
                    creation_date=ra.creation_date,
                    update_date=ra.update_date,
                )
            )

    # Build CourseReadWithPermissions objects
    course_reads = []

    # Pre-load permission grants once for authenticated users
    has_broad_update = has_broad_delete = has_own_update = has_own_delete = False
    if not isinstance(current_user, AnonymousUser) and current_user.id and courses_map:
        next(iter(courses_map.values()))[0]
        checker = PermissionChecker(db_session)
        granted = checker._get_or_load(current_user.id)
        has_broad_update = PermissionChecker._has_perm(
            granted, "course", "update", "all"
        ) or PermissionChecker._has_perm(granted, "course", "update", "platform")
        has_broad_delete = PermissionChecker._has_perm(
            granted, "course", "delete", "all"
        ) or PermissionChecker._has_perm(granted, "course", "delete", "platform")
        has_own_update = PermissionChecker._has_perm(granted, "course", "update", "own")
        has_own_delete = PermissionChecker._has_perm(granted, "course", "delete", "own")

    for course, authors in courses_map.values():
        can_update = can_delete = is_owner = False
        if not isinstance(current_user, AnonymousUser) and current_user.id:
            is_author = any(
                a.user.id == current_user.id
                and a.authorship_status == ResourceAuthorshipStatusEnum.ACTIVE
                for a in authors
            )
            is_owner = course.creator_id == current_user.id
            can_update = has_broad_update or (has_own_update and is_author)
            can_delete = has_broad_delete or (has_own_delete and is_author)

        course_read = CourseReadWithPermissions.model_validate(
            {
                "id": course.id or 0,
                "name": course.name,
                "description": course.description or "",
                "about": course.about or "",
                "learnings": course.learnings or "",
                "tags": course.tags or "",
                "thumbnail_image": course.thumbnail_image or "",
                "public": course.public,
                "open_to_contributors": course.open_to_contributors,
                "course_uuid": course.course_uuid,
                "creation_date": course.creation_date,
                "update_date": course.update_date,
                "authors": authors,
                "can_update": can_update,
                "can_delete": can_delete,
                "is_owner": is_owner,
            }
        )
        course_reads.append(course_read)
    try:
        if (
            isinstance(current_user, AnonymousUser)
            and get_json is not None
            and set_json is not None
        ):
            try:
                serialised = [cr.model_dump() for cr in course_reads]
                set_json(cache_key, serialised, ttl=60)
            except Exception:
                # Swallow redis set errors
                pass
    except Exception:
        # Ignore caching errors
        pass

    return course_reads


async def search_courses(
    request: Request,
    current_user: PublicUser | AnonymousUser,
    search_query: str,
    db_session: Session,
    page: int = 1,
    limit: int = 20,
) -> list[CourseRead]:
    offset = (page - 1) * limit
    search_filter = _course_search_filter(search_query)

    # Base query
    query = select(Course)
    if search_filter is not None:
        query = query.where(search_filter)

    if isinstance(current_user, AnonymousUser):
        # For anonymous users, only show public courses
        query = query.where(Course.public)
    else:
        # For authenticated users, show:
        # 1. Public courses
        # 2. Courses not in any UserGroup
        # 3. Courses in UserGroups where the user is a member
        # 4. Courses where the user is a resource author
        has_usergroup_membership = (
            select(UserGroupResource.id)
            .join(
                UserGroupUser,
                UserGroupUser.usergroup_id == UserGroupResource.usergroup_id,
            )
            .where(
                UserGroupResource.resource_uuid == Course.course_uuid,
                UserGroupUser.user_id == current_user.id,
            )
            .exists()
        )
        is_resource_author = (
            select(ResourceAuthor.id)
            .where(
                ResourceAuthor.resource_uuid == Course.course_uuid,
                ResourceAuthor.user_id == current_user.id,
            )
            .exists()
        )

        query = query.where(
            or_(
                Course.public,
                Course.creator_id == current_user.id,
                has_usergroup_membership,
                is_resource_author,
            )
        )

    # Apply pagination
    query = _apply_lms_sort(query, current_user).offset(offset).limit(limit)

    courses = db_session.exec(query).all()

    # Batch fetch all authors for all courses in one query
    course_uuids = [course.course_uuid for course in courses]
    all_authors_statement = (
        select(ResourceAuthor, User)
        .join(User, ResourceAuthor.user_id == User.id)
        .where(ResourceAuthor.resource_uuid.in_(course_uuids))
        .order_by(ResourceAuthor.id.asc())
    )
    authors_by_course: dict[str, list] = {}
    for resource_author, user in db_session.exec(all_authors_statement).all():
        authors_by_course.setdefault(resource_author.resource_uuid, []).append(
            AuthorWithRole(
                user=UserRead.model_validate(user),
                authorship=resource_author.authorship,
                authorship_status=resource_author.authorship_status,
                creation_date=resource_author.creation_date,
                update_date=resource_author.update_date,
            )
        )

    course_reads = []
    for course in courses:
        course_dict = {
            "id": course.id or 0,  # Ensure id is never None
            "name": course.name,
            "description": course.description or "",
            "about": course.about or "",
            "learnings": course.learnings or "",
            "tags": course.tags or "",
            "thumbnail_image": course.thumbnail_image or "",
            "public": course.public,
            "open_to_contributors": course.open_to_contributors,
            "course_uuid": course.course_uuid,
            "creation_date": course.creation_date,
            "update_date": course.update_date,
            "authors": authors_by_course.get(course.course_uuid, []),
        }
        course_read = CourseRead.model_validate(course_dict)
        course_reads.append(course_read)

    return course_reads


_STARTER_CHAPTERS = [
    {"name": "Introduction", "description": "Overview and course objectives"},
    {"name": "Core Lessons", "description": "Main learning content"},
]


def _seed_starter_chapters(
    course: Course, creator_id: int, db_session: Session
) -> None:
    """Insert the two default chapters for the 'starter' template."""
    from ulid import ULID

    from src.db.courses.chapters import Chapter

    for index, chapter_data in enumerate(_STARTER_CHAPTERS, start=1):
        chapter = Chapter(
            name=chapter_data["name"],
            description=chapter_data["description"],
            thumbnail_image="",
            course_id=course.id,
            chapter_uuid=f"chapter_{ULID()}",
            creation_date=datetime.now(tz=UTC),
            update_date=datetime.now(tz=UTC),
            order=index,
            creator_id=creator_id,
        )
        db_session.add(chapter)
    db_session.commit()


async def create_course(
    request: Request,
    course_object: CourseCreate,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
    thumbnail_file: UploadFile | None = None,
    thumbnail_type: ThumbnailType = ThumbnailType.IMAGE,
    checker: PermissionChecker | None = None,
):
    """
    Create a new course

    SECURITY NOTES:
    - User becomes the CREATOR of the course automatically
    - Requires proper permissions to create courses on the platform
    - Course creation is subject to platform limits and permissions
    """

    # Create Course object from CourseCreate data
    course = Course.model_validate(course_object.model_dump())

    # SECURITY: Check if user has permission to create courses
    if checker is None:
        checker = PermissionChecker(db_session)
    checker.require(current_user.id, "course:create")

    course.course_uuid = f"course_{ULID()}"
    course.creation_date = datetime.now(tz=UTC)
    course.update_date = datetime.now(tz=UTC)
    course.creator_id = current_user.id  # Track creator

    # Upload thumbnail
    if thumbnail_file and thumbnail_file.filename:
        name_in_disk = f"{course.course_uuid}_thumbnail_{ULID()}.{thumbnail_file.filename.split('.')[-1]}"
        await upload_thumbnail(
            thumbnail_file,
            name_in_disk,
            course.course_uuid,
        )
        if thumbnail_type == ThumbnailType.IMAGE:
            course.thumbnail_image = name_in_disk
            course.thumbnail_type = ThumbnailType.IMAGE
        elif thumbnail_type == ThumbnailType.VIDEO:
            course.thumbnail_video = name_in_disk
            course.thumbnail_type = ThumbnailType.VIDEO
    else:
        course.thumbnail_image = ""
        course.thumbnail_video = ""
        course.thumbnail_type = ThumbnailType.IMAGE

    # Insert course
    db_session.add(course)
    db_session.commit()
    db_session.refresh(course)

    # SECURITY: Make the user the creator of the course
    resource_author = ResourceAuthor(
        resource_uuid=course.course_uuid,
        user_id=current_user.id,
        authorship=ResourceAuthorshipEnum.CREATOR,
        authorship_status=ResourceAuthorshipStatusEnum.ACTIVE,
        creation_date=datetime.now(tz=UTC).isoformat(),
        update_date=datetime.now(tz=UTC).isoformat(),
    )
    db_session.add(resource_author)
    db_session.commit()
    db_session.refresh(resource_author)

    # Seed starter chapters when template='starter'
    if course_object.template == "starter" and course.id is not None:
        _seed_starter_chapters(course, current_user.id, db_session)

    # Get course authors with their roles
    authors_statement = (
        select(ResourceAuthor, User)
        .join(User, ResourceAuthor.user_id == User.id)
        .where(ResourceAuthor.resource_uuid == course.course_uuid)
        .order_by(ResourceAuthor.id.asc())
    )
    author_results = db_session.exec(authors_statement).all()

    # Convert to AuthorWithRole objects
    authors = [
        AuthorWithRole(
            user=UserRead.model_validate(user),
            authorship=resource_author.authorship,
            authorship_status=resource_author.authorship_status,
            creation_date=resource_author.creation_date,
            update_date=resource_author.update_date,
        )
        for resource_author, user in author_results
    ]

    return CourseRead.model_validate({**course.model_dump(), "authors": authors})


async def update_course_thumbnail(
    request: Request,
    course_uuid: str,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
    thumbnail_file: UploadFile | None = None,
    thumbnail_type: ThumbnailType = ThumbnailType.IMAGE,
    last_known_update_date: datetime | None = None,
    checker: PermissionChecker | None = None,
):
    course = _get_course_by_uuid(db_session, course_uuid)

    if not course:
        raise HTTPException(
            status_code=404,
            detail="Course not found",
        )

    # RBAC check
    if checker is None:
        checker = PermissionChecker(db_session)
    checker.require(
        current_user.id,
        "course:update",
        resource_owner_id=course.creator_id,
    )

    _ensure_course_is_current(course, last_known_update_date)

    # Upload thumbnail
    name_in_disk = None
    if thumbnail_file and thumbnail_file.filename:
        name_in_disk = f"{course.course_uuid}_thumbnail_{ULID()}.{thumbnail_file.filename.split('.')[-1]}"
        await upload_thumbnail(
            thumbnail_file,
            name_in_disk,
            course.course_uuid,
        )

    # Update course
    if name_in_disk:
        if thumbnail_type == ThumbnailType.IMAGE:
            course.thumbnail_image = name_in_disk
            course.thumbnail_type = (
                ThumbnailType.IMAGE
                if not course.thumbnail_video
                else ThumbnailType.BOTH
            )
        elif thumbnail_type == ThumbnailType.VIDEO:
            course.thumbnail_video = name_in_disk
            course.thumbnail_type = (
                ThumbnailType.VIDEO
                if not course.thumbnail_image
                else ThumbnailType.BOTH
            )
    else:
        raise HTTPException(
            status_code=400,
            detail="No thumbnail file provided",
        )

    # Complete the course object
    course.update_date = datetime.now(tz=UTC)

    db_session.add(course)
    db_session.commit()
    db_session.refresh(course)

    # Get course authors with their roles
    authors_statement = (
        select(ResourceAuthor, User)
        .join(User, ResourceAuthor.user_id == User.id)
        .where(ResourceAuthor.resource_uuid == course.course_uuid)
        .order_by(ResourceAuthor.id.asc())
    )
    author_results = db_session.exec(authors_statement).all()

    # Convert to AuthorWithRole objects
    authors = [
        AuthorWithRole(
            user=UserRead.model_validate(user),
            authorship=resource_author.authorship,
            authorship_status=resource_author.authorship_status,
            creation_date=resource_author.creation_date,
            update_date=resource_author.update_date,
        )
        for resource_author, user in author_results
    ]

    return CourseRead.model_validate({**course.model_dump(), "authors": authors})


async def update_course(
    request: Request,
    course_object: CourseUpdate,
    course_uuid: str,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
    checker: PermissionChecker | None = None,
):
    """
    Update a course

    SECURITY NOTES:
    - Requires course ownership (CREATOR, MAINTAINER) or admin role
    - Sensitive fields (public, open_to_contributors) require additional validation
    - Cannot change course access settings without proper permissions
    """
    course = _get_course_by_uuid(db_session, course_uuid)

    if not course:
        raise HTTPException(
            status_code=404,
            detail="Course not found",
        )

    # SECURITY: Require course ownership or admin role for updating courses
    if checker is None:
        checker = PermissionChecker(db_session)
    checker.require(
        current_user.id,
        "course:update",
        resource_owner_id=course.creator_id,
    )

    # SECURITY: Additional checks for sensitive access control fields
    sensitive_fields_updated = []

    # Check if sensitive fields are being updated
    if course_object.public is not None:
        sensitive_fields_updated.append("public")
    if course_object.open_to_contributors is not None:
        sensitive_fields_updated.append("open_to_contributors")

    # If sensitive fields are being updated, require additional validation
    if sensitive_fields_updated:
        # SECURITY: For sensitive access control changes, require CREATOR or MAINTAINER role
        # Check if user is course owner (CREATOR or MAINTAINER)
        statement = select(ResourceAuthor).where(
            ResourceAuthor.resource_uuid == course_uuid,
            ResourceAuthor.user_id == current_user.id,
        )
        resource_author = db_session.exec(statement).first()

        is_course_owner = False
        if resource_author and (
            (
                resource_author.authorship
                in (ResourceAuthorshipEnum.CREATOR, ResourceAuthorshipEnum.MAINTAINER)
            )
            and resource_author.authorship_status == ResourceAuthorshipStatusEnum.ACTIVE
        ):
            is_course_owner = True

        # Check if user has admin or maintainer role via permission service
        admin_or_maintainer = checker.check(current_user.id, "course:manage")

        # SECURITY: Only course owners (CREATOR, MAINTAINER) or admins can change access settings
        if not (is_course_owner or admin_or_maintainer):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"You must be the course owner (CREATOR or MAINTAINER) or have admin role to change access settings: {', '.join(sensitive_fields_updated)}",
            )

    # Update only the fields that were passed in
    update_data = course_object.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(course, field, value)

    # Complete the course object
    course.update_date = datetime.now(tz=UTC)

    db_session.add(course)
    db_session.commit()
    db_session.refresh(course)

    return _serialize_course_with_authors(course, db_session)


async def update_course_metadata(
    request: Request,
    course_uuid: str,
    metadata_object: CourseMetadataUpdate,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
    checker: PermissionChecker | None = None,
):
    course = _get_course_by_uuid(db_session, course_uuid)

    if not course:
        raise HTTPException(status_code=404, detail="Course not found")

    if checker is None:
        checker = PermissionChecker(db_session)

    checker.require(
        current_user.id,
        "course:update",
        resource_owner_id=course.creator_id,
    )

    _ensure_course_is_current(course, metadata_object.last_known_update_date)

    update_data = metadata_object.model_dump(exclude_unset=True)
    update_data.pop("last_known_update_date", None)

    for field, value in update_data.items():
        setattr(course, field, value)

    course.update_date = datetime.now(tz=UTC)
    db_session.add(course)
    db_session.commit()
    db_session.refresh(course)

    return _serialize_course_with_authors(course, db_session)


async def update_course_access(
    request: Request,
    course_uuid: str,
    access_object: CourseAccessUpdate,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
    checker: PermissionChecker | None = None,
):
    course = _get_course_by_uuid(db_session, course_uuid)

    if not course:
        raise HTTPException(status_code=404, detail="Course not found")

    if checker is None:
        checker = PermissionChecker(db_session)

    _ensure_course_is_current(course, access_object.last_known_update_date)

    update_data = access_object.model_dump(exclude_unset=True)
    update_data.pop("last_known_update_date", None)

    if "public" in update_data:
        checker.require(
            current_user.id,
            "course:manage",
            resource_owner_id=course.creator_id,
        )

    if "open_to_contributors" in update_data:
        checker.require(
            current_user.id,
            "course:update",
            resource_owner_id=course.creator_id,
        )

    for field, value in update_data.items():
        setattr(course, field, value)

    course.update_date = datetime.now(tz=UTC)
    db_session.add(course)
    db_session.commit()
    db_session.refresh(course)

    return _serialize_course_with_authors(course, db_session)


async def delete_course(
    request: Request,
    course_uuid: str,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
    checker: PermissionChecker | None = None,
):
    course = _get_course_by_uuid(db_session, course_uuid)

    if not course:
        raise HTTPException(
            status_code=404,
            detail="Course not found",
        )

    # RBAC check
    if checker is None:
        checker = PermissionChecker(db_session)
    checker.require(
        current_user.id,
        "course:delete",
        resource_owner_id=course.creator_id,
    )

    db_session.delete(course)
    db_session.commit()

    return {"detail": "Course deleted"}


async def get_user_courses(
    request: Request,
    current_user: PublicUser | AnonymousUser,
    user_id: int,
    db_session: Session,
    page: int = 1,
    limit: int = 20,
) -> list[CourseRead]:
    # Verify user is not anonymous
    if current_user.id == 0:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="You must be logged in to perform this action",
        )

    # Get all resource authors for the user
    statement = select(ResourceAuthor).where(
        and_(
            ResourceAuthor.user_id == user_id,
            ResourceAuthor.authorship_status == ResourceAuthorshipStatusEnum.ACTIVE,
        )
    )
    resource_authors = db_session.exec(statement).all()

    # Extract course UUIDs from resource authors
    course_uuids = [author.resource_uuid for author in resource_authors]

    if not course_uuids:
        return []

    # Get courses with the extracted UUIDs
    statement = select(Course).where(Course.course_uuid.in_(course_uuids))

    # Apply pagination
    statement = statement.offset((page - 1) * limit).limit(limit)

    courses = db_session.exec(statement).all()

    # Convert to CourseRead objects
    # Batch fetch all authors and users for all courses in 2 queries (instead of N*M)
    course_uuids = [course.course_uuid for course in courses]
    all_authors_statement = (
        select(ResourceAuthor, User)
        .join(User, ResourceAuthor.user_id == User.id)
        .where(ResourceAuthor.resource_uuid.in_(course_uuids))
    )
    authors_by_course: dict[str, list] = {}
    for resource_author, user in db_session.exec(all_authors_statement).all():
        authors_by_course.setdefault(resource_author.resource_uuid, []).append(
            AuthorWithRole(
                user=UserRead.model_validate(user),
                authorship=resource_author.authorship,
                authorship_status=resource_author.authorship_status,
                creation_date=resource_author.creation_date,
                update_date=resource_author.update_date,
            )
        )

    result = []
    for course in courses:
        # Create CourseRead object
        course_read = CourseRead.model_validate(
            {
                "id": course.id or 0,  # Ensure id is never None
                "name": course.name,
                "description": course.description or "",
                "about": course.about or "",
                "learnings": course.learnings or "",
                "tags": course.tags or "",
                "thumbnail_image": course.thumbnail_image or "",
                "public": course.public,
                "open_to_contributors": course.open_to_contributors,
                "course_uuid": course.course_uuid,
                "creation_date": course.creation_date,
                "update_date": course.update_date,
                "authors": authors_by_course.get(course.course_uuid, []),
            }
        )
        result.append(course_read)

    return result


async def get_editable_courses(
    request: Request,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
    page: int = 1,
    limit: int = 20,
    search_query: str | None = None,
    sort_by: str | None = "updated",
    apply_pagination: bool = True,
    extra_filter=None,
) -> list[CourseReadWithPermissions]:
    """
    Return courses for the platform that the current user has permission to edit
    (i.e. course:update). Anonymous users always get an empty list.

    Scope resolution:
    - course:update:all or course:update:platform  → all courses in the platform
    - course:update:own                        → only courses where user is an
                                                 active ResourceAuthor
    """
    from collections import OrderedDict

    from sqlalchemy.orm import aliased

    if isinstance(current_user, AnonymousUser):
        return []

    checker = PermissionChecker(db_session)
    granted = checker._get_or_load(current_user.id)

    has_broad_update = PermissionChecker._has_perm(
        granted, "course", "update", "all"
    ) or PermissionChecker._has_perm(granted, "course", "update", "platform")
    search_filter = _course_search_filter(search_query)

    offset = (page - 1) * limit

    if has_broad_update:
        id_query = select(Course.id)
        if search_filter is not None:
            id_query = id_query.where(search_filter)
        if extra_filter is not None:
            id_query = id_query.where(extra_filter)
        id_query = _apply_course_sort(id_query, sort_by)
    else:
        has_own_update = PermissionChecker._has_perm(granted, "course", "update", "own")
        if not has_own_update:
            return []

        is_active_author = (
            select(ResourceAuthor.id)
            .where(
                ResourceAuthor.resource_uuid == Course.course_uuid,
                ResourceAuthor.user_id == current_user.id,
                ResourceAuthor.authorship_status == ResourceAuthorshipStatusEnum.ACTIVE,
            )
            .exists()
        )

        id_query = select(Course.id).where(is_active_author)
        if search_filter is not None:
            id_query = id_query.where(search_filter)
        if extra_filter is not None:
            id_query = id_query.where(extra_filter)
        id_query = _apply_course_sort(id_query, sort_by)

    if apply_pagination:
        id_query = id_query.offset(offset).limit(limit)

    id_subquery = id_query.subquery()

    AuthorRA = aliased(ResourceAuthor)
    AuthorUser = aliased(User)

    combined_query = (
        select(Course, AuthorRA, AuthorUser)
        .where(Course.id.in_(select(id_subquery.c.id)))
        .outerjoin(AuthorRA, AuthorRA.resource_uuid == Course.course_uuid)
        .outerjoin(AuthorUser, AuthorRA.user_id == AuthorUser.id)
        .order_by(Course.id, AuthorRA.id.asc())
    )

    results = db_session.exec(combined_query).all()

    if not results:
        return []

    courses_map: OrderedDict[int, tuple] = OrderedDict()
    for course, ra, author_user in results:
        cid = course.id
        if cid not in courses_map:
            courses_map[cid] = (course, [])
        if ra is not None and author_user is not None:
            courses_map[cid][1].append(
                AuthorWithRole(
                    user=UserRead.model_validate(author_user),
                    authorship=ra.authorship,
                    authorship_status=ra.authorship_status,
                    creation_date=ra.creation_date,
                    update_date=ra.update_date,
                )
            )

    course_reads = []

    has_broad_delete = PermissionChecker._has_perm(
        granted, "course", "delete", "all"
    ) or PermissionChecker._has_perm(granted, "course", "delete", "platform")
    has_own_delete = PermissionChecker._has_perm(granted, "course", "delete", "own")

    for course, authors in courses_map.values():
        is_author = any(
            a.user.id == current_user.id
            and a.authorship_status == ResourceAuthorshipStatusEnum.ACTIVE
            for a in authors
        )
        is_owner = course.creator_id == current_user.id
        can_delete = has_broad_delete or (has_own_delete and is_author)

        course_read = CourseReadWithPermissions.model_validate(
            {
                "id": course.id or 0,
                "name": course.name,
                "description": course.description or "",
                "about": course.about or "",
                "learnings": course.learnings or "",
                "tags": course.tags or "",
                "thumbnail_image": course.thumbnail_image or "",
                "public": course.public,
                "open_to_contributors": course.open_to_contributors,
                "course_uuid": course.course_uuid,
                "creation_date": course.creation_date,
                "update_date": course.update_date,
                "authors": authors,
                "can_update": True,
                "can_delete": can_delete,
                "is_owner": is_owner,
            }
        )
        course_reads.append(course_read)

    return course_reads


async def count_editable_courses(
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
    search_query: str | None = None,
) -> int:
    """Count courses the current user can edit in the platform."""
    if isinstance(current_user, AnonymousUser):
        return 0

    checker = PermissionChecker(db_session)
    granted = checker._get_or_load(current_user.id)

    has_broad_update = PermissionChecker._has_perm(
        granted, "course", "update", "all"
    ) or PermissionChecker._has_perm(granted, "course", "update", "platform")
    search_filter = _course_search_filter(search_query)

    if has_broad_update:
        query = select(func.count(Course.id.distinct()))
    else:
        has_own_update = PermissionChecker._has_perm(granted, "course", "update", "own")
        if not has_own_update:
            return 0

        is_active_author = (
            select(1)
            .select_from(ResourceAuthor)
            .where(
                ResourceAuthor.resource_uuid == Course.course_uuid,
                ResourceAuthor.user_id == current_user.id,
                ResourceAuthor.authorship_status == ResourceAuthorshipStatusEnum.ACTIVE,
            )
            .exists()
        )

        query = select(func.count(Course.id.distinct())).where(
            or_(
                Course.creator_id == current_user.id,
                is_active_author,
            )
        )

    if search_filter is not None:
        query = query.where(search_filter)

    return db_session.exec(query).one()


async def get_course_user_rights(
    request: Request,
    course_uuid: str,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
    checker: PermissionChecker | None = None,
) -> dict:
    """
    Get detailed user rights for a specific course.

    This function returns comprehensive rights information that can be used
    by the UI to enable/disable features based on user permissions.

    SECURITY NOTES:
    - Returns rights based on course ownership and user roles
    - Includes both course-level and content-level permissions
    - Safe to expose to UI as it only returns permission information
    """
    # Check if course exists
    course = _get_course_by_uuid(db_session, course_uuid)

    if not course:
        raise HTTPException(
            status_code=404,
            detail="Course not found",
        )

    # Initialize rights object
    rights = {
        "course_uuid": course.course_uuid,
        "user_id": current_user.id,
        "is_anonymous": current_user.id == 0,
        "permissions": {
            "read": False,
            "create": False,
            "update": False,
            "delete": False,
            "create_content": False,
            "update_content": False,
            "delete_content": False,
            "manage_contributors": False,
            "manage_access": False,
            "grade_assignments": False,
            "mark_activities_done": False,
            "create_certifications": False,
        },
        "ownership": {
            "is_owner": False,
            "is_creator": False,
            "is_maintainer": False,
            "is_contributor": False,
            "authorship_status": None,
        },
        "roles": {
            "is_admin": False,
            "is_maintainer_role": False,
            "is_instructor": False,
            "is_user": False,
        },
    }

    # Handle anonymous users
    if current_user.id == 0:
        # Anonymous users can only read public courses
        if course.public:
            rights["permissions"]["read"] = True
        return rights

    # Check course ownership
    statement = select(ResourceAuthor).where(
        ResourceAuthor.resource_uuid == course_uuid,
        ResourceAuthor.user_id == current_user.id,
    )
    resource_author = db_session.exec(statement).first()

    if resource_author:
        rights["ownership"]["authorship_status"] = resource_author.authorship_status

        if resource_author.authorship_status == ResourceAuthorshipStatusEnum.ACTIVE:
            if resource_author.authorship == ResourceAuthorshipEnum.CREATOR:
                rights["ownership"]["is_creator"] = True
                rights["ownership"]["is_owner"] = True
            elif resource_author.authorship == ResourceAuthorshipEnum.MAINTAINER:
                rights["ownership"]["is_maintainer"] = True
                rights["ownership"]["is_owner"] = True
            elif resource_author.authorship == ResourceAuthorshipEnum.CONTRIBUTOR:
                rights["ownership"]["is_contributor"] = True
                rights["ownership"]["is_owner"] = True

    # Check user roles
    if checker is None:
        checker = PermissionChecker(db_session)

    # Check admin/maintainer role (platform-level update/management)
    user_is_admin_or_maintainer = checker.check(current_user.id, "course:manage")

    if user_is_admin_or_maintainer:
        rights["roles"]["is_admin"] = True
        rights["roles"]["is_maintainer_role"] = True

    # Check instructor role (course-level update permission)
    is_owner_for_course = is_course_owner(db_session, current_user.id, course.course_uuid)
    user_has_instructor_role = checker.check(
        current_user.id,
        "course:update",
        resource_owner_id=course.creator_id,
        is_owner=is_owner_for_course,
    )

    if user_has_instructor_role:
        rights["roles"]["is_instructor"] = True

    # Check user role (basic permissions)
    user_has_basic_role = current_user.id != 0

    if user_has_basic_role:
        rights["roles"]["is_user"] = True

    # Determine permissions based on ownership and roles
    is_course_owner_flag = rights["ownership"]["is_owner"]
    is_admin = rights["roles"]["is_admin"]
    is_maintainer_role = rights["roles"]["is_maintainer_role"]
    is_instructor = rights["roles"]["is_instructor"]

    # Additional access checks: membership in UserGroups for this resource or authorship.
    has_user_permissions = False

    # If the user is an active resource author, grant access
    statement = select(ResourceAuthor).where(
        ResourceAuthor.resource_uuid == course_uuid,
        ResourceAuthor.user_id == current_user.id,
        ResourceAuthor.authorship_status == ResourceAuthorshipStatusEnum.ACTIVE,
    )
    if db_session.exec(statement).first():
        has_user_permissions = True
    else:
        # Check if the course is not protected by any UserGroupResource entry. If so,
        # authenticated users are allowed to access it.
        ugr_stmt = select(UserGroupResource).where(
            UserGroupResource.resource_uuid == course_uuid
        )
        ugr = db_session.exec(ugr_stmt).all()
        if not ugr:
            has_user_permissions = True
        else:
            # Otherwise check if the user is a member of any usergroup that grants access
            member_stmt = (
                select(UserGroupUser)
                .join(
                    UserGroupResource,
                    UserGroupUser.usergroup_id == UserGroupResource.usergroup_id,
                )
                .where(
                    UserGroupResource.resource_uuid == course_uuid,
                    UserGroupUser.user_id == current_user.id,
                )
            )
            if db_session.exec(member_stmt).first():
                has_user_permissions = True

    # READ permissions
    if (
        course.public
        or is_course_owner_flag
        or is_admin
        or is_maintainer_role
        or is_instructor
        or has_user_permissions
    ):
        rights["permissions"]["read"] = True
    is_instructor_or_admin_or_maintainer_role: bool = (
        is_instructor or is_admin or is_maintainer_role
    )
    # CREATE permissions (course creation)
    if is_instructor or is_admin or is_maintainer_role:
        rights["permissions"]["create"] = True

    # UPDATE permissions (course-level updates)
    if is_instructor_or_admin_or_maintainer_role:
        rights["permissions"]["update"] = True

    # DELETE permissions (course deletion)
    if is_instructor_or_admin_or_maintainer_role:
        rights["permissions"]["delete"] = True

    # CONTENT CREATION permissions (activities, assignments, chapters, etc.)
    if is_instructor_or_admin_or_maintainer_role:
        rights["permissions"]["create_content"] = True

    # CONTENT UPDATE permissions
    if is_instructor_or_admin_or_maintainer_role:
        rights["permissions"]["update_content"] = True

    # CONTENT DELETE permissions
    if is_instructor_or_admin_or_maintainer_role:
        rights["permissions"]["delete_content"] = True

    # CONTRIBUTOR MANAGEMENT permissions
    if is_instructor_or_admin_or_maintainer_role:
        rights["permissions"]["manage_contributors"] = True

    # ACCESS MANAGEMENT permissions (public, open_to_contributors)
    if (
        rights["ownership"]["is_creator"]
        or rights["ownership"]["is_maintainer"]
        or is_admin
        or is_maintainer_role
    ):
        rights["permissions"]["manage_access"] = True

    # GRADING permissions
    if is_instructor_or_admin_or_maintainer_role:
        rights["permissions"]["grade_assignments"] = True

    # ACTIVITY MARKING permissions
    if is_instructor_or_admin_or_maintainer_role:
        rights["permissions"]["mark_activities_done"] = True

    # CERTIFICATION permissions
    if is_instructor_or_admin_or_maintainer_role:
        rights["permissions"]["create_certifications"] = True

    return rights
