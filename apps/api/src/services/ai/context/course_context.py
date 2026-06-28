from __future__ import annotations

import json

from sqlmodel import Session, col, select

from src.db.assessments import Assessment, AssessmentItem
from src.db.courses.activities import Activity
from src.db.courses.chapters import Chapter
from src.db.courses.courses import Course
from src.db.grading.progress import AssessmentPolicy
from src.db.grading.submissions import Submission
from src.types import JsonObject


def _json_snippet(value: object, *, limit: int = 1800) -> str:
    try:
        text = json.dumps(value, ensure_ascii=False, default=str)
    except TypeError:
        text = str(value)
    return text[:limit]


def assemble_course_context(db_session: Session, course: Course, *, include_unpublished: bool) -> str:
    if course.id is None:
        return ""
    chapters = db_session.exec(
        select(Chapter).where(Chapter.course_id == course.id).order_by(col(Chapter.order), col(Chapter.id))
    ).all()
    activities = db_session.exec(
        select(Activity)
        .where(Activity.course_id == course.id)
        .order_by(col(Activity.chapter_id), col(Activity.order), col(Activity.id))
    ).all()
    if not include_unpublished:
        activities = [activity for activity in activities if activity.published]

    lines = [
        f"Course: {course.name}",
        f"Description: {course.description or ''}",
        f"About: {course.about or ''}",
        f"Learning outcomes: {course.learnings or ''}",
        f"Tags: {course.tags or ''}",
    ]
    chapter_titles = {chapter.id: chapter.name for chapter in chapters}
    for activity in activities:
        lines.extend([
            "",
            f"Chapter: {chapter_titles.get(activity.chapter_id, 'Unassigned')}",
            f"Activity: {activity.name} ({activity.activity_type})",
            f"Published: {activity.published}",
            f"Content: {_json_snippet(activity.content)}",
            f"Details: {_json_snippet(activity.details)}",
        ])
        if activity.id is not None:
            assessment = db_session.exec(select(Assessment).where(Assessment.activity_id == activity.id)).first()
            if assessment is not None and assessment.id is not None:
                policy = (
                    db_session.get(AssessmentPolicy, assessment.policy_id) if assessment.policy_id is not None else None
                )
                settings_json = policy.settings_json if policy is not None else {}
                items = db_session.exec(
                    select(AssessmentItem)
                    .where(AssessmentItem.assessment_id == assessment.id)
                    .order_by(col(AssessmentItem.order))
                ).all()
                lines.extend([
                    f"Assessment: {assessment.title or assessment.assessment_uuid}",
                    f"Assessment settings: {_json_snippet(settings_json)}",
                ])
                lines.extend(
                    f"Assessment item: {item.title} {item.kind} {_json_snippet(item.body_json, limit=700)}"
                    for item in items
                )
    return "\n".join(lines)


def assemble_submission_context(db_session: Session, submission: Submission) -> tuple[str, JsonObject]:
    activity = db_session.get(Activity, submission.activity_id)
    assessment = (
        db_session.exec(select(Assessment).where(Assessment.activity_id == submission.activity_id)).first()
        if activity is not None
        else None
    )
    items: list[AssessmentItem] = []
    if assessment is not None and assessment.id is not None:
        items = list(
            db_session.exec(
                select(AssessmentItem)
                .where(AssessmentItem.assessment_id == assessment.id)
                .order_by(col(AssessmentItem.order))
            ).all()
        )
    lines = [
        f"Activity: {activity.name if activity else submission.activity_id}",
        f"Submission UUID: {submission.submission_uuid}",
        f"Assessment type: {submission.assessment_type}",
        f"Final score: {submission.final_score}",
        f"Auto score: {submission.auto_score}",
        f"Status: {submission.status}",
        f"Answers: {_json_snippet(submission.answers_json)}",
        f"Grading: {_json_snippet(submission.grading_json)}",
    ]
    lines.extend(f"Item: {item.title} {item.kind} {_json_snippet(item.body_json, limit=700)}" for item in items)
    metadata: JsonObject = {
        "activity_id": submission.activity_id,
        "assessment_uuid": assessment.assessment_uuid if assessment else None,
        "item_count": len(items),
    }
    return "\n".join(lines), metadata
