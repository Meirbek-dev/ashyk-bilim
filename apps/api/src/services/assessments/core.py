"""Assessment service — re-export shim.

All implementations have been moved to focused modules:
  - assessment_crud.py   (CRUD + lifecycle)
  - attempt_service.py   (student attempt flow)
  - review_service.py    (teacher review queue)
  - _shared.py           (private helpers)
"""

from src.services.assessments._shared import (
    ASSESSABLE_ACTIVITY_TYPES,
    _has_submit_access_impl as _has_submit_access,
    _require_author_impl as _require_author,
    _require_grade_impl as _require_grade,
    _require_publish_impl as _require_publish,
    _require_read_impl as _require_read,
    _require_submit_access_impl as _require_submit_access,
    build_readiness,
    sync_activity_lifecycle,
)
from src.services.assessments.access_service import (
    get_assessment_access,
    list_assessment_access_eligible_usergroups,
    list_assessment_access_eligible_users,
    update_assessment_access,
)
from src.services.assessments.assessment_crud import (
    check_publish_readiness,
    create_assessment,
    create_assessment_item,
    delete_assessment_item,
    duplicate_assessment,
    get_assessment,
    get_assessment_by_activity_uuid,
    reorder_assessment_items,
    transition_assessment_lifecycle,
    update_assessment,
    update_assessment_item,
)
from src.services.assessments.attempt_service import (
    get_attempt_state,
    get_code_item_run,
    get_my_assessment_draft,
    get_my_assessment_submissions,
    run_code_item,
    save_assessment_draft,
    save_grading_draft,
    start_assessment,
    submit_assessment,
)
from src.services.assessments.policy_defaults import get_policy_preset
from src.services.assessments.review_service import (
    create_student_policy_override,
    delete_student_policy_override,
    get_assessment_submission,
    get_assessment_submission_stats,
    get_assessment_submissions,
    get_item_analytics,
    list_student_policy_overrides,
    publish_assessment_grades,
    save_assessment_grade,
    update_student_policy_override,
)

__all__ = [
    "ASSESSABLE_ACTIVITY_TYPES",
    "_has_submit_access",
    "_require_author",
    "_require_grade",
    "_require_publish",
    "_require_read",
    "_require_submit_access",
    "build_readiness",
    "check_publish_readiness",
    "create_assessment",
    "create_assessment_item",
    "create_student_policy_override",
    "delete_assessment_item",
    "delete_student_policy_override",
    "duplicate_assessment",
    "get_assessment",
    "get_assessment_access",
    "get_assessment_by_activity_uuid",
    "get_assessment_submission",
    "get_assessment_submission_stats",
    "get_assessment_submissions",
    "get_attempt_state",
    "get_code_item_run",
    "get_item_analytics",
    "get_my_assessment_draft",
    "get_my_assessment_submissions",
    "get_policy_preset",
    "list_assessment_access_eligible_usergroups",
    "list_assessment_access_eligible_users",
    "list_student_policy_overrides",
    "publish_assessment_grades",
    "reorder_assessment_items",
    "run_code_item",
    "save_assessment_draft",
    "save_assessment_grade",
    "save_grading_draft",
    "start_assessment",
    "submit_assessment",
    "sync_activity_lifecycle",
    "transition_assessment_lifecycle",
    "update_assessment",
    "update_assessment_access",
    "update_assessment_item",
    "update_student_policy_override",
]
