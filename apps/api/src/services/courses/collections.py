from datetime import datetime

from fastapi import HTTPException, Request, status
from sqlmodel import Session, select
from ulid import ULID

from src.db.collections import (
    Collection,
    CollectionCreate,
    CollectionRead,
    CollectionReadWithPermissions,
    CollectionUpdate,
)
from src.db.collections_courses import CollectionCourse
from src.db.courses.courses import Course
from src.db.users import AnonymousUser, PublicUser
from src.security.rbac import PermissionChecker
from src.services.courses._auth import require_course_permission

####################################################
# CRUD
####################################################


async def get_collection(
    request: Request,
    collection_uuid: str,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
    checker: PermissionChecker | None = None,
) -> CollectionReadWithPermissions:
    statement = select(Collection).where(Collection.collection_uuid == collection_uuid)
    collection = db_session.exec(statement).first()

    if not collection:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Collection does not exist"
        )

    if checker is None:
        checker = PermissionChecker(db_session)
    if not collection.public:
        checker.require(
            current_user.id,
            "collection:read",
            resource_owner_id=collection.creator_id,
        )

    # get courses in collection
    statement_all = (
        select(Course)
        .join(CollectionCourse)
        .where(CollectionCourse.collection_id == collection.id)
        .distinct()
    )

    statement_public = (
        select(Course)
        .join(CollectionCourse)
        .where(CollectionCourse.collection_id == collection.id, Course.public)
        .distinct()
    )
    if current_user.user_uuid == "user_anonymous":
        statement = statement_public
    else:
        statement = statement_all

    courses = list(db_session.exec(statement).all())

    can_update = (
        checker.check(
            current_user.id,
            "collection:update",
            resource_owner_id=collection.creator_id,
        )
        if current_user.id
        else False
    )
    can_delete = (
        checker.check(
            current_user.id,
            "collection:delete",
            resource_owner_id=collection.creator_id,
        )
        if current_user.id
        else False
    )
    is_owner = current_user.id is not None and collection.creator_id == current_user.id

    return CollectionReadWithPermissions(
        **collection.model_dump(),
        courses=courses,
        can_update=can_update,
        can_delete=can_delete,
        is_owner=is_owner,
    )


async def create_collection(
    request: Request,
    collection_object: CollectionCreate,
    current_user: PublicUser,
    db_session: Session,
    checker: PermissionChecker | None = None,
) -> CollectionRead:
    collection = Collection.model_validate(collection_object)

    # Since collections are platform-level resources, we need to check platform permissions
    # SECURITY: Check if user has permission to create collections on this platform
    # For now, we'll use the existing RBAC check but with proper platform context
    if checker is None:
        checker = PermissionChecker(db_session)
    checker.require(current_user.id, "collection:create")

    # Complete the collection object
    collection.collection_uuid = f"collection_{ULID()}"
    collection.creator_id = current_user.id  # Set creator
    collection.creation_date = str(datetime.now())
    collection.update_date = str(datetime.now())

    # Add collection to database
    db_session.add(collection)
    db_session.commit()
    db_session.refresh(collection)

    # SECURITY: Link courses to collection - ensure user has access to all courses being added
    if collection and collection_object.courses:
        # Batch-fetch all requested courses in a single query instead of one per course
        found_courses = db_session.exec(
            select(Course).where(Course.id.in_(collection_object.courses))
        ).all()

        if found_courses:
            # Permission check — verify access to each course individually
            try:
                for course in found_courses:
                    if not course.public:
                        require_course_permission(
                            "course:read", current_user, course, checker
                        )
            except HTTPException:
                raise HTTPException(
                    status_code=403,
                    detail="You don't have permission to add courses to this collection",
                )

            for course in found_courses:
                collection_course = CollectionCourse(
                    collection_id=int(collection.id),
                    course_id=course.id,
                    creation_date=str(datetime.now()),
                    update_date=str(datetime.now()),
                )
                db_session.add(collection_course)

    db_session.commit()
    db_session.refresh(collection)

    # Get courses once again
    statement = (
        select(Course)
        .join(CollectionCourse)
        .where(CollectionCourse.collection_id == collection.id)
        .distinct()
    )
    courses = list(db_session.exec(statement).all())

    collection = CollectionRead(**collection.model_dump(), courses=courses)

    return CollectionRead.model_validate(collection)


async def update_collection(
    request: Request,
    collection_object: CollectionUpdate,
    collection_uuid: str,
    current_user: PublicUser,
    db_session: Session,
    checker: PermissionChecker | None = None,
) -> CollectionRead:
    statement = select(Collection).where(Collection.collection_uuid == collection_uuid)
    collection = db_session.exec(statement).first()

    if not collection:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Collection does not exist"
        )

    # RBAC check
    if checker is None:
        checker = PermissionChecker(db_session)
    checker.require(
        current_user.id,
        "collection:update",
        resource_owner_id=collection.creator_id,
    )

    courses = collection_object.courses

    del collection_object.courses

    # Update only the fields that were passed in
    update_data = collection_object.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        if value is not None:
            setattr(collection, field, value)

    collection.update_date = str(datetime.now())

    statement = select(CollectionCourse).where(
        CollectionCourse.collection_id == collection.id
    )
    collection_courses = db_session.exec(statement).all()

    # Delete all collection_courses
    for collection_course in collection_courses:
        db_session.delete(collection_course)

    # Add new collection_courses
    for course in courses or []:
        collection_course = CollectionCourse(
            collection_id=int(collection.id),
            course_id=int(course),
            creation_date=str(datetime.now()),
            update_date=str(datetime.now()),
        )
        # Add collection_course to database
        db_session.add(collection_course)

    db_session.commit()
    db_session.refresh(collection)

    # Get courses once again
    statement = (
        select(Course)
        .join(CollectionCourse)
        .where(CollectionCourse.collection_id == collection.id)
        .distinct()
    )
    courses = list(db_session.exec(statement).all())

    return CollectionRead(**collection.model_dump(), courses=courses)


async def delete_collection(
    request: Request,
    collection_uuid: str,
    current_user: PublicUser,
    db_session: Session,
    checker: PermissionChecker | None = None,
):
    statement = select(Collection).where(Collection.collection_uuid == collection_uuid)
    collection = db_session.exec(statement).first()

    if not collection:
        raise HTTPException(
            status_code=404,
            detail="Collection not found",
        )

    # RBAC check
    if checker is None:
        checker = PermissionChecker(db_session)
    checker.require(
        current_user.id,
        "collection:delete",
        resource_owner_id=collection.creator_id,
    )

    # delete collection from database
    db_session.delete(collection)
    db_session.commit()

    return {"detail": "Collection deleted"}


####################################################
# Misc
####################################################


async def get_collections(
    request: Request,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
    page: int = 1,
    limit: int = 10,
    checker: PermissionChecker | None = None,
) -> list[CollectionReadWithPermissions]:

    statement_public = select(Collection).where(Collection.public)
    statement_all = select(Collection).distinct(Collection.id)

    statement = statement_public if current_user.id == 0 else statement_all

    collections = db_session.exec(statement).all()

    collections_with_courses = []
    if checker is None:
        checker = PermissionChecker(db_session)

    collection_ids = [c.id for c in collections]
    is_public_user = current_user.id == 0

    # Batch fetch all courses for all collections in one query
    if is_public_user:
        batch_stmt = (
            select(CollectionCourse, Course)
            .join(Course, CollectionCourse.course_id == Course.id)
            .where(CollectionCourse.collection_id.in_(collection_ids), Course.public)
            .distinct()
        )
    else:
        batch_stmt = (
            select(CollectionCourse, Course)
            .join(Course, CollectionCourse.course_id == Course.id)
            .where(CollectionCourse.collection_id.in_(collection_ids))
            .distinct()
        )

    courses_by_collection: dict[int, list] = {}
    for cc, course in db_session.exec(batch_stmt).all():
        courses_by_collection.setdefault(cc.collection_id, []).append(course)

    for collection in collections:
        courses = courses_by_collection.get(collection.id, [])

        can_update = (
            checker.check(
                current_user.id,
                "collection:update",
                resource_owner_id=collection.creator_id,
            )
            if current_user.id
            else False
        )
        can_delete = (
            checker.check(
                current_user.id,
                "collection:delete",
                resource_owner_id=collection.creator_id,
            )
            if current_user.id
            else False
        )
        is_owner = (
            current_user.id is not None and collection.creator_id == current_user.id
        )

        enriched = CollectionReadWithPermissions(
            **collection.model_dump(),
            courses=list(courses),
            can_update=can_update,
            can_delete=can_delete,
            is_owner=is_owner,
        )
        collections_with_courses.append(enriched)

    return collections_with_courses
