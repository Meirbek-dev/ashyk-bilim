from __future__ import annotations

from sqlmodel import Session, select

from src.db.platform import Platform


def get_platform(db_session: Session) -> Platform:
    platform = db_session.exec(select(Platform)).first()
    if not platform:
        raise RuntimeError("Platform not found. Run the install/bootstrap flow first.")
    return platform
