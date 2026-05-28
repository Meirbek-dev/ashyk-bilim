import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2]))
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from src.services.assessments.settings import (
    ASSESSMENT_SETTINGS_ADAPTER,
    AccessModeEnum,
    CodeAssessmentSettings,
    ExamAssessmentSettings,
    ExecutionMode,
    GradingStrategy,
    validate_settings,
)


def test_code_settings_round_trip_json_enum_values_in_strict_mode() -> None:
    settings = ASSESSMENT_SETTINGS_ADAPTER.validate_python(
        {
            "kind": "CODE_CHALLENGE",
            "grading_strategy": "PARTIAL_CREDIT",
            "execution_mode": "COMPLETE_FEEDBACK",
        },
        strict=True,
    )

    assert isinstance(settings, CodeAssessmentSettings)
    assert settings.grading_strategy is GradingStrategy.PARTIAL_CREDIT
    assert settings.execution_mode is ExecutionMode.COMPLETE_FEEDBACK

    reloaded = validate_settings(settings.model_dump(mode="json"))

    assert isinstance(reloaded, CodeAssessmentSettings)
    assert reloaded.grading_strategy is GradingStrategy.PARTIAL_CREDIT
    assert reloaded.execution_mode is ExecutionMode.COMPLETE_FEEDBACK


def test_exam_settings_accept_json_access_mode_in_strict_mode() -> None:
    settings = ASSESSMENT_SETTINGS_ADAPTER.validate_python(
        {
            "kind": "EXAM",
            "access_mode": "ALL_ENROLLED",
        },
        strict=True,
    )

    assert isinstance(settings, ExamAssessmentSettings)
    assert settings.access_mode is AccessModeEnum.ALL_ENROLLED
