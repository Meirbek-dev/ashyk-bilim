from datetime import UTC, datetime

from pydantic import field_validator
from sqlalchemy import JSON, Column, DateTime, ForeignKey, func
from sqlmodel import Field

from src.db.strict_base_model import SQLModelStrictBaseModel


class CertificationBase(SQLModelStrictBaseModel):
    course_id: int = Field(sa_column=Column("course_id", ForeignKey("course.id", ondelete="CASCADE")))
    config: dict[str, object] = Field(default_factory=dict, sa_column=Column(JSON))


class Certifications(CertificationBase, table=True):
    id: int | None = Field(default=None, primary_key=True)
    certification_uuid: str = Field(unique=True)
    course_id: int = Field(sa_column=Column("course_id", ForeignKey("course.id", ondelete="CASCADE")))
    config: dict[str, object] = Field(default_factory=dict, sa_column=Column(JSON))
    creation_date: datetime = Field(
        default_factory=lambda: datetime.now(UTC),
        sa_column=Column(DateTime(timezone=True), server_default=func.now()),
    )
    update_date: datetime = Field(
        default_factory=lambda: datetime.now(UTC),
        sa_column=Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now()),
    )


class CertificationCreate(SQLModelStrictBaseModel):
    course_id: int
    config: dict[str, object] = Field(default_factory=dict)
    last_known_update_date: datetime | None = None

    @field_validator("last_known_update_date", mode="before")
    @classmethod
    def validate_last_known_update_date(cls, value: object) -> object:
        if value is None or isinstance(value, datetime):
            return value
        if isinstance(value, str):
            normalized = value.strip()
            if normalized.endswith("Z"):
                normalized = f"{normalized[:-1]}+00:00"
            return datetime.fromisoformat(normalized)
        return value


class CertificationUpdate(SQLModelStrictBaseModel):
    config: dict[str, object] | None = None
    last_known_update_date: datetime | None = None

    @field_validator("last_known_update_date", mode="before")
    @classmethod
    def validate_last_known_update_date(cls, value: object) -> object:
        if value is None or isinstance(value, datetime):
            return value
        if isinstance(value, str):
            normalized = value.strip()
            if normalized.endswith("Z"):
                normalized = f"{normalized[:-1]}+00:00"
            return datetime.fromisoformat(normalized)
        return value


class CertificationRead(SQLModelStrictBaseModel):
    id: int
    certification_uuid: str
    course_id: int
    config: dict[str, object]
    creation_date: datetime
    update_date: datetime


class CertificateUserBase(SQLModelStrictBaseModel):
    user_id: int = Field(sa_column=Column("user_id", ForeignKey("user.id", ondelete="CASCADE")))
    certification_id: int = Field(
        sa_column=Column("certification_id", ForeignKey("certifications.id", ondelete="CASCADE"))
    )
    user_certification_uuid: str


class CertificateUser(CertificateUserBase, table=True):
    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(sa_column=Column("user_id", ForeignKey("user.id", ondelete="CASCADE")))
    certification_id: int = Field(
        sa_column=Column("certification_id", ForeignKey("certifications.id", ondelete="CASCADE"))
    )
    user_certification_uuid: str
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(UTC),
        sa_column=Column(DateTime(timezone=True), server_default=func.now()),
    )
    updated_at: datetime = Field(
        default_factory=lambda: datetime.now(UTC),
        sa_column=Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now()),
    )


class CertificateUserCreate(SQLModelStrictBaseModel):
    user_id: int
    certification_id: int
    user_certification_uuid: str


class CertificateUserRead(SQLModelStrictBaseModel):
    id: int
    user_id: int
    certification_id: int
    user_certification_uuid: str
    created_at: datetime
    updated_at: datetime


class CertificateUserUpdate(SQLModelStrictBaseModel):
    user_id: int | None = None
    certification_id: int | None = None
    user_certification_uuid: str | None = None
