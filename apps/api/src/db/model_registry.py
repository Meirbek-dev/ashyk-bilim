_MODELS_IMPORTED = False


def import_orm_models() -> None:
    global _MODELS_IMPORTED

    if _MODELS_IMPORTED:
        return

    import src.db.analytics
    import src.db.auth_audit_log
    import src.db.auth_sessions
    import src.db.assessments
    import src.db.collections
    import src.db.collections_courses
    import src.db.courses.activities
    import src.db.courses.blocks
    import src.db.courses.certifications
    import src.db.courses.chapters
    import src.db.courses.course_updates
    import src.db.courses.courses
    import src.db.courses.discussions
    import src.db.courses.enhanced_responses
    import src.db.courses.quiz
    import src.db.gamification
    import src.db.grading.bulk_actions
    import src.db.grading.entries
    import src.db.grading.item_feedback
    import src.db.grading.overrides
    import src.db.grading.progress
    import src.db.grading.schemas
    import src.db.grading.submissions
    import src.db.permissions
    import src.db.platform
    import src.db.resource_authors
    import src.db.trail_runs
    import src.db.trail_steps
    import src.db.trails
    import src.db.uploads
    import src.db.usergroup_resources
    import src.db.usergroup_user
    import src.db.usergroups
    import src.db.users

    _MODELS_IMPORTED = True
