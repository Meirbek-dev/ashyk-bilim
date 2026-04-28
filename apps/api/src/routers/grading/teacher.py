"""
Teacher-facing grading routes.

GET   /grading/submissions           — paginated + filterable + searchable list
GET   /grading/submissions/stats     — aggregate stats for dashboard header
GET   /grading/submissions/export    — streaming CSV export
GET   /grading/submissions/{uuid}    — single submission detail (with answers + grading)
PATCH /grading/submissions/{uuid}    — save teacher grade + feedback
"""

from typing import Annotated

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlmodel import Session

from src.auth.users import get_public_user
from src.db.grading.gradebook import GradebookResponse
from src.db.grading.schemas import BatchGradeRequest, BatchGradeResponse
from src.db.grading.submissions import (
    SubmissionListResponse,
    SubmissionRead,
    SubmissionStats,
    TeacherGradeInput,
)
from src.db.users import PublicUser
from src.infra.db.session import get_db_session
from src.services.grading.gradebook import get_course_gradebook
from src.services.grading.teacher import (
    batch_grade_submissions,
    export_grades_csv,
    get_submission_for_teacher,
    get_submission_stats,
    get_submissions_for_activity,
    save_grade,
)

router = APIRouter()


@router.get("/courses/{course_uuid}/gradebook", response_model=GradebookResponse)
async def api_get_course_gradebook(
    course_uuid: str,
    db_session: Annotated[Session, Depends(get_db_session)],
    current_user: Annotated[PublicUser, Depends(get_public_user)],
) -> GradebookResponse:
    """Return the teacher's course-level gradebook matrix."""
    return await get_course_gradebook(
        course_uuid=course_uuid,
        current_user=current_user,
        db_session=db_session,
    )


@router.get("/submissions", response_model=SubmissionListResponse)
async def api_list_submissions(
    activity_id: int,
    db_session: Annotated[Session, Depends(get_db_session)],
    current_user: Annotated[PublicUser, Depends(get_public_user)],
    status_filter: Annotated[str | None, Query(alias="status")] = None,
    late_only: Annotated[bool, Query()] = False,
    search: Annotated[str | None, Query()] = None,
    sort_by: Annotated[str, Query()] = "submitted_at",
    sort_dir: Annotated[str, Query()] = "desc",
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 25,
) -> SubmissionListResponse:
    """
    Paginated, filterable, searchable submissions list for a teacher.

    Query params:
    - activity_id: required
    - status: DRAFT | PENDING | GRADED | PUBLISHED | RETURNED | NEEDS_GRADING (virtual)
    - late_only: filter PENDING submissions to only those submitted after the deadline
    - search: student name or email filter
    - sort_by: submitted_at | final_score | created_at | attempt_number
    - sort_dir: asc | desc
    - page, page_size: pagination
    """
    return await get_submissions_for_activity(
        activity_id=activity_id,
        current_user=current_user,
        db_session=db_session,
        status_filter=status_filter,
        late_only=late_only,
        search=search,
        sort_by=sort_by,
        sort_dir=sort_dir,
        page=page,
        page_size=page_size,
    )


@router.get("/submissions/stats", response_model=SubmissionStats)
async def api_get_submission_stats(
    activity_id: int,
    db_session: Annotated[Session, Depends(get_db_session)],
    current_user: Annotated[PublicUser, Depends(get_public_user)],
) -> SubmissionStats:
    """Aggregate statistics for the teacher dashboard header."""
    return await get_submission_stats(
        activity_id=activity_id,
        current_user=current_user,
        db_session=db_session,
    )


@router.get("/submissions/export")
def api_export_submissions_csv(
    activity_id: int,
    db_session: Annotated[Session, Depends(get_db_session)],
    current_user: Annotated[PublicUser, Depends(get_public_user)],
) -> StreamingResponse:
    """
    Export all non-draft submissions for an activity as CSV.

    Streams the full dataset — no row cap.
    Content-Disposition header triggers a browser download.
    """
    return StreamingResponse(
        export_grades_csv(
            activity_id=activity_id,
            current_user=current_user,
            db_session=db_session,
        ),
        media_type="text/csv",
        headers={
            "Content-Disposition": f"attachment; filename=grades-activity-{activity_id}.csv"
        },
    )


@router.patch("/submissions/batch", response_model=BatchGradeResponse)
async def api_batch_grade_submissions(
    batch_request: BatchGradeRequest,
    db_session: Annotated[Session, Depends(get_db_session)],
    current_user: Annotated[PublicUser, Depends(get_public_user)],
) -> BatchGradeResponse:
    """Save teacher grades for multiple submissions in a single request."""
    return await batch_grade_submissions(
        batch_request=batch_request,
        current_user=current_user,
        db_session=db_session,
    )


@router.get("/submissions/{submission_uuid}", response_model=SubmissionRead)
async def api_get_submission(
    submission_uuid: str,
    db_session: Annotated[Session, Depends(get_db_session)],
    current_user: Annotated[PublicUser, Depends(get_public_user)],
) -> SubmissionRead:
    """Fetch a single submission with full answers and grading breakdown."""
    return await get_submission_for_teacher(
        submission_uuid=submission_uuid,
        current_user=current_user,
        db_session=db_session,
    )


@router.patch("/submissions/{submission_uuid}", response_model=SubmissionRead)
async def api_save_grade(
    submission_uuid: str,
    grade_input: TeacherGradeInput,
    db_session: Annotated[Session, Depends(get_db_session)],
    current_user: Annotated[PublicUser, Depends(get_public_user)],
) -> SubmissionRead:
    """
    Save a teacher-entered final score and optional per-item feedback.

    Permission is checked in save_grade via the activity's creator_id.
    """
    return await save_grade(
        submission_uuid=submission_uuid,
        grade_input=grade_input,
        current_user=current_user,
        db_session=db_session,
    )
