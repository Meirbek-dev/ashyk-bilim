"""Стадия конвейера: применить штрафы за опоздание и попытки.

Чистые функции — без I/O. Берёт auto_score из стадии оценивания и
применяет штрафы по политике, чтобы получить итоговый балл.
"""

from __future__ import annotations

from datetime import UTC, datetime

from src.db.grading.overrides import StudentPolicyOverride
from src.services.grading.pipeline.context import EffectivePolicy, PenaltyResult
from src.services.grading.settings_loader import AssessmentSettings


def apply_penalties(
    auto_score: float,
    effective: EffectivePolicy,
    override: StudentPolicyOverride | None,
    submitted_at: datetime,
    attempt_number: int,
    settings: AssessmentSettings,
    violation_exceeded: bool,
    needs_manual_review: bool,
) -> PenaltyResult:
    """Вычислить итоговый балл после всех штрафов.

    Если `needs_manual_review` истинно, final_score остаётся 0 (преподаватель задаёт его вручную).
    Если `violation_exceeded` истинно, final_score обнуляется.
    """
    if violation_exceeded:
        return PenaltyResult(
            late_penalty_pct=0.0,
            attempt_penalty_applied=False,
            final_score=0.0,
            violation_zeroed=True,
        )

    if needs_manual_review:
        # Итоговый балл задаст преподаватель; штрафы пока не применяем
        return PenaltyResult(
            late_penalty_pct=0.0,
            attempt_penalty_applied=False,
            final_score=0.0,
            violation_zeroed=False,
        )

    # 1. Штраф за попытки (ограничивает максимальный достижимый балл)
    penalized_score = _apply_attempt_penalty(
        auto_score,
        attempt_number,
        settings.max_score_penalty_per_attempt,
    )
    attempt_penalty_applied = penalized_score < auto_score

    # 2. Late penalty
    waive_late = override is not None and override.waive_late_penalty
    if waive_late:
        late_penalty_pct = 0.0
    else:
        late_penalty_pct = _calculate_late_penalty(
            submitted_at, effective.due_at, effective
        )

    # Apply late penalty to the (possibly attempt-penalized) score
    final_score = _apply_late_penalty(penalized_score, late_penalty_pct)

    return PenaltyResult(
        late_penalty_pct=late_penalty_pct,
        attempt_penalty_applied=attempt_penalty_applied,
        final_score=final_score,
        violation_zeroed=False,
    )


def _apply_attempt_penalty(
    base_score: float,
    attempt_number: int,
    max_score_penalty_per_attempt: float | None,
) -> float:
    """Cap the score based on attempt-number penalty."""
    if not max_score_penalty_per_attempt or attempt_number <= 1:
        return base_score
    penalty_multiplier = attempt_number - 1
    max_score_reduction = max_score_penalty_per_attempt * penalty_multiplier
    penalized_max = max(0.0, 100.0 - max_score_reduction)
    return min(base_score, penalized_max)


def _calculate_late_penalty(
    submitted_at: datetime,
    due_at: datetime | None,
    effective: EffectivePolicy,
) -> float:
    """Delegate to the LatePolicy's apply method."""
    if due_at is None or submitted_at <= due_at:
        return 0.0
    if not effective.allow_late:
        return 0.0
    return effective.late_policy.apply(submitted_at, due_at)


def _apply_late_penalty(score: float, penalty_pct: float) -> float:
    """Reduce score by the late penalty percentage."""
    clamped = max(0.0, min(100.0, penalty_pct))
    return round(score * (1 - clamped / 100), 2)
