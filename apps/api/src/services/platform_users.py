import logging
from collections import defaultdict

from fastapi import HTTPException, Request
from sqlmodel import Session, select

from src.db.permission_enums import ADMIN_ROLE_SLUGS
from src.db.permissions import Role, RoleRead, UserRole
from src.db.platform import PaginatedPlatformUsers, PlatformUser
from src.db.users import AnonymousUser, PublicUser, User, UserRead
from src.security.rbac import PermissionChecker

logger = logging.getLogger(__name__)


def get_platform_users(
    request: Request,
    db_session: Session,
    current_user: PublicUser | AnonymousUser,
    checker: PermissionChecker,
    page: int = 1,
    per_page: int = 20,
) -> PaginatedPlatformUsers:
    checker.require(current_user.id, "platform:read")

    base_statement = (
        select(User).join(UserRole, UserRole.user_id == User.id).distinct(User.id)
    )

    all_user_ids = db_session.exec(
        select(User.id).join(UserRole, UserRole.user_id == User.id).distinct()
    ).all()
    total = len(all_user_ids)

    offset = (page - 1) * per_page
    paginated_statement = base_statement.offset(offset).limit(per_page)
    users = db_session.exec(paginated_statement).all()

    platform_users_list = []

    user_ids = [u.id for u in users]
    roles_by_user: dict[int, list] = defaultdict(list)
    if user_ids:
        all_role_rows = db_session.exec(
            select(Role, UserRole)
            .join(UserRole, UserRole.role_id == Role.id)
            .where(UserRole.user_id.in_(user_ids))
        ).all()
        for role, user_role in all_role_rows:
            roles_by_user[user_role.user_id].append(role)

    for user in users:
        user_roles = roles_by_user.get(user.id, [])

        if not user_roles:
            logger.warning("No roles found for user %s in platform", user.id)
            continue

        role = user_roles[0]

        user_read = UserRead.model_validate(user)
        role_read = RoleRead.model_validate(role)

        platform_users_list.append(
            PlatformUser(
                user=user_read,
                role=role_read,
            )
        )

    total_pages = (total + per_page - 1) // per_page if total > 0 else 1

    return PaginatedPlatformUsers(
        users=platform_users_list,
        total=total,
        page=page,
        per_page=per_page,
        total_pages=total_pages,
    )


def remove_platform_user(
    request: Request,
    user_id: int,
    db_session: Session,
    current_user: PublicUser | AnonymousUser,
    checker: PermissionChecker,
):
    checker.require(current_user.id, "platform:manage")

    statement = select(UserRole).where(UserRole.user_id == user_id)
    result = db_session.exec(statement)

    user_roles = result.all()

    if not user_roles:
        raise HTTPException(
            status_code=404,
            detail="User not found",
        )

    admin_role = db_session.exec(
        select(Role).where(Role.slug.in_(list(ADMIN_ROLE_SLUGS)))
    ).first()
    admin_role_id = admin_role.id if admin_role else 1

    statement = select(UserRole).where(UserRole.role_id == admin_role_id).distinct()
    result = db_session.exec(statement)
    admin_roles = result.all()

    admin_user_ids = {role.user_id for role in admin_roles}

    if len(admin_user_ids) == 1 and user_id in admin_user_ids:
        raise HTTPException(
            status_code=400,
            detail="You can't remove the last admin of the platform",
        )

    for role in user_roles:
        db_session.delete(role)
    db_session.commit()

    return {"detail": "User removed from platform"}


def update_platform_user_role(
    request: Request,
    user_id: int,
    role_id: int,
    db_session: Session,
    current_user: PublicUser | AnonymousUser,
    checker: PermissionChecker,
):
    role = db_session.get(Role, role_id)
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")

    checker.require(current_user.id, "platform:update")

    admin_role = db_session.exec(
        select(Role).where(Role.slug.in_(list(ADMIN_ROLE_SLUGS)))
    ).first()
    admin_role_id = admin_role.id if admin_role else 1

    admin_user_ids = {
        ur.user_id
        for ur in db_session.exec(
            select(UserRole).where(UserRole.role_id == admin_role_id)
        ).all()
    }
    if not admin_user_ids:
        raise HTTPException(status_code=400, detail="There is no admin in the platform")

    if (
        len(admin_user_ids) == 1
        and user_id in admin_user_ids
        and role.slug not in ADMIN_ROLE_SLUGS
    ):
        raise HTTPException(
            status_code=400, detail="Platform must have at least one admin"
        )

    existing_roles = db_session.exec(
        select(UserRole).where(UserRole.user_id == user_id)
    ).all()
    if not existing_roles:
        raise HTTPException(status_code=404, detail="User not found")

    for user_role in existing_roles:
        db_session.delete(user_role)
    db_session.flush()

    checker.assign_role(user_id=user_id, role_id=role.id)
    db_session.commit()

    return {"detail": "User role updated"}
