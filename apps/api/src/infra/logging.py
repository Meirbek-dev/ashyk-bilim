import logging.config
import os
from collections.abc import Mapping
from pathlib import Path
from typing import Literal, override

from src.infra.settings import AppSettings

_logging_configured = False

_COLOR_BY_LEVEL = {
    "DEBUG": "\x1b[36m",
    "INFO": "\x1b[32m",
    "WARNING": "\x1b[33m",
    "ERROR": "\x1b[31m",
    "CRITICAL": "\x1b[1;31m",
}
_RESET = "\x1b[0m"


class ColorFormatter(logging.Formatter):
    def __init__(
        self,
        fmt: str | None = None,
        datefmt: str | None = None,
        style: Literal["%", "{", "$"] = "%",
        validate: bool = True,
        *,
        defaults: Mapping[str, object] | None = None,
        colorize: bool = True,
    ) -> None:
        super().__init__(fmt, datefmt, style, validate, defaults=defaults)
        self.colorize = colorize and "NO_COLOR" not in os.environ

    @override
    def format(self, record: logging.LogRecord) -> str:
        if not self.colorize:
            return super().format(record)

        levelname = record.levelname
        color = _COLOR_BY_LEVEL.get(levelname)
        if not color:
            return super().format(record)

        record.levelname = f"{color}{levelname}{_RESET}"
        try:
            return super().format(record)
        finally:
            record.levelname = levelname


def build_logging_config(settings: AppSettings) -> dict[str, object]:
    level = "DEBUG" if settings.general_config.development_mode else "INFO"
    colorize = settings.general_config.color_logs

    return {
        "version": 1,
        "disable_existing_loggers": False,
        "formatters": {
            "standard": {
                "()": "src.infra.logging.ColorFormatter",
                "format": "%(asctime)s %(levelname)s %(name)s %(message)s",
                "colorize": colorize,
            },
            "granian": {
                "()": "src.infra.logging.ColorFormatter",
                "format": "[%(levelname)s] %(message)s",
                "colorize": colorize,
            },
            "access": {
                "format": "%(message)s",
            },
        },
        "handlers": {
            "console": {
                "class": "logging.StreamHandler",
                "formatter": "standard",
                "level": level,
            },
            "granian": {
                "class": "logging.StreamHandler",
                "formatter": "granian",
                "level": level,
            },
            "access": {
                "class": "logging.StreamHandler",
                "formatter": "access",
                "level": "INFO",
            },
        },
        "root": {"handlers": ["console"], "level": level},
        "loggers": {
            "_granian": {
                "handlers": ["granian"],
                "level": level,
                "propagate": False,
            },
            "granian.access": {
                "handlers": ["access"],
                "level": "INFO",
                "propagate": False,
            },
            "watchfiles": {
                "level": "INFO",
            },
            "watchfiles.main": {
                "level": "INFO",
            },
        },
    }


def configure_logging(settings: AppSettings) -> None:
    global _logging_configured

    if _logging_configured:
        return

    Path("logs").mkdir(parents=True, exist_ok=True)
    logging.config.dictConfig(build_logging_config(settings))
    _logging_configured = True
