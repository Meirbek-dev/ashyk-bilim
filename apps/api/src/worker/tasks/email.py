"""Durable user-notification email tasks."""

from __future__ import annotations

import asyncio
import logging

from src.worker.broker import broker

logger = logging.getLogger(__name__)


@broker.task(task_name="email:account_creation", retry_on_error=True, max_retries=3)
async def send_account_creation_email_task(*, username: str, email: str) -> None:
    from src.services.users.emails import send_account_creation_email_by_fields

    try:
        await asyncio.to_thread(
            send_account_creation_email_by_fields,
            username=username,
            email=email,
        )
    except Exception:
        logger.exception("account_creation_email_failed email=%s", email)
        raise


@broker.task(task_name="email:password_reset", retry_on_error=True, max_retries=3)
async def send_password_reset_email_task(
    *,
    generated_reset_code: str,
    username: str,
    email: str,
) -> None:
    from src.services.users.emails import send_password_reset_email_by_fields

    try:
        await asyncio.to_thread(
            send_password_reset_email_by_fields,
            generated_reset_code=generated_reset_code,
            username=username,
            email=email,
        )
    except Exception:
        logger.exception("password_reset_email_failed email=%s", email)
        raise


@broker.task(task_name="email:lockout_notification", retry_on_error=True, max_retries=3)
async def send_lockout_notification_email_task(*, email: str) -> None:
    from src.services.users.emails import send_lockout_notification_email

    try:
        await asyncio.to_thread(send_lockout_notification_email, email=email)
    except Exception:
        logger.exception("lockout_notification_email_failed email=%s", email)
        raise
