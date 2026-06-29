# pyright: reportMissingImports=false, reportPrivateUsage=false
"""Unit coverage for the canonical student activity runtime."""

import importlib.util
import pathlib
import sys

from src.types.simple_namespace import SimpleNamespace

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2]))
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from src.db.courses.activities import ActivityTypeEnum
from src.db.grading.progress import ActivityProgressState
from src.db.student_activity_runtime import (
    StudentActivityNavItem,
    StudentActivityProgressRuntime,
)
from src.services.student_activity_runtime import (
    _derive_primary_action,
    _normalize_state,
)


def test_normalize_state_uses_enum_values() -> None:
    progress = SimpleNamespace(state=ActivityProgressState.GRADED, completed_at=None)

    assert _normalize_state(progress) == "graded_hidden"


def test_normalize_state_prefers_completed_timestamp() -> None:
    progress = SimpleNamespace(state=ActivityProgressState.COMPLETED, completed_at=object())

    assert _normalize_state(progress) == "complete"


def test_normalize_state_preserves_published_result_state() -> None:
    progress = SimpleNamespace(state=ActivityProgressState.PASSED, completed_at=object())

    assert _normalize_state(progress) == "passed"


def test_primary_action_blocks_unavailable_content() -> None:
    action = _derive_primary_action(
        activity=SimpleNamespace(activity_type=ActivityTypeEnum.TYPE_DYNAMIC),
        can_view=False,
        is_authenticated=True,
        next_item=None,
        progress=StudentActivityProgressRuntime(state="not_started"),
    )

    assert action.id == "none"
    assert action.enabled is False
    assert action.reason == "unavailable"


def test_primary_action_for_submitted_and_completed_activities_guides_user() -> None:
    activity = SimpleNamespace(activity_type=ActivityTypeEnum.TYPE_EXAM)
    next_item = StudentActivityNavItem(
        id=3,
        uuid="activity_next",
        title="Next",
        type=ActivityTypeEnum.TYPE_DYNAMIC.value,
        published=True,
    )

    # With next activity, should return next_activity
    submitted_with_next = _derive_primary_action(
        activity=activity,
        can_view=True,
        is_authenticated=True,
        next_item=next_item,
        progress=StudentActivityProgressRuntime(state="needs_grading"),
    )
    passed_with_next = _derive_primary_action(
        activity=activity,
        can_view=True,
        is_authenticated=True,
        next_item=next_item,
        progress=StudentActivityProgressRuntime(state="passed", complete=True),
    )

    assert submitted_with_next.id == "next_activity"
    assert submitted_with_next.target_activity_uuid == "activity_next"
    assert passed_with_next.id == "next_activity"
    assert passed_with_next.target_activity_uuid == "activity_next"

    # Without next activity, should return back_to_course
    submitted_without_next = _derive_primary_action(
        activity=activity,
        can_view=True,
        is_authenticated=True,
        next_item=None,
        progress=StudentActivityProgressRuntime(state="needs_grading"),
    )
    passed_without_next = _derive_primary_action(
        activity=activity,
        can_view=True,
        is_authenticated=True,
        next_item=None,
        progress=StudentActivityProgressRuntime(state="passed", complete=True),
    )

    assert submitted_without_next.id == "back_to_course"
    assert passed_without_next.id == "back_to_course"


def test_final_invariant_migration_targets_deprecated_tables() -> None:
    migration_path = (
        pathlib.Path(__file__).resolve().parents[2]
        / "migrations"
        / "versions"
        / "2026_05_18_1a2b3c4d5e6f_student_workflow_invariants.py"
    )
    spec = importlib.util.spec_from_file_location("student_workflow_invariants", migration_path)
    assert spec is not None
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)

    assert module.revision == "1a2b3c4d5e6f"
    assert {
        "assignment",
        "assignment_task",
        "assignmenttask",
        "assignmentusersubmission",
        "assignmenttasksubmission",
    }.issubset(module.DEPRECATED_TABLES)
    assert ("TYPE_" + "ASSIGNMENT") in migration_path.read_text(encoding="utf-8")
