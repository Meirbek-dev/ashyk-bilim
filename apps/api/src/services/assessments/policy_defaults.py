"""Canonical assessment policy defaults.

Every create path and policy-preset endpoint must use this module instead of
copying per-kind defaults into separate services.
"""

from __future__ import annotations

from fastapi import HTTPException, status

from src.db.assessments import AssessmentPolicyPreset
from src.db.grading.progress import AssessmentCompletionRule, AssessmentGradingMode, GradeReleaseMode
from src.db.grading.submissions import AssessmentType
from src.types import JsonObject


def default_anti_cheat(kind: AssessmentType) -> JsonObject:
    if kind != AssessmentType.EXAM:
        return {}
    return {
        "copy_paste_protection": True,
        "tab_switch_detection": True,
        "devtools_detection": True,
        "right_click_disable": True,
        "fullscreen_enforcement": True,
        "violation_threshold": 3,
    }


def get_policy_preset(kind: AssessmentType) -> AssessmentPolicyPreset:
    presets: dict[AssessmentType, AssessmentPolicyPreset] = {
        AssessmentType.EXAM: AssessmentPolicyPreset(
            kind=AssessmentType.EXAM,
            grade_release_mode=GradeReleaseMode.BATCH,
            grading_mode=AssessmentGradingMode.AUTO_THEN_MANUAL,
            completion_rule=AssessmentCompletionRule.PASSED,
            passing_score=60.0,
            max_attempts=1,
            time_limit_seconds=3600,
            allow_late=False,
            anti_cheat_enabled=True,
            review_visibility="SCORE_ONLY",
        ),
        AssessmentType.QUIZ: AssessmentPolicyPreset(
            kind=AssessmentType.QUIZ,
            grade_release_mode=GradeReleaseMode.IMMEDIATE,
            grading_mode=AssessmentGradingMode.AUTO,
            completion_rule=AssessmentCompletionRule.PASSED,
            passing_score=60.0,
            max_attempts=None,
            time_limit_seconds=None,
            allow_late=True,
            anti_cheat_enabled=False,
            review_visibility="FULL",
        ),
        AssessmentType.CODE_CHALLENGE: AssessmentPolicyPreset(
            kind=AssessmentType.CODE_CHALLENGE,
            grade_release_mode=GradeReleaseMode.IMMEDIATE,
            grading_mode=AssessmentGradingMode.AUTO,
            completion_rule=AssessmentCompletionRule.PASSED,
            passing_score=60.0,
            max_attempts=None,
            time_limit_seconds=None,
            allow_late=True,
            anti_cheat_enabled=False,
            review_visibility="SCORE_ONLY",
        ),
    }
    preset = presets.get(kind)
    if preset is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Предустановка политики оценивания не найдена",
        )
    return preset
