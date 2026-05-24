from typing import TypeVar

from fastapi import Request
from sqlalchemy import func
from sqlalchemy import true as sa_true
from sqlmodel import Session, and_, or_, select

from src.db.collections import Collection, CollectionRead
from src.db.collections_courses import CollectionCourse
from src.db.courses.courses import Course, CourseRead
from src.db.permissions import UserRole
from src.db.strict_base_model import PydanticStrictBaseModel
from src.db.users import AnonymousUser, PublicUser, User, UserRead
from src.services.courses.courses import search_courses

T = TypeVar("T")


class SearchResult(PydanticStrictBaseModel):
    courses: list[CourseRead]
    collections: list[CollectionRead]
    users: list[UserRead]


async def search_platform_content(
    request: Request,
    current_user: PublicUser | AnonymousUser,
    search_query: str,
    db_session: Session,
    page: int = 1,
    limit: int = 10,
) -> SearchResult:
    """
    Search across courses, collections and users within the platform
    """
    offset = (page - 1) * limit
    normalized_query = search_query.strip()

    # Search courses using existing search_courses function
    courses = await search_courses(
        request, current_user, search_query, db_session, page, limit
    )

    dialect_name = db_session.bind.dialect.name

    # Search collections
    if dialect_name == "postgresql":
        vector = func.to_tsvector(
            "english",
            func.coalesce(Collection.name, "")
            + " "
            + func.coalesce(Collection.description, ""),
        )
        query = func.websearch_to_tsquery("english", normalized_query)
        collections_query = (
            select(Collection)
            .where(vector.op("@@")(query))
            .order_by(
                func.ts_rank_cd(vector, query).desc(),
                Collection.id.desc(),
            )
        )
    else:
        pattern = f"%{normalized_query}%"
        collections_query = (
            select(Collection)
            .where(
                or_(Collection.name.ilike(pattern), Collection.description.ilike(pattern))
            )
        )

    # Search users
    if dialect_name == "postgresql":
        vector = func.to_tsvector(
            "english",
            func.coalesce(User.username, "")
            + " "
            + func.coalesce(User.first_name, "")
            + " "
            + func.coalesce(User.last_name, "")
            + " "
            + func.coalesce(User.bio, ""),
        )
        query = func.websearch_to_tsquery("english", normalized_query)
        users_query = (
            select(User)
            .where(User.id.in_(select(UserRole.user_id)))
            .where(vector.op("@@")(query))
            .order_by(
                func.ts_rank_cd(vector, query).desc(),
                User.id.desc(),
            )
        )
    else:
        pattern = f"%{normalized_query}%"
        users_query = (
            select(User)
            .where(User.id.in_(select(UserRole.user_id)))
            .where(
                or_(
                    User.username.ilike(pattern),
                    User.first_name.ilike(pattern),
                    User.last_name.ilike(pattern),
                    User.bio.ilike(pattern),
                )
            )
        )

    if isinstance(current_user, AnonymousUser):
        # For anonymous users, only show public collections
        collections_query = collections_query.where(Collection.public == sa_true())
    else:
        # For authenticated users, all collections are platform-wide.
        collections_query = collections_query.where(sa_true())

    # Apply pagination to queries
    collections = db_session.exec(collections_query.offset(offset).limit(limit)).all()
    users = db_session.exec(users_query.offset(offset).limit(limit)).all()

    # Convert collections to CollectionRead objects with courses
    collection_reads = []
    if collections:
        collection_ids = [c.id for c in collections]
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
            collection_read = CollectionRead.model_validate({
                **collection.model_dump(),
                "courses": courses_by_collection.get(collection.id, []),
            })
            collection_reads.append(collection_read)

    # Convert users to UserRead objects
    user_reads = [UserRead.model_validate(user) for user in users]

    return SearchResult(courses=courses, collections=collection_reads, users=user_reads)
