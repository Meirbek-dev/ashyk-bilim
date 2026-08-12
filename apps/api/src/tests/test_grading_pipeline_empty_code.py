from types import SimpleNamespace
from typing import cast
from unittest.mock import AsyncMock

import pytest
from sqlmodel import Session

from src.db.assessments import CodeItemAnswer, CodeItemBody, CodeTestCase
from src.db.grading.submissions import Submission
from src.db.users import PublicUser
from src.services.grading.pipeline import orchestrator
from src.services.grading.settings_loader import AssessmentSettings, CanonicalAssessmentItem


@pytest.mark.anyio
async def test_final_code_grading_scores_blank_source_without_calling_judge0(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    service = SimpleNamespace(run=AsyncMock())
    monkeypatch.setattr(orchestrator, "get_code_execution_service", lambda: service)

    class SessionStub:
        def exec(self, _statement: object) -> object:
            return SimpleNamespace(first=lambda: None)

    item_uuid = "item_blank_code"
    settings = AssessmentSettings(
        items=[
            CanonicalAssessmentItem(
                item_uuid=item_uuid,
                kind="CODE",
                title="Blank code",
                body=CodeItemBody(
                    languages=[71],
                    tests=[CodeTestCase(input="1", expected_output="1"), CodeTestCase(input="2", expected_output="2")],
                ),
                max_score=100,
            )
        ]
    )
    answers = {item_uuid: CodeItemAnswer(language=71, source="   ")}

    enriched, payload = await orchestrator._run_final_code_answers(
        db_session=cast("Session", SessionStub()),
        settings=settings,
        answers_by_item_uuid=answers,
        answers_payload={"answers": []},
        current_user=cast("PublicUser", SimpleNamespace(id=7)),
        draft=cast("Submission", SimpleNamespace(activity_id=1, submission_uuid="submission_blank_code")),
    )

    service.run.assert_not_awaited()
    answer = cast("CodeItemAnswer", enriched[item_uuid])
    assert answer.latest_run is not None
    assert answer.latest_run.passed == 0
    assert answer.latest_run.total == 2
    assert answer.latest_run.score == 0.0
    assert payload["answers"] == [
        {
            "item_uuid": item_uuid,
            "answer": {
                "kind": "CODE",
                "language": 71,
                "source": "",
                "latest_run": {"passed": 0, "total": 2, "score": 0.0, "details": []},
            },
        }
    ]
