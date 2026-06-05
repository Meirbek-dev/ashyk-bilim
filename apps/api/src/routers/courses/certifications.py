from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request
from sqlmodel import Session

from src.auth.users import get_public_user
from src.db.courses.certifications import (
    CertificateUserRead,
    CertificationCreate,
    CertificationRead,
    CertificationUpdate,
)
from src.db.strict_base_model import PydanticStrictBaseModel
from src.db.users import PublicUser
from src.infra.db.session import get_db_session
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


class CertificateCourseSummary(PydanticStrictBaseModel):
    id: int | None = None
    course_uuid: str
    name: str
    description: str | None = None
    thumbnail_image: str | None = None


class CertificateUserSummary(PydanticStrictBaseModel):
    id: int | None = None
    user_uuid: str | None = None
    username: str
    email: str
    first_name: str | None = None
    last_name: str | None = None


class CourseCertificateResponse(PydanticStrictBaseModel):
    certificate_user: CertificateUserRead
    certification: CertificationRead | None = None
    course: CertificateCourseSummary


class PublicCertificateResponse(PydanticStrictBaseModel):
    certificate_user: CertificateUserRead
    certification: CertificationRead
    course: CertificateCourseSummary


class UserCertificateResponse(PydanticStrictBaseModel):
    certificate_user: CertificateUserRead
    certification: CertificationRead
    course: CertificateCourseSummary
    user: CertificateUserSummary | None = None


class CertificationDetailResponse(PydanticStrictBaseModel):
    detail: str


@router.post("", response_model=CertificationRead)
async def api_create_certification(
    request: Request,
    certification_object: CertificationCreate,
    current_user: Annotated[PublicUser, Depends(get_public_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
) -> CertificationRead:
    """Create new certification for a course."""
    return await create_certification(request, certification_object, current_user, db_session)


@router.get("/{certification_uuid}", response_model=CertificationRead)
async def api_get_certification(
    request: Request,
    certification_uuid: str,
    current_user: Annotated[PublicUser, Depends(get_public_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
) -> CertificationRead:
    """Get single certification by certification_id."""
    return await get_certification(request, certification_uuid, current_user, db_session)


@router.get("/course/{course_uuid}", response_model=list[CertificationRead])
async def api_get_certifications_by_course(
    request: Request,
    course_uuid: str,
    current_user: Annotated[PublicUser, Depends(get_public_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
) -> list[CertificationRead]:
    """Get all certifications for a specific course."""
    return await get_certifications_by_course(request, course_uuid, current_user, db_session)


@router.put("/{certification_uuid}", response_model=CertificationRead)
async def api_update_certification(
    request: Request,
    certification_uuid: str,
    certification_object: CertificationUpdate,
    current_user: Annotated[PublicUser, Depends(get_public_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
) -> CertificationRead:
    """Update certification by certification_id."""
    return await update_certification(request, certification_uuid, certification_object, current_user, db_session)


@router.delete("/{certification_uuid}", response_model=CertificationDetailResponse)
async def api_delete_certification(
    request: Request,
    certification_uuid: str,
    current_user: Annotated[PublicUser, Depends(get_public_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
    last_known_update_date: Annotated[datetime | None, Query()] = None,
) -> CertificationDetailResponse:
    """Delete certification by certification_id."""
    return await delete_certification(
        request,
        certification_uuid,
        current_user,
        db_session,
        last_known_update_date=last_known_update_date,
    )


@router.get("/user/course/{course_uuid}", response_model=list[CourseCertificateResponse])
async def api_get_user_certificates_for_course(
    request: Request,
    course_uuid: str,
    current_user: Annotated[PublicUser, Depends(get_public_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
) -> list[CourseCertificateResponse]:
    """Get all certificates for the current user in a specific course with certification details."""
    certs = await get_user_certificates_for_course(request, course_uuid, current_user, db_session)
    return [CourseCertificateResponse.model_validate(c) for c in certs]


@router.get("/certificate/{user_certification_uuid}", response_model=PublicCertificateResponse)
async def api_get_certificate_by_user_certification_uuid(
    request: Request,
    user_certification_uuid: str,
    db_session: Annotated[Session, Depends(get_db_session)],
) -> PublicCertificateResponse:
    """Get a certificate by user_certification_uuid with certification and course details."""
    cert = await get_certificate_by_user_certification_uuid(request, user_certification_uuid, None, db_session)
    return PublicCertificateResponse.model_validate(cert)


@router.get("/user/all", response_model=list[UserCertificateResponse])
async def api_get_all_user_certificates(
    request: Request,
    current_user: Annotated[PublicUser, Depends(get_public_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
) -> list[UserCertificateResponse]:
    """Get all certificates obtained by the current user with complete linked information."""
    certs = await get_all_user_certificates(request, current_user, db_session)
    return [UserCertificateResponse.model_validate(c) for c in certs]
