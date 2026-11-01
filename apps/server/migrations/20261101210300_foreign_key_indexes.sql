-- Schema review item 21: every foreign key the app can trigger a check on
-- gets an index led by its columns. Without one, deleting (or re-keying) a
-- parent row scans the whole child table under lock: a preview submission
-- discard scanned analytics_events and activity_progress, leaving a course
-- scanned daily_user_course_progress, an item delete scanned item_feedback.
-- Per-person rows are indexed by user_id too (profile and erasure reads).
--
-- Keys onto users from actor/audit columns (creator_id, graded_by, ...) stay
-- unindexed: the app never deletes a users row. crates/db/tests/fk_index_audit.rs
-- lists them and fails on any new unindexed key.

CREATE INDEX user_roles_role_idx ON user_roles (role_id);
CREATE INDEX collection_courses_course_idx ON collection_courses (course_id);
CREATE INDEX discussion_reactions_user_idx ON discussion_reactions (user_id);
CREATE INDEX certificate_users_user_idx ON certificate_users (user_id);
CREATE INDEX resource_authors_collection_idx ON resource_authors (collection_id);
CREATE INDEX resource_authors_user_idx ON resource_authors (user_id);
CREATE INDEX submissions_user_idx ON submissions (user_id);
CREATE INDEX item_feedback_item_idx ON item_feedback (item_id);
CREATE INDEX file_submission_attempts_user_idx ON file_submission_attempts (user_id);
CREATE INDEX file_submission_files_upload_idx ON file_submission_files (upload_id);
CREATE INDEX file_submission_overrides_user_idx ON file_submission_overrides (user_id);
CREATE INDEX activity_progress_best_submission_idx ON activity_progress (best_submission_id);
CREATE INDEX activity_progress_latest_submission_idx ON activity_progress (latest_submission_id);
CREATE INDEX activity_progress_user_idx ON activity_progress (user_id);
CREATE INDEX trail_runs_user_idx ON trail_runs (user_id);
CREATE INDEX trail_steps_activity_idx ON trail_steps (activity_id);
CREATE INDEX trail_steps_user_idx ON trail_steps (user_id);
CREATE INDEX analytics_events_activity_idx ON analytics_events (activity_id);
CREATE INDEX analytics_events_assessment_idx ON analytics_events (assessment_id);
CREATE INDEX analytics_events_submission_idx ON analytics_events (submission_id);
CREATE INDEX daily_course_engagement_activity_idx ON daily_course_engagement (activity_id);
CREATE INDEX daily_course_engagement_chapter_idx ON daily_course_engagement (chapter_id);
CREATE INDEX daily_assessment_metrics_activity_idx ON daily_assessment_metrics (activity_id);
CREATE INDEX daily_assessment_metrics_assessment_idx ON daily_assessment_metrics (assessment_id);
CREATE INDEX daily_user_course_progress_trail_run_idx ON daily_user_course_progress (trail_run_id);
CREATE INDEX daily_user_course_progress_user_idx ON daily_user_course_progress (user_id);
CREATE INDEX daily_teacher_metrics_teacher_idx ON daily_teacher_metrics (teacher_user_id);
CREATE INDEX learner_risk_snapshots_user_idx ON learner_risk_snapshots (user_id);
CREATE INDEX teacher_interventions_course_idx ON teacher_interventions (course_id);

-- AI tables: indexes only (their structure belongs to the AI work).
CREATE INDEX ai_threads_activity_idx ON ai_threads (activity_id);
CREATE INDEX ai_evidence_artifact_idx ON ai_evidence (artifact_id);
CREATE INDEX ai_approvals_run_idx ON ai_approvals (run_id);
CREATE INDEX ai_eval_results_run_idx ON ai_eval_results (run_id);
CREATE INDEX ai_token_ledger_user_idx ON ai_token_ledger (user_id);
CREATE INDEX ai_qa_messages_user_idx ON ai_qa_messages (user_id);
CREATE INDEX ai_submission_analyses_run_idx ON ai_submission_analyses (run_id);
CREATE INDEX ai_course_analyses_run_idx ON ai_course_analyses (run_id);
CREATE INDEX ai_lecture_reviews_run_idx ON ai_lecture_reviews (run_id);
CREATE INDEX ai_remediation_sessions_activity_idx ON ai_remediation_sessions (activity_id);
CREATE INDEX ai_remediation_sessions_analysis_idx ON ai_remediation_sessions (analysis_id);
CREATE INDEX ai_remediation_sessions_run_idx ON ai_remediation_sessions (run_id);
