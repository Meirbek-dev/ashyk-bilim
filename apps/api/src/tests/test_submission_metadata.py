import pathlib
import sys
from datetime import UTC, datetime

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2]))
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from src.db.grading.submissions import (
    CodeRunRecord,
    SubmissionMetadata,
    merge_submission_metadata,
)


def test_merge_submission_metadata_accepts_json_code_run_timestamp() -> None:
    record = CodeRunRecord(
        run_id="code_run_1",
        language_id=71,
        status="ACCEPTED",
        passed=1,
        total=1,
        created_at=datetime(2026, 5, 22, 16, 57, 22, tzinfo=UTC),
    )

    metadata = merge_submission_metadata(
        {},
        latest_run=record.model_dump(mode="json"),
    )

    assert metadata["latest_run"]["created_at"] == "2026-05-22T16:57:22Z"


def test_submission_metadata_accepts_json_timestamps_in_strict_mode() -> None:
    metadata = SubmissionMetadata.model_validate(
        {
            "latest_run": {
                "run_id": "code_run_1",
                "language_id": 71,
                "created_at": "2026-05-22T16:57:22.370168Z",
            },
            "runs": [
                {
                    "run_id": "code_run_2",
                    "language_id": 71,
                    "created_at": "2026-05-22T16:57:24.420632Z",
                }
            ],
            "violations": [
                {
                    "kind": "TAB_SWITCH",
                    "occurred_at": "2026-05-22T16:57:25Z",
                }
            ],
            "plagiarism": {
                "score": 0.12,
                "checked_at": "2026-05-22T16:57:26Z",
            },
        },
        strict=True,
    )

    assert metadata.latest_run is not None
    assert metadata.latest_run.created_at == datetime(2026, 5, 22, 16, 57, 22, 370168, tzinfo=UTC)
