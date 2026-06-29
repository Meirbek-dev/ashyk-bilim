"""Taskiq worker and scheduler entrypoint."""

from __future__ import annotations

import taskiq_fastapi
from taskiq import TaskiqScheduler
from taskiq.schedule_sources import LabelScheduleSource

from src.worker.broker import broker
from src.worker.tasks import import_all_tasks

taskiq_fastapi.init(broker, "app:app")
import_all_tasks()

scheduler = TaskiqScheduler(
    broker=broker,
    sources=[LabelScheduleSource(broker)],
)
