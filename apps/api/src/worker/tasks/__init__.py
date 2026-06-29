"""Worker task registration."""

from __future__ import annotations

import importlib
from collections.abc import Iterable

TASK_MODULES: tuple[str, ...] = (
    "src.worker.tasks.audit",
    "src.worker.tasks.auth_sessions",
    "src.worker.tasks.bulk_grading",
    "src.worker.tasks.email",
    "src.worker.tasks.plagiarism",
    "src.worker.tasks.scheduler_tasks",
    "src.worker.tasks.sse",
    "src.worker.tasks.xp_award",
)


def import_all_tasks(modules: Iterable[str] = TASK_MODULES) -> None:
    for module in modules:
        importlib.import_module(module)
