"""Shared helper functions for the assessment service layer.

These are internal utilities used across the decomposed modules. They handle
entity lookups, permission checks, and response building.
"""

from __future__ import annotations

from src.services.assessments._shared import (
    _build_assessment_read,
    _build_item_read,
    _build_student_submission_read,
    _build_teacher_submission_read,
    _content_version,
    _default_activity_settings,
    _ensure_authorable,
    _get_activity_and_course,
    _get_assessment_by_uuid_or_404,
    _get_chapter_or_404,
    _get_course_for_activity_or_404,
    _get_course_or_404,
    _get_item_or_404,
    _get_or_create_policy,
    _get_or_project_assessment_for_activity,
    _require_author,
    _require_grade,
    _require_publish,
    _require_read,
    _require_submit_access,
    build_readiness,
    sync_activity_lifecycle,
)
from src.services.courses._utils import _get_activity_by_uuid_or_404

__all__ = [
    "_build_assessment_read",
    "_build_item_read",
    "_build_student_submission_read",
    "_build_teacher_submission_read",
    "_content_version",
    "_default_activity_settings",
    "_ensure_authorable",
    "_get_activity_and_course",
    "_get_activity_by_uuid_or_404",
    "_get_assessment_by_uuid_or_404",
    "_get_chapter_or_404",
    "_get_course_for_activity_or_404",
    "_get_course_or_404",
    "_get_item_or_404",
    "_get_or_create_policy",
    "_get_or_project_assessment_for_activity",
    "_require_author",
    "_require_grade",
    "_require_publish",
    "_require_read",
    "_require_submit_access",
    "build_readiness",
    "sync_activity_lifecycle",
]
