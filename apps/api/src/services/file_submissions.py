"""Service layer for first-class file submission activities."""

from __future__ import annotations

import csv
import io
import zipfile
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import func, or_
from sqlmodel import Session, select
from ulid import ULID

from src.db.courses.activities import (
    Activity,
    ActivitySubTypeEnum,
    ActivityTypeEnum,
)
from src.db.courses.chapters import Chapter
from src.db.courses.courses import Course
from src.db.file_submissions import (
    FileSubmissionActivity,
    FileSubmissionAttempt,
    FileSubmissionAttemptFile,
    FileSubmissionAttemptFileRead,
    FileSubmissionAttemptRead,
    FileSubmissionAttemptStatus,
    FileSubmissionCreate,
    FileSubmissionDraftPatch,
    FileSubmissionFilePatch,
    FileSubmissionGradePatch,
    FileSubmissionLifecycle,
    FileSubmissionRead,
    FileSubmissionReviewQueue,
    FileSubmissionScanStatus,
    FileSubmissionUpdate,
    FileSubmissionUserRead,
)
from src.db.grading.progress import (
    LATE_POLICY_ADAPTER,
    ActivityProgress,
    ActivityProgressState,
    AssessmentCompletionRule,
    LatePolicyNone,
)
from src.db.uploads import Upload, UploadStatus
from src.db.users import AnonymousUser, PublicUser, User
from src.security.rbac import PermissionChecker
from src.services.courses._utils import (
    _get_activity_by_uuid_or_404,
    _next_activity_order,
)
from src.services.courses.access import user_has_course_access
from src.services.events import get_event_bus
from src.services.events.types import (
    FileSubmissionGradedEvent,
    FileSubmissionPublishedEvent,
    FileSubmissionReturnedEvent,
    FileSubmissionSubmittedEvent,
)
from src.services.progress.submissions import recalculate_course_progress


def _now() -> datetime:
    return datetime.now(UTC)


async def create_file_submission(
    payload: FileSubmissionCreate,
    current_user: PublicUser,
    db_session: Session,
) -> FileSubmissionRead:
    course = _get_course_or_404(payload.course_id, db_session)
    chapter = _get_chapter_or_404(payload.chapter_id, db_session)
    if chapter.course_id != course.id:
        raise HTTPException(status_code=400, detail="Chapter does not belong to course")
    _require_author(current_user, course, db_session)

    now = _now()
    activity = Activity(
        name=payload.title,
        activity_type=ActivityTypeEnum.TYPE_FILE_SUBMISSION,
        activity_sub_type=ActivitySubTypeEnum.SUBTYPE_FILE_SUBMISSION_STANDARD,
        content={},
        details={"lifecycle_status": FileSubmissionLifecycle.DRAFT.value},
        settings={"kind": "FILE_SUBMISSION"},
        published=False,
        chapter_id=chapter.id,
        course_id=course.id,
        order=_next_activity_order(chapter.id, db_session),
        creator_id=current_user.id,
        activity_uuid=f"activity_{ULID()}",
        creation_date=now,
        update_date=now,
    )
    db_session.add(activity)
    db_session.flush()

    file_submission = FileSubmissionActivity(
        file_submission_uuid=f"filesub_{ULID()}",
        activity_id=activity.id,
        instructions=payload.instructions,
        rubric_json=payload.rubric,
        allowed_mime_types=_normalize_mimes(payload.allowed_mime_types),
        max_files=payload.max_files,
        max_file_size_mb=payload.max_file_size_mb,
        due_at=payload.due_at,
        allow_late=payload.allow_late,
        late_policy_json=payload.late_policy
        or LatePolicyNone().model_dump(mode="json"),
        max_attempts=payload.max_attempts,
        grade_release_mode=payload.grade_release_mode,
        settings_json=payload.settings,
        created_at=now,
        updated_at=now,
    )
    db_session.add(file_submission)
    db_session.commit()
    db_session.refresh(file_submission)
    return _build_file_submission_read(
        file_submission, current_user=current_user, db_session=db_session
    )


async def get_file_submission_by_activity_uuid(
    activity_uuid: str,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
) -> FileSubmissionRead:
    file_submission, activity, course = _get_context_by_activity_uuid(
        activity_uuid, db_session
    )
    _require_read(current_user, activity, course, db_session)
    return _build_file_submission_read(
        file_submission, current_user=current_user, db_session=db_session
    )


async def get_file_submission(
    file_submission_uuid: str,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
) -> FileSubmissionRead:
    file_submission, activity, course = _get_context(file_submission_uuid, db_session)
    _require_read(current_user, activity, course, db_session)
    return _build_file_submission_read(
        file_submission, current_user=current_user, db_session=db_session
    )


async def update_file_submission(
    file_submission_uuid: str,
    payload: FileSubmissionUpdate,
    current_user: PublicUser,
    db_session: Session,
) -> FileSubmissionRead:
    file_submission, activity, course = _get_context(file_submission_uuid, db_session)
    _require_author(current_user, course, db_session)
    _ensure_authorable(file_submission)

    changes = payload.model_dump(exclude_unset=True)
    if "title" in changes and payload.title is not None:
        activity.name = payload.title
    if "instructions" in changes and payload.instructions is not None:
        file_submission.instructions = payload.instructions
    if payload.allowed_mime_types is not None:
        file_submission.allowed_mime_types = _normalize_mimes(
            payload.allowed_mime_types
        )
    for attr in (
        "max_files",
        "max_file_size_mb",
        "due_at",
        "allow_late",
        "max_attempts",
        "grade_release_mode",
    ):
        if attr in changes:
            setattr(file_submission, attr, changes[attr])
    if payload.late_policy is not None:
        file_submission.late_policy_json = payload.late_policy
    if payload.rubric is not None:
        file_submission.rubric_json = payload.rubric
    if payload.settings is not None:
        file_submission.settings_json = payload.settings

    now = _now()
    file_submission.updated_at = now
    activity.update_date = now
    db_session.add(file_submission)
    db_session.add(activity)
    db_session.commit()
    db_session.refresh(file_submission)
    return _build_file_submission_read(
        file_submission, current_user=current_user, db_session=db_session
    )


async def publish_file_submission(
    file_submission_uuid: str,
    current_user: PublicUser,
    db_session: Session,
) -> FileSubmissionRead:
    file_submission, activity, course = _get_context(file_submission_uuid, db_session)
    _require_author(current_user, course, db_session)
    if not activity.name.strip():
        raise HTTPException(status_code=422, detail="Title is required")
    if not file_submission.instructions.strip():
        raise HTTPException(status_code=422, detail="Instructions are required")

    now = _now()
    file_submission.lifecycle = FileSubmissionLifecycle.PUBLISHED
    file_submission.published_at = file_submission.published_at or now
    file_submission.archived_at = None
    file_submission.updated_at = now
    activity.published = True
    activity.details = {
        **(activity.details if isinstance(activity.details, dict) else {}),
        "lifecycle_status": FileSubmissionLifecycle.PUBLISHED.value,
        "published_at": file_submission.published_at.isoformat(),
        "archived_at": None,
    }
    activity.update_date = now
    db_session.add(file_submission)
    db_session.add(activity)
    db_session.commit()
    db_session.refresh(file_submission)
    return _build_file_submission_read(
        file_submission, current_user=current_user, db_session=db_session
    )


async def get_my_file_submission_draft(
    file_submission_uuid: str,
    current_user: PublicUser,
    db_session: Session,
) -> FileSubmissionAttemptRead | None:
    file_submission, activity, course = _get_context(file_submission_uuid, db_session)
    _require_submit_access(current_user, activity, course, db_session)
    draft = _get_current_draft(file_submission, current_user.id, db_session)
    return _build_attempt_read(draft, db_session) if draft else None


async def start_file_submission_draft(
    file_submission_uuid: str,
    current_user: PublicUser,
    db_session: Session,
) -> FileSubmissionAttemptRead:
    file_submission, activity, course = _get_context(file_submission_uuid, db_session)
    _require_submit_access(current_user, activity, course, db_session)
    _require_published(file_submission, activity)

    existing = _get_current_draft(file_submission, current_user.id, db_session)
    if existing is not None:
        return _build_attempt_read(existing, db_session)

    completed_attempts = _count_completed_attempts(
        file_submission, current_user.id, db_session
    )
    if (
        file_submission.max_attempts is not None
        and completed_attempts >= file_submission.max_attempts
    ):
        raise HTTPException(status_code=409, detail="Attempt limit reached")

    now = _now()
    attempt = FileSubmissionAttempt(
        attempt_uuid=f"filesub_attempt_{ULID()}",
        file_submission_id=file_submission.id,
        activity_id=activity.id,
        user_id=current_user.id,
        status=FileSubmissionAttemptStatus.DRAFT,
        attempt_number=completed_attempts + 1,
        started_at=now,
        created_at=now,
        updated_at=now,
    )
    db_session.add(attempt)
    db_session.flush()
    _project_file_submission_progress(attempt, file_submission, activity, db_session)
    db_session.commit()
    db_session.refresh(attempt)
    return _build_attempt_read(attempt, db_session)


async def save_file_submission_draft(
    file_submission_uuid: str,
    payload: FileSubmissionDraftPatch,
    current_user: PublicUser,
    db_session: Session,
    *,
    if_match: str | None = None,
) -> FileSubmissionAttemptRead:
    file_submission, activity, course = _get_context(file_submission_uuid, db_session)
    _require_submit_access(current_user, activity, course, db_session)
    draft = _get_current_draft(file_submission, current_user.id, db_session)
    if draft is None:
        draft = await _create_draft_without_commit(
            file_submission, activity, current_user, db_session
        )
    _check_version(draft, if_match)
    _replace_attempt_files(
        draft, file_submission, payload.files, current_user, db_session
    )
    draft.version += 1
    draft.updated_at = _now()
    db_session.add(draft)
    db_session.flush()
    _project_file_submission_progress(draft, file_submission, activity, db_session)
    db_session.commit()
    db_session.refresh(draft)
    return _build_attempt_read(draft, db_session)


async def submit_file_submission(
    file_submission_uuid: str,
    payload: FileSubmissionDraftPatch | None,
    current_user: PublicUser,
    db_session: Session,
    *,
    if_match: str | None = None,
) -> FileSubmissionAttemptRead:
    file_submission, activity, course = _get_context(file_submission_uuid, db_session)
    _require_submit_access(current_user, activity, course, db_session)
    _require_published(file_submission, activity)
    draft = _get_current_draft(file_submission, current_user.id, db_session)
    if draft is None:
        draft = await _create_draft_without_commit(
            file_submission, activity, current_user, db_session
        )
    _check_version(draft, if_match)
    if payload is not None:
        _replace_attempt_files(
            draft, file_submission, payload.files, current_user, db_session
        )
    files = _attempt_files(draft, db_session)
    if not files:
        raise HTTPException(status_code=422, detail="At least one file is required")

    now = _now()
    late_penalty = _late_penalty(file_submission, now)
    draft.status = FileSubmissionAttemptStatus.SUBMITTED
    draft.submitted_at = now
    draft.is_late = bool(file_submission.due_at and now > file_submission.due_at)
    draft.late_penalty_pct = late_penalty
    draft.version += 1
    draft.updated_at = now
    db_session.add(draft)
    db_session.flush()
    _project_file_submission_progress(draft, file_submission, activity, db_session)
    db_session.commit()
    db_session.refresh(draft)

    await get_event_bus().emit(
        FileSubmissionSubmittedEvent(
            attempt_uuid=draft.attempt_uuid,
            file_submission_uuid=file_submission.file_submission_uuid,
            user_id=draft.user_id,
            activity_id=draft.activity_id,
            attempt_number=draft.attempt_number,
            is_late=draft.is_late,
            file_keys=[
                file.storage_key or str(file.upload_id)
                for file in _attempt_files(draft, db_session)
            ],
        )
    )
    return _build_attempt_read(draft, db_session)


async def list_my_file_submission_attempts(
    file_submission_uuid: str,
    current_user: PublicUser,
    db_session: Session,
) -> list[FileSubmissionAttemptRead]:
    file_submission, activity, course = _get_context(file_submission_uuid, db_session)
    _require_submit_access(current_user, activity, course, db_session)
    attempts = db_session.exec(
        select(FileSubmissionAttempt)
        .where(
            FileSubmissionAttempt.file_submission_id == file_submission.id,
            FileSubmissionAttempt.user_id == current_user.id,
        )
        .order_by(FileSubmissionAttempt.attempt_number.desc())
    ).all()
    return [_build_attempt_read(attempt, db_session) for attempt in attempts]


async def list_file_submission_submissions(
    file_submission_uuid: str,
    current_user: PublicUser,
    db_session: Session,
    *,
    status_filter: str | None = None,
    search: str | None = None,
    page: int = 1,
    page_size: int = 25,
) -> FileSubmissionReviewQueue:
    file_submission, _activity, course = _get_context(file_submission_uuid, db_session)
    _require_grade(current_user, course, db_session)
    stmt = (
        select(FileSubmissionAttempt)
        .join(User, User.id == FileSubmissionAttempt.user_id)
        .where(FileSubmissionAttempt.file_submission_id == file_submission.id)
    )
    if status_filter:
        stmt = stmt.where(FileSubmissionAttempt.status == status_filter)
    if search:
        pattern = f"%{search.strip()}%"
        stmt = stmt.where(
            or_(
                User.username.ilike(pattern),
                User.email.ilike(pattern),
                User.first_name.ilike(pattern),
                User.last_name.ilike(pattern),
            )
        )
    total = db_session.exec(select(func.count()).select_from(stmt.subquery())).one()
    attempts = db_session.exec(
        stmt
        .order_by(FileSubmissionAttempt.submitted_at.desc().nullslast())
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()
    return FileSubmissionReviewQueue(
        items=[
            _build_attempt_read(attempt, db_session, include_user=True)
            for attempt in attempts
        ],
        total=total,
        page=page,
        page_size=page_size,
    )


async def grade_file_submission_attempt(
    file_submission_uuid: str,
    attempt_uuid: str,
    payload: FileSubmissionGradePatch,
    current_user: PublicUser,
    db_session: Session,
    *,
    if_match: str | None = None,
) -> FileSubmissionAttemptRead:
    file_submission, activity, course = _get_context(file_submission_uuid, db_session)
    _require_grade(current_user, course, db_session)
    attempt = _get_attempt_or_404(file_submission, attempt_uuid, db_session)
    _check_version(attempt, if_match)
    now = _now()

    if payload.status in {"GRADED", "PUBLISHED"} and payload.final_score is None:
        raise HTTPException(status_code=422, detail="final_score is required")

    attempt.final_score = payload.final_score
    attempt.feedback_json = {"feedback": payload.feedback, "rubric": payload.rubric}
    attempt.status = FileSubmissionAttemptStatus(payload.status)
    attempt.graded_at = now
    attempt.version += 1
    attempt.updated_at = now
    db_session.add(attempt)
    db_session.flush()
    _project_file_submission_progress(attempt, file_submission, activity, db_session)
    db_session.commit()
    db_session.refresh(attempt)

    bus = get_event_bus()
    if attempt.status == FileSubmissionAttemptStatus.RETURNED:
        await bus.emit(
            FileSubmissionReturnedEvent(
                attempt_uuid=attempt.attempt_uuid,
                user_id=attempt.user_id,
                feedback=payload.feedback,
                returned_at=now,
            )
        )
    elif attempt.status == FileSubmissionAttemptStatus.PUBLISHED:
        await bus.emit(
            FileSubmissionPublishedEvent(
                attempt_uuid=attempt.attempt_uuid,
                user_id=attempt.user_id,
                final_score=float(attempt.final_score or 0),
                published_at=now,
                graded_by=current_user.id,
            )
        )
    else:
        await bus.emit(
            FileSubmissionGradedEvent(
                attempt_uuid=attempt.attempt_uuid,
                user_id=attempt.user_id,
                final_score=float(attempt.final_score or 0),
                graded_at=now,
                graded_by=current_user.id,
            )
        )
    return _build_attempt_read(attempt, db_session, include_user=True)


async def export_file_submission_csv(
    file_submission_uuid: str,
    current_user: PublicUser,
    db_session: Session,
) -> str:
    file_submission, _activity, course = _get_context(file_submission_uuid, db_session)
    _require_grade(current_user, course, db_session)
    attempts = db_session.exec(
        select(FileSubmissionAttempt)
        .where(FileSubmissionAttempt.file_submission_id == file_submission.id)
        .order_by(FileSubmissionAttempt.submitted_at.desc().nullslast())
    ).all()
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow([
        "attempt_uuid",
        "user_id",
        "status",
        "attempt_number",
        "submitted_at",
        "is_late",
        "final_score",
        "file_count",
    ])
    for attempt in attempts:
        writer.writerow([
            attempt.attempt_uuid,
            attempt.user_id,
            str(attempt.status),
            attempt.attempt_number,
            attempt.submitted_at.isoformat() if attempt.submitted_at else "",
            attempt.is_late,
            attempt.final_score if attempt.final_score is not None else "",
            len(_attempt_files(attempt, db_session)),
        ])
    return buffer.getvalue()


async def build_file_submission_zip(
    file_submission_uuid: str,
    attempt_uuids: list[str],
    current_user: PublicUser,
    db_session: Session,
) -> bytes:
    file_submission, _activity, course = _get_context(file_submission_uuid, db_session)
    _require_grade(current_user, course, db_session)
    stmt = select(FileSubmissionAttempt).where(
        FileSubmissionAttempt.file_submission_id == file_submission.id
    )
    if attempt_uuids:
        stmt = stmt.where(FileSubmissionAttempt.attempt_uuid.in_(attempt_uuids))
    attempts = db_session.exec(stmt).all()
    output = io.BytesIO()
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for attempt in attempts:
            for file in _attempt_files(attempt, db_session):
                upload = db_session.get(Upload, file.upload_id)
                name = f"{attempt.attempt_uuid}/{file.display_name or file.attempt_file_uuid}"
                body = _read_upload_bytes(upload, db_session) if upload else None
                if body is not None:
                    archive.writestr(name, body)
                else:
                    archive.writestr(
                        f"{name}.missing.txt",
                        (
                            "File content was not available in local storage.\n"
                            f"storage_key={file.storage_key or ''}\n"
                            f"sha256={file.sha256 or ''}\n"
                        ),
                    )
    return output.getvalue()


async def get_file_submission_attempt_file_upload(
    attempt_file_uuid: str,
    current_user: PublicUser,
    db_session: Session,
) -> Upload:
    attempt_file = db_session.exec(
        select(FileSubmissionAttemptFile).where(
            FileSubmissionAttemptFile.attempt_file_uuid == attempt_file_uuid
        )
    ).first()
    if attempt_file is None:
        raise HTTPException(status_code=404, detail="Submitted file not found")
    attempt = db_session.get(FileSubmissionAttempt, attempt_file.attempt_id)
    if attempt is None:
        raise HTTPException(status_code=404, detail="Submission attempt not found")
    file_submission = db_session.get(FileSubmissionActivity, attempt.file_submission_id)
    if file_submission is None:
        raise HTTPException(status_code=404, detail="File submission not found")
    activity = db_session.get(Activity, attempt.activity_id)
    if activity is None:
        raise HTTPException(status_code=404, detail="Activity not found")
    course = _get_course_for_activity(activity, db_session)

    if attempt.user_id == current_user.id:
        _require_submit_access(current_user, activity, course, db_session)
    else:
        _require_grade(current_user, course, db_session)

    upload = db_session.get(Upload, attempt_file.upload_id)
    if upload is None:
        raise HTTPException(status_code=404, detail="Upload not found")
    if upload.status != UploadStatus.FINALIZED:
        raise HTTPException(status_code=409, detail="Upload is not finalised")
    return upload


def read_file_submission_upload_bytes(upload: Upload, db_session: Session) -> bytes:
    body = _read_upload_bytes(upload, db_session)
    if body is None:
        raise HTTPException(status_code=404, detail="File bytes not found")
    return body


def file_submission_attempts_for_gradebook(
    activity_ids: set[int],
    db_session: Session,
    *,
    student_ids: list[int] | None = None,
) -> dict[tuple[int, int], FileSubmissionAttempt]:
    if not activity_ids:
        return {}
    query = select(FileSubmissionAttempt).where(
        FileSubmissionAttempt.activity_id.in_(activity_ids)
    )
    if student_ids is not None:
        if not student_ids:
            return {}
        query = query.where(FileSubmissionAttempt.user_id.in_(student_ids))
    attempts = db_session.exec(
        query.order_by(FileSubmissionAttempt.updated_at, FileSubmissionAttempt.id)
    ).all()
    result: dict[tuple[int, int], FileSubmissionAttempt] = {}
    for attempt in attempts:
        result[attempt.user_id, attempt.activity_id] = attempt
    return result


def file_submission_configs_for_activities(
    activity_ids: set[int],
    db_session: Session,
) -> dict[int, FileSubmissionActivity]:
    if not activity_ids:
        return {}
    configs = db_session.exec(
        select(FileSubmissionActivity).where(
            FileSubmissionActivity.activity_id.in_(activity_ids)
        )
    ).all()
    return {config.activity_id: config for config in configs}


async def _create_draft_without_commit(
    file_submission: FileSubmissionActivity,
    activity: Activity,
    current_user: PublicUser,
    db_session: Session,
) -> FileSubmissionAttempt:
    completed_attempts = _count_completed_attempts(
        file_submission, current_user.id, db_session
    )
    if (
        file_submission.max_attempts is not None
        and completed_attempts >= file_submission.max_attempts
    ):
        raise HTTPException(status_code=409, detail="Attempt limit reached")
    now = _now()
    draft = FileSubmissionAttempt(
        attempt_uuid=f"filesub_attempt_{ULID()}",
        file_submission_id=file_submission.id,
        activity_id=activity.id,
        user_id=current_user.id,
        status=FileSubmissionAttemptStatus.DRAFT,
        attempt_number=completed_attempts + 1,
        started_at=now,
        created_at=now,
        updated_at=now,
    )
    db_session.add(draft)
    db_session.flush()
    return draft


def _replace_attempt_files(
    attempt: FileSubmissionAttempt,
    file_submission: FileSubmissionActivity,
    files: list[FileSubmissionFilePatch],
    current_user: PublicUser,
    db_session: Session,
) -> None:
    if len(files) > file_submission.max_files:
        raise HTTPException(status_code=422, detail="Too many files")
    seen: set[str] = set()
    uploads: list[Upload] = []
    for file_ref in files:
        if file_ref.upload_uuid in seen:
            raise HTTPException(status_code=422, detail="Duplicate file upload")
        seen.add(file_ref.upload_uuid)
        upload = db_session.exec(
            select(Upload).where(Upload.upload_uuid == file_ref.upload_uuid)
        ).first()
        if (
            upload is None
            or upload.user_id != current_user.id
            or upload.status != UploadStatus.FINALIZED
        ):
            raise HTTPException(status_code=422, detail="Upload is not finalized")
        if (
            file_submission.allowed_mime_types
            and upload.content_type not in file_submission.allowed_mime_types
        ):
            raise HTTPException(status_code=422, detail="File type is not allowed")
        if (
            file_submission.max_file_size_mb is not None
            and upload.size_bytes is not None
            and upload.size_bytes > file_submission.max_file_size_mb * 1024 * 1024
        ):
            raise HTTPException(status_code=422, detail="File is too large")
        uploads.append(upload)

    for existing in _attempt_files(attempt, db_session):
        db_session.delete(existing)
    db_session.flush()

    now = _now()
    for position, (file_ref, upload) in enumerate(zip(files, uploads, strict=True)):
        upload.referenced_at = upload.referenced_at or now
        upload.referenced_count = (upload.referenced_count or 0) + 1
        upload.updated_at = now
        db_session.add(upload)
        db_session.add(
            FileSubmissionAttemptFile(
                attempt_file_uuid=f"filesub_file_{ULID()}",
                attempt_id=attempt.id,
                upload_id=upload.id,
                display_name=file_ref.display_name or upload.filename,
                content_type=upload.content_type,
                size_bytes=upload.size_bytes,
                sha256=upload.sha256,
                storage_key=upload.storage_key,
                position=position,
                scan_status=FileSubmissionScanStatus.PENDING,
                created_at=now,
            )
        )
    db_session.flush()


def _project_file_submission_progress(
    attempt: FileSubmissionAttempt,
    file_submission: FileSubmissionActivity,
    activity: Activity,
    db_session: Session,
) -> None:
    if activity.course_id is None:
        return
    progress = db_session.exec(
        select(ActivityProgress).where(
            ActivityProgress.activity_id == activity.id,
            ActivityProgress.user_id == attempt.user_id,
        )
    ).first()
    if progress is None:
        progress = ActivityProgress(
            course_id=activity.course_id,
            activity_id=activity.id,
            user_id=attempt.user_id,
        )

    status_value = str(attempt.status)
    score = attempt.final_score
    passed = score is not None and score >= 60
    teacher_action = False
    state = ActivityProgressState.NOT_STARTED
    completed_at = None
    status_reason = "file_submission"

    if status_value == FileSubmissionAttemptStatus.DRAFT.value:
        state = ActivityProgressState.IN_PROGRESS
    elif status_value == FileSubmissionAttemptStatus.SUBMITTED.value:
        state = ActivityProgressState.NEEDS_GRADING
        teacher_action = True
    elif status_value == FileSubmissionAttemptStatus.RETURNED.value:
        state = ActivityProgressState.RETURNED
        status_reason = "returned_for_revision"
    elif status_value in {
        FileSubmissionAttemptStatus.GRADED.value,
        FileSubmissionAttemptStatus.PUBLISHED.value,
    }:
        state = ActivityProgressState.PASSED if passed else ActivityProgressState.FAILED
        completed_at = attempt.graded_at or attempt.submitted_at or attempt.updated_at

    progress.required = True
    progress.state = state
    progress.score = score
    progress.passed = passed if score is not None else None
    progress.best_submission_id = None
    progress.latest_submission_id = None
    progress.attempt_count = _count_completed_attempts(
        file_submission, attempt.user_id, db_session
    )
    progress.started_at = attempt.started_at
    progress.last_activity_at = attempt.updated_at
    progress.submitted_at = attempt.submitted_at
    progress.graded_at = attempt.graded_at
    progress.completed_at = completed_at
    progress.due_at = file_submission.due_at
    progress.is_late = attempt.is_late
    progress.teacher_action_required = teacher_action
    progress.status_reason = status_reason
    progress.updated_at = _now()
    db_session.add(progress)
    recalculate_course_progress(
        activity.course_id,
        attempt.user_id,
        db_session,
        commit=False,
    )


def _late_penalty(
    file_submission: FileSubmissionActivity, submitted_at: datetime
) -> float:
    if file_submission.due_at is None or submitted_at <= file_submission.due_at:
        return 0.0
    if not file_submission.allow_late:
        raise HTTPException(status_code=409, detail="Late submissions are closed")
    policy = LATE_POLICY_ADAPTER.validate_python(
        file_submission.late_policy_json or {"kind": "NONE"}
    )
    return float(policy.apply(submitted_at, file_submission.due_at))


def _get_context(
    file_submission_uuid: str,
    db_session: Session,
) -> tuple[FileSubmissionActivity, Activity, Course]:
    normalized = (
        file_submission_uuid
        if file_submission_uuid.startswith("filesub_")
        else f"filesub_{file_submission_uuid}"
    )
    file_submission = db_session.exec(
        select(FileSubmissionActivity).where(
            FileSubmissionActivity.file_submission_uuid == normalized
        )
    ).first()
    if file_submission is None:
        raise HTTPException(status_code=404, detail="File submission not found")
    activity = db_session.get(Activity, file_submission.activity_id)
    if activity is None:
        raise HTTPException(status_code=404, detail="Activity not found")
    course = _get_course_for_activity(activity, db_session)
    return file_submission, activity, course


def _get_context_by_activity_uuid(
    activity_uuid: str,
    db_session: Session,
) -> tuple[FileSubmissionActivity, Activity, Course]:
    activity = _get_activity_by_uuid_or_404(activity_uuid, db_session)
    file_submission = db_session.exec(
        select(FileSubmissionActivity).where(
            FileSubmissionActivity.activity_id == activity.id
        )
    ).first()
    if file_submission is None:
        raise HTTPException(status_code=404, detail="File submission not found")
    return file_submission, activity, _get_course_for_activity(activity, db_session)


def _build_file_submission_read(
    file_submission: FileSubmissionActivity,
    *,
    current_user: PublicUser | AnonymousUser | None,
    db_session: Session,
) -> FileSubmissionRead:
    activity = db_session.get(Activity, file_submission.activity_id)
    if activity is None:
        raise HTTPException(status_code=404, detail="Activity not found")
    course = _get_course_for_activity(activity, db_session)
    attempts: list[FileSubmissionAttemptRead] = []
    current_attempt = None
    if isinstance(current_user, PublicUser):
        raw_attempts = db_session.exec(
            select(FileSubmissionAttempt)
            .where(
                FileSubmissionAttempt.file_submission_id == file_submission.id,
                FileSubmissionAttempt.user_id == current_user.id,
            )
            .order_by(FileSubmissionAttempt.attempt_number.desc())
        ).all()
        attempts = [
            _build_attempt_read(attempt, db_session) for attempt in raw_attempts
        ]
        current_attempt = attempts[0] if attempts else None
    return FileSubmissionRead(
        id=file_submission.id or 0,
        file_submission_uuid=file_submission.file_submission_uuid,
        activity_id=activity.id or 0,
        activity_uuid=activity.activity_uuid,
        course_id=course.id,
        course_uuid=course.course_uuid,
        chapter_id=activity.chapter_id,
        title=activity.name,
        instructions=file_submission.instructions,
        lifecycle=FileSubmissionLifecycle(file_submission.lifecycle),
        published=activity.published,
        allowed_mime_types=file_submission.allowed_mime_types,
        max_files=file_submission.max_files,
        max_file_size_mb=file_submission.max_file_size_mb,
        due_at=file_submission.due_at,
        allow_late=file_submission.allow_late,
        late_policy=file_submission.late_policy_json,
        max_attempts=file_submission.max_attempts,
        grade_release_mode=file_submission.grade_release_mode,
        rubric=file_submission.rubric_json,
        settings=file_submission.settings_json,
        current_attempt=current_attempt,
        attempts=attempts,
        created_at=file_submission.created_at,
        updated_at=file_submission.updated_at,
    )


def _build_attempt_read(
    attempt: FileSubmissionAttempt,
    db_session: Session,
    *,
    include_user: bool = False,
) -> FileSubmissionAttemptRead:
    user_read = None
    if include_user:
        user = db_session.get(User, attempt.user_id)
        if user is not None:
            user_read = FileSubmissionUserRead(
                id=user.id,
                username=user.username,
                first_name=user.first_name,
                last_name=user.last_name,
                email=str(user.email),
                avatar_image=user.avatar_image,
                user_uuid=user.user_uuid,
            )
    return FileSubmissionAttemptRead(
        attempt_uuid=attempt.attempt_uuid,
        status=FileSubmissionAttemptStatus(attempt.status),
        attempt_number=attempt.attempt_number,
        files=[
            _build_file_read(file, db_session)
            for file in _attempt_files(attempt, db_session)
        ],
        is_late=attempt.is_late,
        late_penalty_pct=attempt.late_penalty_pct,
        final_score=attempt.final_score,
        feedback=attempt.feedback_json,
        version=attempt.version,
        started_at=attempt.started_at,
        submitted_at=attempt.submitted_at,
        graded_at=attempt.graded_at,
        created_at=attempt.created_at,
        updated_at=attempt.updated_at,
        user=user_read,
    )


def _build_file_read(
    file: FileSubmissionAttemptFile,
    db_session: Session,
) -> FileSubmissionAttemptFileRead:
    upload = db_session.get(Upload, file.upload_id)
    return FileSubmissionAttemptFileRead(
        attempt_file_uuid=file.attempt_file_uuid,
        upload_uuid=upload.upload_uuid if upload else "",
        filename=file.display_name,
        content_type=file.content_type,
        size_bytes=file.size_bytes,
        sha256=file.sha256,
        storage_key=file.storage_key,
        scan_status=FileSubmissionScanStatus(file.scan_status),
        position=file.position,
        created_at=file.created_at,
    )


def _attempt_files(
    attempt: FileSubmissionAttempt,
    db_session: Session,
) -> list[FileSubmissionAttemptFile]:
    if attempt.id is None:
        return []
    return list(
        db_session.exec(
            select(FileSubmissionAttemptFile)
            .where(FileSubmissionAttemptFile.attempt_id == attempt.id)
            .order_by(FileSubmissionAttemptFile.position, FileSubmissionAttemptFile.id)
        ).all()
    )


def _read_upload_bytes(upload: Upload | None, db_session: Session) -> bytes | None:
    if upload is None or not upload.storage_key:
        return None
    user = db_session.get(User, upload.user_id)
    if user is None:
        return None
    user_uuid = user.user_uuid or str(user.id)
    path = Path("content") / "users" / user_uuid / upload.storage_key
    if not path.exists() or not path.is_file():
        return None
    return path.read_bytes()


def _get_current_draft(
    file_submission: FileSubmissionActivity,
    user_id: int,
    db_session: Session,
) -> FileSubmissionAttempt | None:
    return db_session.exec(
        select(FileSubmissionAttempt)
        .where(
            FileSubmissionAttempt.file_submission_id == file_submission.id,
            FileSubmissionAttempt.user_id == user_id,
            FileSubmissionAttempt.status.in_([
                FileSubmissionAttemptStatus.DRAFT,
                FileSubmissionAttemptStatus.RETURNED,
            ]),
        )
        .order_by(FileSubmissionAttempt.attempt_number.desc())
    ).first()


def _get_attempt_or_404(
    file_submission: FileSubmissionActivity,
    attempt_uuid: str,
    db_session: Session,
) -> FileSubmissionAttempt:
    attempt = db_session.exec(
        select(FileSubmissionAttempt).where(
            FileSubmissionAttempt.file_submission_id == file_submission.id,
            FileSubmissionAttempt.attempt_uuid == attempt_uuid,
        )
    ).first()
    if attempt is None:
        raise HTTPException(status_code=404, detail="Submission not found")
    return attempt


def _count_completed_attempts(
    file_submission: FileSubmissionActivity,
    user_id: int,
    db_session: Session,
) -> int:
    return db_session.exec(
        select(func.count()).where(
            FileSubmissionAttempt.file_submission_id == file_submission.id,
            FileSubmissionAttempt.user_id == user_id,
            FileSubmissionAttempt.status != FileSubmissionAttemptStatus.DRAFT,
        )
    ).one()


def _check_version(attempt: FileSubmissionAttempt, if_match: str | None) -> None:
    if if_match is None:
        return
    try:
        expected = int(if_match)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid If-Match header")
    if expected != attempt.version:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "VERSION_CONFLICT",
                "latest": _build_attempt_read_no_files(attempt),
            },
        )


def _build_attempt_read_no_files(attempt: FileSubmissionAttempt) -> dict[str, Any]:
    return {
        "attempt_uuid": attempt.attempt_uuid,
        "status": str(attempt.status),
        "version": attempt.version,
        "updated_at": attempt.updated_at.isoformat(),
    }


def _require_published(
    file_submission: FileSubmissionActivity, activity: Activity
) -> None:
    if (
        activity.published
        and FileSubmissionLifecycle(file_submission.lifecycle)
        == FileSubmissionLifecycle.PUBLISHED
    ):
        return
    raise HTTPException(status_code=409, detail="File submission is not published")


def _ensure_authorable(file_submission: FileSubmissionActivity) -> None:
    if (
        FileSubmissionLifecycle(file_submission.lifecycle)
        == FileSubmissionLifecycle.ARCHIVED
    ):
        raise HTTPException(
            status_code=409, detail="Archived submissions are read-only"
        )


def _get_course_for_activity(activity: Activity, db_session: Session) -> Course:
    if activity.course_id is not None:
        course = db_session.get(Course, activity.course_id)
        if course is not None:
            return course
    chapter = db_session.get(Chapter, activity.chapter_id)
    if chapter is not None:
        course = db_session.get(Course, chapter.course_id)
        if course is not None:
            return course
    raise HTTPException(status_code=404, detail="Course not found")


def _get_course_or_404(course_id: int, db_session: Session) -> Course:
    course = db_session.get(Course, course_id)
    if course is None:
        raise HTTPException(status_code=404, detail="Course not found")
    return course


def _get_chapter_or_404(chapter_id: int, db_session: Session) -> Chapter:
    chapter = db_session.get(Chapter, chapter_id)
    if chapter is None:
        raise HTTPException(status_code=404, detail="Chapter not found")
    return chapter


def _require_author(user: PublicUser, course: Course, db_session: Session) -> None:
    checker = PermissionChecker(db_session)
    if checker.check(user.id, "assessment:author", resource_owner_id=course.creator_id):
        return
    checker.require(user.id, "activity:update", resource_owner_id=course.creator_id)


def _require_grade(user: PublicUser, course: Course, db_session: Session) -> None:
    checker = PermissionChecker(db_session)
    checker.require(user.id, "assessment:grade", resource_owner_id=course.creator_id)


def _require_read(
    user: PublicUser | AnonymousUser,
    activity: Activity,
    course: Course,
    db_session: Session,
) -> None:
    if course.public and activity.published:
        return
    checker = PermissionChecker(db_session)
    if checker.check(user.id, "activity:read", resource_owner_id=activity.creator_id):
        return
    checker.require(user.id, "assessment:read", resource_owner_id=course.creator_id)


def _require_submit_access(
    user: PublicUser,
    activity: Activity,
    course: Course,
    db_session: Session,
) -> None:
    if not user_has_course_access(user.id, course, db_session):
        raise HTTPException(status_code=403, detail="Course enrollment is required")
    checker = PermissionChecker(db_session)
    checker.require(
        user.id,
        "assessment:submit",
        resource_owner_id=activity.creator_id,
        is_assigned=True,
    )


def _normalize_mimes(values: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for value in values:
        mime = value.strip().lower()
        if not mime or mime in seen:
            continue
        seen.add(mime)
        result.append(mime)
    return result
