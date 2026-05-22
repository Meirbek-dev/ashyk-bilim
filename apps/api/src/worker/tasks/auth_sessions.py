"""Durable auth-session audit tasks."""

from __future__ import annotations

import asyncio
import logging
from typing import Any

from src.worker.broker import broker

logger = logging.getLogger(__name__)


@broker.task(task_name="auth_session:created", retry_on_error=True, max_retries=3)
async def audit_session_created_task(session_data: dict[str, Any]) -> None:
    from src.services.auth.sessions import _audit_create_sync

    try:
        await asyncio.to_thread(_audit_create_sync, session_data)
    except Exception:
        logger.exception(
            "auth_session_create_audit_failed session=%s",
            session_data.get("session_id"),
        )
        raise


@broker.task(task_name="auth_session:revoked", retry_on_error=True, max_retries=3)
async def audit_session_revoked_task(session_id: str) -> None:
    from src.services.auth.sessions import _audit_revoke_sync

    try:
        await asyncio.to_thread(_audit_revoke_sync, session_id)
    except Exception:
        logger.exception("auth_session_revoke_audit_failed session=%s", session_id)
        raise


@broker.task(task_name="auth_session:rotated", retry_on_error=True, max_retries=3)
async def audit_session_rotated_task(
    old_session_id: str,
    new_session_id: str,
    new_session_data: dict[str, Any],
) -> None:
    from src.services.auth.sessions import _audit_rotate_sync

    try:
        await asyncio.to_thread(
            _audit_rotate_sync,
            old_session_id,
            new_session_id,
            new_session_data,
        )
    except Exception:
        logger.exception(
            "auth_session_rotate_audit_failed old_session=%s new_session=%s",
            old_session_id,
            new_session_id,
        )
        raise
