import logging.config
from pathlib import Path

from src.infra.settings import AppSettings

_logging_configured = False


def configure_logging(settings: AppSettings) -> None:
    global _logging_configured

    if _logging_configured:
        return

    Path("logs").mkdir(parents=True, exist_ok=True)
    level = "DEBUG" if settings.general_config.development_mode else "INFO"

    logging.config.dictConfig({
        "version": 1,
        "disable_existing_loggers": False,
        "formatters": {
            "standard": {
                "format": "%(asctime)s %(levelname)s %(name)s %(message)s",
            }
        },
        "handlers": {
            "console": {
                "class": "logging.StreamHandler",
                "formatter": "standard",
                "level": level,
            }
        },
        "root": {"handlers": ["console"], "level": level},
    })
    _logging_configured = True
