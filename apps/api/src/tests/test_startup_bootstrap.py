import logging

import pytest
from sqlalchemy import func
from sqlalchemy.orm import sessionmaker
from sqlmodel import Session, SQLModel, create_engine, select

from config.config import get_settings, reload_platform_config_cache
from src.app.judge0_patch import apply_judge0_patches
from src.db.permissions import Permission, Role, RolePermission
from src.db.platform import Platform
from src.services.setup.setup import ensure_bootstrap_state


def test_ensure_bootstrap_state_seeds_platform_and_roles(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("PLATFORM_CONTACT_EMAIL", "ops@school.edu")
    monkeypatch.delenv("PLATFORM_INITIAL_ADMIN_EMAIL", raising=False)
    monkeypatch.delenv("PLATFORM_INITIAL_ADMIN_PASSWORD", raising=False)
    reload_platform_config_cache()

    engine = create_engine("sqlite://")
    SQLModel.metadata.create_all(
        engine,
        tables=[
            Platform.__table__,
            Role.__table__,
            Permission.__table__,
            RolePermission.__table__,
        ],
    )
    try:
        with Session(engine) as session:
            ensure_bootstrap_state(get_settings(), session)
            ensure_bootstrap_state(get_settings(), session)

            platform_count = session.exec(select(func.count()).select_from(Platform)).one()
            role_count = session.exec(select(func.count()).select_from(Role)).one()
            permission_count = session.exec(select(func.count()).select_from(Permission)).one()
            platform = session.exec(select(Platform)).one()

        assert platform_count == 1
        assert role_count > 0
        assert permission_count > 0
        assert platform.email == "ops@school.edu"
    finally:
        SQLModel.metadata.drop_all(
            engine,
            tables=[
                RolePermission.__table__,
                Permission.__table__,
                Role.__table__,
                Platform.__table__,
            ],
        )
        engine.dispose()
        reload_platform_config_cache()


def test_judge0_patcher_skips_when_languages_table_is_absent(caplog: pytest.LogCaptureFixture) -> None:
    engine = create_engine("sqlite://")
    factory = sessionmaker(bind=engine, class_=Session)

    try:
        with caplog.at_level(logging.INFO, logger="src.app.judge0_patch"):
            apply_judge0_patches(factory)
    finally:
        engine.dispose()

    assert "public.languages is not present" in caplog.text
