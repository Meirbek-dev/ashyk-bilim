from fastapi import APIRouter, Depends

from src.routers import (
    analytics,
    auth,
    dev,
    gamification,
    health,
    platform,
    rbac,
    roles,
    search,
    trail,
    usergroups,
    users,
)
from src.routers.ai import ai
from src.routers.courses import (
    assignments,
    certifications,
    chapters,
    code_challenges,
    collections,
    courses,
    discussions,
    exams,
)
from src.routers.courses.activities import activities, blocks
from src.routers.grading.submit import router as grading_submit_router
from src.routers.grading.teacher import router as grading_teacher_router
from src.routers.uploads import chunked_upload
from src.routers.utils import router as utils_router
from src.services.dev.dev import isDevModeEnabledOrRaise

from src.auth.users import fastapi_users, auth_backend

v1_router = APIRouter(prefix="/api/v1")

# Auth domains
v1_router.include_router(
    fastapi_users.get_auth_router(auth_backend),
    prefix="/auth",
    tags=["auth"],
)
v1_router.include_router(
    fastapi_users.get_reset_password_router(),
    prefix="/auth",
    tags=["auth"],
)
from src.db.users import UserCreate, UserRead
v1_router.include_router(
    fastapi_users.get_register_router(UserRead, UserCreate),
    prefix="/auth",
    tags=["auth"],
)

# Core domain routes
v1_router.include_router(users.router, prefix="/users", tags=["users"])
v1_router.include_router(usergroups.router, prefix="/usergroups", tags=["usergroups"])
v1_router.include_router(auth.router, prefix="/auth", tags=["auth"])
v1_router.include_router(platform.router, prefix="", tags=["platform"])
v1_router.include_router(roles.router, prefix="/roles", tags=["roles"])
v1_router.include_router(rbac.router, prefix="/rbac", tags=["rbac"])
v1_router.include_router(search.router, prefix="/search", tags=["search"])
v1_router.include_router(health.router, prefix="/health", tags=["health"])
v1_router.include_router(utils_router, prefix="/utils", tags=["utils"])
v1_router.include_router(chunked_upload.router, prefix="/uploads", tags=["uploads"])

# Learning domain
v1_router.include_router(blocks.router, prefix="/blocks", tags=["blocks"])
v1_router.include_router(courses.router, prefix="/courses", tags=["courses"])
v1_router.include_router(discussions.router, prefix="/courses", tags=["discussions"])
v1_router.include_router(chapters.router, prefix="/chapters", tags=["chapters"])
v1_router.include_router(activities.router, prefix="/activities", tags=["activities"])
v1_router.include_router(
    assignments.router, prefix="/assignments", tags=["assignments"]
)
v1_router.include_router(exams.router, prefix="/exams", tags=["exams"])
v1_router.include_router(
    code_challenges.router, prefix="/code-challenges", tags=["code-challenges"]
)
v1_router.include_router(
    certifications.router, prefix="/certifications", tags=["certifications"]
)
v1_router.include_router(
    collections.router, prefix="/collections", tags=["collections"]
)
v1_router.include_router(trail.router, prefix="/trail", tags=["trail"])

# Gamification
v1_router.include_router(
    gamification.router,
    prefix="/gamification",
    tags=["gamification"],
)
v1_router.include_router(analytics.router, prefix="/analytics", tags=["analytics"])

# Unified grading system (replaces fragmented assignment/quiz grading)
v1_router.include_router(grading_submit_router, prefix="/grading", tags=["grading"])
v1_router.include_router(grading_teacher_router, prefix="/grading", tags=["grading"])

v1_router.include_router(ai.router, prefix="/ai", tags=["ai"])

# Dev routes
v1_router.include_router(
    dev.router,
    prefix="/dev",
    tags=["dev"],
    dependencies=[Depends(isDevModeEnabledOrRaise)],
)

__all__ = ["v1_router"]
