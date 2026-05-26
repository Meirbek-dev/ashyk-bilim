"""Orphan upload reaper — nightly background task.

Runs two sweeps:
1. Delete FINALIZED uploads that were never referenced (referenced_count == 0)
   and were finalised more than 24 hours ago.
2. Cancel CREATED/RECEIVING uploads that were started more than 1 hour ago and
   never finalised (likely abandoned by the client).

This is intentionally simple: it runs in-process on the same DB session and
does not need a distributed lock because the deletes are idempotent.
"""

import contextlib
import logging
from datetime import UTC, datetime, timedelta

from sqlmodel import Session, select

from src.db.uploads import Upload, UploadStatus

log = logging.getLogger(__name__)

# Orphan thresholds (see §4.1 of the overhaul plan)
_FINALIZED_ORPHAN_TTL = timedelta(hours=24)
_PENDING_ORPHAN_TTL = timedelta(hours=1)


def reap_orphan_uploads(db_session: Session) -> dict[str, int]:
    """Delete unreferenced uploads and cancel stale pending uploads.

    Returns a dict with counts of affected rows per action.
    """
    now = datetime.now(UTC)
    cancelled = 0
    deleted = 0

    # --- Cancel stale CREATED / RECEIVING uploads ---
    stale_cutoff = now - _PENDING_ORPHAN_TTL
    stale = db_session.exec(
        select(Upload).where(
            Upload.status.in_([UploadStatus.CREATED, UploadStatus.RECEIVING]),
            Upload.created_at < stale_cutoff,
        )
    ).all()
    for upload in stale:
        upload.status = UploadStatus.CANCELLED
        upload.updated_at = now
        db_session.add(upload)
        cancelled += 1

    # --- Delete unreferenced FINALIZED uploads ---
    orphan_cutoff = now - _FINALIZED_ORPHAN_TTL
    orphans = db_session.exec(
        select(Upload).where(
            Upload.status == UploadStatus.FINALIZED,
            Upload.referenced_count == 0,
            Upload.finalized_at < orphan_cutoff,
        )
    ).all()
    for upload in orphans:
        db_session.delete(upload)
        deleted += 1

    db_session.commit()

    # --- Clean up orphaned temporary chunk directories ---
    import shutil
    import time
    from pathlib import Path

    temp_uploads_root = Path("temp_uploads")
    if temp_uploads_root.exists():
        now_ts = time.time()
        cutoff_seconds = 2 * 3600  # 2 hours
        dirs_to_check = []
        for p in temp_uploads_root.iterdir():
            if p.is_dir():
                if p.name == "assessment":
                    dirs_to_check.extend(subp for subp in p.iterdir() if subp.is_dir())
                else:
                    dirs_to_check.append(p)

        for d in dirs_to_check:
            try:
                mtime = d.stat().st_mtime
                for filepath in d.rglob("*"):
                    with contextlib.suppress(Exception):
                        mtime = max(mtime, filepath.stat().st_mtime)
                if (now_ts - mtime) > cutoff_seconds:
                    shutil.rmtree(d)
                    log.info("upload_reaper: deleted stale temp upload directory %s", d)
            except Exception as e:
                log.warning(
                    "upload_reaper: failed to delete stale temp upload directory %s: %s",
                    d,
                    e,
                )

    log.info("upload_reaper: cancelled=%d deleted=%d", cancelled, deleted)
    return {"cancelled": cancelled, "deleted": deleted}
