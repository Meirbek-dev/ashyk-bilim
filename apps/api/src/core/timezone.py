"""Timezone utilities.

Provides a centralized way to get timezone-aware datetime objects
based on the configured backend settings
"""

from datetime import UTC, datetime
from zoneinfo import ZoneInfo

from config.config import get_settings

_cached_timezone: ZoneInfo | None = None


def get_timezone() -> ZoneInfo:
    """Get the configured timezone as a ZoneInfo object.

    Returns:
        ZoneInfo: Configured timezone (defaults to UTC if invalid)

    """
    global _cached_timezone

    if _cached_timezone is not None:
        return _cached_timezone

    settings = get_settings()
    tz_name = settings.general_config.timezone

    try:
        _cached_timezone = ZoneInfo(tz_name)
    except Exception:
        # Fallback to UTC if timezone is invalid
        _cached_timezone = ZoneInfo("UTC")

    return _cached_timezone


def now() -> datetime:
    """Get current datetime in the configured timezone.

    Returns:
        datetime: Current datetime with configured timezone

    """
    return datetime.now(get_timezone())


def utcnow() -> datetime:
    """Get current datetime in UTC.

    This is useful when you explicitly need UTC time
    regardless of the configured timezone.

    Returns:
        datetime: Current datetime in UTC

    """
    return datetime.now(UTC)


def utcnow_iso() -> str:
    """Return the current UTC timestamp as an ISO 8601 string."""
    return utcnow().isoformat()


def to_timezone(dt: datetime) -> datetime:
    """Convert a datetime to the configured timezone.

    Args:
        dt: datetime object to convert

    Returns:
        datetime: datetime in configured timezone

    """
    if dt.tzinfo is None:
        # If naive, assume UTC
        dt = dt.replace(tzinfo=UTC)

    return dt.astimezone(get_timezone())


def invalidate_cache() -> None:
    """Invalidate the cached timezone.
    Useful for testing or when config changes.
    """
    global _cached_timezone
    _cached_timezone = None
