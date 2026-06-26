import pathlib
import sys

from src.types.simple_namespace import SimpleNamespace

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2]))
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from src.db.grading.progress import ActivityProgress, ActivityProgressState
from src.db.grading.submissions import AssessmentType
from src.services.grading.gradebook import (
    _build_activity,
    _gradebook_assessment_type,
    _student_matches_saved_filter,
)


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


def test_gradebook_saved_filter_matching_includes_synthetic_not_started_cells() -> None:
    progress_by_pair = {
        (10, 1): ActivityProgress(
            course_id=1,
            activity_id=1,
            user_id=10,
            state=ActivityProgressState.NEEDS_GRADING,
            teacher_action_required=True,
        ),
        (10, 2): ActivityProgress(
            course_id=1,
            activity_id=2,
            user_id=10,
            state=ActivityProgressState.FAILED,
            passed=False,
        ),
    }

    assert _student_matches_saved_filter(10, [1, 2, 3], progress_by_pair, "needs_grading")
    assert _student_matches_saved_filter(10, [1, 2, 3], progress_by_pair, "failed")
    assert _student_matches_saved_filter(10, [1, 2, 3], progress_by_pair, "not_started")
    assert not _student_matches_saved_filter(10, [1, 2, 3], progress_by_pair, "returned")
