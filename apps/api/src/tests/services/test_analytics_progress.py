from datetime import UTC, datetime

from src.db.grading.progress import CourseProgress
from src.db.trail_steps import TrailStep
from src.services.analytics.queries import AnalyticsContext, progress_snapshots


def test_progress_snapshots_use_course_progress_not_trail_steps() -> None:
    now = datetime.now(UTC)
    context = AnalyticsContext(
        generated_at=now,
        courses_by_id={},
        activities_by_id={},
        chapters_by_id={},
        course_chapters=[],
        chapter_activities=[],
        trail_runs=[],
        trail_steps=[
            TrailStep(
                id=1,
                complete=True,
                teacher_verified=True,
                grade=100,
                data={},
                trailrun_id=1,
                trail_id=1,
                activity_id=10,
                course_id=1,
                user_id=5,
                creation_date=now.isoformat(),
                update_date=now.isoformat(),
            )
        ],
        activity_progress=[],
        course_progress=[
            CourseProgress(
                course_id=1,
                user_id=5,
                completed_required_count=1,
                total_required_count=4,
                progress_pct=25,
                certificate_eligible=False,
                last_activity_at=now,
            )
        ],
        certificates=[],
        assignments=[],
        assignment_submissions=[],
        exams=[],
        exam_attempts=[],
        quiz_attempts=[],
        quiz_question_stats=[],
        code_submissions=[],
        users_by_id={},
        usergroup_names_by_id={},
        cohort_ids_by_user={},
    )

    snapshot = progress_snapshots(context)[(1, 5)]

    assert snapshot.completed_steps == 1
    assert snapshot.total_steps == 4
    assert snapshot.progress_pct == 25
    assert snapshot.is_completed is False
