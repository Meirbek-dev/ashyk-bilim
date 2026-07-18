import pytest

from src.services.events.subscribers.plagiarism import DisabledPlagiarismProvider


@pytest.mark.asyncio
async def test_default_plagiarism_provider_reports_disabled_without_clean_score() -> None:
    result = await DisabledPlagiarismProvider().check("submission-1", ["file-1"])

    assert result["status"] == "disabled"
    assert "score" not in result
    assert "flagged" not in result
