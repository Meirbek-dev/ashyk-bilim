from __future__ import annotations

import json

from sqlmodel import Session, col, select

from src.db.assessments import Assessment, AssessmentItem
from src.db.courses.activities import Activity
from src.db.courses.chapters import Chapter
from src.db.courses.courses import Course
from src.db.grading.progress import AssessmentPolicy
from src.db.grading.submissions import Submission
from src.services.ai.context.sources import AIContextBundle, AIContextSource, render_context_bundle
from src.types import JsonObject


def _json_snippet(value: object, *, limit: int = 1800) -> str:
    try:
        text = json.dumps(value, ensure_ascii=False, default=str)
    except TypeError:
        text = str(value)
    return text[:limit]


def _source(
    citation_id: str,
    *,
    label: str,
    source_type: str,
    source_uuid: str | None,
    excerpt: str,
    metadata: JsonObject | None = None,
) -> AIContextSource:
    return AIContextSource(
        citation_id=citation_id,
        label=label,
        source_type=source_type,
        source_uuid=source_uuid,
        excerpt=excerpt[:1200],
        metadata=metadata or {},
    )


def assemble_course_context_bundle(db_session: Session, course: Course, *, include_unpublished: bool) -> AIContextBundle:
    if course.id is None:
        return AIContextBundle(text="", sources=[])
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
    sources = [
        _source(
            f"course:{course.course_uuid or course.id}",
            label=course.name,
            source_type="course",
            source_uuid=course.course_uuid or str(course.id),
            excerpt="\n".join(lines),
            metadata={"course_id": course.id},
        )
    ]
    chapter_titles = {chapter.id: chapter.name for chapter in chapters}
    for activity in activities:
        chapter_title = chapter_titles.get(activity.chapter_id, "Unassigned")
        activity_lines = [
            f"Chapter: {chapter_title}",
            f"Activity: {activity.name} ({activity.activity_type})",
            f"Published: {activity.published}",
            f"Content: {_json_snippet(activity.content)}",
            f"Details: {_json_snippet(activity.details)}",
        ]
        lines.extend([
            "",
            *activity_lines,
        ])
        sources.append(
            _source(
                f"activity:{activity.activity_uuid or activity.id}",
                label=activity.name,
                source_type="activity",
                source_uuid=activity.activity_uuid or str(activity.id),
                excerpt="\n".join(activity_lines),
                metadata={
                    "course_id": course.id,
                    "activity_id": activity.id,
                    "chapter_id": activity.chapter_id,
                    "published": activity.published,
                },
            )
        )
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
                assessment_lines = [
                    f"Assessment: {assessment.title or assessment.assessment_uuid}",
                    f"Assessment settings: {_json_snippet(settings_json)}",
                ]
                lines.extend(assessment_lines)
                sources.append(
                    _source(
                        f"assessment:{assessment.assessment_uuid or assessment.id}",
                        label=assessment.title or assessment.assessment_uuid,
                        source_type="assessment",
                        source_uuid=assessment.assessment_uuid or str(assessment.id),
                        excerpt="\n".join(assessment_lines),
                        metadata={"activity_id": activity.id, "assessment_id": assessment.id},
                    )
                )
                for item in items:
                    item_line = f"Assessment item: {item.title} {item.kind} {_json_snippet(item.body_json, limit=700)}"
                    lines.append(item_line)
                    sources.append(
                        _source(
                            f"assessment_item:{item.id}",
                            label=item.title or f"Item {item.id}",
                            source_type="assessment_item",
                            source_uuid=str(item.id),
                            excerpt=item_line,
                            metadata={"assessment_id": assessment.id, "activity_id": activity.id},
                        )
                    )
    return AIContextBundle(text="\n".join(lines), sources=sources)


def assemble_course_context(db_session: Session, course: Course, *, include_unpublished: bool) -> str:
    return render_context_bundle(
        assemble_course_context_bundle(db_session, course, include_unpublished=include_unpublished)
    )


def assemble_submission_context_bundle(db_session: Session, submission: Submission) -> tuple[AIContextBundle, JsonObject]:
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
    sources = [
        _source(
            f"submission:{submission.submission_uuid}",
            label=f"Submission {submission.submission_uuid}",
            source_type="submission",
            source_uuid=submission.submission_uuid,
            excerpt="\n".join(lines),
            metadata={"activity_id": submission.activity_id, "student_user_id": submission.user_id},
        )
    ]
    if activity is not None:
        sources.append(
            _source(
                f"activity:{activity.activity_uuid or activity.id}",
                label=activity.name,
                source_type="activity",
                source_uuid=activity.activity_uuid or str(activity.id),
                excerpt=f"Activity: {activity.name}\nContent: {_json_snippet(activity.content)}",
                metadata={"activity_id": activity.id, "course_id": activity.course_id},
            )
        )
    for item in items:
        item_line = f"Item: {item.title} {item.kind} {_json_snippet(item.body_json, limit=700)}"
        lines.append(item_line)
        sources.append(
            _source(
                f"assessment_item:{item.id}",
                label=item.title or f"Item {item.id}",
                source_type="assessment_item",
                source_uuid=str(item.id),
                excerpt=item_line,
                metadata={"assessment_id": item.assessment_id},
            )
        )
    metadata: JsonObject = {
        "activity_id": submission.activity_id,
        "assessment_uuid": assessment.assessment_uuid if assessment else None,
        "item_count": len(items),
    }
    return AIContextBundle(text="\n".join(lines), sources=sources), metadata


def assemble_submission_context(db_session: Session, submission: Submission) -> tuple[str, JsonObject]:
    bundle, metadata = assemble_submission_context_bundle(db_session, submission)
    return render_context_bundle(bundle), metadata
