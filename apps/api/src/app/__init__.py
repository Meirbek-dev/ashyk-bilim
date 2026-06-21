from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from fastapi import FastAPI

    from src.infra.settings import AppSettings


def create_app(settings: AppSettings | None = None) -> FastAPI:
    from src.app.factory import create_app as _create_app

    return _create_app(settings)


__all__ = ["create_app"]
