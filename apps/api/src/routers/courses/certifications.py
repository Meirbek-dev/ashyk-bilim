from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request
from sqlmodel import Session

from src.db.courses.certifications import (
    CertificationCreate,
    CertificationRead,
    CertificationUpdate,
)
from src.db.users import PublicUser
from src.infra.db.session import get_db_session
from src.security.auth import get_current_user
from src.services.courses.certifications import (
    create_certification,
    delete_certification,
    get_all_user_certificates,
    get_certificate_by_user_certification_uuid,
    get_certification,
    get_certifications_by_course,
    get_user_certificates_for_course,
    update_certification,
)

router = APIRouter()


@router.post("")
async def api_create_certification(
    request: Request,
    certification_object: CertificationCreate,
    current_user: Annotated[PublicUser, Depends(get_current_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
) -> CertificationRead:
    """
    Create new certification for a course
    """
    return await create_certification(
        request, certification_object, current_user, db_session
    )


@router.get("/{certification_uuid}")
async def api_get_certification(
    request: Request,
    certification_uuid: str,
    current_user: Annotated[PublicUser, Depends(get_current_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
) -> CertificationRead:
    """
    Get single certification by certification_id
    """
    return await get_certification(
        request, certification_uuid, current_user, db_session
    )


@router.get("/course/{course_uuid}")
async def api_get_certifications_by_course(
    request: Request,
    course_uuid: str,
    current_user: Annotated[PublicUser, Depends(get_current_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
) -> list[CertificationRead]:
    """
    Get all certifications for a specific course
    """
    return await get_certifications_by_course(
        request, course_uuid, current_user, db_session
    )


@router.put("/{certification_uuid}")
async def api_update_certification(
    request: Request,
    certification_uuid: str,
    certification_object: CertificationUpdate,
    current_user: Annotated[PublicUser, Depends(get_current_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
) -> CertificationRead:
    """
    Update certification by certification_id
    """
    return await update_certification(
        request, certification_uuid, certification_object, current_user, db_session
    )


@router.delete("/{certification_uuid}")
async def api_delete_certification(
    request: Request,
    certification_uuid: str,
    current_user: Annotated[PublicUser, Depends(get_current_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
    last_known_update_date: Annotated[datetime | None, Query()] = None,
):
    """
    Delete certification by certification_id
    """
    return await delete_certification(
        request,
        certification_uuid,
        current_user,
        db_session,
        last_known_update_date=last_known_update_date,
    )


@router.get("/user/course/{course_uuid}")
async def api_get_user_certificates_for_course(
    request: Request,
    course_uuid: str,
    current_user: Annotated[PublicUser, Depends(get_current_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
) -> list[dict]:
    """
    Get all certificates for the current user in a specific course with certification details
    """
    return await get_user_certificates_for_course(
        request, course_uuid, current_user, db_session
    )


@router.get("/certificate/{user_certification_uuid}")
async def api_get_certificate_by_user_certification_uuid(
    request: Request,
    user_certification_uuid: str,
    db_session: Annotated[Session, Depends(get_db_session)],
) -> dict:
    """
    Get a certificate by user_certification_uuid with certification and course details
    """
    return await get_certificate_by_user_certification_uuid(
        request, user_certification_uuid, None, db_session
    )


@router.get("/user/all")
async def api_get_all_user_certificates(
    request: Request,
    current_user: Annotated[PublicUser, Depends(get_current_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
) -> list[dict]:
    """
    Get all certificates obtained by the current user with complete linked information
    """
    return await get_all_user_certificates(request, current_user, db_session)
