from importlib import import_module

ORM_MODEL_MODULES: tuple[str, ...] = (
    "src.db.ai_runtime",
    "src.db.analytics",
    "src.db.assessment_access",
    "src.db.assessments",
    "src.db.auth_audit_log",
    "src.db.auth_sessions",
    "src.db.audit",
    "src.db.code_execution",
    "src.db.collections",
    "src.db.collections_courses",
    "src.db.courses.activities",
    "src.db.courses.blocks",
    "src.db.courses.certifications",
    "src.db.courses.chapters",
    "src.db.courses.course_updates",
    "src.db.courses.courses",
    "src.db.courses.discussions",
    "src.db.file_submissions",
    "src.db.gamification",
    "src.db.grading.bulk_actions",
    "src.db.grading.entries",
    "src.db.grading.item_feedback",
    "src.db.grading.overrides",
    "src.db.grading.progress",
    "src.db.grading.submissions",
    "src.db.permissions",
    "src.db.platform",
    "src.db.resource_authors",
    "src.db.trail_runs",
    "src.db.trail_steps",
    "src.db.trails",
    "src.db.uploads",
    "src.db.usergroup_resources",
    "src.db.usergroup_user",
    "src.db.usergroups",
    "src.db.users",
)

_models_imported = False


def import_orm_models() -> None:
    global _models_imported

    if _models_imported:
        return

    for module_name in ORM_MODEL_MODULES:
        import_module(module_name)

    _models_imported = True
