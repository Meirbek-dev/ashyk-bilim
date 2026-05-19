import pathlib
import sys
from types import SimpleNamespace

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2]))
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from src.db.grading.submissions import AssessmentType
from src.services.grading.gradebook import _build_activity, _gradebook_assessment_type


def test_gradebook_ignores_unsupported_policy_type() -> None:
    policy = SimpleNamespace(assessment_type="UNSUPPORTED_TASK", due_at=None)

    assert _gradebook_assessment_type(policy) is None

    activity = SimpleNamespace(
        id=1,
        activity_uuid="activity_1",
        name="File submission",
        activity_type="TYPE_FILE_SUBMISSION",
        order=1,
    )

    payload = _build_activity(activity, policy)

    assert payload.assessment_type is None


def test_gradebook_keeps_supported_assessment_policy_type() -> None:
    policy = SimpleNamespace(assessment_type="QUIZ", due_at=None)

    assert _gradebook_assessment_type(policy) == AssessmentType.QUIZ
