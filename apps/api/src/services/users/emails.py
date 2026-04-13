from pydantic import EmailStr

from config.config import get_settings
from src.core.platform import PLATFORM_BRAND_NAME
from src.db.users import UserRead
from src.services.email.utils import send_email


def _get_public_web_origin() -> str:
    settings = get_settings()
    scheme = "https" if settings.hosting_config.ssl else "http"
    return f"{scheme}://{settings.hosting_config.domain}".rstrip("/")


def send_account_creation_email(
    user: UserRead,
    email: EmailStr,
):
    # send email
    return send_email(
        to=email,
        subject=f"Welcome to {PLATFORM_BRAND_NAME}, {user.username}!",
        body=f"""
<html>
    <body>
        <p>Hello {user.username}</p>
        <p>Welcome to {PLATFORM_BRAND_NAME}! Your account is ready to use.</p>
        <p>Need some help to get started ? <a href="https://tou.edu.kz/ru/">Toraighyrov University</a></p>
    </body>
</html>
""",
    )


def send_password_reset_email(
    generated_reset_code: str,
    user: UserRead,
    email: EmailStr,
):
    reset_link = (
        f"{_get_public_web_origin()}/reset"
        f"?email={email}&resetCode={generated_reset_code}"
    )

    # send email
    return send_email(
        to=email,
        subject="Reset your password",
        body=f"""
<html>
    <body>
        <p>Hello {user.username}</p>
        <p>You have requested to reset your password.</p>
        <p>Here is your reset code: {generated_reset_code}</p>
        <p>Click <a href="{reset_link}">here</a> to reset your password.</p>
    </body>
</html>
""",
    )


def send_lockout_notification_email(email: str) -> None:
    """Notify a user that their account has been locked due to repeated failed login attempts."""
    return send_email(
        to=email,
        subject=f"{PLATFORM_BRAND_NAME} — Suspicious login activity",
        body=f"""
<html>
    <body>
        <p>Hello,</p>
        <p>We detected multiple failed login attempts on your {PLATFORM_BRAND_NAME} account.</p>
        <p>Your account has been temporarily locked for 15 minutes as a security precaution.</p>
        <p>If this was you, please wait and try again later.  If you did not attempt to log in,
           we recommend resetting your password immediately.</p>
        <p><a href="{_get_public_web_origin()}/forgot">Reset your password</a></p>
    </body>
</html>
""",
    )
