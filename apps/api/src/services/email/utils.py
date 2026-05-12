import resend
from pydantic import EmailStr
from resend import Emails

from config.config import get_settings, secret_value


def send_email(to: EmailStr, subject: str, body: str) -> None:
    print("We don't have email domain configured, so we're not sending emails, duh...")


def future_send_email(to: EmailStr, subject: str, body: str) -> Emails.SendResponse:
    settings = get_settings()

    params = {
        "from": "Ashyk Bilim <" + settings.mailing_config.system_email_address + ">",
        "to": [to],
        "subject": subject,
        "html": body,
    }

    resend.api_key = secret_value(settings.mailing_config.resend_api_key)

    return resend.Emails.send(params)
