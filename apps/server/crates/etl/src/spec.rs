//! Audited fate of every JSON/JSONB column in the restored production schema.
//!
//! The inventory is intentionally static: a restore containing a new JSON
//! column requires an explicit migration decision before P11.

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum JsonFate {
    /// Values become typed scalar/relational columns.
    Normalize,
    /// Values remain JSON, but are parsed and written in the v2 tagged shape.
    Retype,
    /// The owning legacy feature is deliberately retired or rebuilt.
    Drop,
}

pub struct JsonColumnFate {
    pub table: &'static str,
    pub column: &'static str,
    pub fate: JsonFate,
    pub reason: &'static str,
}

macro_rules! fate {
    ($table:literal, $column:literal, $fate:ident, $reason:literal) => {
        JsonColumnFate {
            table: $table,
            column: $column,
            fate: JsonFate::$fate,
            reason: $reason,
        }
    };
}

/// 63 columns were present in the 2026-09-06 production restore. Earlier
/// planning counted 52; this restore-derived inventory supersedes that count.
pub const JSON_FATES: &[JsonColumnFate] = &[
    fate!(
        "activity",
        "content",
        Retype,
        "activity/block content converted to v2 bodies"
    ),
    fate!(
        "activity",
        "details",
        Normalize,
        "known activity details become columns"
    ),
    fate!(
        "activity",
        "settings",
        Normalize,
        "known settings become typed activity/assessment columns"
    ),
    fate!(
        "ai_approval",
        "payload_json",
        Drop,
        "legacy AI tables are empty; v2 runs rebuild state"
    ),
    fate!(
        "ai_artifact",
        "content_json",
        Drop,
        "legacy AI tables are empty; v2 runs rebuild state"
    ),
    fate!(
        "ai_course_analysis",
        "evidence_json",
        Drop,
        "legacy AI tables are empty; v2 runs rebuild state"
    ),
    fate!(
        "ai_course_analysis",
        "report_json",
        Drop,
        "legacy AI tables are empty; v2 runs rebuild state"
    ),
    fate!(
        "ai_eval_result",
        "details_json",
        Drop,
        "legacy AI tables are empty; v2 evals rebuild state"
    ),
    fate!(
        "ai_event",
        "payload_json",
        Drop,
        "legacy AI tables are empty; v2 runs rebuild state"
    ),
    fate!(
        "ai_evidence",
        "evidence_metadata",
        Drop,
        "legacy AI tables are empty; v2 runs rebuild state"
    ),
    fate!(
        "ai_lecture_review",
        "dismissed_json",
        Drop,
        "legacy AI tables are empty; v2 runs rebuild state"
    ),
    fate!(
        "ai_lecture_review",
        "suggestions_json",
        Drop,
        "legacy AI tables are empty; v2 runs rebuild state"
    ),
    fate!(
        "ai_qa_message",
        "citations_json",
        Drop,
        "legacy AI tables are empty; v2 runs rebuild state"
    ),
    fate!(
        "ai_qa_message",
        "message_metadata",
        Drop,
        "legacy AI tables are empty; v2 runs rebuild state"
    ),
    fate!(
        "ai_remediation_session",
        "lecture_json",
        Drop,
        "legacy AI tables are empty; v2 runs rebuild state"
    ),
    fate!(
        "ai_remediation_session",
        "test_json",
        Drop,
        "legacy AI tables are empty; v2 runs rebuild state"
    ),
    fate!(
        "ai_run",
        "run_metadata",
        Drop,
        "legacy AI tables are empty; v2 runs rebuild state"
    ),
    fate!(
        "ai_student_memory",
        "memory_metadata",
        Drop,
        "legacy AI tables are empty; v2 runs rebuild state"
    ),
    fate!(
        "ai_submission_analysis",
        "analysis_json",
        Drop,
        "legacy AI tables are empty; v2 runs rebuild state"
    ),
    fate!(
        "ai_submission_analysis",
        "evidence_json",
        Drop,
        "legacy AI tables are empty; v2 runs rebuild state"
    ),
    fate!(
        "analytics_event",
        "payload",
        Drop,
        "legacy event table is empty; v2 captures fresh events"
    ),
    fate!(
        "analytics_saved_view",
        "query",
        Drop,
        "legacy saved-view table is empty"
    ),
    fate!(
        "assessment_item",
        "body_json",
        Retype,
        "strictly parsed into versioned ItemBody"
    ),
    fate!(
        "assessment_item",
        "metadata_json",
        Normalize,
        "difficulty/tags/outcomes become columns"
    ),
    fate!(
        "assessment_policy",
        "anti_cheat_json",
        Normalize,
        "anti-cheat flags become columns"
    ),
    fate!(
        "assessment_policy",
        "late_policy_json",
        Normalize,
        "late policy becomes typed columns"
    ),
    fate!(
        "assessment_policy",
        "settings_json",
        Normalize,
        "review and attempt settings become columns"
    ),
    fate!(
        "audit_event",
        "payload_json",
        Drop,
        "retired generic audit stream"
    ),
    fate!(
        "auth_audit_log",
        "metadata",
        Retype,
        "preserved as bounded audit metadata"
    ),
    fate!(
        "block",
        "content",
        Retype,
        "strictly converted to versioned block body"
    ),
    fate!(
        "bulk_action",
        "params",
        Retype,
        "preserved bulk-operation parameters"
    ),
    fate!(
        "bulk_action",
        "target_user_ids",
        Normalize,
        "resolved to real user references"
    ),
    fate!(
        "certifications",
        "config",
        Retype,
        "preserved certificate configuration"
    ),
    fate!(
        "document_chunks",
        "metadata",
        Drop,
        "legacy RAG index is rebuilt from canonical content"
    ),
    fate!(
        "exam",
        "settings",
        Drop,
        "superseded exam model is deliberately retired"
    ),
    fate!(
        "examattempt",
        "answers",
        Drop,
        "superseded exam attempts are deliberately retired"
    ),
    fate!(
        "examattempt",
        "question_order",
        Drop,
        "superseded exam attempts are deliberately retired"
    ),
    fate!(
        "examattempt",
        "violations",
        Drop,
        "superseded exam attempts are deliberately retired"
    ),
    fate!(
        "file_submission_activity",
        "allowed_mime_types",
        Normalize,
        "MIME values become a typed array"
    ),
    fate!(
        "file_submission_activity",
        "late_policy_json",
        Normalize,
        "late policy becomes typed columns"
    ),
    fate!(
        "file_submission_activity",
        "rubric_json",
        Retype,
        "rubric remains structured JSON"
    ),
    fate!(
        "file_submission_activity",
        "settings_json",
        Normalize,
        "known settings become columns"
    ),
    fate!(
        "file_submission_attempt",
        "feedback_json",
        Retype,
        "feedback converted to v2 grading shape"
    ),
    fate!(
        "gamification_profiles",
        "preferences",
        Retype,
        "preserved user gamification preferences"
    ),
    fate!(
        "grading_entry",
        "effective_breakdown",
        Retype,
        "item ids re-keyed into v2 grading breakdown"
    ),
    fate!(
        "grading_entry",
        "raw_breakdown",
        Retype,
        "item ids re-keyed into v2 grading breakdown"
    ),
    fate!(
        "install",
        "data",
        Drop,
        "legacy installation state is deployment-owned"
    ),
    fate!(
        "learner_risk_snapshot",
        "reason_codes",
        Drop,
        "analytics projections are recomputed"
    ),
    fate!(
        "org_gamification_config",
        "rewards",
        Retype,
        "preserved reward thresholds"
    ),
    fate!(
        "paymentsconfig",
        "provider_config",
        Drop,
        "payments subsystem is outside rewrite scope"
    ),
    fate!(
        "paymentsuser",
        "provider_specific_data",
        Drop,
        "payments subsystem is outside rewrite scope"
    ),
    fate!(
        "role",
        "rights",
        Drop,
        "v2 permission grants are seed-managed"
    ),
    fate!(
        "submission",
        "answers_json",
        Retype,
        "strict answer variants with re-keyed item ids"
    ),
    fate!(
        "submission",
        "grading_json",
        Retype,
        "converted to v2 grading breakdown"
    ),
    fate!(
        "submission",
        "items_snapshot",
        Retype,
        "strict item snapshots with v2 ids"
    ),
    fate!(
        "submission",
        "metadata_json",
        Normalize,
        "violations and timer fields split into typed columns"
    ),
    fate!(
        "submission",
        "policy_snapshot",
        Retype,
        "converted to the bounded v2 policy snapshot"
    ),
    fate!(
        "submission",
        "raw_grading_json",
        Retype,
        "converted to v2 grading breakdown"
    ),
    fate!(
        "teacher_intervention",
        "payload",
        Drop,
        "analytics projections are recomputed"
    ),
    fate!(
        "trailrun",
        "data",
        Retype,
        "preserved in the versioned trail payload"
    ),
    fate!(
        "trailstep",
        "data",
        Retype,
        "preserved in the versioned trail payload"
    ),
    fate!(
        "user",
        "details",
        Normalize,
        "known profile fields become user columns"
    ),
    fate!(
        "user",
        "profile",
        Normalize,
        "known profile fields become user columns"
    ),
];

#[cfg(test)]
mod tests {
    use std::collections::HashSet;

    use super::*;

    #[test]
    fn production_json_inventory_is_complete_and_unique() {
        assert_eq!(JSON_FATES.len(), 63);
        let unique: HashSet<_> = JSON_FATES
            .iter()
            .map(|entry| (entry.table, entry.column))
            .collect();
        assert_eq!(unique.len(), JSON_FATES.len());
        assert!(JSON_FATES.iter().all(|entry| !entry.reason.is_empty()));
    }
}
