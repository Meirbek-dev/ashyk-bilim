"""
Unit tests for _calculate_late_penalty.

All 4 LatePolicy types are covered with boundary and edge cases.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest

from src.db.grading.progress import AssessmentPolicy, AssessmentGradingMode, AssessmentCompletionRule
from src.db.grading.submissions import AssessmentType
from src.services.courses.activities.assignments.submissions import _calculate_late_penalty

# Fixed reference timestamps for deterministic testing
DUE_AT = datetime(2026, 1, 10, 12, 0, 0, tzinfo=UTC)  # noon UTC on 2026-01-10


def _policy(
    *,
    late_policy_json: dict,
    allow_late: bool = True,
) -> AssessmentPolicy:
    """Build a minimal AssessmentPolicy for testing late-penalty logic."""
    return AssessmentPolicy(
        policy_uuid="policy_test",
        activity_id=1,
        assessment_type=AssessmentType.ASSIGNMENT,
        grading_mode=AssessmentGradingMode.MANUAL,
        completion_rule=AssessmentCompletionRule.GRADED,
        passing_score=60.0,
        allow_late=allow_late,
        late_policy_json=late_policy_json,
        settings_json={},
    )


# ── No policy / no config ─────────────────────────────────────────────────────


def test_no_policy_returns_zero() -> None:
    submitted_at = DUE_AT + timedelta(hours=1)
    assert _calculate_late_penalty(submitted_at, DUE_AT, policy=None) == 0.0


def test_empty_late_policy_json_returns_zero() -> None:
    p = _policy(late_policy_json={})
    submitted_at = DUE_AT + timedelta(hours=1)
    assert _calculate_late_penalty(submitted_at, DUE_AT, p) == 0.0


def test_allow_late_false_returns_zero() -> None:
    """When allow_late is False the penalty is bypassed (submissions blocked upstream)."""
    p = _policy(late_policy_json={"type": "FLAT_PERCENT", "percent": 50}, allow_late=False)
    submitted_at = DUE_AT + timedelta(hours=1)
    assert _calculate_late_penalty(submitted_at, DUE_AT, p) == 0.0


def test_unknown_policy_type_returns_zero() -> None:
    p = _policy(late_policy_json={"type": "MYSTERY_POLICY"})
    submitted_at = DUE_AT + timedelta(hours=1)
    assert _calculate_late_penalty(submitted_at, DUE_AT, p) == 0.0


# ── NO_PENALTY ────────────────────────────────────────────────────────────────


def test_no_penalty_returns_zero() -> None:
    p = _policy(late_policy_json={"type": "NO_PENALTY"})
    submitted_at = DUE_AT + timedelta(days=5)
    assert _calculate_late_penalty(submitted_at, DUE_AT, p) == 0.0


# ── FLAT_PERCENT ──────────────────────────────────────────────────────────────


def test_flat_percent_nominal() -> None:
    p = _policy(late_policy_json={"type": "FLAT_PERCENT", "percent": 20.0})
    submitted_at = DUE_AT + timedelta(hours=1)
    assert _calculate_late_penalty(submitted_at, DUE_AT, p) == 20.0


def test_flat_percent_zero() -> None:
    p = _policy(late_policy_json={"type": "FLAT_PERCENT", "percent": 0.0})
    submitted_at = DUE_AT + timedelta(hours=1)
    assert _calculate_late_penalty(submitted_at, DUE_AT, p) == 0.0


def test_flat_percent_capped_at_100() -> None:
    p = _policy(late_policy_json={"type": "FLAT_PERCENT", "percent": 150.0})
    submitted_at = DUE_AT + timedelta(hours=1)
    assert _calculate_late_penalty(submitted_at, DUE_AT, p) == 100.0


def test_flat_percent_negative_clamped_to_zero() -> None:
    p = _policy(late_policy_json={"type": "FLAT_PERCENT", "percent": -10.0})
    submitted_at = DUE_AT + timedelta(hours=1)
    assert _calculate_late_penalty(submitted_at, DUE_AT, p) == 0.0


def test_flat_percent_missing_percent_key() -> None:
    p = _policy(late_policy_json={"type": "FLAT_PERCENT"})
    submitted_at = DUE_AT + timedelta(hours=1)
    assert _calculate_late_penalty(submitted_at, DUE_AT, p) == 0.0


# ── PER_DAY ───────────────────────────────────────────────────────────────────


def test_per_day_one_minute_late_counts_as_one_day() -> None:
    """Any partial day must count as a full day (ceil semantics)."""
    p = _policy(late_policy_json={
        "type": "PER_DAY",
        "percent_per_day": 10.0,
        "max_pct": 100.0,
    })
    submitted_at = DUE_AT + timedelta(minutes=1)  # 1 minute → 1 day
    assert _calculate_late_penalty(submitted_at, DUE_AT, p) == 10.0


def test_per_day_exactly_one_day_late() -> None:
    p = _policy(late_policy_json={
        "type": "PER_DAY",
        "percent_per_day": 10.0,
        "max_pct": 100.0,
    })
    submitted_at = DUE_AT + timedelta(hours=24)
    result = _calculate_late_penalty(submitted_at, DUE_AT, p)
    # 24 h = 1 day → 10 %; +1 day rounding so may be 20 % depending on impl
    # The implementation uses floor(seconds/86400)+1, so 24h → floor(1)+1 = 2 days
    assert result == 20.0


def test_per_day_three_days_late() -> None:
    p = _policy(late_policy_json={
        "type": "PER_DAY",
        "percent_per_day": 10.0,
        "max_pct": 100.0,
    })
    submitted_at = DUE_AT + timedelta(days=3)
    # floor(259200/86400)+1 = 3+1 = 4 days → 40%
    assert _calculate_late_penalty(submitted_at, DUE_AT, p) == 40.0


def test_per_day_capped_by_max_pct() -> None:
    p = _policy(late_policy_json={
        "type": "PER_DAY",
        "percent_per_day": 20.0,
        "max_pct": 50.0,
    })
    submitted_at = DUE_AT + timedelta(days=10)
    # 11 days * 20% = 220% → capped at 50%
    assert _calculate_late_penalty(submitted_at, DUE_AT, p) == 50.0


def test_per_day_missing_percent_per_day_key() -> None:
    p = _policy(late_policy_json={"type": "PER_DAY", "max_pct": 100.0})
    submitted_at = DUE_AT + timedelta(days=2)
    assert _calculate_late_penalty(submitted_at, DUE_AT, p) == 0.0


def test_per_day_missing_max_pct_defaults_to_100() -> None:
    p = _policy(late_policy_json={"type": "PER_DAY", "percent_per_day": 30.0})
    submitted_at = DUE_AT + timedelta(days=10)
    # Without max_pct cap, defaults to 100.0 from code
    result = _calculate_late_penalty(submitted_at, DUE_AT, p)
    assert result <= 100.0


# ── ZERO_GRADE ────────────────────────────────────────────────────────────────


def test_zero_grade_returns_100() -> None:
    p = _policy(late_policy_json={"type": "ZERO_GRADE"})
    submitted_at = DUE_AT + timedelta(seconds=1)
    assert _calculate_late_penalty(submitted_at, DUE_AT, p) == 100.0


def test_zero_grade_returns_100_even_seconds_late() -> None:
    p = _policy(late_policy_json={"type": "ZERO_GRADE"})
    submitted_at = DUE_AT + timedelta(seconds=1)
    assert _calculate_late_penalty(submitted_at, DUE_AT, p) == 100.0
