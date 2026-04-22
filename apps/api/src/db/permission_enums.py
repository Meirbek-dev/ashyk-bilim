"""
Permission Enums - single source of truth for RBAC definitions.
"""

from enum import StrEnum


class Action(StrEnum):
    """Actions that can be performed on resources."""

    CREATE = "create"
    READ = "read"
    UPDATE = "update"
    DELETE = "delete"
    MANAGE = "manage"
    MODERATE = "moderate"
    EXPORT = "export"
    GRADE = "grade"
    SUBMIT = "submit"
    ENROLL = "enroll"


class ResourceType(StrEnum):
    """Types of resources in the system."""

    PLATFORM = "platform"
    COURSE = "course"
    CHAPTER = "chapter"
    ACTIVITY = "activity"
    ASSIGNMENT = "assignment"
    QUIZ = "quiz"
    USER = "user"
    USERGROUP = "usergroup"
    COLLECTION = "collection"
    ROLE = "role"
    CERTIFICATE = "certificate"
    DISCUSSION = "discussion"
    FILE = "file"
    ANALYTICS = "analytics"
    TRAIL = "trail"
    EXAM = "exam"
    API_TOKEN = "api_token"


class Scope(StrEnum):
    """Scope of a permission."""

    ALL = "all"
    OWN = "own"
    ASSIGNED = "assigned"
    PLATFORM = "platform"


class RoleSlug(StrEnum):
    """Standard role slugs."""

    ADMIN = "admin"
    MAINTAINER = "maintainer"
    INSTRUCTOR = "instructor"
    MODERATOR = "moderator"
    USER = "user"
    GUEST = "guest"


# ============================================================================
# System role definitions - what each built-in role can do
# ============================================================================

SYSTEM_ROLES: dict[str, dict] = {
    RoleSlug.ADMIN: {
        "name": "Администратор",
        "description": "Администратор платформы с полным доступом к системе",
        "priority": 100,
        "permissions": ["*:*:*"],
    },
    RoleSlug.MAINTAINER: {
        "name": "Куратор",
        "description": "Куратор курсов с расширенными правами на контент",
        "priority": 70,
        "permissions": [
            "course:create:platform",
            "course:read:all",
            "course:update:platform",
            "course:delete:own",
            "course:manage:own",
            "chapter:*:platform",
            "activity:*:platform",
            "assignment:*:platform",
            "quiz:*:platform",
            "exam:*:platform",
            "collection:create:platform",
            "collection:read:all",
            "collection:update:own",
            "collection:delete:own",
            "discussion:moderate:platform",
            "analytics:read:platform",
            "certificate:create:own",
            "certificate:read:own",
        ],
    },
    RoleSlug.INSTRUCTOR: {
        "name": "Преподаватель",
        "description": "Преподаватель с возможностью создавать контент",
        "priority": 50,
        "permissions": [
            "course:create:platform",
            "course:read:all",
            "course:update:own",
            "course:manage:own",
            "course:delete:own",
            "chapter:create:own",
            "chapter:read:all",
            "chapter:update:own",
            "chapter:delete:own",
            "activity:create:own",
            "activity:read:all",
            "activity:update:own",
            "activity:delete:own",
            "assignment:*:own",
            "assignment:read:assigned",
            "assignment:grade:own",
            "quiz:*:own",
            "quiz:read:assigned",
            "quiz:grade:own",
            "exam:*:own",
            "exam:read:assigned",
            "exam:grade:own",
            "collection:create:platform",
            "collection:read:all",
            "collection:update:own",
            "collection:delete:own",
            "collection:manage:own",
            "discussion:create:platform",
            "discussion:read:all",
            "discussion:update:own",
            "discussion:delete:own",
            "discussion:moderate:own",
            "analytics:read:assigned",
            "analytics:export:assigned",
            "user:read:platform",
            "user:read:own",
            "user:update:own",
            "usergroup:create:platform",
            "usergroup:read:platform",
            "usergroup:update:own",
            "usergroup:delete:own",
            "usergroup:manage:own",
            "trail:create:own",
            "trail:read:all",
            "trail:update:own",
            "trail:delete:own",
            "certificate:create:platform",
            "certificate:read:own",
            "certificate:update:own",
            "certificate:delete:own",
            "file:create:own",
            "file:read:all",
            "file:delete:own",
        ],
    },
    RoleSlug.MODERATOR: {
        "name": "Модератор",
        "description": "Модератор контента и обсуждений",
        "priority": 40,
        "permissions": [
            "course:read:all",
            "discussion:moderate:platform",
            "discussion:read:all",
            "discussion:update:platform",
            "discussion:delete:platform",
            "user:read:platform",
        ],
    },
    RoleSlug.USER: {
        "name": "Пользователь",
        "description": "Пользователь с базовым доступом",
        "priority": 10,
        "permissions": [
            "course:read:all",
            "course:enroll:all",
            "chapter:read:all",
            "activity:read:all",
            "assignment:submit:assigned",
            "assignment:read:assigned",
            "quiz:submit:assigned",
            "quiz:read:assigned",
            "exam:submit:assigned",
            "exam:read:assigned",
            "collection:read:all",
            "discussion:create:platform",
            "discussion:read:all",
            "discussion:update:own",
            "discussion:delete:own",
            "user:read:platform",
            "user:read:own",
            "user:update:own",
            "usergroup:read:assigned",
            "trail:read:all",
            "trail:submit:assigned",
            "certificate:read:own",
            "file:create:own",
            "file:read:own",
            "file:delete:own",
        ],
    },
    RoleSlug.GUEST: {
        "name": "Гость",
        "description": "Неавторизованный пользователь с доступом к публичному контенту",
        "priority": 0,
        "permissions": [
            "course:read:all",
            "chapter:read:all",
            "activity:read:all",
            "collection:read:all",
            "discussion:read:all",
            "trail:read:all",
            "user:read:platform",
        ],
    },
}


# ============================================================================
# Role group helpers
# ============================================================================

ADMIN_ROLE_SLUGS = frozenset({RoleSlug.ADMIN})
