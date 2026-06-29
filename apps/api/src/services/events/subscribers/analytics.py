"""Analytics subscriber — structured logging for all events.

Every event is logged with consistent field names for observability tooling
(Datadog, Loki, CloudWatch, etc.).
"""

from __future__ import annotations

import logging
from datetime import date, datetime

logger = logging.getLogger("grading.analytics")


class AnalyticsSubscriber:
    """Logs every event as a structured JSON record."""

    async def handle(self, event: object) -> None:
        """Log the event with its type and all fields."""
        event_type = type(event).__name__
        fields: dict[str, object] = {}

        # Extract all dataclass fields
        if hasattr(event, "__dataclass_fields__"):
            for field_name in event.__dataclass_fields__:
                value = getattr(event, field_name, None)
                # Serialize datetime to ISO string
                if isinstance(value, (date, datetime)):
                    value = value.isoformat()
                fields[field_name] = value

        logger.info(
            "assessment_event type=%s %s",
            event_type,
            " ".join(f"{k}={v}" for k, v in fields.items()),
            extra={"event_type": event_type, **fields},
        )
