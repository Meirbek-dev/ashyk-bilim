"""Auto-submit retry backoff for timed-out drafts.

A draft that keeps failing stays DRAFT, so without a backoff the timer would
retry it on every tick forever (and keep hammering Judge0 with it).
"""

from datetime import UTC, datetime, timedelta
from typing import cast

from sqlmodel import Session

from src.db.grading.submissions import Submission
from src.tasks.assessment_timer import (
    MAX_AUTO_SUBMIT_ATTEMPTS,
    RETRY_BACKOFF_BASE_SECONDS,
    _is_backing_off,
    _record_failed_attempt,
)
from src.types import JsonObject

NOW = datetime(2026, 8, 12, 18, 0, tzinfo=UTC)


class SessionStub:
    def __init__(self) -> None:
        self.commits = 0

    def add(self, _instance: object) -> None:
        return None

    def commit(self) -> None:
        self.commits += 1

    def rollback(self) -> None:
        return None


def _submission(metadata: JsonObject | None = None) -> Submission:
    return cast(
        "Submission",
        type("SubmissionStub", (), {"submission_uuid": "submission_stuck", "metadata_json": metadata})(),
    )


def test_first_failure_is_not_backing_off() -> None:
    assert _is_backing_off(None, NOW) is False
    assert _is_backing_off({}, NOW) is False


def test_recorded_failure_backs_off_then_becomes_eligible_again() -> None:
    submission = _submission()
    session = SessionStub()

    _record_failed_attempt(submission, cast("Session", session), now=NOW)

    assert session.commits == 1
    assert submission.metadata_json["auto_submit_failed_attempts"] == 1
    assert _is_backing_off(submission.metadata_json, NOW) is True
    assert _is_backing_off(submission.metadata_json, NOW + timedelta(seconds=RETRY_BACKOFF_BASE_SECONDS)) is False


def test_backoff_grows_and_stops_after_max_attempts() -> None:
    submission = _submission()
    session = SessionStub()

    for _ in range(MAX_AUTO_SUBMIT_ATTEMPTS):
        _record_failed_attempt(submission, cast("Session", session), now=NOW)

    assert submission.metadata_json["auto_submit_failed_attempts"] == MAX_AUTO_SUBMIT_ATTEMPTS
    # Exhausted drafts are never picked up again, however long we wait.
    assert _is_backing_off(submission.metadata_json, NOW + timedelta(days=7)) is True
