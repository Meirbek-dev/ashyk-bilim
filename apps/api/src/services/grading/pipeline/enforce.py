"""Pipeline stage: enforce policy constraints.

Pure functions that raise HTTPException when a constraint is violated.
No database I/O — all inputs are pre-resolved.
"""

from __future__ import annotations

from datetime import UTC, datetime

from fastapi import HTTPException, status

from src.db.grading.overrides import StudentPolicyOverride
from src.db.grading.progress import (
    AssessmentPolicy,
    LatePolicy,
    LatePolicyNone,
    deserialize_late_policy,
)
from src.services.grading.pipeline.context import EffectivePolicy
from src.services.grading.settings_loader import AssessmentSettings

# Grace period for time-limit enforcement (network latency tolerance)
SUBMIT_GRACE_SECONDS = 30


def resolve_effective_policy(
    policy: AssessmentPolicy | None,
    override: StudentPolicyOverride | None,
    settings: AssessmentSettings,
) -> EffectivePolicy:
    """Merge policy + override + settings into a single resolved policy."""
    # Start from settings defaults
    max_attempts = settings.max_attempts
    time_limit_seconds = settings.time_limit_seconds
    due_at: datetime | None = None
    allow_late = True
    passing_score = 60.0
    late_policy: LatePolicy = LatePolicyNone()

    # Policy overrides settings
    if policy is not None:
        max_attempts = policy.max_attempts
        time_limit_seconds = policy.time_limit_seconds
        due_at = policy.due_at
        allow_late = policy.allow_late
        passing_score = policy.passing_score
        late_policy = deserialize_late_policy(policy.late_policy_json)

    # Per-student override overrides policy
    if override is not None:
        if override.max_attempts_override is not None:
            max_attempts = override.max_attempts_override
        if override.due_at_override is not None:
            due_at = override.due_at_override

    # Fallback due_at from settings
    if due_at is None and settings.due_date_iso:
        try:
            due_at = datetime.fromisoformat(settings.due_date_iso)
        except ValueError:
            due_at = None

    # Ensure timezone awareness
    if due_at is not None and due_at.tzinfo is None:
        due_at = due_at.replace(tzinfo=UTC)

    return EffectivePolicy(
        max_attempts=max_attempts,
        time_limit_seconds=time_limit_seconds,
        due_at=due_at,
        late_policy=late_policy,
        allow_late=allow_late,
        passing_score=passing_score,
    )


def enforce_attempt_limit(
    effective: EffectivePolicy,
    completed_attempt_count: int,
) -> None:
    """Raise 403 if the student has exhausted their attempts."""
    if effective.max_attempts is None:
        return
    if completed_attempt_count >= effective.max_attempts:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Достигнуто максимальное количество попыток ({effective.max_attempts})",
        )


def enforce_time_limit(
    started_at: datetime | None,
    effective: EffectivePolicy,
    now: datetime | None = None,
) -> None:
    """Raise 403 if the time limit has been exceeded."""
    if started_at is None or effective.time_limit_seconds is None:
        return

    if now is None:
        now = datetime.now(UTC)

    if started_at.tzinfo is None:
        started_at = started_at.replace(tzinfo=UTC)

    elapsed = (now - started_at).total_seconds()
    if elapsed > effective.time_limit_seconds + SUBMIT_GRACE_SECONDS:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Лимит времени ({effective.time_limit_seconds} сек) превышен",
        )


def enforce_late_submission(
    effective: EffectivePolicy,
    now: datetime | None = None,
) -> None:
    """Raise 403 if late submissions are disallowed and we're past due."""
    if effective.due_at is None:
        return

    if now is None:
        now = datetime.now(UTC)

    if now > effective.due_at and not effective.allow_late:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Поздние решения не разрешены для этой активности",
        )


def check_violations(
    settings: AssessmentSettings,
    violation_count: int,
) -> bool:
    """Return True if violations should zero out the score.

    max_violations is the inclusive upper limit — reaching it triggers zeroing.
    A max_violations of 0 or less is treated as "no limit".
    """
    if settings.max_violations <= 0:
        return False
    return settings.track_violations and settings.block_on_violations and violation_count >= settings.max_violations
