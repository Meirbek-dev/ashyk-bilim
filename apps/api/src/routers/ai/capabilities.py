from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query
from sqlmodel import Session, or_, select
from sqlmodel.sql.expression import SelectOfScalar

from config.config import get_settings
from src.auth.users import get_public_user
from src.db.courses.activities import Activity, ActivityTypeEnum
from src.db.strict_base_model import PydanticStrictBaseModel
from src.db.users import PublicUser
from src.infra.db.session import get_db_session
from src.services.ai.policy import derive_course_ai_role
from src.services.courses.courses import _get_course_by_uuid  # pyright: ignore[reportPrivateUsage]

router = APIRouter(prefix="/capabilities")

AIUserRole = Literal["student", "teacher", "author", "admin"]
AIContextVisibility = Literal["student", "teacher", "admin"]
AISurface = Literal["student-activity", "teacher-studio", "teacher-review", "course-page", "admin"]


class AIFeatureCapability(PydanticStrictBaseModel):
    key: str
    enabled: bool
    reason: str | None = None


class AIScopeCapabilityRead(PydanticStrictBaseModel):
    available: bool
    role: AIUserRole
    surface: AISurface
    context_visibility: AIContextVisibility
    restricted: bool = False
    reason: str | None = None
    modes: list[str]
    features: list[AIFeatureCapability]


def _activity_statement(course_id: int, activity_uuid: str) -> SelectOfScalar[Activity]:
    normalized = activity_uuid.removeprefix("activity_")
    return select(Activity).where(
        Activity.course_id == course_id,
        or_(Activity.activity_uuid == activity_uuid, Activity.activity_uuid == normalized),
    )


def _feature_enabled(key: str) -> bool:
    config = get_settings().integrations.ai
    return bool(config.ai_enabled and getattr(config, key))


def _feature(key: str, *, reason: str | None = None) -> AIFeatureCapability:
    enabled = _feature_enabled(key)
    return AIFeatureCapability(key=key, enabled=enabled, reason=None if enabled else (reason or "disabled"))


def _role_context(role: str) -> AIContextVisibility:
    return "teacher" if role in {"teacher", "author", "admin"} else "student"


@router.get("/scope/{course_uuid}", response_model=AIScopeCapabilityRead)
async def api_ai_scope_capabilities(
    course_uuid: str,
    current_user: Annotated[PublicUser, Depends(get_public_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
    surface: Annotated[AISurface, Query()] = "course-page",
    activity_uuid: Annotated[str | None, Query()] = None,
    submission_uuid: Annotated[str | None, Query()] = None,
) -> AIScopeCapabilityRead:
    course = _get_course_by_uuid(db_session, course_uuid)
    config = get_settings().integrations.ai
    if course is None or course.id is None:
        return AIScopeCapabilityRead(
            available=False,
            role="student",
            surface=surface,
            context_visibility="student",
            reason="course_not_found",
            modes=[],
            features=[],
        )

    role = derive_course_ai_role(db_session, course, current_user)
    context_visibility = _role_context(role)
    activity = (
        db_session.exec(_activity_statement(course.id, activity_uuid)).first()
        if activity_uuid
        else None
    )
    student_restricted_activity = (
        role == "student"
        and activity is not None
        and activity.activity_type
        in {
            ActivityTypeEnum.TYPE_EXAM,
            ActivityTypeEnum.TYPE_CODE_CHALLENGE,
            ActivityTypeEnum.TYPE_CUSTOM,
        }
    )

    features = [
        _feature("course_qa_enabled"),
        _feature("study_companion_enabled"),
        _feature("course_analysis_enabled"),
        _feature("submission_analysis_enabled"),
        _feature("remediation_enabled"),
        _feature("lecture_authoring_enabled"),
    ]

    modes: list[str] = []
    if config.ai_enabled and not student_restricted_activity:
        if _feature_enabled("course_qa_enabled"):
            modes.append("ask")
        if role == "student" and _feature_enabled("study_companion_enabled"):
            modes.extend(["explain", "practice", "sources"])
    if config.ai_enabled and role != "student":
        if _feature_enabled("lecture_authoring_enabled"):
            modes.append("review")
        if _feature_enabled("course_analysis_enabled"):
            modes.append("analyze")
        if submission_uuid and _feature_enabled("submission_analysis_enabled"):
            modes.append("draft-feedback")
        if submission_uuid and _feature_enabled("remediation_enabled"):
            modes.append("remediation")
        if _feature_enabled("course_qa_enabled") and "ask" not in modes:
            modes.append("ask")

    reason = None
    if not config.ai_enabled:
        reason = "ai_disabled"
    elif student_restricted_activity:
        reason = "restricted_activity"
    elif not modes:
        reason = "no_enabled_modes"

    return AIScopeCapabilityRead(
        available=bool(config.ai_enabled and modes and not student_restricted_activity),
        role=role,  # type: ignore[arg-type]
        surface=surface,
        context_visibility=context_visibility,
        restricted=student_restricted_activity,
        reason=reason,
        modes=modes,
        features=features,
    )
