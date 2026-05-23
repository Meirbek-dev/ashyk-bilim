"""Background task: token-based plagiarism detection for text submissions.

Runs every ``POLL_INTERVAL_SECONDS`` (default 120). On each tick it finds
GRADED/PENDING submissions for each activity that have not yet been checked
(``plagiarism`` key absent from ``metadata_json``) and computes pairwise
cosine similarity between tokenised text answers. Submissions that exceed
``SIMILARITY_THRESHOLD`` are flagged and the result is written back to
``metadata_json["plagiarism"]``.

Wire into app startup via ``lifespan.py``::

    from src.tasks.plagiarism_checker import plagiarism_checker_loop
    asyncio.create_task(plagiarism_checker_loop(settings), name="plagiarism_checker")

Only OPEN_TEXT and ESSAY-type answers are compared. CODE answers are handled
by the ``PlagiarismSubscriber`` (file-upload path) and are skipped here.
"""

from __future__ import annotations

import asyncio
import logging
import math
import re
from collections import Counter
from collections.abc import Sequence
from datetime import UTC, datetime

from sqlmodel import Session, select

from src.db.grading.submissions import Submission, SubmissionStatus

logger = logging.getLogger(__name__)

POLL_INTERVAL_SECONDS: int = 120
# Cosine similarity threshold above which a pair is considered suspicious.
SIMILARITY_THRESHOLD: float = 0.85
# Maximum number of submissions to scan per activity per tick to avoid OOM.
_BATCH_SIZE: int = 200
# Assessment types that contain comparable text answers.
_TEXT_TYPES: frozenset[str] = frozenset({"OPEN_TEXT", "QUIZ", "ESSAY"})


# ── Tokeniser ─────────────────────────────────────────────────────────────────


def _tokenise(text: str) -> Counter[str]:
    """Lower-case, strip punctuation, split on whitespace.  Returns tf vector."""
    tokens = re.findall(r"[a-zа-яёіңғүұқөәA-ZА-ЯЁІҢҒҮҰҚӨӘa-zA-Z0-9_]{2,}", text.lower())
    return Counter(tokens)


def _cosine(a: Counter[str], b: Counter[str]) -> float:
    """Cosine similarity between two token-frequency vectors."""
    if not a or not b:
        return 0.0
    dot = sum(a[k] * b[k] for k in a if k in b)
    if dot == 0:
        return 0.0
    mag_a = math.sqrt(sum(v * v for v in a.values()))
    mag_b = math.sqrt(sum(v * v for v in b.values()))
    if mag_a == 0 or mag_b == 0:
        return 0.0
    return dot / (mag_a * mag_b)


def _extract_text_from_answers(answers_json: dict) -> str:
    """Concatenate all string answer values from the answers payload."""
    parts: list[str] = []
    for value in answers_json.values():
        if isinstance(value, str):
            parts.append(value)
        elif isinstance(value, list):
            parts.extend(str(v) for v in value if isinstance(v, str))
    return " ".join(parts)


# ── Main loop ─────────────────────────────────────────────────────────────────


async def plagiarism_checker_loop() -> None:
    """Periodic loop that checks submitted text answers for plagiarism."""
    logger.info(
        "Plagiarism checker started (poll interval: %ds, threshold: %.2f)",
        POLL_INTERVAL_SECONDS,
        SIMILARITY_THRESHOLD,
    )
    while True:
        await asyncio.sleep(POLL_INTERVAL_SECONDS)
        try:
            checked = await asyncio.to_thread(_run_check_tick)
            if checked:
                logger.info("Plagiarism checker: flagged %d submission pairs", checked)
        except Exception:
            logger.exception("Plagiarism checker tick failed; will retry next cycle")


# ── Sync worker (runs in thread pool) ────────────────────────────────────────


def _run_check_tick() -> int:
    """Find unchecked submissions per activity and run pairwise similarity.

    Returns the number of (submission, peer) pairs that were flagged.
    """
    try:
        from src.infra.db.engine import get_bg_engine

        engine = get_bg_engine()
    except RuntimeError:
        return 0  # engine not yet initialised (e.g. during test setup)

    flagged_pairs = 0
    now = datetime.now(UTC)

    with Session(engine) as session:
        # Find distinct activity IDs that have unchecked submissions.
        graded_statuses = (
            str(SubmissionStatus.GRADED),
            str(SubmissionStatus.PENDING),
        )
        unchecked: Sequence[Submission] = session.exec(
            select(Submission)
            .where(Submission.status.in_(graded_statuses))  # type: ignore[attr-defined]
            .where(
                # Submissions where plagiarism key is absent from metadata.
                # Use a JSON path expression: metadata_json->>'plagiarism' IS NULL.
                Submission.metadata_json["plagiarism"].as_string() is None
            )
            .where(Submission.assessment_type.in_(list(_TEXT_TYPES)))  # type: ignore[attr-defined]
            .limit(_BATCH_SIZE)
        ).all()

        if not unchecked:
            return 0

        # Group by activity so we compare within the same assessment.
        by_activity: dict[int, list[Submission]] = {}
        for sub in unchecked:
            by_activity.setdefault(sub.activity_id, []).append(sub)

        for activity_id, target_subs in by_activity.items():
            # Load all graded submissions for this activity as the comparison pool.
            pool: Sequence[Submission] = session.exec(
                select(Submission)
                .where(Submission.activity_id == activity_id)
                .where(Submission.status.in_(graded_statuses))  # type: ignore[attr-defined]
                .limit(_BATCH_SIZE)
            ).all()

            # Pre-compute token vectors for all pool members.
            pool_vectors: dict[str, Counter[str]] = {}
            for p in pool:
                text = _extract_text_from_answers(p.answers_json or {})
                if text.strip():
                    pool_vectors[p.submission_uuid] = _tokenise(text)

            for target in target_subs:
                try:
                    target_text = _extract_text_from_answers(target.answers_json or {})
                    if not target_text.strip():
                        _write_plagiarism_result(
                            target,
                            session,
                            score=0.0,
                            flagged=False,
                            details={},
                            now=now,
                            status="complete",
                        )
                        continue

                    target_vec = _tokenise(target_text)
                    max_score = 0.0
                    most_similar_uuid: str | None = None
                    flagged = False

                    for peer_uuid, peer_vec in pool_vectors.items():
                        if peer_uuid == target.submission_uuid:
                            continue
                        sim = _cosine(target_vec, peer_vec)
                        if sim > max_score:
                            max_score = sim
                            most_similar_uuid = peer_uuid
                        if sim >= SIMILARITY_THRESHOLD:
                            flagged = True

                    if flagged:
                        flagged_pairs += 1

                    details: dict = {}
                    if most_similar_uuid is not None:
                        details["most_similar_submission_uuid"] = most_similar_uuid
                        details["most_similar_score"] = round(max_score, 4)

                    _write_plagiarism_result(
                        target,
                        session,
                        score=max_score,
                        flagged=flagged,
                        details=details,
                        now=now,
                        status="complete",
                    )
                except Exception as exc:
                    logger.exception(
                        "Plagiarism check failed for submission %s",
                        target.submission_uuid,
                    )
                    _write_plagiarism_result(
                        target,
                        session,
                        score=0.0,
                        flagged=False,
                        details={},
                        now=now,
                        status="failed",
                        error=str(exc),
                    )

        session.commit()

    return flagged_pairs


def _write_plagiarism_result(
    submission: Submission,
    session: Session,
    *,
    score: float,
    flagged: bool,
    details: dict,
    now: datetime,
    status: str,
    error: str | None = None,
) -> None:
    """Write the plagiarism result back into the submission's metadata_json."""
    current_meta: dict = submission.metadata_json or {}
    current_meta["plagiarism"] = {
        "score": round(score, 4),
        "checked_at": now.isoformat(),
        "flagged": flagged,
        "details": details,
    }
    current_meta["plagiarism_status"] = status
    if error:
        current_meta["plagiarism_error"] = error
    else:
        current_meta.pop("plagiarism_error", None)
    submission.metadata_json = current_meta
    session.add(submission)
