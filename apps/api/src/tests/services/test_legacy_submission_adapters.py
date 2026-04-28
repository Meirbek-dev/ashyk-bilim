from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def test_legacy_attempt_tables_are_only_written_by_adapters() -> None:
    """No new feature should write QuizAttempt or CodeSubmission directly."""

    allowed = {
        ROOT / "services" / "blocks" / "block_types" / "quizBlock" / "quizBlock.py",
        ROOT / "routers" / "courses" / "code_challenges.py",
    }
    writes: list[Path] = []

    for path in ROOT.rglob("*.py"):
        if "tests" in path.parts:
            continue
        text = path.read_text(encoding="utf-8")
        if (
            "db_session.add(quiz_attempt)" in text
            or "db_session.add(code_submission)" in text
        ):
            writes.append(path)

    assert set(writes) <= allowed
