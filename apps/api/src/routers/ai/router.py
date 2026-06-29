from fastapi import APIRouter

from src.routers.ai import (
    course_analysis,
    course_qa,
    lecture_authoring,
    remediation,
    runs,
    study_companion,
    submission_analysis,
    token_usage,
)

router = APIRouter()
router.include_router(course_analysis.router)
router.include_router(submission_analysis.router)
router.include_router(remediation.router)
router.include_router(study_companion.router)
router.include_router(lecture_authoring.router)
router.include_router(course_qa.router)
router.include_router(token_usage.router)
router.include_router(runs.router)

__all__ = ["router"]
