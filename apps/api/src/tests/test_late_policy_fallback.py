import pathlib
import sys
from datetime import UTC, datetime

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2]))
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from src.db.grading.progress import (
    AssessmentPolicy,
    LatePolicyCutoff,
    LatePolicyNone,
    LatePolicyPenalty,
    deserialize_late_policy,
)


def test_deserialize_late_policy_none_fallbacks() -> None:
    # Test None, empty string, empty dict
    p1 = deserialize_late_policy(None)
    assert isinstance(p1, LatePolicyNone)
    assert p1.kind == "NONE"

    p2 = deserialize_late_policy("")
    assert isinstance(p2, LatePolicyNone)
    assert p2.kind == "NONE"

    p3 = deserialize_late_policy({})
    assert isinstance(p3, LatePolicyNone)
    assert p3.kind == "NONE"


def test_deserialize_late_policy_valid_values() -> None:
    # Test valid NONE policy
    p1 = deserialize_late_policy({"kind": "NONE"})
    assert isinstance(p1, LatePolicyNone)
    assert p1.kind == "NONE"

    # Test valid PENALTY policy
    p2 = deserialize_late_policy({"kind": "PENALTY", "percent_per_day": 10.0, "max_days": 5})
    assert isinstance(p2, LatePolicyPenalty)
    assert p2.kind == "PENALTY"
    assert p2.percent_per_day == 10.0
    assert p2.max_days == 5

    # Test valid CUTOFF policy
    cutoff_time = datetime(2026, 6, 11, 12, 0, 0, tzinfo=UTC)
    p3 = deserialize_late_policy({"kind": "CUTOFF", "cutoff_at": cutoff_time.isoformat()})
    assert isinstance(p3, LatePolicyCutoff)
    assert p3.kind == "CUTOFF"
    assert p3.cutoff_at == cutoff_time


def test_deserialize_late_policy_invalid_fallback() -> None:
    # Test invalid policy (missing fields or wrong kind) doesn't crash but falls back
    p1 = deserialize_late_policy({"kind": "PENALTY"})  # missing fields
    assert isinstance(p1, LatePolicyNone)
    assert p1.kind == "NONE"

    p2 = deserialize_late_policy({"kind": "UNKNOWN"})
    assert isinstance(p2, LatePolicyNone)
    assert p2.kind == "NONE"

    p3 = deserialize_late_policy("not a dict")
    assert isinstance(p3, LatePolicyNone)
    assert p3.kind == "NONE"


def test_assessment_policy_validation_uses_deserialize() -> None:
    # Verify that AssessmentPolicy validates late_policy_json safely via model_validate
    policy_dict = {
        "policy_uuid": "pol_1",
        "activity_id": 1,
        "assessment_type": "EXAM",
        "late_policy_json": {},
    }
    policy = AssessmentPolicy.model_validate(policy_dict)
    assert policy.late_policy_json == {"kind": "NONE"}

    # Test with invalid dict under late_policy_json
    policy_dict_invalid = {
        "policy_uuid": "pol_2",
        "activity_id": 2,
        "assessment_type": "EXAM",
        "late_policy_json": {"kind": "PENALTY"},  # invalid, missing percent_per_day/max_days
    }
    policy_invalid = AssessmentPolicy.model_validate(policy_dict_invalid)
    assert policy_invalid.late_policy_json == {"kind": "NONE"}
