"""Assessment access management.

Access is deliberately course-scoped: a restricted assessment can only narrow
the set of learners that already have access to the parent course.
"""

from __future__ import annotations

from collections.abc import Sequence
from datetime import UTC, datetime
from typing import cast

from fastapi import HTTPException, status
from sqlmodel import Session, col, select

from src.db.assessment_access import (
    AssessmentAccessMode,
    AssessmentAccessPolicy,
    AssessmentAccessUser,
    AssessmentAccessUserGroup,
)
from src.db.assessments import (
    AssessmentAccessRead,
    AssessmentAccessUpdate,
    AssessmentAccessUserGroupRead,
    AssessmentAccessUserRead,
)
from src.db.usergroup_resources import UserGroupResource
from src.db.usergroup_user import UserGroupUser
from src.db.usergroups import UserGroup
from src.db.users import PublicUser, User
from src.services.assessments._helpers import (
    _get_activity_and_course,
    _get_assessment_by_uuid_or_404,
    _require_author,
)
from src.services.courses.access import user_has_course_access


async def get_assessment_access(
    assessment_uuid: str,
    current_user: PublicUser,
    db_session: Session,
) -> AssessmentAccessRead:
    assessment = _get_assessment_by_uuid_or_404(assessment_uuid, db_session)
    _activity, course = _get_activity_and_course(assessment, db_session)
    _require_author(current_user, course, db_session)
    return _build_access_read(assessment.id or 0, db_session)


async def update_assessment_access(
    assessment_uuid: str,
    payload: AssessmentAccessUpdate,
    current_user: PublicUser,
    db_session: Session,
) -> AssessmentAccessRead:
    assessment = _get_assessment_by_uuid_or_404(assessment_uuid, db_session)
    _activity, course = _get_activity_and_course(assessment, db_session)
    _require_author(current_user, course, db_session)

    user_ids = sorted(set(payload.user_ids))
    usergroup_ids = sorted(set(payload.usergroup_ids))

    if payload.mode == AssessmentAccessMode.RESTRICTED:
        invalid_user_ids = [user_id for user_id in user_ids if not user_has_course_access(user_id, course, db_session)]
        if invalid_user_ids:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail={
                    "code": "ACCESS_USER_NOT_IN_COURSE",
                    "user_ids": invalid_user_ids,
                },
            )

        eligible_group_ids = _eligible_usergroup_ids_for_course(course.course_uuid, db_session)
        invalid_group_ids = [group_id for group_id in usergroup_ids if group_id not in eligible_group_ids]
        if invalid_group_ids:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail={
                    "code": "ACCESS_GROUP_NOT_IN_COURSE",
                    "usergroup_ids": invalid_group_ids,
                },
            )

    policy = _get_or_create_access_policy(assessment.id or 0, db_session)
    policy.mode = payload.mode
    policy.updated_at = datetime.now(UTC)
    db_session.add(policy)
    db_session.flush()

    _replace_policy_users(
        policy.id or 0,
        user_ids if payload.mode == AssessmentAccessMode.RESTRICTED else [],
        db_session,
    )
    _replace_policy_usergroups(
        policy.id or 0,
        usergroup_ids if payload.mode == AssessmentAccessMode.RESTRICTED else [],
        db_session,
    )

    db_session.commit()
    return _build_access_read(assessment.id or 0, db_session)


async def list_assessment_access_eligible_users(
    assessment_uuid: str,
    current_user: PublicUser,
    db_session: Session,
) -> list[AssessmentAccessUserRead]:
    assessment = _get_assessment_by_uuid_or_404(assessment_uuid, db_session)
    _activity, course = _get_activity_and_course(assessment, db_session)
    _require_author(current_user, course, db_session)
    users = db_session.exec(select(User).where(User.is_active)).all()
    return [
        _user_read(user)
        for user in users
        if user.id is not None and user_has_course_access(user.id, course, db_session)
    ]


async def list_assessment_access_eligible_usergroups(
    assessment_uuid: str,
    current_user: PublicUser,
    db_session: Session,
) -> list[AssessmentAccessUserGroupRead]:
    assessment = _get_assessment_by_uuid_or_404(assessment_uuid, db_session)
    _activity, course = _get_activity_and_course(assessment, db_session)
    _require_author(current_user, course, db_session)
    eligible_ids = _eligible_usergroup_ids_for_course(course.course_uuid, db_session)
    if not eligible_ids:
        return []
    groups = db_session.exec(select(UserGroup).where(col(UserGroup.id).in_(eligible_ids))).all()
    return [_usergroup_read(group, db_session) for group in groups]


def _get_or_create_access_policy(
    assessment_id: int,
    db_session: Session,
) -> AssessmentAccessPolicy:
    policy = db_session.exec(
        select(AssessmentAccessPolicy).where(AssessmentAccessPolicy.assessment_id == assessment_id)
    ).first()
    if policy is not None:
        return policy
    now = datetime.now(UTC)
    policy = AssessmentAccessPolicy(
        assessment_id=assessment_id,
        mode=AssessmentAccessMode.ALL_COURSE_LEARNERS,
        created_at=now,
        updated_at=now,
    )
    db_session.add(policy)
    db_session.flush()
    return policy


def _replace_policy_users(
    policy_id: int,
    user_ids: list[int],
    db_session: Session,
) -> None:
    existing = db_session.exec(select(AssessmentAccessUser).where(AssessmentAccessUser.policy_id == policy_id)).all()
    for row in existing:
        db_session.delete(row)
    for user_id in user_ids:
        db_session.add(AssessmentAccessUser(policy_id=policy_id, user_id=user_id))


def _replace_policy_usergroups(
    policy_id: int,
    usergroup_ids: list[int],
    db_session: Session,
) -> None:
    existing = db_session.exec(
        select(AssessmentAccessUserGroup).where(AssessmentAccessUserGroup.policy_id == policy_id)
    ).all()
    for row in existing:
        db_session.delete(row)
    for usergroup_id in usergroup_ids:
        db_session.add(AssessmentAccessUserGroup(policy_id=policy_id, usergroup_id=usergroup_id))


def _build_access_read(
    assessment_id: int,
    db_session: Session,
) -> AssessmentAccessRead:
    policy = db_session.exec(
        select(AssessmentAccessPolicy).where(AssessmentAccessPolicy.assessment_id == assessment_id)
    ).first()
    if policy is None or policy.id is None:
        return AssessmentAccessRead(mode=AssessmentAccessMode.ALL_COURSE_LEARNERS)

    user_rows = db_session.exec(
        select(User)
        .join(AssessmentAccessUser, col(AssessmentAccessUser.user_id) == User.id)
        .where(AssessmentAccessUser.policy_id == policy.id)
    ).all()
    group_rows = db_session.exec(
        select(UserGroup)
        .join(
            AssessmentAccessUserGroup,
            col(AssessmentAccessUserGroup.usergroup_id) == UserGroup.id,
        )
        .where(AssessmentAccessUserGroup.policy_id == policy.id)
    ).all()

    effective_user_ids = {user.id for user in user_rows if user.id is not None}
    if group_rows:
        group_ids = [group.id for group in group_rows if group.id is not None]
        member_rows = db_session.exec(
            select(UserGroupUser.user_id).where(col(UserGroupUser.usergroup_id).in_(group_ids))
        ).all()
        effective_user_ids.update(member_rows)

    return AssessmentAccessRead(
        mode=policy.mode,
        users=[_user_read(user) for user in user_rows],
        usergroups=[_usergroup_read(group, db_session) for group in group_rows],
        effective_user_count=len(effective_user_ids),
    )


def _eligible_usergroup_ids_for_course(
    course_uuid: str,
    db_session: Session,
) -> set[int]:
    linked_group_ids = set(
        db_session.exec(
            select(UserGroupResource.usergroup_id).where(UserGroupResource.resource_uuid == course_uuid)
        ).all()
    )
    if linked_group_ids:
        return linked_group_ids
    return set(cast("Sequence[int]", db_session.exec(select(UserGroup.id)).all()))


def _user_read(user: User) -> AssessmentAccessUserRead:
    return AssessmentAccessUserRead(
        id=user.id or 0,
        user_uuid=user.user_uuid,
        username=user.username,
        first_name=user.first_name,
        last_name=user.last_name,
        email=user.email,
    )


def _usergroup_read(
    group: UserGroup,
    db_session: Session,
) -> AssessmentAccessUserGroupRead:
    member_count = db_session.exec(select(UserGroupUser.id).where(UserGroupUser.usergroup_id == group.id)).all()
    return AssessmentAccessUserGroupRead(
        id=group.id or 0,
        usergroup_uuid=group.usergroup_uuid,
        name=group.name,
        description=group.description,
        member_count=len(member_count),
    )
