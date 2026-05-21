import logging
from datetime import datetime
from typing import Literal

from fastapi import HTTPException, Request
from sqlmodel import Session, select
from ulid import ULID

from src.db.usergroup_resources import UserGroupResource
from src.db.usergroup_user import UserGroupUser
from src.db.usergroups import UserGroup, UserGroupCreate, UserGroupRead, UserGroupUpdate
from src.db.users import AnonymousUser, InternalUser, PublicUser, User, UserRead
from src.security.rbac import PermissionChecker

logger = logging.getLogger(__name__)


async def create_usergroup(
    request: Request,
    db_session: Session,
    current_user: PublicUser | AnonymousUser,
    usergroup_create: UserGroupCreate,
    checker: PermissionChecker | None = None,
) -> UserGroupRead:
    usergroup = UserGroup.model_validate(usergroup_create)

    # RBAC check
    if checker is None:
        checker = PermissionChecker(db_session)
    checker.require(current_user.id, "usergroup:create")

    # Complete the object
    usergroup.usergroup_uuid = f"usergroup_{ULID()}"
    usergroup.creation_date = str(datetime.now())
    usergroup.update_date = str(datetime.now())
    usergroup.creator_id = current_user.id

    # Save the object
    db_session.add(usergroup)
    db_session.commit()
    db_session.refresh(usergroup)

    return UserGroupRead.model_validate(usergroup)


async def read_usergroup_by_id(
    request: Request,
    db_session: Session,
    current_user: PublicUser | AnonymousUser,
    usergroup_id: int,
    checker: PermissionChecker | None = None,
) -> UserGroupRead:
    statement = select(UserGroup).where(UserGroup.id == usergroup_id)
    usergroup = db_session.exec(statement).first()

    if not usergroup:
        raise HTTPException(
            status_code=404,
            detail="UserGroup not found",
        )

    # RBAC check
    if checker is None:
        checker = PermissionChecker(db_session)
    checker.require(
        current_user.id,
        "usergroup:read",
        resource_owner_id=usergroup.creator_id,
    )

    return UserGroupRead.model_validate(usergroup)


async def get_users_linked_to_usergroup(
    request: Request,
    db_session: Session,
    current_user: PublicUser | AnonymousUser,
    usergroup_id: int,
    checker: PermissionChecker | None = None,
) -> list[UserRead]:
    statement = select(UserGroup).where(UserGroup.id == usergroup_id)
    usergroup = db_session.exec(statement).first()

    if not usergroup:
        raise HTTPException(
            status_code=404,
            detail="UserGroup not found",
        )

    # RBAC check
    if checker is None:
        checker = PermissionChecker(db_session)
    checker.require(
        current_user.id,
        "usergroup:read",
        resource_owner_id=usergroup.creator_id,
    )

    statement = select(UserGroupUser).where(UserGroupUser.usergroup_id == usergroup_id)
    usergroup_users = db_session.exec(statement).all()

    user_ids = [usergroup_user.user_id for usergroup_user in usergroup_users]

    if not user_ids:
        return []

    users = db_session.exec(select(User).where(User.id.in_(user_ids))).all()

    return [UserRead.model_validate(user) for user in users]


async def read_usergroups(
    request: Request,
    db_session: Session,
    current_user: PublicUser | AnonymousUser,
    checker: PermissionChecker | None = None,
) -> list[UserGroupRead]:
    statement = select(UserGroup)
    usergroups = db_session.exec(statement).all()

    # RBAC check
    if checker is None:
        checker = PermissionChecker(db_session)
    checker.require(current_user.id, "usergroup:read")

    return [UserGroupRead.model_validate(usergroup) for usergroup in usergroups]


async def get_usergroups_by_resource(
    request: Request,
    db_session: Session,
    current_user: PublicUser | AnonymousUser,
    resource_uuid: str,
    checker: PermissionChecker | None = None,
) -> list[UserGroupRead]:
    statement = select(UserGroupResource).where(
        UserGroupResource.resource_uuid == resource_uuid
    )
    usergroup_resources = db_session.exec(statement).all()

    # RBAC check
    if checker is None:
        checker = PermissionChecker(db_session)
    checker.require(current_user.id, "usergroup:read")

    usergroup_ids = [usergroup.usergroup_id for usergroup in usergroup_resources]

    if not usergroup_ids:
        return []

    usergroups = db_session.exec(
        select(UserGroup).where(UserGroup.id.in_(usergroup_ids))
    ).all()

    return [UserGroupRead.model_validate(usergroup) for usergroup in usergroups]


async def update_usergroup_by_id(
    request: Request,
    db_session: Session,
    current_user: PublicUser | AnonymousUser,
    usergroup_id: int,
    usergroup_update: UserGroupUpdate,
    checker: PermissionChecker | None = None,
) -> UserGroupRead:
    statement = select(UserGroup).where(UserGroup.id == usergroup_id)
    usergroup = db_session.exec(statement).first()

    if not usergroup:
        raise HTTPException(
            status_code=404,
            detail="UserGroup not found",
        )

    # RBAC check
    if checker is None:
        checker = PermissionChecker(db_session)
    checker.require(
        current_user.id,
        "usergroup:update",
        resource_owner_id=usergroup.creator_id,
    )

    usergroup.name = usergroup_update.name
    usergroup.description = usergroup_update.description
    usergroup.update_date = str(datetime.now())

    db_session.add(usergroup)
    db_session.commit()
    db_session.refresh(usergroup)

    return UserGroupRead.model_validate(usergroup)


async def delete_usergroup_by_id(
    request: Request,
    db_session: Session,
    current_user: PublicUser | AnonymousUser,
    usergroup_id: int,
    checker: PermissionChecker | None = None,
) -> str:
    statement = select(UserGroup).where(UserGroup.id == usergroup_id)
    usergroup = db_session.exec(statement).first()

    if not usergroup:
        raise HTTPException(
            status_code=404,
            detail="UserGroup not found",
        )

    # RBAC check
    if checker is None:
        checker = PermissionChecker(db_session)
    checker.require(
        current_user.id,
        "usergroup:delete",
        resource_owner_id=usergroup.creator_id,
    )

    db_session.delete(usergroup)
    db_session.commit()

    return "UserGroup deleted successfully"


async def add_users_to_usergroup(
    request: Request,
    db_session: Session,
    current_user: PublicUser | AnonymousUser | InternalUser,
    usergroup_id: int,
    user_ids: str,
    checker: PermissionChecker | None = None,
) -> str:
    statement = select(UserGroup).where(UserGroup.id == usergroup_id)
    usergroup = db_session.exec(statement).first()

    if not usergroup:
        raise HTTPException(
            status_code=404,
            detail="UserGroup not found",
        )

    # RBAC check
    if checker is None:
        checker = PermissionChecker(db_session)
    checker.require(
        current_user.id,
        "usergroup:manage",
        resource_owner_id=usergroup.creator_id,
    )

    user_ids_array = user_ids.split(",")

    # Parse valid integer IDs
    parsed_ids: list[int] = []
    for user_id_str in user_ids_array:
        try:
            parsed_ids.append(int(user_id_str.strip()))
        except ValueError:
            logger.exception("Invalid user_id format: %s", user_id_str)

    if not parsed_ids:
        return "Users added to UserGroup successfully"

    # Batch fetch all users and existing memberships in 2 queries
    users_map = {
        u.id: u
        for u in db_session.exec(select(User).where(User.id.in_(parsed_ids))).all()
    }
    existing_user_ids = {
        ugu.user_id
        for ugu in db_session.exec(
            select(UserGroupUser).where(
                UserGroupUser.usergroup_id == usergroup_id,
                UserGroupUser.user_id.in_(parsed_ids),
            )
        ).all()
    }

    current_time = str(datetime.now())
    new_entries = []
    for user_id in parsed_ids:
        if user_id in existing_user_ids:
            logger.error("User with id %s already exists in UserGroup", user_id)
            continue

        user = users_map.get(user_id)
        if user and user.id is not None:
            new_entries.append(
                UserGroupUser(
                    usergroup_id=usergroup_id,
                    user_id=user.id,
                    creation_date=current_time,
                    update_date=current_time,
                )
            )
        else:
            logger.error("User with id %s not found", user_id)

    if new_entries:
        db_session.add_all(new_entries)
        db_session.commit()

    return "Users added to UserGroup successfully"


async def remove_users_from_usergroup(
    request: Request,
    db_session: Session,
    current_user: PublicUser | AnonymousUser,
    usergroup_id: int,
    user_ids: str,
    checker: PermissionChecker | None = None,
) -> str:
    statement = select(UserGroup).where(UserGroup.id == usergroup_id)
    usergroup = db_session.exec(statement).first()

    if not usergroup:
        raise HTTPException(
            status_code=404,
            detail="UserGroup not found",
        )

    # RBAC check
    if checker is None:
        checker = PermissionChecker(db_session)
    checker.require(
        current_user.id,
        "usergroup:manage",
        resource_owner_id=usergroup.creator_id,
    )

    user_ids_array = user_ids.split(",")

    # Parse valid integer IDs
    parsed_ids: list[int] = []
    for user_id_str in user_ids_array:
        try:
            parsed_ids.append(int(user_id_str.strip()))
        except ValueError:
            logger.exception("Invalid user_id format: %s", user_id_str)

    # Batch fetch all memberships in one query
    usergroup_users = db_session.exec(
        select(UserGroupUser).where(
            UserGroupUser.user_id.in_(parsed_ids),
            UserGroupUser.usergroup_id == usergroup_id,
        )
    ).all()

    found_user_ids = {ugu.user_id for ugu in usergroup_users}
    for user_id in parsed_ids:
        if user_id not in found_user_ids:
            logger.error("User with id %s not found in UserGroup", user_id)

    for usergroup_user in usergroup_users:
        db_session.delete(usergroup_user)
    if usergroup_users:
        db_session.commit()

    return "Users removed from UserGroup successfully"


async def add_resources_to_usergroup(
    request: Request,
    db_session: Session,
    current_user: PublicUser | AnonymousUser,
    usergroup_id: int,
    resources_uuids: str,
    checker: PermissionChecker | None = None,
) -> str:
    statement = select(UserGroup).where(UserGroup.id == usergroup_id)
    usergroup = db_session.exec(statement).first()

    if not usergroup:
        raise HTTPException(
            status_code=404,
            detail="UserGroup not found",
        )

    # RBAC check
    if checker is None:
        checker = PermissionChecker(db_session)
    checker.require(
        current_user.id,
        "usergroup:manage",
        resource_owner_id=usergroup.creator_id,
    )

    resources_uuids_array = resources_uuids.split(",")

    # Batch fetch all existing resource links in one query
    existing_uuids = {
        ugr.resource_uuid
        for ugr in db_session.exec(
            select(UserGroupResource).where(
                UserGroupResource.usergroup_id == usergroup_id,
                UserGroupResource.resource_uuid.in_(resources_uuids_array),
            )
        ).all()
    }

    current_time = str(datetime.now())
    new_entries = []
    for resource_uuid in resources_uuids_array:
        if resource_uuid in existing_uuids:
            logger.error("Resource %s already exists in UserGroup", resource_uuid)
            continue

        # TODO : Find a way to check if resource really exists
        new_entries.append(
            UserGroupResource(
                usergroup_id=usergroup_id,
                resource_uuid=resource_uuid,
                creation_date=current_time,
                update_date=current_time,
            )
        )

    if new_entries:
        for entry in new_entries:
            db_session.add(entry)
        db_session.commit()

    return "Resources added to UserGroup successfully"


async def remove_resources_from_usergroup(
    request: Request,
    db_session: Session,
    current_user: PublicUser | AnonymousUser,
    usergroup_id: int,
    resources_uuids: str,
    checker: PermissionChecker | None = None,
) -> str:
    statement = select(UserGroup).where(UserGroup.id == usergroup_id)
    usergroup = db_session.exec(statement).first()

    if not usergroup:
        raise HTTPException(
            status_code=404,
            detail="UserGroup not found",
        )

    # RBAC check
    if checker is None:
        checker = PermissionChecker(db_session)
    checker.require(
        current_user.id,
        "usergroup:manage",
        resource_owner_id=usergroup.creator_id,
    )

    resources_uuids_array = resources_uuids.split(",")

    # Batch fetch all matching resource links in one query
    usergroup_resources = db_session.exec(
        select(UserGroupResource).where(
            UserGroupResource.resource_uuid.in_(resources_uuids_array)
        )
    ).all()

    found_uuids = {ugr.resource_uuid for ugr in usergroup_resources}
    for resource_uuid in resources_uuids_array:
        if resource_uuid not in found_uuids:
            logger.error("resource with uuid %s not found in UserGroup", resource_uuid)

    for usergroup_resource in usergroup_resources:
        db_session.delete(usergroup_resource)
    if usergroup_resources:
        db_session.commit()

    return "Resources removed from UserGroup successfully"
