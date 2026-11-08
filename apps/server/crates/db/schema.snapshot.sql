constraint activities activities_activity_sub_type_not_null NOT NULL activity_sub_type
constraint activities activities_activity_type_not_null NOT NULL activity_type
constraint activities activities_chapter_id_fkey FOREIGN KEY (chapter_id, course_id) REFERENCES chapters(id, course_id) ON UPDATE RESTRICT ON DELETE CASCADE
constraint activities activities_chapter_id_not_null NOT NULL chapter_id
constraint activities activities_content_not_null NOT NULL content
constraint activities activities_content_object CHECK ((jsonb_typeof(content) = 'object'::text))
constraint activities activities_course_id_fkey FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
constraint activities activities_course_id_not_null NOT NULL course_id
constraint activities activities_created_at_not_null NOT NULL created_at
constraint activities activities_creator_id_fkey FOREIGN KEY (creator_id) REFERENCES users(id) ON DELETE SET NULL
constraint activities activities_details_not_null NOT NULL details
constraint activities activities_details_object CHECK ((jsonb_typeof(details) = 'object'::text))
constraint activities activities_id_course_key UNIQUE (id, course_id)
constraint activities activities_id_not_null NOT NULL id
constraint activities activities_kind_fkey FOREIGN KEY (activity_type, activity_sub_type) REFERENCES activity_kinds(kind, sub_kind) ON UPDATE CASCADE
constraint activities activities_name_check CHECK ((char_length(name) <= 500))
constraint activities activities_name_not_null NOT NULL name
constraint activities activities_pkey PRIMARY KEY (id)
constraint activities activities_position_check CHECK (("position" >= 1))
constraint activities activities_position_key UNIQUE (chapter_id, "position") DEFERRABLE INITIALLY DEFERRED
constraint activities activities_position_not_null NOT NULL "position"
constraint activities activities_published_not_null NOT NULL published
constraint activities activities_required_not_null NOT NULL required
constraint activities activities_settings_not_null NOT NULL settings
constraint activities activities_settings_object CHECK ((jsonb_typeof(settings) = 'object'::text))
constraint activities activities_updated_at_not_null NOT NULL updated_at
constraint activities activities_version_not_null NOT NULL version
constraint activity_kinds activity_kinds_kind_not_null NOT NULL kind
constraint activity_kinds activity_kinds_pkey PRIMARY KEY (kind, sub_kind)
constraint activity_kinds activity_kinds_sub_kind_not_null NOT NULL sub_kind
constraint activity_progress activity_progress_activity_id_fkey FOREIGN KEY (activity_id, course_id) REFERENCES activities(id, course_id) ON UPDATE RESTRICT ON DELETE CASCADE
constraint activity_progress activity_progress_activity_id_not_null NOT NULL activity_id
constraint activity_progress activity_progress_attempt_count_check CHECK ((attempt_count >= 0))
constraint activity_progress activity_progress_attempt_count_not_null NOT NULL attempt_count
constraint activity_progress activity_progress_best_submission_id_fkey FOREIGN KEY (best_submission_id, user_id) REFERENCES submissions(id, user_id) ON DELETE SET NULL (best_submission_id)
constraint activity_progress activity_progress_course_id_fkey FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
constraint activity_progress activity_progress_course_id_not_null NOT NULL course_id
constraint activity_progress activity_progress_created_at_not_null NOT NULL created_at
constraint activity_progress activity_progress_is_late_not_null NOT NULL is_late
constraint activity_progress activity_progress_latest_submission_id_fkey FOREIGN KEY (latest_submission_id, user_id) REFERENCES submissions(id, user_id) ON DELETE SET NULL (latest_submission_id)
constraint activity_progress activity_progress_pkey PRIMARY KEY (activity_id, user_id)
constraint activity_progress activity_progress_required_not_null NOT NULL required
constraint activity_progress activity_progress_score_check CHECK (((score IS NULL) OR (((score)::double precision >= (0)::double precision) AND ((score)::double precision <= (100)::double precision))))
constraint activity_progress activity_progress_state_check CHECK ((state = ANY (ARRAY['not_started'::text, 'in_progress'::text, 'submitted'::text, 'needs_grading'::text, 'returned'::text, 'graded'::text, 'passed'::text, 'failed'::text, 'completed'::text])))
constraint activity_progress activity_progress_state_not_null NOT NULL state
constraint activity_progress activity_progress_teacher_action_required_not_null NOT NULL teacher_action_required
constraint activity_progress activity_progress_updated_at_not_null NOT NULL updated_at
constraint activity_progress activity_progress_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT
constraint activity_progress activity_progress_user_id_not_null NOT NULL user_id
constraint ai_approvals ai_approvals_action_type_not_null NOT NULL action_type
constraint ai_approvals ai_approvals_action_type_word CHECK ((action_type ~ '^[A-Za-z][A-Za-z0-9_.:-]*$'::text))
constraint ai_approvals ai_approvals_created_at_not_null NOT NULL created_at
constraint ai_approvals ai_approvals_id_not_null NOT NULL id
constraint ai_approvals ai_approvals_payload_not_null NOT NULL payload
constraint ai_approvals ai_approvals_payload_object CHECK ((jsonb_typeof(payload) = 'object'::text))
constraint ai_approvals ai_approvals_pkey PRIMARY KEY (id)
constraint ai_approvals ai_approvals_requested_by_fkey FOREIGN KEY (requested_by) REFERENCES users(id) ON DELETE SET NULL
constraint ai_approvals ai_approvals_resolved_by_fkey FOREIGN KEY (resolved_by) REFERENCES users(id) ON DELETE SET NULL
constraint ai_approvals ai_approvals_run_id_fkey FOREIGN KEY (run_id) REFERENCES ai_runs(id) ON DELETE CASCADE
constraint ai_approvals ai_approvals_run_id_not_null NOT NULL run_id
constraint ai_approvals ai_approvals_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'denied'::text, 'expired'::text])))
constraint ai_approvals ai_approvals_status_not_null NOT NULL status
constraint ai_artifacts ai_artifacts_content_not_null NOT NULL content
constraint ai_artifacts ai_artifacts_content_object CHECK ((jsonb_typeof(content) = 'object'::text))
constraint ai_artifacts ai_artifacts_created_at_not_null NOT NULL created_at
constraint ai_artifacts ai_artifacts_final_not_null NOT NULL final
constraint ai_artifacts ai_artifacts_id_not_null NOT NULL id
constraint ai_artifacts ai_artifacts_kind_not_null NOT NULL kind
constraint ai_artifacts ai_artifacts_kind_word CHECK ((kind ~ '^[A-Za-z][A-Za-z0-9_.:-]*$'::text))
constraint ai_artifacts ai_artifacts_pkey PRIMARY KEY (id)
constraint ai_artifacts ai_artifacts_run_id_fkey FOREIGN KEY (run_id) REFERENCES ai_runs(id) ON DELETE CASCADE
constraint ai_artifacts ai_artifacts_run_id_not_null NOT NULL run_id
constraint ai_course_analyses ai_course_analyses_content_hash_format CHECK ((content_hash ~ '^[0-9a-f]{64}$'::text))
constraint ai_course_analyses ai_course_analyses_course_id_fkey FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
constraint ai_course_analyses ai_course_analyses_course_id_not_null NOT NULL course_id
constraint ai_course_analyses ai_course_analyses_created_at_not_null NOT NULL created_at
constraint ai_course_analyses ai_course_analyses_evidence_not_null NOT NULL evidence
constraint ai_course_analyses ai_course_analyses_evidence_object CHECK ((jsonb_typeof(evidence) = 'object'::text))
constraint ai_course_analyses ai_course_analyses_id_not_null NOT NULL id
constraint ai_course_analyses ai_course_analyses_language_not_null NOT NULL language
constraint ai_course_analyses ai_course_analyses_language_tag CHECK ((language ~ '^[a-z]{2,8}(-[A-Za-z0-9]+)*$'::text))
constraint ai_course_analyses ai_course_analyses_pkey PRIMARY KEY (id)
constraint ai_course_analyses ai_course_analyses_public_score_check CHECK (((public_score >= 0) AND (public_score <= 100)))
constraint ai_course_analyses ai_course_analyses_public_score_not_null NOT NULL public_score
constraint ai_course_analyses ai_course_analyses_report_not_null NOT NULL report
constraint ai_course_analyses ai_course_analyses_report_object CHECK ((jsonb_typeof(report) = 'object'::text))
constraint ai_course_analyses ai_course_analyses_run_id_fkey FOREIGN KEY (run_id) REFERENCES ai_runs(id) ON DELETE SET NULL
constraint ai_course_analyses ai_course_analyses_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'needs_human_review'::text, 'published'::text])))
constraint ai_course_analyses ai_course_analyses_status_not_null NOT NULL status
constraint ai_course_analyses ai_course_analyses_triggered_by_fkey FOREIGN KEY (triggered_by) REFERENCES users(id) ON DELETE SET NULL
constraint ai_course_settings ai_course_settings_auto_grade_drafts_not_null NOT NULL auto_grade_drafts
constraint ai_course_settings ai_course_settings_course_id_fkey FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
constraint ai_course_settings ai_course_settings_course_id_not_null NOT NULL course_id
constraint ai_course_settings ai_course_settings_enabled_by_fkey FOREIGN KEY (enabled_by) REFERENCES users(id) ON DELETE SET NULL
constraint ai_course_settings ai_course_settings_pkey PRIMARY KEY (course_id)
constraint ai_course_settings ai_course_settings_updated_at_not_null NOT NULL updated_at
constraint ai_eval_results ai_eval_results_created_at_not_null NOT NULL created_at
constraint ai_eval_results ai_eval_results_dataset_not_null NOT NULL dataset
constraint ai_eval_results ai_eval_results_details_not_null NOT NULL details
constraint ai_eval_results ai_eval_results_details_object CHECK ((jsonb_typeof(details) = 'object'::text))
constraint ai_eval_results ai_eval_results_evaluator_not_null NOT NULL evaluator
constraint ai_eval_results ai_eval_results_id_not_null NOT NULL id
constraint ai_eval_results ai_eval_results_pkey PRIMARY KEY (id)
constraint ai_eval_results ai_eval_results_run_id_fkey FOREIGN KEY (run_id) REFERENCES ai_runs(id) ON DELETE SET NULL
constraint ai_eval_results ai_eval_results_score_check CHECK (((score IS NULL) OR ((score >= (0)::double precision) AND (score <= (1)::double precision))))
constraint ai_events ai_events_created_at_not_null NOT NULL created_at
constraint ai_events ai_events_event_type_not_null NOT NULL event_type
constraint ai_events ai_events_event_type_word CHECK ((event_type ~ '^[A-Za-z][A-Za-z0-9_.:-]*$'::text))
constraint ai_events ai_events_id_not_null NOT NULL id
constraint ai_events ai_events_payload_not_null NOT NULL payload
constraint ai_events ai_events_payload_object CHECK ((jsonb_typeof(payload) = 'object'::text))
constraint ai_events ai_events_pkey PRIMARY KEY (id)
constraint ai_events ai_events_run_id_fkey FOREIGN KEY (run_id) REFERENCES ai_runs(id) ON DELETE CASCADE
constraint ai_events ai_events_run_id_not_null NOT NULL run_id
constraint ai_events ai_events_run_id_sequence_key UNIQUE (run_id, sequence)
constraint ai_events ai_events_sequence_check CHECK ((sequence >= 1))
constraint ai_events ai_events_sequence_not_null NOT NULL sequence
constraint ai_evidence ai_evidence_artifact_id_fkey FOREIGN KEY (artifact_id) REFERENCES ai_artifacts(id) ON DELETE SET NULL
constraint ai_evidence ai_evidence_citation_id_not_null NOT NULL citation_id
constraint ai_evidence ai_evidence_created_at_not_null NOT NULL created_at
constraint ai_evidence ai_evidence_excerpt_not_null NOT NULL excerpt
constraint ai_evidence ai_evidence_id_not_null NOT NULL id
constraint ai_evidence ai_evidence_label_not_null NOT NULL label
constraint ai_evidence ai_evidence_metadata_not_null NOT NULL metadata
constraint ai_evidence ai_evidence_metadata_object CHECK ((jsonb_typeof(metadata) = 'object'::text))
constraint ai_evidence ai_evidence_pkey PRIMARY KEY (id)
constraint ai_evidence ai_evidence_run_id_fkey FOREIGN KEY (run_id) REFERENCES ai_runs(id) ON DELETE CASCADE
constraint ai_evidence ai_evidence_run_id_not_null NOT NULL run_id
constraint ai_evidence ai_evidence_score_check CHECK (((score IS NULL) OR ((score >= (0)::double precision) AND (score <= (1)::double precision))))
constraint ai_evidence ai_evidence_source_type_not_null NOT NULL source_type
constraint ai_evidence ai_evidence_source_type_word CHECK ((source_type ~ '^[A-Za-z][A-Za-z0-9_.:-]*$'::text))
constraint ai_feature_switches ai_feature_switches_enabled_not_null NOT NULL enabled
constraint ai_feature_switches ai_feature_switches_feature_check CHECK ((feature = ANY (ARRAY['course_analysis_enabled'::text, 'submission_analysis_enabled'::text, 'remediation_enabled'::text, 'course_qa_enabled'::text, 'study_companion_enabled'::text, 'lecture_authoring_enabled'::text, 'semantic_memory_enabled'::text, 'semantic_search_enabled'::text, 'concept_graph_enabled'::text, 'grading_assistant_enabled'::text])))
constraint ai_feature_switches ai_feature_switches_feature_not_null NOT NULL feature
constraint ai_feature_switches ai_feature_switches_pkey PRIMARY KEY (feature)
constraint ai_feature_switches ai_feature_switches_updated_at_not_null NOT NULL updated_at
constraint ai_feature_switches ai_feature_switches_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
constraint ai_grade_corrections ai_grade_corrections_activity_id_fkey FOREIGN KEY (activity_id, course_id) REFERENCES activities(id, course_id) ON DELETE CASCADE
constraint ai_grade_corrections ai_grade_corrections_activity_id_not_null NOT NULL activity_id
constraint ai_grade_corrections ai_grade_corrections_ai_score_not_null NOT NULL ai_score
constraint ai_grade_corrections ai_grade_corrections_course_id_fkey FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
constraint ai_grade_corrections ai_grade_corrections_course_id_not_null NOT NULL course_id
constraint ai_grade_corrections ai_grade_corrections_created_at_not_null NOT NULL created_at
constraint ai_grade_corrections ai_grade_corrections_criterion_key_check CHECK ((char_length(criterion_key) <= 100))
constraint ai_grade_corrections ai_grade_corrections_criterion_key_not_null NOT NULL criterion_key
constraint ai_grade_corrections ai_grade_corrections_draft_id_fkey FOREIGN KEY (draft_id) REFERENCES ai_grade_drafts(id) ON DELETE CASCADE
constraint ai_grade_corrections ai_grade_corrections_draft_id_not_null NOT NULL draft_id
constraint ai_grade_corrections ai_grade_corrections_draft_id_part_key_criterion_key_key UNIQUE (draft_id, part_key, criterion_key)
constraint ai_grade_corrections ai_grade_corrections_excerpt_check CHECK ((char_length(excerpt) <= 1000))
constraint ai_grade_corrections ai_grade_corrections_excerpt_not_null NOT NULL excerpt
constraint ai_grade_corrections ai_grade_corrections_id_not_null NOT NULL id
constraint ai_grade_corrections ai_grade_corrections_max_score_check CHECK (((max_score)::numeric > (0)::numeric))
constraint ai_grade_corrections ai_grade_corrections_max_score_not_null NOT NULL max_score
constraint ai_grade_corrections ai_grade_corrections_part_key_check CHECK (((char_length(part_key) >= 1) AND (char_length(part_key) <= 100)))
constraint ai_grade_corrections ai_grade_corrections_part_key_not_null NOT NULL part_key
constraint ai_grade_corrections ai_grade_corrections_pkey PRIMARY KEY (id)
constraint ai_grade_corrections ai_grade_corrections_teacher_feedback_check CHECK ((char_length(teacher_feedback) <= 1000))
constraint ai_grade_corrections ai_grade_corrections_teacher_feedback_not_null NOT NULL teacher_feedback
constraint ai_grade_corrections ai_grade_corrections_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE SET NULL
constraint ai_grade_corrections ai_grade_corrections_teacher_score_not_null NOT NULL teacher_score
constraint ai_grade_drafts ai_grade_drafts_activity_id_fkey FOREIGN KEY (activity_id, course_id) REFERENCES activities(id, course_id) ON DELETE CASCADE
constraint ai_grade_drafts ai_grade_drafts_activity_id_not_null NOT NULL activity_id
constraint ai_grade_drafts ai_grade_drafts_agreement_check CHECK ((agreement = ANY (ARRAY['exact'::text, 'adjusted'::text])))
constraint ai_grade_drafts ai_grade_drafts_check CHECK (((submission_id IS NULL) <> (file_attempt_id IS NULL)))
constraint ai_grade_drafts ai_grade_drafts_check1 CHECK (((status = 'applied'::text) = (agreement IS NOT NULL)))
constraint ai_grade_drafts ai_grade_drafts_confidence_check CHECK (((confidence IS NULL) OR ((confidence >= (0)::double precision) AND (confidence <= (1)::double precision))))
constraint ai_grade_drafts ai_grade_drafts_course_id_fkey FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
constraint ai_grade_drafts ai_grade_drafts_course_id_not_null NOT NULL course_id
constraint ai_grade_drafts ai_grade_drafts_created_at_not_null NOT NULL created_at
constraint ai_grade_drafts ai_grade_drafts_decided_by_fkey FOREIGN KEY (decided_by) REFERENCES users(id) ON DELETE SET NULL
constraint ai_grade_drafts ai_grade_drafts_file_attempt_id_fkey FOREIGN KEY (file_attempt_id, learner_id) REFERENCES file_submission_attempts(id, user_id) ON DELETE CASCADE
constraint ai_grade_drafts ai_grade_drafts_flags_not_null NOT NULL flags
constraint ai_grade_drafts ai_grade_drafts_id_not_null NOT NULL id
constraint ai_grade_drafts ai_grade_drafts_learner_id_fkey FOREIGN KEY (learner_id) REFERENCES users(id) ON DELETE CASCADE
constraint ai_grade_drafts ai_grade_drafts_learner_id_not_null NOT NULL learner_id
constraint ai_grade_drafts ai_grade_drafts_pkey PRIMARY KEY (id)
constraint ai_grade_drafts ai_grade_drafts_proposal_check CHECK ((jsonb_typeof(proposal) = 'object'::text))
constraint ai_grade_drafts ai_grade_drafts_proposal_not_null NOT NULL proposal
constraint ai_grade_drafts ai_grade_drafts_requested_by_fkey FOREIGN KEY (requested_by) REFERENCES users(id) ON DELETE SET NULL
constraint ai_grade_drafts ai_grade_drafts_run_id_fkey FOREIGN KEY (run_id) REFERENCES ai_runs(id) ON DELETE SET NULL
constraint ai_grade_drafts ai_grade_drafts_status_check CHECK ((status = ANY (ARRAY['queued'::text, 'ready'::text, 'applied'::text, 'discarded'::text, 'superseded'::text, 'failed'::text])))
constraint ai_grade_drafts ai_grade_drafts_status_not_null NOT NULL status
constraint ai_grade_drafts ai_grade_drafts_subject_version_not_null NOT NULL subject_version
constraint ai_grade_drafts ai_grade_drafts_submission_id_fkey FOREIGN KEY (submission_id, learner_id) REFERENCES submissions(id, user_id) ON DELETE CASCADE
constraint ai_grade_drafts ai_grade_drafts_updated_at_not_null NOT NULL updated_at
constraint ai_lecture_reviews ai_lecture_reviews_activity_id_fkey FOREIGN KEY (activity_id, course_id) REFERENCES activities(id, course_id) ON DELETE CASCADE
constraint ai_lecture_reviews ai_lecture_reviews_course_id_fkey FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
constraint ai_lecture_reviews ai_lecture_reviews_course_id_not_null NOT NULL course_id
constraint ai_lecture_reviews ai_lecture_reviews_created_at_not_null NOT NULL created_at
constraint ai_lecture_reviews ai_lecture_reviews_dismissed_suggestion_ids_check CHECK (text_list_ok(dismissed_suggestion_ids, 500, 200))
constraint ai_lecture_reviews ai_lecture_reviews_dismissed_suggestion_ids_not_null NOT NULL dismissed_suggestion_ids
constraint ai_lecture_reviews ai_lecture_reviews_id_not_null NOT NULL id
constraint ai_lecture_reviews ai_lecture_reviews_language_not_null NOT NULL language
constraint ai_lecture_reviews ai_lecture_reviews_language_tag CHECK ((language ~ '^[a-z]{2,8}(-[A-Za-z0-9]+)*$'::text))
constraint ai_lecture_reviews ai_lecture_reviews_pkey PRIMARY KEY (id)
constraint ai_lecture_reviews ai_lecture_reviews_run_id_fkey FOREIGN KEY (run_id) REFERENCES ai_runs(id) ON DELETE SET NULL
constraint ai_lecture_reviews ai_lecture_reviews_status_check CHECK ((status = ANY (ARRAY['active'::text, 'superseded'::text])))
constraint ai_lecture_reviews ai_lecture_reviews_status_not_null NOT NULL status
constraint ai_lecture_reviews ai_lecture_reviews_suggestions_not_null NOT NULL suggestions
constraint ai_lecture_reviews ai_lecture_reviews_suggestions_object CHECK ((jsonb_typeof(suggestions) = 'object'::text))
constraint ai_lecture_reviews ai_lecture_reviews_triggered_by_fkey FOREIGN KEY (triggered_by) REFERENCES users(id) ON DELETE SET NULL
constraint ai_qa_messages ai_qa_messages_citations_not_null NOT NULL citations
constraint ai_qa_messages ai_qa_messages_citations_object CHECK ((jsonb_typeof(citations) = 'object'::text))
constraint ai_qa_messages ai_qa_messages_confidence_check CHECK (((confidence IS NULL) OR (confidence = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text]))))
constraint ai_qa_messages ai_qa_messages_content_not_null NOT NULL content
constraint ai_qa_messages ai_qa_messages_course_id_fkey FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
constraint ai_qa_messages ai_qa_messages_course_id_not_null NOT NULL course_id
constraint ai_qa_messages ai_qa_messages_created_at_not_null NOT NULL created_at
constraint ai_qa_messages ai_qa_messages_id_not_null NOT NULL id
constraint ai_qa_messages ai_qa_messages_metadata_not_null NOT NULL metadata
constraint ai_qa_messages ai_qa_messages_metadata_object CHECK ((jsonb_typeof(metadata) = 'object'::text))
constraint ai_qa_messages ai_qa_messages_pkey PRIMARY KEY (id)
constraint ai_qa_messages ai_qa_messages_role_check CHECK ((role = ANY (ARRAY['user'::text, 'assistant'::text])))
constraint ai_qa_messages ai_qa_messages_role_not_null NOT NULL role
constraint ai_qa_messages ai_qa_messages_thread_id_fkey FOREIGN KEY (thread_id) REFERENCES ai_threads(id) ON DELETE CASCADE
constraint ai_qa_messages ai_qa_messages_thread_id_not_null NOT NULL thread_id
constraint ai_qa_messages ai_qa_messages_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
constraint ai_remediation_sessions ai_remediation_sessions_activity_id_fkey FOREIGN KEY (activity_id) REFERENCES activities(id) ON DELETE CASCADE
constraint ai_remediation_sessions ai_remediation_sessions_activity_id_not_null NOT NULL activity_id
constraint ai_remediation_sessions ai_remediation_sessions_analysis_id_fkey FOREIGN KEY (analysis_id) REFERENCES ai_submission_analyses(id) ON DELETE SET NULL
constraint ai_remediation_sessions ai_remediation_sessions_created_at_not_null NOT NULL created_at
constraint ai_remediation_sessions ai_remediation_sessions_file_submission_attempt_id_fkey FOREIGN KEY (file_submission_attempt_id, student_user_id) REFERENCES file_submission_attempts(id, user_id) ON DELETE CASCADE
constraint ai_remediation_sessions ai_remediation_sessions_gate_mode_not_null NOT NULL gate_mode
constraint ai_remediation_sessions ai_remediation_sessions_id_not_null NOT NULL id
constraint ai_remediation_sessions ai_remediation_sessions_language_not_null NOT NULL language
constraint ai_remediation_sessions ai_remediation_sessions_language_tag CHECK ((language ~ '^[a-z]{2,8}(-[A-Za-z0-9]+)*$'::text))
constraint ai_remediation_sessions ai_remediation_sessions_lecture_not_null NOT NULL lecture
constraint ai_remediation_sessions ai_remediation_sessions_lecture_object CHECK ((jsonb_typeof(lecture) = 'object'::text))
constraint ai_remediation_sessions ai_remediation_sessions_one_subject CHECK (((submission_id IS NULL) <> (file_submission_attempt_id IS NULL)))
constraint ai_remediation_sessions ai_remediation_sessions_pkey PRIMARY KEY (id)
constraint ai_remediation_sessions ai_remediation_sessions_run_id_fkey FOREIGN KEY (run_id) REFERENCES ai_runs(id) ON DELETE SET NULL
constraint ai_remediation_sessions ai_remediation_sessions_score_check CHECK (((score IS NULL) OR ((score >= 0) AND (score <= 100))))
constraint ai_remediation_sessions ai_remediation_sessions_status_check CHECK ((status = ANY (ARRAY['assigned'::text, 'in_progress'::text, 'passed'::text, 'failed'::text])))
constraint ai_remediation_sessions ai_remediation_sessions_status_not_null NOT NULL status
constraint ai_remediation_sessions ai_remediation_sessions_student_user_id_fkey FOREIGN KEY (student_user_id) REFERENCES users(id) ON DELETE CASCADE
constraint ai_remediation_sessions ai_remediation_sessions_student_user_id_not_null NOT NULL student_user_id
constraint ai_remediation_sessions ai_remediation_sessions_submission_id_fkey FOREIGN KEY (submission_id, student_user_id) REFERENCES submissions(id, user_id) ON DELETE CASCADE
constraint ai_remediation_sessions ai_remediation_sessions_test_not_null NOT NULL test
constraint ai_remediation_sessions ai_remediation_sessions_test_object CHECK ((jsonb_typeof(test) = 'object'::text))
constraint ai_remediation_sessions ai_remediation_sessions_updated_at_not_null NOT NULL updated_at
constraint ai_runs ai_runs_created_at_not_null NOT NULL created_at
constraint ai_runs ai_runs_duration_ms_check CHECK (((duration_ms IS NULL) OR (duration_ms >= 0)))
constraint ai_runs ai_runs_finished_at_check CHECK (((status <> ALL (ARRAY['succeeded'::text, 'failed'::text, 'aborted'::text])) OR (completed_at IS NOT NULL)))
constraint ai_runs ai_runs_id_not_null NOT NULL id
constraint ai_runs ai_runs_input_tokens_check CHECK (((input_tokens IS NULL) OR (input_tokens >= 0)))
constraint ai_runs ai_runs_kind_check CHECK ((kind = ANY (ARRAY['course_analysis'::text, 'submission_analysis'::text, 'remediation'::text, 'study_companion'::text, 'lecture_review'::text, 'course_qa'::text, 'concept_mapping'::text, 'grade_draft'::text])))
constraint ai_runs ai_runs_kind_not_null NOT NULL kind
constraint ai_runs ai_runs_metadata_not_null NOT NULL metadata
constraint ai_runs ai_runs_metadata_object CHECK ((jsonb_typeof(metadata) = 'object'::text))
constraint ai_runs ai_runs_output_tokens_check CHECK (((output_tokens IS NULL) OR (output_tokens >= 0)))
constraint ai_runs ai_runs_pkey PRIMARY KEY (id)
constraint ai_runs ai_runs_safety_state_word CHECK ((safety_state ~ '^[A-Za-z][A-Za-z0-9_.:-]*$'::text))
constraint ai_runs ai_runs_status_check CHECK ((status = ANY (ARRAY['queued'::text, 'running'::text, 'succeeded'::text, 'failed'::text, 'aborted'::text])))
constraint ai_runs ai_runs_status_not_null NOT NULL status
constraint ai_runs ai_runs_thread_id_fkey FOREIGN KEY (thread_id) REFERENCES ai_threads(id) ON DELETE CASCADE
constraint ai_runs ai_runs_triggered_by_fkey FOREIGN KEY (triggered_by) REFERENCES users(id) ON DELETE SET NULL
constraint ai_student_memory ai_student_memory_course_id_fkey FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
constraint ai_student_memory ai_student_memory_created_at_not_null NOT NULL created_at
constraint ai_student_memory ai_student_memory_id_not_null NOT NULL id
constraint ai_student_memory ai_student_memory_language_not_null NOT NULL language
constraint ai_student_memory ai_student_memory_language_tag CHECK ((language ~ '^[a-z]{2,8}(-[A-Za-z0-9]+)*$'::text))
constraint ai_student_memory ai_student_memory_memory_text_not_null NOT NULL memory_text
constraint ai_student_memory ai_student_memory_metadata_not_null NOT NULL metadata
constraint ai_student_memory ai_student_memory_metadata_object CHECK ((jsonb_typeof(metadata) = 'object'::text))
constraint ai_student_memory ai_student_memory_pkey PRIMARY KEY (id)
constraint ai_student_memory ai_student_memory_source_id_not_null NOT NULL source_id
constraint ai_student_memory ai_student_memory_source_type_not_null NOT NULL source_type
constraint ai_student_memory ai_student_memory_source_type_word CHECK ((source_type ~ '^[A-Za-z][A-Za-z0-9_.:-]*$'::text))
constraint ai_student_memory ai_student_memory_student_user_id_fkey FOREIGN KEY (student_user_id) REFERENCES users(id) ON DELETE CASCADE
constraint ai_student_memory ai_student_memory_student_user_id_not_null NOT NULL student_user_id
constraint ai_student_memory ai_student_memory_updated_at_not_null NOT NULL updated_at
constraint ai_submission_analyses ai_submission_analyses_analysis_not_null NOT NULL analysis
constraint ai_submission_analyses ai_submission_analyses_analysis_object CHECK ((jsonb_typeof(analysis) = 'object'::text))
constraint ai_submission_analyses ai_submission_analyses_created_at_not_null NOT NULL created_at
constraint ai_submission_analyses ai_submission_analyses_evidence_not_null NOT NULL evidence
constraint ai_submission_analyses ai_submission_analyses_evidence_object CHECK ((jsonb_typeof(evidence) = 'object'::text))
constraint ai_submission_analyses ai_submission_analyses_file_submission_attempt_id_fkey FOREIGN KEY (file_submission_attempt_id) REFERENCES file_submission_attempts(id) ON DELETE CASCADE
constraint ai_submission_analyses ai_submission_analyses_gap_count_check CHECK ((gap_count >= 0))
constraint ai_submission_analyses ai_submission_analyses_gap_count_not_null NOT NULL gap_count
constraint ai_submission_analyses ai_submission_analyses_id_not_null NOT NULL id
constraint ai_submission_analyses ai_submission_analyses_language_not_null NOT NULL language
constraint ai_submission_analyses ai_submission_analyses_language_tag CHECK ((language ~ '^[a-z]{2,8}(-[A-Za-z0-9]+)*$'::text))
constraint ai_submission_analyses ai_submission_analyses_one_subject CHECK (((submission_id IS NULL) <> (file_submission_attempt_id IS NULL)))
constraint ai_submission_analyses ai_submission_analyses_pkey PRIMARY KEY (id)
constraint ai_submission_analyses ai_submission_analyses_run_id_fkey FOREIGN KEY (run_id) REFERENCES ai_runs(id) ON DELETE SET NULL
constraint ai_submission_analyses ai_submission_analyses_status_check CHECK ((status = ANY (ARRAY['complete'::text, 'failed'::text, 'superseded'::text])))
constraint ai_submission_analyses ai_submission_analyses_status_not_null NOT NULL status
constraint ai_submission_analyses ai_submission_analyses_submission_id_fkey FOREIGN KEY (submission_id) REFERENCES submissions(id) ON DELETE CASCADE
constraint ai_submission_analyses ai_submission_analyses_triggered_by_fkey FOREIGN KEY (triggered_by) REFERENCES users(id) ON DELETE SET NULL
constraint ai_threads ai_threads_activity_id_fkey FOREIGN KEY (activity_id) REFERENCES activities(id) ON DELETE SET NULL
constraint ai_threads ai_threads_course_id_fkey FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE SET NULL
constraint ai_threads ai_threads_created_at_not_null NOT NULL created_at
constraint ai_threads ai_threads_id_not_null NOT NULL id
constraint ai_threads ai_threads_pkey PRIMARY KEY (id)
constraint ai_threads ai_threads_role_check CHECK ((role = ANY (ARRAY['student'::text, 'teacher'::text, 'author'::text, 'admin'::text])))
constraint ai_threads ai_threads_role_not_null NOT NULL role
constraint ai_threads ai_threads_updated_at_not_null NOT NULL updated_at
constraint ai_threads ai_threads_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
constraint ai_token_ledger ai_token_ledger_input_tokens_check CHECK ((input_tokens >= 0))
constraint ai_token_ledger ai_token_ledger_input_tokens_not_null NOT NULL input_tokens
constraint ai_token_ledger ai_token_ledger_month_check CHECK ((month = (date_trunc('month'::text, (month)::timestamp with time zone))::date))
constraint ai_token_ledger ai_token_ledger_month_not_null NOT NULL month
constraint ai_token_ledger ai_token_ledger_output_tokens_check CHECK ((output_tokens >= 0))
constraint ai_token_ledger ai_token_ledger_output_tokens_not_null NOT NULL output_tokens
constraint ai_token_ledger ai_token_ledger_pkey PRIMARY KEY (month, user_id)
constraint ai_token_ledger ai_token_ledger_run_count_check CHECK ((run_count >= 0))
constraint ai_token_ledger ai_token_ledger_run_count_not_null NOT NULL run_count
constraint ai_token_ledger ai_token_ledger_updated_at_not_null NOT NULL updated_at
constraint ai_token_ledger ai_token_ledger_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
constraint ai_token_ledger ai_token_ledger_user_id_not_null NOT NULL user_id
constraint ai_token_reservations ai_token_reservations_created_at_not_null NOT NULL created_at
constraint ai_token_reservations ai_token_reservations_expires_at_not_null NOT NULL expires_at
constraint ai_token_reservations ai_token_reservations_id_not_null NOT NULL id
constraint ai_token_reservations ai_token_reservations_pkey PRIMARY KEY (id)
constraint ai_token_reservations ai_token_reservations_run_id_fkey FOREIGN KEY (run_id) REFERENCES ai_runs(id) ON DELETE CASCADE
constraint ai_token_reservations ai_token_reservations_tokens_check CHECK ((tokens >= 0))
constraint ai_token_reservations ai_token_reservations_tokens_not_null NOT NULL tokens
constraint ai_work_embeddings ai_work_embeddings_activity_id_fkey FOREIGN KEY (activity_id) REFERENCES activities(id) ON DELETE CASCADE
constraint ai_work_embeddings ai_work_embeddings_activity_id_not_null NOT NULL activity_id
constraint ai_work_embeddings ai_work_embeddings_created_at_not_null NOT NULL created_at
constraint ai_work_embeddings ai_work_embeddings_embedding_model_not_null NOT NULL embedding_model
constraint ai_work_embeddings ai_work_embeddings_embedding_not_null NOT NULL embedding
constraint ai_work_embeddings ai_work_embeddings_part_key_not_null NOT NULL part_key
constraint ai_work_embeddings ai_work_embeddings_pkey PRIMARY KEY (subject_id, part_key)
constraint ai_work_embeddings ai_work_embeddings_subject_id_not_null NOT NULL subject_id
constraint ai_work_embeddings ai_work_embeddings_text_hash_format CHECK ((text_hash ~ '^[0-9a-f]{64}$'::text))
constraint ai_work_embeddings ai_work_embeddings_text_hash_not_null NOT NULL text_hash
constraint analytics_events analytics_events_created_at_not_null NOT NULL created_at
constraint analytics_events analytics_events_event_type_check CHECK ((event_type = ANY (ARRAY['submission.submitted'::text, 'submission.graded'::text, 'submission.published'::text, 'submission.returned'::text, 'activity.completed'::text, 'discussion.posted'::text, 'login'::text])))
constraint analytics_events analytics_events_event_type_not_null NOT NULL event_type
constraint analytics_events analytics_events_id_not_null NOT NULL id
constraint analytics_events analytics_events_occurred_at_not_null NOT NULL occurred_at
constraint analytics_events analytics_events_payload_check CHECK ((jsonb_typeof(payload) = 'object'::text))
constraint analytics_events analytics_events_payload_not_null NOT NULL payload
constraint analytics_events analytics_events_pkey PRIMARY KEY (id, occurred_at)
constraint analytics_saved_views analytics_saved_views_created_at_not_null NOT NULL created_at
constraint analytics_saved_views analytics_saved_views_id_not_null NOT NULL id
constraint analytics_saved_views analytics_saved_views_name_check CHECK (((char_length(name) >= 1) AND (char_length(name) <= 200)))
constraint analytics_saved_views analytics_saved_views_name_not_null NOT NULL name
constraint analytics_saved_views analytics_saved_views_pkey PRIMARY KEY (id)
constraint analytics_saved_views analytics_saved_views_query_not_null NOT NULL query
constraint analytics_saved_views analytics_saved_views_query_object CHECK ((jsonb_typeof(query) = 'object'::text))
constraint analytics_saved_views analytics_saved_views_teacher_user_id_fkey FOREIGN KEY (teacher_user_id) REFERENCES users(id) ON DELETE CASCADE
constraint analytics_saved_views analytics_saved_views_teacher_user_id_not_null NOT NULL teacher_user_id
constraint analytics_saved_views analytics_saved_views_teacher_user_id_view_type_name_key UNIQUE (teacher_user_id, view_type, name)
constraint analytics_saved_views analytics_saved_views_updated_at_not_null NOT NULL updated_at
constraint analytics_saved_views analytics_saved_views_view_type_check CHECK (((char_length(view_type) >= 1) AND (char_length(view_type) <= 50)))
constraint analytics_saved_views analytics_saved_views_view_type_not_null NOT NULL view_type
constraint assessment_access_usergroups assessment_access_usergroups_assessment_id_fkey FOREIGN KEY (assessment_id) REFERENCES assessments(id) ON DELETE CASCADE
constraint assessment_access_usergroups assessment_access_usergroups_assessment_id_not_null NOT NULL assessment_id
constraint assessment_access_usergroups assessment_access_usergroups_created_at_not_null NOT NULL created_at
constraint assessment_access_usergroups assessment_access_usergroups_pkey PRIMARY KEY (assessment_id, usergroup_id)
constraint assessment_access_usergroups assessment_access_usergroups_usergroup_id_fkey FOREIGN KEY (usergroup_id) REFERENCES usergroups(id) ON DELETE CASCADE
constraint assessment_access_usergroups assessment_access_usergroups_usergroup_id_not_null NOT NULL usergroup_id
constraint assessment_access_users assessment_access_users_assessment_id_fkey FOREIGN KEY (assessment_id) REFERENCES assessments(id) ON DELETE CASCADE
constraint assessment_access_users assessment_access_users_assessment_id_not_null NOT NULL assessment_id
constraint assessment_access_users assessment_access_users_created_at_not_null NOT NULL created_at
constraint assessment_access_users assessment_access_users_pkey PRIMARY KEY (assessment_id, user_id)
constraint assessment_access_users assessment_access_users_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
constraint assessment_access_users assessment_access_users_user_id_not_null NOT NULL user_id
constraint assessment_audit_events assessment_audit_events_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE SET NULL
constraint assessment_audit_events assessment_audit_events_assessment_id_not_null NOT NULL assessment_id
constraint assessment_audit_events assessment_audit_events_created_at_not_null NOT NULL created_at
constraint assessment_audit_events assessment_audit_events_event_not_null NOT NULL event
constraint assessment_audit_events assessment_audit_events_event_word CHECK ((event ~ '^[A-Za-z][A-Za-z0-9_.:-]*$'::text))
constraint assessment_audit_events assessment_audit_events_id_not_null NOT NULL id
constraint assessment_audit_events assessment_audit_events_payload_check CHECK ((jsonb_typeof(payload) = 'object'::text))
constraint assessment_audit_events assessment_audit_events_payload_not_null NOT NULL payload
constraint assessment_audit_events assessment_audit_events_pkey PRIMARY KEY (id)
constraint assessment_items assessment_items_assessment_id_fkey FOREIGN KEY (assessment_id) REFERENCES assessments(id) ON DELETE CASCADE
constraint assessment_items assessment_items_assessment_id_not_null NOT NULL assessment_id
constraint assessment_items assessment_items_body_kind_check CHECK (((jsonb_typeof(body) = 'object'::text) AND ((body ->> 'kind'::text) = kind)))
constraint assessment_items assessment_items_body_not_null NOT NULL body
constraint assessment_items assessment_items_created_at_not_null NOT NULL created_at
constraint assessment_items assessment_items_difficulty_check CHECK (((difficulty IS NULL) OR (difficulty = ANY (ARRAY['easy'::text, 'medium'::text, 'hard'::text]))))
constraint assessment_items assessment_items_estimated_minutes_check CHECK (((estimated_minutes IS NULL) OR (estimated_minutes >= 0)))
constraint assessment_items assessment_items_id_assessment_key UNIQUE (id, assessment_id)
constraint assessment_items assessment_items_id_not_null NOT NULL id
constraint assessment_items assessment_items_kind_check CHECK ((kind = ANY (ARRAY['choice'::text, 'open_text'::text, 'form'::text, 'code'::text, 'matching'::text])))
constraint assessment_items assessment_items_kind_not_null NOT NULL kind
constraint assessment_items assessment_items_max_score_not_null NOT NULL max_score
constraint assessment_items assessment_items_outcome_ids_check CHECK (text_list_ok(outcome_ids, 50, 64))
constraint assessment_items assessment_items_outcome_ids_not_null NOT NULL outcome_ids
constraint assessment_items assessment_items_pkey PRIMARY KEY (id)
constraint assessment_items assessment_items_position_check CHECK (("position" >= 1))
constraint assessment_items assessment_items_position_key UNIQUE (assessment_id, "position") DEFERRABLE INITIALLY DEFERRED
constraint assessment_items assessment_items_position_not_null NOT NULL "position"
constraint assessment_items assessment_items_tags_check CHECK (text_list_ok(tags, 50, 64))
constraint assessment_items assessment_items_tags_not_null NOT NULL tags
constraint assessment_items assessment_items_title_not_null NOT NULL title
constraint assessment_items assessment_items_updated_at_not_null NOT NULL updated_at
constraint assessment_overrides assessment_overrides_assessment_id_fkey FOREIGN KEY (assessment_id) REFERENCES assessments(id) ON DELETE CASCADE
constraint assessment_overrides assessment_overrides_assessment_id_not_null NOT NULL assessment_id
constraint assessment_overrides assessment_overrides_assessment_id_user_id_key UNIQUE (assessment_id, user_id)
constraint assessment_overrides assessment_overrides_created_at_not_null NOT NULL created_at
constraint assessment_overrides assessment_overrides_due_extended_not_null NOT NULL due_extended
constraint assessment_overrides assessment_overrides_granted_by_fkey FOREIGN KEY (granted_by) REFERENCES users(id) ON DELETE SET NULL
constraint assessment_overrides assessment_overrides_id_not_null NOT NULL id
constraint assessment_overrides assessment_overrides_max_attempts_override_check CHECK (((max_attempts_override IS NULL) OR ((max_attempts_override >= 1) AND (max_attempts_override <= 10))))
constraint assessment_overrides assessment_overrides_note_not_null NOT NULL note
constraint assessment_overrides assessment_overrides_pkey PRIMARY KEY (id)
constraint assessment_overrides assessment_overrides_updated_at_not_null NOT NULL updated_at
constraint assessment_overrides assessment_overrides_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
constraint assessment_overrides assessment_overrides_user_id_not_null NOT NULL user_id
constraint assessment_overrides assessment_overrides_version_not_null NOT NULL version
constraint assessment_overrides assessment_overrides_waive_late_penalty_not_null NOT NULL waive_late_penalty
constraint assessment_versions assessment_versions_assessment_id_content_hash_key UNIQUE (assessment_id, content_hash)
constraint assessment_versions assessment_versions_assessment_id_fkey FOREIGN KEY (assessment_id) REFERENCES assessments(id) ON DELETE CASCADE
constraint assessment_versions assessment_versions_assessment_id_not_null NOT NULL assessment_id
constraint assessment_versions assessment_versions_assessment_id_number_key UNIQUE (assessment_id, number)
constraint assessment_versions assessment_versions_content_hash_format CHECK ((content_hash ~ '^[0-9a-f]{32}$'::text))
constraint assessment_versions assessment_versions_content_hash_not_null NOT NULL content_hash
constraint assessment_versions assessment_versions_created_at_not_null NOT NULL created_at
constraint assessment_versions assessment_versions_id_not_null NOT NULL id
constraint assessment_versions assessment_versions_items_check CHECK ((jsonb_typeof(items) = 'object'::text))
constraint assessment_versions assessment_versions_items_not_null NOT NULL items
constraint assessment_versions assessment_versions_max_points_check CHECK ((max_points >= (0)::numeric))
constraint assessment_versions assessment_versions_max_points_not_null NOT NULL max_points
constraint assessment_versions assessment_versions_number_check CHECK ((number >= 1))
constraint assessment_versions assessment_versions_number_not_null NOT NULL number
constraint assessment_versions assessment_versions_pkey PRIMARY KEY (id)
constraint assessment_versions assessment_versions_policy_check CHECK ((jsonb_typeof(policy) = 'object'::text))
constraint assessment_versions assessment_versions_policy_not_null NOT NULL policy
constraint assessments assessments_access_mode_check CHECK ((access_mode = ANY (ARRAY['all_course_learners'::text, 'restricted'::text])))
constraint assessments assessments_access_mode_not_null NOT NULL access_mode
constraint assessments assessments_activity_id_fkey FOREIGN KEY (activity_id, course_id) REFERENCES activities(id, course_id) ON UPDATE RESTRICT ON DELETE CASCADE
constraint assessments assessments_activity_id_key UNIQUE (activity_id)
constraint assessments assessments_activity_id_not_null NOT NULL activity_id
constraint assessments assessments_allow_late_not_null NOT NULL allow_late
constraint assessments assessments_archived_at_check CHECK (((lifecycle <> 'archived'::text) OR (archived_at IS NOT NULL)))
constraint assessments assessments_attempt_penalty_percent_not_null NOT NULL attempt_penalty_percent
constraint assessments assessments_completion_rule_check CHECK ((completion_rule = ANY (ARRAY['viewed'::text, 'submitted'::text, 'graded'::text, 'passed'::text, 'teacher_verified'::text])))
constraint assessments assessments_completion_rule_not_null NOT NULL completion_rule
constraint assessments assessments_content_version_not_null NOT NULL content_version
constraint assessments assessments_copy_paste_protection_not_null NOT NULL copy_paste_protection
constraint assessments assessments_course_id_fkey FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
constraint assessments assessments_course_id_not_null NOT NULL course_id
constraint assessments assessments_created_at_not_null NOT NULL created_at
constraint assessments assessments_creator_id_fkey FOREIGN KEY (creator_id) REFERENCES users(id) ON DELETE SET NULL
constraint assessments assessments_description_not_null NOT NULL description
constraint assessments assessments_devtools_detection_not_null NOT NULL devtools_detection
constraint assessments assessments_fullscreen_required_not_null NOT NULL fullscreen_required
constraint assessments assessments_grace_period_minutes_check CHECK ((grace_period_minutes >= 0))
constraint assessments assessments_grace_period_minutes_not_null NOT NULL grace_period_minutes
constraint assessments assessments_grade_release_mode_check CHECK ((grade_release_mode = ANY (ARRAY['immediate'::text, 'batch'::text])))
constraint assessments assessments_grade_release_mode_not_null NOT NULL grade_release_mode
constraint assessments assessments_grading_mode_check CHECK ((grading_mode = ANY (ARRAY['auto'::text, 'manual'::text, 'auto_then_manual'::text])))
constraint assessments assessments_grading_mode_not_null NOT NULL grading_mode
constraint assessments assessments_grading_type_check CHECK ((grading_type = ANY (ARRAY['numeric'::text, 'percentage'::text])))
constraint assessments assessments_grading_type_not_null NOT NULL grading_type
constraint assessments assessments_id_course_key UNIQUE (id, course_id)
constraint assessments assessments_id_not_null NOT NULL id
constraint assessments assessments_late_penalty_max_days_check CHECK (((late_penalty_max_days IS NULL) OR (late_penalty_max_days >= 1)))
constraint assessments assessments_late_policy_kind_check CHECK ((late_policy_kind = ANY (ARRAY['none'::text, 'penalty'::text, 'cutoff'::text])))
constraint assessments assessments_late_policy_kind_not_null NOT NULL late_policy_kind
constraint assessments assessments_late_policy_shape CHECK ((((late_policy_kind = 'none'::text) AND (late_penalty_percent_per_day IS NULL) AND (late_penalty_max_days IS NULL) AND (late_cutoff_at IS NULL)) OR ((late_policy_kind = 'penalty'::text) AND (late_penalty_percent_per_day IS NOT NULL) AND (late_penalty_max_days IS NOT NULL) AND (late_cutoff_at IS NULL)) OR ((late_policy_kind = 'cutoff'::text) AND (late_cutoff_at IS NOT NULL) AND (late_penalty_percent_per_day IS NULL) AND (late_penalty_max_days IS NULL))))
constraint assessments assessments_lifecycle_check CHECK ((lifecycle = ANY (ARRAY['draft'::text, 'scheduled'::text, 'published'::text, 'archived'::text])))
constraint assessments assessments_lifecycle_not_null NOT NULL lifecycle
constraint assessments assessments_max_attempts_check CHECK (((max_attempts IS NULL) OR (max_attempts >= 1)))
constraint assessments assessments_negative_marking_percent_not_null NOT NULL negative_marking_percent
constraint assessments assessments_partial_credit_not_null NOT NULL partial_credit
constraint assessments assessments_passing_score_not_null NOT NULL passing_score
constraint assessments assessments_pkey PRIMARY KEY (id)
constraint assessments assessments_policy_version_not_null NOT NULL policy_version
constraint assessments assessments_published_at_check CHECK (((lifecycle <> 'published'::text) OR (published_at IS NOT NULL)))
constraint assessments assessments_randomize_options_not_null NOT NULL randomize_options
constraint assessments assessments_randomize_questions_not_null NOT NULL randomize_questions
constraint assessments assessments_required_not_null NOT NULL required
constraint assessments assessments_review_visibility_check CHECK ((review_visibility = ANY (ARRAY['none'::text, 'score_only'::text, 'full'::text])))
constraint assessments assessments_review_visibility_not_null NOT NULL review_visibility
constraint assessments assessments_right_click_disabled_not_null NOT NULL right_click_disabled
constraint assessments assessments_scheduled_needs_time CHECK (((lifecycle <> 'scheduled'::text) OR (scheduled_at IS NOT NULL)))
constraint assessments assessments_tab_switch_detection_not_null NOT NULL tab_switch_detection
constraint assessments assessments_time_limit_seconds_check CHECK (((time_limit_seconds IS NULL) OR (time_limit_seconds >= 1)))
constraint assessments assessments_updated_at_not_null NOT NULL updated_at
constraint assessments assessments_version_not_null NOT NULL version
constraint assessments assessments_violation_threshold_check CHECK ((violation_threshold >= 1))
constraint assessments assessments_violation_threshold_not_null NOT NULL violation_threshold
constraint assessments assessments_weight_not_null NOT NULL weight
constraint auth_audit_log auth_audit_log_created_at_not_null NOT NULL created_at
constraint auth_audit_log auth_audit_log_event_not_null NOT NULL event
constraint auth_audit_log auth_audit_log_event_word CHECK ((event ~ '^[A-Za-z][A-Za-z0-9_.:-]*$'::text))
constraint auth_audit_log auth_audit_log_id_not_null NOT NULL id
constraint auth_audit_log auth_audit_log_metadata_check CHECK ((jsonb_typeof(metadata) = 'object'::text))
constraint auth_audit_log auth_audit_log_metadata_not_null NOT NULL metadata
constraint auth_audit_log auth_audit_log_pkey PRIMARY KEY (id)
constraint auth_audit_log auth_audit_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
constraint block_uploads block_uploads_block_id_fkey FOREIGN KEY (block_id) REFERENCES blocks(id) ON DELETE CASCADE
constraint block_uploads block_uploads_block_id_not_null NOT NULL block_id
constraint block_uploads block_uploads_pkey PRIMARY KEY (block_id, upload_id)
constraint block_uploads block_uploads_upload_id_fkey FOREIGN KEY (upload_id) REFERENCES uploads(id) ON DELETE CASCADE
constraint block_uploads block_uploads_upload_id_not_null NOT NULL upload_id
constraint blocks blocks_activity_id_fkey FOREIGN KEY (activity_id) REFERENCES activities(id) ON DELETE CASCADE
constraint blocks blocks_activity_id_not_null NOT NULL activity_id
constraint blocks blocks_block_type_check CHECK ((block_type = ANY (ARRAY['video'::text, 'pdf'::text, 'image'::text, 'custom'::text])))
constraint blocks blocks_block_type_not_null NOT NULL block_type
constraint blocks blocks_claimed_not_null NOT NULL claimed
constraint blocks blocks_content_not_null NOT NULL content
constraint blocks blocks_content_object CHECK ((jsonb_typeof(content) = 'object'::text))
constraint blocks blocks_created_at_not_null NOT NULL created_at
constraint blocks blocks_id_not_null NOT NULL id
constraint blocks blocks_legacy_uuid_key UNIQUE (legacy_uuid)
constraint blocks blocks_pkey PRIMARY KEY (id)
constraint blocks blocks_updated_at_not_null NOT NULL updated_at
constraint bulk_actions bulk_actions_action_type_check CHECK ((action_type = ANY (ARRAY['extend_deadline'::text, 'release_grades'::text, 'return_all'::text, 'override_score'::text, 'batch_grade'::text])))
constraint bulk_actions bulk_actions_action_type_not_null NOT NULL action_type
constraint bulk_actions bulk_actions_affected_count_not_null NOT NULL affected_count
constraint bulk_actions bulk_actions_assessment_id_not_null NOT NULL assessment_id
constraint bulk_actions bulk_actions_created_at_not_null NOT NULL created_at
constraint bulk_actions bulk_actions_error_log_not_null NOT NULL error_log
constraint bulk_actions bulk_actions_id_not_null NOT NULL id
constraint bulk_actions bulk_actions_params_not_null NOT NULL params
constraint bulk_actions bulk_actions_params_object CHECK ((jsonb_typeof(params) = 'object'::text))
constraint bulk_actions bulk_actions_performed_by_fkey FOREIGN KEY (performed_by) REFERENCES users(id) ON DELETE SET NULL
constraint bulk_actions bulk_actions_pkey PRIMARY KEY (id)
constraint bulk_actions bulk_actions_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'running'::text, 'completed'::text, 'failed'::text])))
constraint bulk_actions bulk_actions_status_not_null NOT NULL status
constraint bulk_actions bulk_actions_target_user_ids_not_null NOT NULL target_user_ids
constraint certificate_users certificate_users_certificate_name_not_null NOT NULL certificate_name
constraint certificate_users certificate_users_certification_id_fkey FOREIGN KEY (certification_id) REFERENCES certifications(id) ON DELETE RESTRICT
constraint certificate_users certificate_users_certification_id_not_null NOT NULL certification_id
constraint certificate_users certificate_users_certification_id_user_id_key UNIQUE (certification_id, user_id)
constraint certificate_users certificate_users_course_id_not_null NOT NULL course_id
constraint certificate_users certificate_users_course_name_not_null NOT NULL course_name
constraint certificate_users certificate_users_created_at_not_null NOT NULL created_at
constraint certificate_users certificate_users_holder_name_not_null NOT NULL holder_name
constraint certificate_users certificate_users_id_not_null NOT NULL id
constraint certificate_users certificate_users_pkey PRIMARY KEY (id)
constraint certificate_users certificate_users_updated_at_not_null NOT NULL updated_at
constraint certificate_users certificate_users_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT
constraint certificate_users certificate_users_user_id_not_null NOT NULL user_id
constraint certificate_users certificate_users_verify_code_key UNIQUE (verify_code)
constraint certificate_users certificate_users_verify_code_not_null NOT NULL verify_code
constraint certifications certifications_config_not_null NOT NULL config
constraint certifications certifications_config_object CHECK ((jsonb_typeof(config) = 'object'::text))
constraint certifications certifications_course_id_fkey FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE SET NULL
constraint certifications certifications_created_at_not_null NOT NULL created_at
constraint certifications certifications_id_not_null NOT NULL id
constraint certifications certifications_pkey PRIMARY KEY (id)
constraint certifications certifications_updated_at_not_null NOT NULL updated_at
constraint certifications certifications_version_not_null NOT NULL version
constraint chapters chapters_course_id_fkey FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
constraint chapters chapters_course_id_not_null NOT NULL course_id
constraint chapters chapters_created_at_not_null NOT NULL created_at
constraint chapters chapters_creator_id_fkey FOREIGN KEY (creator_id) REFERENCES users(id) ON DELETE SET NULL
constraint chapters chapters_description_check CHECK ((char_length(description) <= 5000))
constraint chapters chapters_description_not_null NOT NULL description
constraint chapters chapters_id_course_key UNIQUE (id, course_id)
constraint chapters chapters_id_not_null NOT NULL id
constraint chapters chapters_name_check CHECK ((char_length(name) <= 500))
constraint chapters chapters_name_not_null NOT NULL name
constraint chapters chapters_pkey PRIMARY KEY (id)
constraint chapters chapters_position_check CHECK (("position" >= 1))
constraint chapters chapters_position_key UNIQUE (course_id, "position") DEFERRABLE INITIALLY DEFERRED
constraint chapters chapters_position_not_null NOT NULL "position"
constraint chapters chapters_thumbnail_upload_id_fkey FOREIGN KEY (thumbnail_upload_id) REFERENCES uploads(id) ON DELETE SET NULL
constraint chapters chapters_updated_at_not_null NOT NULL updated_at
constraint chapters chapters_version_not_null NOT NULL version
constraint code_run_cases code_run_cases_description_not_null NOT NULL description
constraint code_run_cases code_run_cases_id_not_null NOT NULL id
constraint code_run_cases code_run_cases_is_visible_not_null NOT NULL is_visible
constraint code_run_cases code_run_cases_passed_not_null NOT NULL passed
constraint code_run_cases code_run_cases_pkey PRIMARY KEY (id)
constraint code_run_cases code_run_cases_position_not_null NOT NULL "position"
constraint code_run_cases code_run_cases_run_id_fkey FOREIGN KEY (run_id) REFERENCES code_runs(id) ON DELETE CASCADE
constraint code_run_cases code_run_cases_run_id_not_null NOT NULL run_id
constraint code_run_cases code_run_cases_run_position_key UNIQUE (run_id, "position")
constraint code_run_cases code_run_cases_status_description_not_null NOT NULL status_description
constraint code_run_cases code_run_cases_test_id_not_null NOT NULL test_id
constraint code_run_cases code_run_cases_verdict_check CHECK ((verdict = ANY (ARRAY['accepted'::text, 'wrong_answer'::text, 'time_limit'::text, 'memory_limit'::text, 'output_limit'::text, 'compile_error'::text, 'runtime_error'::text, 'internal_error'::text])))
constraint code_run_cases code_run_cases_verdict_not_null NOT NULL verdict
constraint code_run_cases code_run_cases_weight_not_null NOT NULL weight
constraint code_runs code_runs_assessment_id_fkey FOREIGN KEY (assessment_id) REFERENCES assessments(id) ON DELETE CASCADE
constraint code_runs code_runs_assessment_id_not_null NOT NULL assessment_id
constraint code_runs code_runs_counts_check CHECK (((passed >= 0) AND (total >= 0) AND (passed <= total)))
constraint code_runs code_runs_created_at_not_null NOT NULL created_at
constraint code_runs code_runs_finished_check CHECK (((status = ANY (ARRAY['queued'::text, 'running'::text])) OR (finished_at IS NOT NULL)))
constraint code_runs code_runs_id_not_null NOT NULL id
constraint code_runs code_runs_item_id_fkey FOREIGN KEY (item_id, assessment_id) REFERENCES assessment_items(id, assessment_id) ON DELETE CASCADE
constraint code_runs code_runs_item_id_not_null NOT NULL item_id
constraint code_runs code_runs_language_id_not_null NOT NULL language_id
constraint code_runs code_runs_passed_not_null NOT NULL passed
constraint code_runs code_runs_pkey PRIMARY KEY (id)
constraint code_runs code_runs_purpose_check CHECK ((purpose = ANY (ARRAY['custom'::text, 'visible'::text, 'final'::text, 'reference_check'::text])))
constraint code_runs code_runs_purpose_not_null NOT NULL purpose
constraint code_runs code_runs_source_sha256_format CHECK ((source_sha256 ~ '^[0-9a-f]{64}$'::text))
constraint code_runs code_runs_source_sha256_not_null NOT NULL source_sha256
constraint code_runs code_runs_status_check CHECK ((status = ANY (ARRAY['queued'::text, 'running'::text, 'accepted'::text, 'wrong_answer'::text, 'compile_error'::text, 'runtime_error'::text, 'time_limit'::text, 'internal_error'::text, 'degraded'::text])))
constraint code_runs code_runs_status_not_null NOT NULL status
constraint code_runs code_runs_stdin_sha256_format CHECK ((stdin_sha256 ~ '^[0-9a-f]{64}$'::text))
constraint code_runs code_runs_submission_id_fkey FOREIGN KEY (submission_id, user_id) REFERENCES submissions(id, user_id) ON DELETE SET NULL (submission_id)
constraint code_runs code_runs_total_not_null NOT NULL total
constraint code_runs code_runs_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT
constraint code_runs code_runs_user_id_item_id_purpose_idempotency_key_key UNIQUE (user_id, item_id, purpose, idempotency_key)
constraint code_runs code_runs_user_id_not_null NOT NULL user_id
constraint collection_courses collection_courses_collection_id_fkey FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE CASCADE
constraint collection_courses collection_courses_collection_id_not_null NOT NULL collection_id
constraint collection_courses collection_courses_course_id_fkey FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
constraint collection_courses collection_courses_course_id_not_null NOT NULL course_id
constraint collection_courses collection_courses_created_at_not_null NOT NULL created_at
constraint collection_courses collection_courses_pkey PRIMARY KEY (collection_id, course_id)
constraint collection_courses collection_courses_position_check CHECK (("position" >= 1))
constraint collection_courses collection_courses_position_key UNIQUE (collection_id, "position") DEFERRABLE INITIALLY DEFERRED
constraint collection_courses collection_courses_position_not_null NOT NULL "position"
constraint collection_staff collection_staff_authorship_check CHECK ((authorship = ANY (ARRAY['creator'::text, 'contributor'::text, 'maintainer'::text, 'reporter'::text])))
constraint collection_staff collection_staff_authorship_not_null NOT NULL authorship
constraint collection_staff collection_staff_collection_id_fkey FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE CASCADE
constraint collection_staff collection_staff_collection_id_not_null NOT NULL collection_id
constraint collection_staff collection_staff_created_at_not_null NOT NULL created_at
constraint collection_staff collection_staff_pkey PRIMARY KEY (collection_id, user_id)
constraint collection_staff collection_staff_status_check CHECK ((status = ANY (ARRAY['active'::text, 'pending'::text, 'inactive'::text])))
constraint collection_staff collection_staff_status_not_null NOT NULL status
constraint collection_staff collection_staff_updated_at_not_null NOT NULL updated_at
constraint collection_staff collection_staff_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
constraint collection_staff collection_staff_user_id_not_null NOT NULL user_id
constraint collection_staff collection_staff_version_not_null NOT NULL version
constraint collections collections_cover_upload_id_fkey FOREIGN KEY (cover_upload_id) REFERENCES uploads(id) ON DELETE SET NULL
constraint collections collections_created_at_not_null NOT NULL created_at
constraint collections collections_creator_id_fkey FOREIGN KEY (creator_id) REFERENCES users(id) ON DELETE SET NULL
constraint collections collections_description_check CHECK ((char_length(description) <= 5000))
constraint collections collections_description_not_null NOT NULL description
constraint collections collections_id_not_null NOT NULL id
constraint collections collections_name_check CHECK ((char_length(name) <= 500))
constraint collections collections_name_not_null NOT NULL name
constraint collections collections_pkey PRIMARY KEY (id)
constraint collections collections_public_not_null NOT NULL public
constraint collections collections_updated_at_not_null NOT NULL updated_at
constraint collections collections_version_not_null NOT NULL version
constraint completions completions_activity_id_fkey FOREIGN KEY (activity_id) REFERENCES activities(id) ON DELETE CASCADE
constraint completions completions_activity_id_not_null NOT NULL activity_id
constraint completions completions_completed_at_not_null NOT NULL completed_at
constraint completions completions_pkey PRIMARY KEY (activity_id, user_id)
constraint completions completions_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT
constraint completions completions_user_id_not_null NOT NULL user_id
constraint concept_mastery concept_mastery_concept_id_fkey FOREIGN KEY (concept_id, course_id) REFERENCES course_concepts(id, course_id) ON DELETE CASCADE
constraint concept_mastery concept_mastery_concept_id_not_null NOT NULL concept_id
constraint concept_mastery concept_mastery_course_id_fkey FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
constraint concept_mastery concept_mastery_course_id_not_null NOT NULL course_id
constraint concept_mastery concept_mastery_evidence_count_check CHECK ((evidence_count >= 0))
constraint concept_mastery concept_mastery_evidence_count_not_null NOT NULL evidence_count
constraint concept_mastery concept_mastery_p_known_check CHECK (((p_known >= (0)::double precision) AND (p_known <= (1)::double precision)))
constraint concept_mastery concept_mastery_p_known_not_null NOT NULL p_known
constraint concept_mastery concept_mastery_pkey PRIMARY KEY (user_id, concept_id)
constraint concept_mastery concept_mastery_updated_at_not_null NOT NULL updated_at
constraint concept_mastery concept_mastery_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
constraint concept_mastery concept_mastery_user_id_not_null NOT NULL user_id
constraint concept_prerequisites concept_prerequisites_check CHECK ((concept_id <> requires_id))
constraint concept_prerequisites concept_prerequisites_concept_id_course_id_fkey FOREIGN KEY (concept_id, course_id) REFERENCES course_concepts(id, course_id) ON DELETE CASCADE
constraint concept_prerequisites concept_prerequisites_concept_id_not_null NOT NULL concept_id
constraint concept_prerequisites concept_prerequisites_course_id_not_null NOT NULL course_id
constraint concept_prerequisites concept_prerequisites_created_at_not_null NOT NULL created_at
constraint concept_prerequisites concept_prerequisites_origin_check CHECK ((origin = ANY (ARRAY['ai'::text, 'teacher'::text])))
constraint concept_prerequisites concept_prerequisites_origin_not_null NOT NULL origin
constraint concept_prerequisites concept_prerequisites_pkey PRIMARY KEY (concept_id, requires_id)
constraint concept_prerequisites concept_prerequisites_requires_id_course_id_fkey FOREIGN KEY (requires_id, course_id) REFERENCES course_concepts(id, course_id) ON DELETE CASCADE
constraint concept_prerequisites concept_prerequisites_requires_id_not_null NOT NULL requires_id
constraint concept_prerequisites concept_prerequisites_status_check CHECK ((status = ANY (ARRAY['suggested'::text, 'approved'::text, 'rejected'::text])))
constraint concept_prerequisites concept_prerequisites_status_not_null NOT NULL status
constraint concept_tags concept_tags_activity_id_fkey FOREIGN KEY (activity_id, course_id) REFERENCES activities(id, course_id) ON DELETE CASCADE
constraint concept_tags concept_tags_activity_id_not_null NOT NULL activity_id
constraint concept_tags concept_tags_concept_id_activity_id_item_id_key UNIQUE NULLS NOT DISTINCT (concept_id, activity_id, item_id)
constraint concept_tags concept_tags_concept_id_course_id_fkey FOREIGN KEY (concept_id, course_id) REFERENCES course_concepts(id, course_id) ON DELETE CASCADE
constraint concept_tags concept_tags_concept_id_not_null NOT NULL concept_id
constraint concept_tags concept_tags_course_id_not_null NOT NULL course_id
constraint concept_tags concept_tags_created_at_not_null NOT NULL created_at
constraint concept_tags concept_tags_decided_by_fkey FOREIGN KEY (decided_by) REFERENCES users(id) ON DELETE SET NULL
constraint concept_tags concept_tags_id_not_null NOT NULL id
constraint concept_tags concept_tags_item_id_fkey FOREIGN KEY (item_id) REFERENCES assessment_items(id) ON DELETE CASCADE
constraint concept_tags concept_tags_origin_check CHECK ((origin = ANY (ARRAY['ai'::text, 'teacher'::text])))
constraint concept_tags concept_tags_origin_not_null NOT NULL origin
constraint concept_tags concept_tags_pkey PRIMARY KEY (id)
constraint concept_tags concept_tags_rationale_check CHECK ((char_length(rationale) <= 1000))
constraint concept_tags concept_tags_rationale_not_null NOT NULL rationale
constraint concept_tags concept_tags_run_id_fkey FOREIGN KEY (run_id) REFERENCES ai_runs(id) ON DELETE SET NULL
constraint concept_tags concept_tags_status_check CHECK ((status = ANY (ARRAY['suggested'::text, 'approved'::text, 'rejected'::text])))
constraint concept_tags concept_tags_status_not_null NOT NULL status
constraint concept_tags concept_tags_updated_at_not_null NOT NULL updated_at
constraint concept_tags concept_tags_weight_check CHECK (((weight > (0)::double precision) AND (weight <= (1)::double precision)))
constraint concept_tags concept_tags_weight_not_null NOT NULL weight
constraint content_chunks content_chunks_activity_id_fkey FOREIGN KEY (activity_id, course_id) REFERENCES activities(id, course_id) ON DELETE CASCADE
constraint content_chunks content_chunks_anchor_check CHECK ((jsonb_typeof(anchor) = 'object'::text))
constraint content_chunks content_chunks_anchor_not_null NOT NULL anchor
constraint content_chunks content_chunks_audience_check CHECK ((audience = ANY (ARRAY['learner'::text, 'staff'::text])))
constraint content_chunks content_chunks_audience_not_null NOT NULL audience
constraint content_chunks content_chunks_body_check CHECK (((char_length(body) >= 1) AND (char_length(body) <= 4000)))
constraint content_chunks content_chunks_body_not_null NOT NULL body
constraint content_chunks content_chunks_check CHECK (((embedding IS NULL) = (embedding_model IS NULL)))
constraint content_chunks content_chunks_course_id_fkey FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
constraint content_chunks content_chunks_course_id_not_null NOT NULL course_id
constraint content_chunks content_chunks_created_at_not_null NOT NULL created_at
constraint content_chunks content_chunks_id_not_null NOT NULL id
constraint content_chunks content_chunks_label_check CHECK (((char_length(label) >= 1) AND (char_length(label) <= 500)))
constraint content_chunks content_chunks_label_not_null NOT NULL label
constraint content_chunks content_chunks_ordinal_check CHECK ((ordinal >= 0))
constraint content_chunks content_chunks_ordinal_not_null NOT NULL ordinal
constraint content_chunks content_chunks_pkey PRIMARY KEY (id)
constraint content_chunks content_chunks_source_id_not_null NOT NULL source_id
constraint content_chunks content_chunks_source_type_check CHECK ((source_type = ANY (ARRAY['lesson'::text, 'activity'::text, 'assignment'::text, 'item'::text, 'course'::text, 'document'::text, 'transcript'::text])))
constraint content_chunks content_chunks_source_type_not_null NOT NULL source_type
constraint content_chunks content_chunks_source_type_source_id_ordinal_key UNIQUE (source_type, source_id, ordinal)
constraint content_chunks content_chunks_token_estimate_check CHECK ((token_estimate >= 0))
constraint content_chunks content_chunks_token_estimate_not_null NOT NULL token_estimate
constraint content_index_state content_index_state_activity_id_fkey FOREIGN KEY (activity_id, course_id) REFERENCES activities(id, course_id) ON DELETE CASCADE
constraint content_index_state content_index_state_chunk_count_check CHECK ((chunk_count >= 0))
constraint content_index_state content_index_state_chunk_count_not_null NOT NULL chunk_count
constraint content_index_state content_index_state_course_id_fkey FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
constraint content_index_state content_index_state_course_id_not_null NOT NULL course_id
constraint content_index_state content_index_state_indexed_at_not_null NOT NULL indexed_at
constraint content_index_state content_index_state_pkey PRIMARY KEY (source_type, source_id)
constraint content_index_state content_index_state_source_id_not_null NOT NULL source_id
constraint content_index_state content_index_state_source_type_check CHECK ((source_type = ANY (ARRAY['lesson'::text, 'activity'::text, 'assignment'::text, 'item'::text, 'course'::text, 'document'::text, 'transcript'::text])))
constraint content_index_state content_index_state_source_type_not_null NOT NULL source_type
constraint content_index_state content_index_state_source_version_not_null NOT NULL source_version
constraint course_concepts course_concepts_course_id_fkey FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
constraint course_concepts course_concepts_course_id_not_null NOT NULL course_id
constraint course_concepts course_concepts_course_id_slug_key UNIQUE (course_id, slug)
constraint course_concepts course_concepts_created_at_not_null NOT NULL created_at
constraint course_concepts course_concepts_decided_by_fkey FOREIGN KEY (decided_by) REFERENCES users(id) ON DELETE SET NULL
constraint course_concepts course_concepts_description_check CHECK ((char_length(description) <= 2000))
constraint course_concepts course_concepts_description_not_null NOT NULL description
constraint course_concepts course_concepts_id_course_id_key UNIQUE (id, course_id)
constraint course_concepts course_concepts_id_not_null NOT NULL id
constraint course_concepts course_concepts_name_check CHECK (((char_length(name) >= 1) AND (char_length(name) <= 200)))
constraint course_concepts course_concepts_name_not_null NOT NULL name
constraint course_concepts course_concepts_origin_check CHECK ((origin = ANY (ARRAY['ai'::text, 'teacher'::text])))
constraint course_concepts course_concepts_origin_not_null NOT NULL origin
constraint course_concepts course_concepts_pkey PRIMARY KEY (id)
constraint course_concepts course_concepts_position_check CHECK (("position" >= 0))
constraint course_concepts course_concepts_position_not_null NOT NULL "position"
constraint course_concepts course_concepts_run_id_fkey FOREIGN KEY (run_id) REFERENCES ai_runs(id) ON DELETE SET NULL
constraint course_concepts course_concepts_slug_check CHECK ((slug ~ '^[a-z0-9][a-z0-9-]{0,79}$'::text))
constraint course_concepts course_concepts_slug_not_null NOT NULL slug
constraint course_concepts course_concepts_status_check CHECK ((status = ANY (ARRAY['suggested'::text, 'approved'::text, 'rejected'::text])))
constraint course_concepts course_concepts_status_not_null NOT NULL status
constraint course_concepts course_concepts_updated_at_not_null NOT NULL updated_at
constraint course_discussions course_discussions_content_check CHECK ((char_length(content) <= 20000))
constraint course_discussions course_discussions_content_not_null NOT NULL content
constraint course_discussions course_discussions_course_id_fkey FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
constraint course_discussions course_discussions_course_id_not_null NOT NULL course_id
constraint course_discussions course_discussions_created_at_not_null NOT NULL created_at
constraint course_discussions course_discussions_dislikes_count_not_null NOT NULL dislikes_count
constraint course_discussions course_discussions_id_course_key UNIQUE (id, course_id)
constraint course_discussions course_discussions_id_not_null NOT NULL id
constraint course_discussions course_discussions_kind_check CHECK ((kind = ANY (ARRAY['post'::text, 'reply'::text])))
constraint course_discussions course_discussions_kind_not_null NOT NULL kind
constraint course_discussions course_discussions_likes_count_not_null NOT NULL likes_count
constraint course_discussions course_discussions_parent_id_fkey FOREIGN KEY (parent_id, course_id) REFERENCES course_discussions(id, course_id) ON UPDATE RESTRICT ON DELETE CASCADE
constraint course_discussions course_discussions_pkey PRIMARY KEY (id)
constraint course_discussions course_discussions_replies_count_not_null NOT NULL replies_count
constraint course_discussions course_discussions_reply_parent_check CHECK (((kind = 'reply'::text) = (parent_id IS NOT NULL)))
constraint course_discussions course_discussions_status_check CHECK ((status = ANY (ARRAY['active'::text, 'hidden'::text, 'deleted'::text])))
constraint course_discussions course_discussions_status_not_null NOT NULL status
constraint course_discussions course_discussions_updated_at_not_null NOT NULL updated_at
constraint course_discussions course_discussions_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
constraint course_discussions course_discussions_version_not_null NOT NULL version
constraint course_progress course_progress_certificate_eligible_not_null NOT NULL certificate_eligible
constraint course_progress course_progress_completed_at_check CHECK (((completed_at IS NULL) OR ((total_required_count > 0) AND (completed_required_count >= total_required_count))))
constraint course_progress course_progress_completed_required_count_not_null NOT NULL completed_required_count
constraint course_progress course_progress_counts_check CHECK (((completed_required_count >= 0) AND (completed_required_count <= total_required_count)))
constraint course_progress course_progress_course_id_fkey FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
constraint course_progress course_progress_course_id_not_null NOT NULL course_id
constraint course_progress course_progress_created_at_not_null NOT NULL created_at
constraint course_progress course_progress_missing_required_count_not_null NOT NULL missing_required_count
constraint course_progress course_progress_needs_grading_count_not_null NOT NULL needs_grading_count
constraint course_progress course_progress_pkey PRIMARY KEY (course_id, user_id)
constraint course_progress course_progress_progress_pct_not_null NOT NULL progress_pct
constraint course_progress course_progress_total_required_count_not_null NOT NULL total_required_count
constraint course_progress course_progress_updated_at_not_null NOT NULL updated_at
constraint course_progress course_progress_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT
constraint course_progress course_progress_user_id_not_null NOT NULL user_id
constraint course_staff course_staff_authorship_check CHECK ((authorship = ANY (ARRAY['creator'::text, 'contributor'::text, 'maintainer'::text, 'reporter'::text])))
constraint course_staff course_staff_authorship_not_null NOT NULL authorship
constraint course_staff course_staff_course_id_fkey FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
constraint course_staff course_staff_course_id_not_null NOT NULL course_id
constraint course_staff course_staff_created_at_not_null NOT NULL created_at
constraint course_staff course_staff_pkey PRIMARY KEY (course_id, user_id)
constraint course_staff course_staff_status_check CHECK ((status = ANY (ARRAY['active'::text, 'pending'::text, 'inactive'::text])))
constraint course_staff course_staff_status_not_null NOT NULL status
constraint course_staff course_staff_updated_at_not_null NOT NULL updated_at
constraint course_staff course_staff_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
constraint course_staff course_staff_user_id_not_null NOT NULL user_id
constraint course_staff course_staff_version_not_null NOT NULL version
constraint course_update_activities course_update_activities_activity_id_fkey FOREIGN KEY (activity_id) REFERENCES activities(id) ON DELETE CASCADE
constraint course_update_activities course_update_activities_activity_id_not_null NOT NULL activity_id
constraint course_update_activities course_update_activities_pkey PRIMARY KEY (update_id, activity_id)
constraint course_update_activities course_update_activities_position_check CHECK (("position" >= 1))
constraint course_update_activities course_update_activities_position_not_null NOT NULL "position"
constraint course_update_activities course_update_activities_update_id_fkey FOREIGN KEY (update_id) REFERENCES course_updates(id) ON DELETE CASCADE
constraint course_update_activities course_update_activities_update_id_not_null NOT NULL update_id
constraint course_updates course_updates_author_id_fkey FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE SET NULL
constraint course_updates course_updates_content_check CHECK ((char_length(content) <= 50000))
constraint course_updates course_updates_content_not_null NOT NULL content
constraint course_updates course_updates_course_id_fkey FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
constraint course_updates course_updates_course_id_not_null NOT NULL course_id
constraint course_updates course_updates_created_at_not_null NOT NULL created_at
constraint course_updates course_updates_id_not_null NOT NULL id
constraint course_updates course_updates_pkey PRIMARY KEY (id)
constraint course_updates course_updates_title_check CHECK ((char_length(title) <= 500))
constraint course_updates course_updates_title_not_null NOT NULL title
constraint course_updates course_updates_updated_at_not_null NOT NULL updated_at
constraint course_updates course_updates_version_not_null NOT NULL version
constraint courses courses_about_check CHECK ((char_length(about) <= 20000))
constraint courses courses_about_not_null NOT NULL about
constraint courses courses_archived_by_fkey FOREIGN KEY (archived_by) REFERENCES users(id) ON DELETE SET NULL
constraint courses courses_assessments_require_enrollment_not_null NOT NULL assessments_require_enrollment
constraint courses courses_created_at_not_null NOT NULL created_at
constraint courses courses_creator_id_fkey FOREIGN KEY (creator_id) REFERENCES users(id) ON DELETE SET NULL
constraint courses courses_deleted_by_check CHECK (((deleted_by IS NULL) OR (deleted_at IS NOT NULL)))
constraint courses courses_deleted_by_fkey FOREIGN KEY (deleted_by) REFERENCES users(id) ON DELETE SET NULL
constraint courses courses_deleted_is_archived CHECK (((deleted_at IS NULL) OR (archived_at IS NOT NULL)))
constraint courses courses_description_check CHECK ((char_length(description) <= 5000))
constraint courses courses_description_not_null NOT NULL description
constraint courses courses_id_not_null NOT NULL id
constraint courses courses_language_check CHECK ((language = ANY (ARRAY['ru'::text, 'kk'::text, 'en'::text])))
constraint courses courses_language_not_null NOT NULL language
constraint courses courses_learnings_check CHECK (course_learnings_ok(learnings))
constraint courses courses_learnings_not_null NOT NULL learnings
constraint courses courses_name_check CHECK ((char_length(name) <= 500))
constraint courses courses_name_not_null NOT NULL name
constraint courses courses_open_to_contributors_not_null NOT NULL open_to_contributors
constraint courses courses_pkey PRIMARY KEY (id)
constraint courses courses_public_not_null NOT NULL public
constraint courses courses_tags_check CHECK (text_list_ok(tags, 20, 64))
constraint courses courses_tags_not_null NOT NULL tags
constraint courses courses_thumbnail_image_upload_id_fkey FOREIGN KEY (thumbnail_image_upload_id) REFERENCES uploads(id) ON DELETE SET NULL
constraint courses courses_thumbnail_type_check CHECK ((thumbnail_type = ANY (ARRAY['image'::text, 'video'::text, 'both'::text])))
constraint courses courses_thumbnail_type_not_null NOT NULL thumbnail_type
constraint courses courses_thumbnail_video_upload_id_fkey FOREIGN KEY (thumbnail_video_upload_id) REFERENCES uploads(id) ON DELETE SET NULL
constraint courses courses_updated_at_not_null NOT NULL updated_at
constraint courses courses_version_not_null NOT NULL version
constraint daily_assessment_metrics daily_assessment_metrics_activity_id_fkey FOREIGN KEY (activity_id) REFERENCES activities(id) ON DELETE SET NULL
constraint daily_assessment_metrics daily_assessment_metrics_assessment_id_fkey FOREIGN KEY (assessment_id) REFERENCES assessments(id) ON DELETE CASCADE
constraint daily_assessment_metrics daily_assessment_metrics_assessment_id_not_null NOT NULL assessment_id
constraint daily_assessment_metrics daily_assessment_metrics_assessment_kind_check CHECK ((assessment_kind = ANY (ARRAY['quiz'::text, 'exam'::text, 'code_challenge'::text])))
constraint daily_assessment_metrics daily_assessment_metrics_assessment_kind_not_null NOT NULL assessment_kind
constraint daily_assessment_metrics daily_assessment_metrics_course_id_fkey FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
constraint daily_assessment_metrics daily_assessment_metrics_course_id_not_null NOT NULL course_id
constraint daily_assessment_metrics daily_assessment_metrics_eligible_learners_not_null NOT NULL eligible_learners
constraint daily_assessment_metrics daily_assessment_metrics_generated_at_not_null NOT NULL generated_at
constraint daily_assessment_metrics daily_assessment_metrics_metric_date_not_null NOT NULL metric_date
constraint daily_assessment_metrics daily_assessment_metrics_pkey PRIMARY KEY (metric_date, assessment_id)
constraint daily_assessment_metrics daily_assessment_metrics_submitted_learners_not_null NOT NULL submitted_learners
constraint daily_course_engagement daily_course_engagement_activity_id_fkey FOREIGN KEY (activity_id) REFERENCES activities(id) ON DELETE CASCADE
constraint daily_course_engagement daily_course_engagement_activity_id_not_null NOT NULL activity_id
constraint daily_course_engagement daily_course_engagement_chapter_id_fkey FOREIGN KEY (chapter_id) REFERENCES chapters(id) ON DELETE SET NULL
constraint daily_course_engagement daily_course_engagement_completed_learners_not_null NOT NULL completed_learners
constraint daily_course_engagement daily_course_engagement_course_id_fkey FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
constraint daily_course_engagement daily_course_engagement_course_id_not_null NOT NULL course_id
constraint daily_course_engagement daily_course_engagement_generated_at_not_null NOT NULL generated_at
constraint daily_course_engagement daily_course_engagement_metric_date_not_null NOT NULL metric_date
constraint daily_course_engagement daily_course_engagement_pkey PRIMARY KEY (metric_date, activity_id)
constraint daily_course_engagement daily_course_engagement_started_learners_not_null NOT NULL started_learners
constraint daily_course_metrics daily_course_metrics_active_learners_28d_not_null NOT NULL active_learners_28d
constraint daily_course_metrics daily_course_metrics_active_learners_7d_not_null NOT NULL active_learners_7d
constraint daily_course_metrics daily_course_metrics_at_risk_learners_not_null NOT NULL at_risk_learners
constraint daily_course_metrics daily_course_metrics_certificates_issued_not_null NOT NULL certificates_issued
constraint daily_course_metrics daily_course_metrics_course_id_fkey FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
constraint daily_course_metrics daily_course_metrics_course_id_not_null NOT NULL course_id
constraint daily_course_metrics daily_course_metrics_enrolled_learners_not_null NOT NULL enrolled_learners
constraint daily_course_metrics daily_course_metrics_generated_at_not_null NOT NULL generated_at
constraint daily_course_metrics daily_course_metrics_metric_date_not_null NOT NULL metric_date
constraint daily_course_metrics daily_course_metrics_pkey PRIMARY KEY (metric_date, course_id)
constraint daily_course_metrics daily_course_metrics_teacher_user_id_fkey FOREIGN KEY (teacher_user_id) REFERENCES users(id) ON DELETE SET NULL
constraint daily_course_metrics daily_course_metrics_ungraded_submissions_not_null NOT NULL ungraded_submissions
constraint daily_platform_metrics daily_platform_metrics_active_learners_28d_not_null NOT NULL active_learners_28d
constraint daily_platform_metrics daily_platform_metrics_active_learners_7d_not_null NOT NULL active_learners_7d
constraint daily_platform_metrics daily_platform_metrics_active_learners_90d_not_null NOT NULL active_learners_90d
constraint daily_platform_metrics daily_platform_metrics_at_risk_learners_not_null NOT NULL at_risk_learners
constraint daily_platform_metrics daily_platform_metrics_certificates_issued_28d_not_null NOT NULL certificates_issued_28d
constraint daily_platform_metrics daily_platform_metrics_courses_with_negative_engagemen_not_null NOT NULL courses_with_negative_engagement
constraint daily_platform_metrics daily_platform_metrics_generated_at_not_null NOT NULL generated_at
constraint daily_platform_metrics daily_platform_metrics_managed_course_count_not_null NOT NULL managed_course_count
constraint daily_platform_metrics daily_platform_metrics_metric_date_not_null NOT NULL metric_date
constraint daily_platform_metrics daily_platform_metrics_pkey PRIMARY KEY (metric_date)
constraint daily_platform_metrics daily_platform_metrics_returning_learners_28d_not_null NOT NULL returning_learners_28d
constraint daily_platform_metrics daily_platform_metrics_ungraded_submissions_not_null NOT NULL ungraded_submissions
constraint daily_teacher_metrics daily_teacher_metrics_active_learners_28d_not_null NOT NULL active_learners_28d
constraint daily_teacher_metrics daily_teacher_metrics_active_learners_7d_not_null NOT NULL active_learners_7d
constraint daily_teacher_metrics daily_teacher_metrics_active_learners_90d_not_null NOT NULL active_learners_90d
constraint daily_teacher_metrics daily_teacher_metrics_at_risk_learners_not_null NOT NULL at_risk_learners
constraint daily_teacher_metrics daily_teacher_metrics_certificates_issued_28d_not_null NOT NULL certificates_issued_28d
constraint daily_teacher_metrics daily_teacher_metrics_courses_with_negative_engagement_not_null NOT NULL courses_with_negative_engagement
constraint daily_teacher_metrics daily_teacher_metrics_generated_at_not_null NOT NULL generated_at
constraint daily_teacher_metrics daily_teacher_metrics_id_not_null NOT NULL id
constraint daily_teacher_metrics daily_teacher_metrics_managed_course_count_not_null NOT NULL managed_course_count
constraint daily_teacher_metrics daily_teacher_metrics_metric_date_not_null NOT NULL metric_date
constraint daily_teacher_metrics daily_teacher_metrics_metric_date_teacher_user_id_key UNIQUE NULLS NOT DISTINCT (metric_date, teacher_user_id)
constraint daily_teacher_metrics daily_teacher_metrics_pkey PRIMARY KEY (id)
constraint daily_teacher_metrics daily_teacher_metrics_returning_learners_28d_not_null NOT NULL returning_learners_28d
constraint daily_teacher_metrics daily_teacher_metrics_teacher_user_id_fkey FOREIGN KEY (teacher_user_id) REFERENCES users(id) ON DELETE CASCADE
constraint daily_teacher_metrics daily_teacher_metrics_ungraded_submissions_not_null NOT NULL ungraded_submissions
constraint daily_user_course_progress daily_user_course_progress_completed_steps_not_null NOT NULL completed_steps
constraint daily_user_course_progress daily_user_course_progress_course_id_fkey FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
constraint daily_user_course_progress daily_user_course_progress_course_id_not_null NOT NULL course_id
constraint daily_user_course_progress daily_user_course_progress_generated_at_not_null NOT NULL generated_at
constraint daily_user_course_progress daily_user_course_progress_has_certificate_not_null NOT NULL has_certificate
constraint daily_user_course_progress daily_user_course_progress_is_completed_not_null NOT NULL is_completed
constraint daily_user_course_progress daily_user_course_progress_metric_date_not_null NOT NULL metric_date
constraint daily_user_course_progress daily_user_course_progress_pkey PRIMARY KEY (metric_date, user_id, course_id)
constraint daily_user_course_progress daily_user_course_progress_progress_pct_not_null NOT NULL progress_pct
constraint daily_user_course_progress daily_user_course_progress_total_steps_not_null NOT NULL total_steps
constraint daily_user_course_progress daily_user_course_progress_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
constraint daily_user_course_progress daily_user_course_progress_user_id_not_null NOT NULL user_id
constraint discussion_reactions discussion_reactions_created_at_not_null NOT NULL created_at
constraint discussion_reactions discussion_reactions_discussion_id_fkey FOREIGN KEY (discussion_id) REFERENCES course_discussions(id) ON DELETE CASCADE
constraint discussion_reactions discussion_reactions_discussion_id_not_null NOT NULL discussion_id
constraint discussion_reactions discussion_reactions_pkey PRIMARY KEY (discussion_id, user_id)
constraint discussion_reactions discussion_reactions_reaction_check CHECK ((reaction = ANY (ARRAY['like'::text, 'dislike'::text])))
constraint discussion_reactions discussion_reactions_reaction_not_null NOT NULL reaction
constraint discussion_reactions discussion_reactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
constraint discussion_reactions discussion_reactions_user_id_not_null NOT NULL user_id
constraint enrolment_events enrolment_events_completions_array CHECK ((jsonb_typeof(completions) = 'array'::text))
constraint enrolment_events enrolment_events_course_id_not_null NOT NULL course_id
constraint enrolment_events enrolment_events_created_at_not_null NOT NULL created_at
constraint enrolment_events enrolment_events_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
constraint enrolment_events enrolment_events_event_check CHECK ((event = ANY (ARRAY['joined'::text, 'left'::text])))
constraint enrolment_events enrolment_events_event_not_null NOT NULL event
constraint enrolment_events enrolment_events_id_not_null NOT NULL id
constraint enrolment_events enrolment_events_pkey PRIMARY KEY (id)
constraint enrolment_events enrolment_events_source_check CHECK ((source = ANY (ARRAY['self'::text, 'staff'::text, 'backfill'::text])))
constraint enrolment_events enrolment_events_source_not_null NOT NULL source
constraint enrolment_events enrolment_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
constraint enrolment_events enrolment_events_user_id_not_null NOT NULL user_id
constraint enrolments enrolments_course_id_fkey FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
constraint enrolments enrolments_course_id_not_null NOT NULL course_id
constraint enrolments enrolments_enrolled_at_not_null NOT NULL enrolled_at
constraint enrolments enrolments_pkey PRIMARY KEY (course_id, user_id)
constraint enrolments enrolments_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT
constraint enrolments enrolments_user_id_not_null NOT NULL user_id
constraint feature_activations feature_activations_activated_at_not_null NOT NULL activated_at
constraint feature_activations feature_activations_feature_check CHECK ((feature = 'deadline_auto_submit'::text))
constraint feature_activations feature_activations_feature_not_null NOT NULL feature
constraint feature_activations feature_activations_pkey PRIMARY KEY (feature)
constraint file_grading_entries file_grading_entries_attempt_id_fkey FOREIGN KEY (attempt_id) REFERENCES file_submission_attempts(id) ON DELETE CASCADE
constraint file_grading_entries file_grading_entries_attempt_id_not_null NOT NULL attempt_id
constraint file_grading_entries file_grading_entries_created_at_not_null NOT NULL created_at
constraint file_grading_entries file_grading_entries_feedback_not_null NOT NULL feedback
constraint file_grading_entries file_grading_entries_graded_by_fkey FOREIGN KEY (graded_by) REFERENCES users(id) ON DELETE SET NULL
constraint file_grading_entries file_grading_entries_id_not_null NOT NULL id
constraint file_grading_entries file_grading_entries_penalty_pct_not_null NOT NULL penalty_pct
constraint file_grading_entries file_grading_entries_pkey PRIMARY KEY (id)
constraint file_grading_entries file_grading_entries_revision_not_null NOT NULL revision
constraint file_grading_entries file_grading_entries_status_check CHECK ((status = ANY (ARRAY['graded'::text, 'released'::text, 'returned'::text])))
constraint file_grading_entries file_grading_entries_status_not_null NOT NULL status
constraint file_submission_attempts file_submission_attempts_attempt_number_check CHECK ((attempt_number >= 1))
constraint file_submission_attempts file_submission_attempts_attempt_number_not_null NOT NULL attempt_number
constraint file_submission_attempts file_submission_attempts_course_id_fkey FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE RESTRICT
constraint file_submission_attempts file_submission_attempts_course_id_not_null NOT NULL course_id
constraint file_submission_attempts file_submission_attempts_created_at_not_null NOT NULL created_at
constraint file_submission_attempts file_submission_attempts_feedback_not_null NOT NULL feedback
constraint file_submission_attempts file_submission_attempts_file_submission_id_fkey FOREIGN KEY (file_submission_id, course_id) REFERENCES file_submissions(id, course_id) ON UPDATE RESTRICT ON DELETE RESTRICT
constraint file_submission_attempts file_submission_attempts_file_submission_id_not_null NOT NULL file_submission_id
constraint file_submission_attempts file_submission_attempts_graded_by_fkey FOREIGN KEY (graded_by) REFERENCES users(id) ON DELETE SET NULL
constraint file_submission_attempts file_submission_attempts_id_not_null NOT NULL id
constraint file_submission_attempts file_submission_attempts_id_user_key UNIQUE (id, user_id)
constraint file_submission_attempts file_submission_attempts_is_late_not_null NOT NULL is_late
constraint file_submission_attempts file_submission_attempts_late_penalty_pct_not_null NOT NULL late_penalty_pct
constraint file_submission_attempts file_submission_attempts_pkey PRIMARY KEY (id)
constraint file_submission_attempts file_submission_attempts_preview_not_null NOT NULL preview
constraint file_submission_attempts file_submission_attempts_rubric_scores_not_null NOT NULL rubric_scores
constraint file_submission_attempts file_submission_attempts_rubric_scores_object CHECK ((jsonb_typeof(rubric_scores) = 'object'::text))
constraint file_submission_attempts file_submission_attempts_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'submitted'::text, 'graded'::text, 'released'::text, 'returned'::text])))
constraint file_submission_attempts file_submission_attempts_status_not_null NOT NULL status
constraint file_submission_attempts file_submission_attempts_submitted_at_check CHECK (((status = 'draft'::text) OR (submitted_at IS NOT NULL)))
constraint file_submission_attempts file_submission_attempts_updated_at_not_null NOT NULL updated_at
constraint file_submission_attempts file_submission_attempts_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT
constraint file_submission_attempts file_submission_attempts_user_id_not_null NOT NULL user_id
constraint file_submission_attempts file_submission_attempts_version_not_null NOT NULL version
constraint file_submission_files file_submission_files_attempt_id_fkey FOREIGN KEY (attempt_id) REFERENCES file_submission_attempts(id) ON DELETE CASCADE
constraint file_submission_files file_submission_files_attempt_id_not_null NOT NULL attempt_id
constraint file_submission_files file_submission_files_attempt_id_upload_id_key UNIQUE (attempt_id, upload_id)
constraint file_submission_files file_submission_files_content_type_mime CHECK ((content_type ~ '^[A-Za-z0-9.+-]+/[A-Za-z0-9.+-]+'::text))
constraint file_submission_files file_submission_files_content_type_not_null NOT NULL content_type
constraint file_submission_files file_submission_files_created_at_not_null NOT NULL created_at
constraint file_submission_files file_submission_files_display_name_not_null NOT NULL display_name
constraint file_submission_files file_submission_files_id_not_null NOT NULL id
constraint file_submission_files file_submission_files_pkey PRIMARY KEY (id)
constraint file_submission_files file_submission_files_position_not_null NOT NULL "position"
constraint file_submission_files file_submission_files_scan_status_check CHECK ((scan_status = ANY (ARRAY['pending'::text, 'clean'::text, 'flagged'::text, 'error'::text])))
constraint file_submission_files file_submission_files_scan_status_not_null NOT NULL scan_status
constraint file_submission_files file_submission_files_storage_key_not_null NOT NULL storage_key
constraint file_submission_files file_submission_files_upload_id_fkey FOREIGN KEY (upload_id) REFERENCES uploads(id) ON DELETE RESTRICT
constraint file_submission_files file_submission_files_upload_id_not_null NOT NULL upload_id
constraint file_submission_overrides file_submission_overrides_created_at_not_null NOT NULL created_at
constraint file_submission_overrides file_submission_overrides_due_at_not_null NOT NULL due_at
constraint file_submission_overrides file_submission_overrides_file_submission_id_fkey FOREIGN KEY (file_submission_id) REFERENCES file_submissions(id) ON DELETE CASCADE
constraint file_submission_overrides file_submission_overrides_file_submission_id_not_null NOT NULL file_submission_id
constraint file_submission_overrides file_submission_overrides_granted_by_fkey FOREIGN KEY (granted_by) REFERENCES users(id) ON DELETE SET NULL
constraint file_submission_overrides file_submission_overrides_pkey PRIMARY KEY (file_submission_id, user_id)
constraint file_submission_overrides file_submission_overrides_reason_check CHECK ((char_length(reason) <= 1000))
constraint file_submission_overrides file_submission_overrides_reason_not_null NOT NULL reason
constraint file_submission_overrides file_submission_overrides_updated_at_not_null NOT NULL updated_at
constraint file_submission_overrides file_submission_overrides_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
constraint file_submission_overrides file_submission_overrides_user_id_not_null NOT NULL user_id
constraint file_submissions file_submissions_activity_id_fkey FOREIGN KEY (activity_id, course_id) REFERENCES activities(id, course_id) ON UPDATE RESTRICT ON DELETE CASCADE
constraint file_submissions file_submissions_activity_id_key UNIQUE (activity_id)
constraint file_submissions file_submissions_activity_id_not_null NOT NULL activity_id
constraint file_submissions file_submissions_allow_late_not_null NOT NULL allow_late
constraint file_submissions file_submissions_allowed_mime_types_not_null NOT NULL allowed_mime_types
constraint file_submissions file_submissions_course_id_fkey FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
constraint file_submissions file_submissions_course_id_not_null NOT NULL course_id
constraint file_submissions file_submissions_created_at_not_null NOT NULL created_at
constraint file_submissions file_submissions_creator_id_fkey FOREIGN KEY (creator_id) REFERENCES users(id) ON DELETE SET NULL
constraint file_submissions file_submissions_grade_release_mode_check CHECK ((grade_release_mode = ANY (ARRAY['immediate'::text, 'batch'::text])))
constraint file_submissions file_submissions_grade_release_mode_not_null NOT NULL grade_release_mode
constraint file_submissions file_submissions_id_course_key UNIQUE (id, course_id)
constraint file_submissions file_submissions_id_not_null NOT NULL id
constraint file_submissions file_submissions_instructions_check CHECK ((char_length(instructions) <= 50000))
constraint file_submissions file_submissions_instructions_not_null NOT NULL instructions
constraint file_submissions file_submissions_late_penalty_max_days_check CHECK ((late_penalty_max_days >= 1))
constraint file_submissions file_submissions_late_policy_kind_check CHECK ((late_policy_kind = ANY (ARRAY['none'::text, 'penalty'::text, 'cutoff'::text])))
constraint file_submissions file_submissions_late_policy_kind_not_null NOT NULL late_policy_kind
constraint file_submissions file_submissions_late_policy_shape CHECK ((((late_policy_kind = 'none'::text) AND (late_penalty_percent_per_day IS NULL) AND (late_penalty_max_days IS NULL) AND (late_cutoff_at IS NULL)) OR ((late_policy_kind = 'penalty'::text) AND (late_penalty_percent_per_day IS NOT NULL) AND (late_penalty_max_days IS NOT NULL) AND (late_cutoff_at IS NULL)) OR ((late_policy_kind = 'cutoff'::text) AND (late_cutoff_at IS NOT NULL) AND (late_penalty_percent_per_day IS NULL) AND (late_penalty_max_days IS NULL))))
constraint file_submissions file_submissions_lifecycle_check CHECK ((lifecycle = ANY (ARRAY['draft'::text, 'published'::text, 'archived'::text])))
constraint file_submissions file_submissions_lifecycle_not_null NOT NULL lifecycle
constraint file_submissions file_submissions_max_attempts_check CHECK (((max_attempts >= 1) AND (max_attempts <= 50)))
constraint file_submissions file_submissions_max_file_size_mb_check CHECK (((max_file_size_mb >= 1) AND (max_file_size_mb <= 500)))
constraint file_submissions file_submissions_max_files_check CHECK (((max_files >= 1) AND (max_files <= 25)))
constraint file_submissions file_submissions_max_files_not_null NOT NULL max_files
constraint file_submissions file_submissions_pkey PRIMARY KEY (id)
constraint file_submissions file_submissions_rubric_not_null NOT NULL rubric
constraint file_submissions file_submissions_rubric_object CHECK ((jsonb_typeof(rubric) = 'object'::text))
constraint file_submissions file_submissions_settings_not_null NOT NULL settings
constraint file_submissions file_submissions_settings_object CHECK ((jsonb_typeof(settings) = 'object'::text))
constraint file_submissions file_submissions_updated_at_not_null NOT NULL updated_at
constraint file_submissions file_submissions_version_not_null NOT NULL version
constraint gamification_completions gamification_completions_created_at_not_null NOT NULL created_at
constraint gamification_completions gamification_completions_kind_check CHECK ((kind = ANY (ARRAY['activity'::text, 'course'::text])))
constraint gamification_completions gamification_completions_kind_not_null NOT NULL kind
constraint gamification_completions gamification_completions_pkey PRIMARY KEY (user_id, kind, source_id)
constraint gamification_completions gamification_completions_source_id_not_null NOT NULL source_id
constraint gamification_completions gamification_completions_source_id_shape CHECK ((source_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'::text))
constraint gamification_completions gamification_completions_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT
constraint gamification_completions gamification_completions_user_id_not_null NOT NULL user_id
constraint gamification_config gamification_config_id_check CHECK ((id = 1))
constraint gamification_config gamification_config_id_not_null NOT NULL id
constraint gamification_config gamification_config_pkey PRIMARY KEY (id)
constraint gamification_config gamification_config_rewards_not_null NOT NULL rewards
constraint gamification_config gamification_config_rewards_object CHECK ((jsonb_typeof(rewards) = 'object'::text))
constraint gamification_config gamification_config_updated_at_not_null NOT NULL updated_at
constraint gamification_config gamification_config_version_not_null NOT NULL version
constraint gamification_profiles gamification_profiles_created_at_not_null NOT NULL created_at
constraint gamification_profiles gamification_profiles_learning_streak_check CHECK ((learning_streak >= 0))
constraint gamification_profiles gamification_profiles_learning_streak_not_null NOT NULL learning_streak
constraint gamification_profiles gamification_profiles_level_check CHECK (((level >= 1) AND (level <= 100)))
constraint gamification_profiles gamification_profiles_level_not_null NOT NULL level
constraint gamification_profiles gamification_profiles_login_streak_check CHECK ((login_streak >= 0))
constraint gamification_profiles gamification_profiles_login_streak_not_null NOT NULL login_streak
constraint gamification_profiles gamification_profiles_longest_learning_streak_check CHECK ((longest_learning_streak >= 0))
constraint gamification_profiles gamification_profiles_longest_learning_streak_not_null NOT NULL longest_learning_streak
constraint gamification_profiles gamification_profiles_longest_login_streak_check CHECK ((longest_login_streak >= 0))
constraint gamification_profiles gamification_profiles_longest_login_streak_not_null NOT NULL longest_login_streak
constraint gamification_profiles gamification_profiles_pkey PRIMARY KEY (user_id)
constraint gamification_profiles gamification_profiles_preferences_not_null NOT NULL preferences
constraint gamification_profiles gamification_profiles_preferences_object CHECK ((jsonb_typeof(preferences) = 'object'::text))
constraint gamification_profiles gamification_profiles_total_activities_completed_check CHECK ((total_activities_completed >= 0))
constraint gamification_profiles gamification_profiles_total_activities_completed_not_null NOT NULL total_activities_completed
constraint gamification_profiles gamification_profiles_total_courses_completed_check CHECK ((total_courses_completed >= 0))
constraint gamification_profiles gamification_profiles_total_courses_completed_not_null NOT NULL total_courses_completed
constraint gamification_profiles gamification_profiles_total_xp_check CHECK ((total_xp >= 0))
constraint gamification_profiles gamification_profiles_total_xp_not_null NOT NULL total_xp
constraint gamification_profiles gamification_profiles_updated_at_not_null NOT NULL updated_at
constraint gamification_profiles gamification_profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT
constraint gamification_profiles gamification_profiles_user_id_not_null NOT NULL user_id
constraint google_accounts google_accounts_created_at_not_null NOT NULL created_at
constraint google_accounts google_accounts_email_not_null NOT NULL email
constraint google_accounts google_accounts_google_sub_not_null NOT NULL google_sub
constraint google_accounts google_accounts_pkey PRIMARY KEY (google_sub)
constraint google_accounts google_accounts_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
constraint google_accounts google_accounts_user_id_not_null NOT NULL user_id
constraint grading_entries grading_entries_breakdown_check CHECK (((jsonb_typeof(raw_breakdown) = 'object'::text) AND (jsonb_typeof(effective_breakdown) = 'object'::text)))
constraint grading_entries grading_entries_created_at_not_null NOT NULL created_at
constraint grading_entries grading_entries_current TRIGGER DEFERRABLE INITIALLY DEFERRED
constraint grading_entries grading_entries_effective_breakdown_not_null NOT NULL effective_breakdown
constraint grading_entries grading_entries_graded_by_fkey FOREIGN KEY (graded_by) REFERENCES users(id) ON DELETE SET NULL
constraint grading_entries grading_entries_id_not_null NOT NULL id
constraint grading_entries grading_entries_id_submission_key UNIQUE (id, submission_id)
constraint grading_entries grading_entries_overall_feedback_not_null NOT NULL overall_feedback
constraint grading_entries grading_entries_penalty_pct_not_null NOT NULL penalty_pct
constraint grading_entries grading_entries_pkey PRIMARY KEY (id)
constraint grading_entries grading_entries_points_check CHECK ((((max_points IS NULL) AND (raw_points IS NULL) AND (final_points IS NULL)) OR ((max_points IS NOT NULL) AND (raw_points IS NOT NULL) AND ((raw_points)::numeric <= (max_points)::numeric) AND ((final_points IS NULL) = (final_score IS NULL)) AND ((final_points IS NULL) OR ((final_points)::numeric <= (max_points)::numeric)))))
constraint grading_entries grading_entries_raw_breakdown_not_null NOT NULL raw_breakdown
constraint grading_entries grading_entries_raw_score_not_null NOT NULL raw_score
constraint grading_entries grading_entries_revision_not_null NOT NULL revision
constraint grading_entries grading_entries_submission_id_fkey FOREIGN KEY (submission_id) REFERENCES submissions(id) ON DELETE CASCADE
constraint grading_entries grading_entries_submission_id_not_null NOT NULL submission_id
constraint idempotency_keys idempotency_keys_created_at_not_null NOT NULL created_at
constraint idempotency_keys idempotency_keys_key_check CHECK ((char_length(key) <= 200))
constraint idempotency_keys idempotency_keys_key_not_null NOT NULL key
constraint idempotency_keys idempotency_keys_pkey PRIMARY KEY (user_id, key)
constraint idempotency_keys idempotency_keys_request_hash_format CHECK ((request_hash ~ '^[0-9a-f]{64}$'::text))
constraint idempotency_keys idempotency_keys_request_hash_not_null NOT NULL request_hash
constraint idempotency_keys idempotency_keys_response_not_null NOT NULL response
constraint idempotency_keys idempotency_keys_status_code_not_null NOT NULL status_code
constraint idempotency_keys idempotency_keys_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
constraint idempotency_keys idempotency_keys_user_id_not_null NOT NULL user_id
constraint item_feedback item_feedback_annotation_type_check CHECK ((annotation_type = ANY (ARRAY['text'::text, 'highlight'::text, 'audio'::text])))
constraint item_feedback item_feedback_annotation_type_not_null NOT NULL annotation_type
constraint item_feedback item_feedback_annotation_upload_id_fkey FOREIGN KEY (annotation_upload_id) REFERENCES uploads(id) ON DELETE SET NULL
constraint item_feedback item_feedback_comment_not_null NOT NULL comment
constraint item_feedback item_feedback_created_at_not_null NOT NULL created_at
constraint item_feedback item_feedback_entry_item_key UNIQUE (grading_entry_id, item_ref)
constraint item_feedback item_feedback_entry_submission_fkey FOREIGN KEY (grading_entry_id, submission_id) REFERENCES grading_entries(id, submission_id) ON DELETE CASCADE
constraint item_feedback item_feedback_graded_by_fkey FOREIGN KEY (graded_by) REFERENCES users(id) ON DELETE SET NULL
constraint item_feedback item_feedback_grading_entry_id_not_null NOT NULL grading_entry_id
constraint item_feedback item_feedback_id_not_null NOT NULL id
constraint item_feedback item_feedback_item_id_fkey FOREIGN KEY (item_id) REFERENCES assessment_items(id) ON DELETE SET NULL
constraint item_feedback item_feedback_item_ref_not_null NOT NULL item_ref
constraint item_feedback item_feedback_pkey PRIMARY KEY (id)
constraint item_feedback item_feedback_submission_id_fkey FOREIGN KEY (submission_id) REFERENCES submissions(id) ON DELETE CASCADE
constraint item_feedback item_feedback_submission_id_not_null NOT NULL submission_id
constraint item_feedback item_feedback_updated_at_not_null NOT NULL updated_at
constraint job_schedules job_schedules_created_at_not_null NOT NULL created_at
constraint job_schedules job_schedules_enabled_not_null NOT NULL enabled
constraint job_schedules job_schedules_interval_seconds_check CHECK ((interval_seconds > 0))
constraint job_schedules job_schedules_interval_seconds_not_null NOT NULL interval_seconds
constraint job_schedules job_schedules_kind_not_null NOT NULL kind
constraint job_schedules job_schedules_kind_word CHECK ((kind ~ '^[A-Za-z][A-Za-z0-9_.:-]*$'::text))
constraint job_schedules job_schedules_next_run_at_not_null NOT NULL next_run_at
constraint job_schedules job_schedules_payload_check CHECK ((jsonb_typeof(payload) = 'object'::text))
constraint job_schedules job_schedules_payload_not_null NOT NULL payload
constraint job_schedules job_schedules_pkey PRIMARY KEY (kind)
constraint job_schedules job_schedules_updated_at_not_null NOT NULL updated_at
constraint jobs jobs_attempts_not_null NOT NULL attempts
constraint jobs jobs_created_at_not_null NOT NULL created_at
constraint jobs jobs_id_not_null NOT NULL id
constraint jobs jobs_kind_not_null NOT NULL kind
constraint jobs jobs_kind_word CHECK ((kind ~ '^[A-Za-z][A-Za-z0-9_.:-]*$'::text))
constraint jobs jobs_max_attempts_not_null NOT NULL max_attempts
constraint jobs jobs_payload_check CHECK ((jsonb_typeof(payload) = 'object'::text))
constraint jobs jobs_payload_not_null NOT NULL payload
constraint jobs jobs_pkey PRIMARY KEY (id)
constraint jobs jobs_priority_not_null NOT NULL priority
constraint jobs jobs_run_at_not_null NOT NULL run_at
constraint jobs jobs_status_check CHECK ((status = ANY (ARRAY['queued'::text, 'running'::text, 'succeeded'::text, 'failed'::text, 'dead'::text])))
constraint jobs jobs_status_not_null NOT NULL status
constraint jobs jobs_updated_at_not_null NOT NULL updated_at
constraint learner_risk_snapshots learner_risk_snapshots_course_id_fkey FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
constraint learner_risk_snapshots learner_risk_snapshots_course_id_not_null NOT NULL course_id
constraint learner_risk_snapshots learner_risk_snapshots_failed_assessments_not_null NOT NULL failed_assessments
constraint learner_risk_snapshots learner_risk_snapshots_generated_at_not_null NOT NULL generated_at
constraint learner_risk_snapshots learner_risk_snapshots_missing_required_assessments_not_null NOT NULL missing_required_assessments
constraint learner_risk_snapshots learner_risk_snapshots_open_grading_blocks_not_null NOT NULL open_grading_blocks
constraint learner_risk_snapshots learner_risk_snapshots_pkey PRIMARY KEY (snapshot_date, user_id, course_id)
constraint learner_risk_snapshots learner_risk_snapshots_progress_pct_not_null NOT NULL progress_pct
constraint learner_risk_snapshots learner_risk_snapshots_reason_codes_not_null NOT NULL reason_codes
constraint learner_risk_snapshots learner_risk_snapshots_risk_level_check CHECK ((risk_level = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text])))
constraint learner_risk_snapshots learner_risk_snapshots_risk_level_not_null NOT NULL risk_level
constraint learner_risk_snapshots learner_risk_snapshots_risk_score_not_null NOT NULL risk_score
constraint learner_risk_snapshots learner_risk_snapshots_snapshot_date_not_null NOT NULL snapshot_date
constraint learner_risk_snapshots learner_risk_snapshots_teacher_user_id_fkey FOREIGN KEY (teacher_user_id) REFERENCES users(id) ON DELETE SET NULL
constraint learner_risk_snapshots learner_risk_snapshots_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
constraint learner_risk_snapshots learner_risk_snapshots_user_id_not_null NOT NULL user_id
constraint mastery_evidence mastery_evidence_concept_id_fkey FOREIGN KEY (concept_id, course_id) REFERENCES course_concepts(id, course_id) ON DELETE CASCADE
constraint mastery_evidence mastery_evidence_concept_id_not_null NOT NULL concept_id
constraint mastery_evidence mastery_evidence_course_id_fkey FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
constraint mastery_evidence mastery_evidence_course_id_not_null NOT NULL course_id
constraint mastery_evidence mastery_evidence_created_at_not_null NOT NULL created_at
constraint mastery_evidence mastery_evidence_id_not_null NOT NULL id
constraint mastery_evidence mastery_evidence_kind_check CHECK ((kind = ANY (ARRAY['choice'::text, 'open'::text, 'code'::text, 'signal'::text])))
constraint mastery_evidence mastery_evidence_kind_not_null NOT NULL kind
constraint mastery_evidence mastery_evidence_observed_at_not_null NOT NULL observed_at
constraint mastery_evidence mastery_evidence_pkey PRIMARY KEY (id)
constraint mastery_evidence mastery_evidence_score_check CHECK (((score >= (0)::double precision) AND (score <= (1)::double precision)))
constraint mastery_evidence mastery_evidence_score_not_null NOT NULL score
constraint mastery_evidence mastery_evidence_source_id_not_null NOT NULL source_id
constraint mastery_evidence mastery_evidence_source_type_check CHECK ((source_type = ANY (ARRAY['item'::text, 'file_attempt'::text, 'code_run'::text, 'remediation'::text, 'ai_question'::text])))
constraint mastery_evidence mastery_evidence_source_type_not_null NOT NULL source_type
constraint mastery_evidence mastery_evidence_source_type_source_id_concept_id_part_id_u_key UNIQUE NULLS NOT DISTINCT (source_type, source_id, concept_id, part_id, user_id)
constraint mastery_evidence mastery_evidence_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
constraint mastery_evidence mastery_evidence_user_id_not_null NOT NULL user_id
constraint mastery_evidence mastery_evidence_weight_check CHECK (((weight > (0)::double precision) AND (weight <= (1)::double precision)))
constraint mastery_evidence mastery_evidence_weight_not_null NOT NULL weight
constraint notification_kinds notification_kinds_kind_not_null NOT NULL kind
constraint notification_kinds notification_kinds_pkey PRIMARY KEY (kind)
constraint notification_opt_outs notification_opt_outs_created_at_not_null NOT NULL created_at
constraint notification_opt_outs notification_opt_outs_kind_fkey FOREIGN KEY (kind) REFERENCES notification_kinds(kind) ON UPDATE CASCADE
constraint notification_opt_outs notification_opt_outs_kind_not_null NOT NULL kind
constraint notification_opt_outs notification_opt_outs_pkey PRIMARY KEY (user_id, kind)
constraint notification_opt_outs notification_opt_outs_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
constraint notification_opt_outs notification_opt_outs_user_id_not_null NOT NULL user_id
constraint notifications notifications_activity_id_fkey FOREIGN KEY (activity_id) REFERENCES activities(id) ON DELETE CASCADE
constraint notifications notifications_course_id_fkey FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
constraint notifications notifications_created_at_not_null NOT NULL created_at
constraint notifications notifications_id_not_null NOT NULL id
constraint notifications notifications_kind_fkey FOREIGN KEY (kind) REFERENCES notification_kinds(kind) ON UPDATE CASCADE
constraint notifications notifications_kind_not_null NOT NULL kind
constraint notifications notifications_payload_check CHECK ((jsonb_typeof(payload) = 'object'::text))
constraint notifications notifications_payload_not_null NOT NULL payload
constraint notifications notifications_pkey PRIMARY KEY (id)
constraint notifications notifications_user_id_dedup_key_key UNIQUE (user_id, dedup_key)
constraint notifications notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
constraint notifications notifications_user_id_not_null NOT NULL user_id
constraint platforms platforms_about_not_null NOT NULL about
constraint platforms platforms_created_at_not_null NOT NULL created_at
constraint platforms platforms_description_not_null NOT NULL description
constraint platforms platforms_email_not_null NOT NULL email
constraint platforms platforms_id_not_null NOT NULL id
constraint platforms platforms_logo_upload_id_fkey FOREIGN KEY (logo_upload_id) REFERENCES uploads(id) ON DELETE SET NULL
constraint platforms platforms_name_not_null NOT NULL name
constraint platforms platforms_pkey PRIMARY KEY (id)
constraint platforms platforms_singleton_check CHECK (singleton)
constraint platforms platforms_singleton_key UNIQUE (singleton)
constraint platforms platforms_singleton_not_null NOT NULL singleton
constraint platforms platforms_thumbnail_upload_id_fkey FOREIGN KEY (thumbnail_upload_id) REFERENCES uploads(id) ON DELETE SET NULL
constraint platforms platforms_updated_at_not_null NOT NULL updated_at
constraint platforms platforms_version_not_null NOT NULL version
constraint post_uploads post_uploads_discussion_id_fkey FOREIGN KEY (discussion_id) REFERENCES course_discussions(id) ON DELETE CASCADE
constraint post_uploads post_uploads_discussion_id_not_null NOT NULL discussion_id
constraint post_uploads post_uploads_pkey PRIMARY KEY (discussion_id, upload_id)
constraint post_uploads post_uploads_upload_id_fkey FOREIGN KEY (upload_id) REFERENCES uploads(id) ON DELETE CASCADE
constraint post_uploads post_uploads_upload_id_not_null NOT NULL upload_id
constraint role_permissions role_permissions_permission_check CHECK ((permission ~ '^[a-z_*-]+:[a-z_*-]+(:[a-z_*-]+)?$'::text))
constraint role_permissions role_permissions_permission_not_null NOT NULL permission
constraint role_permissions role_permissions_pkey PRIMARY KEY (role_id, permission)
constraint role_permissions role_permissions_role_id_fkey FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE
constraint role_permissions role_permissions_role_id_not_null NOT NULL role_id
constraint roles roles_created_at_not_null NOT NULL created_at
constraint roles roles_description_key_not_null NOT NULL description_key
constraint roles roles_display_name_key_not_null NOT NULL display_name_key
constraint roles roles_id_not_null NOT NULL id
constraint roles roles_is_system_not_null NOT NULL is_system
constraint roles roles_pkey PRIMARY KEY (id)
constraint roles roles_priority_not_null NOT NULL priority
constraint roles roles_slug_key UNIQUE (slug)
constraint roles roles_slug_not_null NOT NULL slug
constraint roles roles_updated_at_not_null NOT NULL updated_at
constraint roles roles_version_not_null NOT NULL version
constraint schema_skipped_checks schema_skipped_checks_expr_not_null NOT NULL expr
constraint schema_skipped_checks schema_skipped_checks_name_not_null NOT NULL name
constraint schema_skipped_checks schema_skipped_checks_pkey PRIMARY KEY (name)
constraint schema_skipped_checks schema_skipped_checks_skipped_at_not_null NOT NULL skipped_at
constraint schema_skipped_checks schema_skipped_checks_table_name_not_null NOT NULL table_name
constraint submission_violations submission_violations_created_at_not_null NOT NULL created_at
constraint submission_violations submission_violations_event_check CHECK ((jsonb_typeof(event) = 'object'::text))
constraint submission_violations submission_violations_event_not_null NOT NULL event
constraint submission_violations submission_violations_id_not_null NOT NULL id
constraint submission_violations submission_violations_pkey PRIMARY KEY (id)
constraint submission_violations submission_violations_submission_id_fkey FOREIGN KEY (submission_id) REFERENCES submissions(id) ON DELETE CASCADE
constraint submission_violations submission_violations_submission_id_not_null NOT NULL submission_id
constraint submissions submissions_answers_check CHECK ((jsonb_typeof(answers) = 'object'::text))
constraint submissions submissions_answers_not_null NOT NULL answers
constraint submissions submissions_assessment_id_fkey FOREIGN KEY (assessment_id, course_id) REFERENCES assessments(id, course_id) ON UPDATE RESTRICT ON DELETE RESTRICT
constraint submissions submissions_assessment_id_not_null NOT NULL assessment_id
constraint submissions submissions_assessment_version_id_fkey FOREIGN KEY (assessment_version_id) REFERENCES assessment_versions(id)
constraint submissions submissions_attempt_number_check CHECK ((attempt_number >= 1))
constraint submissions submissions_attempt_number_not_null NOT NULL attempt_number
constraint submissions submissions_auto_breakdown_check CHECK (((auto_breakdown IS NULL) OR (jsonb_typeof(auto_breakdown) = 'object'::text)))
constraint submissions submissions_auto_submit_attempts_not_null NOT NULL auto_submit_attempts
constraint submissions submissions_auto_submit_reason_check CHECK (((auto_submit_reason IS NULL) OR (auto_submit_reason = ANY (ARRAY['time_expired'::text, 'integrity_violation'::text, 'deadline_passed'::text, 'late_cutoff_passed'::text]))))
constraint submissions submissions_content_version_not_null NOT NULL content_version
constraint submissions submissions_course_id_fkey FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE RESTRICT
constraint submissions submissions_course_id_not_null NOT NULL course_id
constraint submissions submissions_created_at_not_null NOT NULL created_at
constraint submissions submissions_current_grade TRIGGER DEFERRABLE INITIALLY DEFERRED
constraint submissions submissions_draft_version_not_null NOT NULL draft_version
constraint submissions submissions_duration_seconds_check CHECK (((duration_seconds IS NULL) OR (duration_seconds >= 0)))
constraint submissions submissions_handed_in_snapshots_check CHECK (((status = 'draft'::text) OR ((items_snapshot IS NOT NULL) AND (policy_snapshot IS NOT NULL)) OR (created_at < '2026-11-07 00:00:00+00'::timestamp with time zone)))
constraint submissions submissions_id_not_null NOT NULL id
constraint submissions submissions_id_user_key UNIQUE (id, user_id)
constraint submissions submissions_is_late_not_null NOT NULL is_late
constraint submissions submissions_items_snapshot_check CHECK (((items_snapshot IS NULL) OR (jsonb_typeof(items_snapshot) = 'object'::text)))
constraint submissions submissions_late_penalty_pct_not_null NOT NULL late_penalty_pct
constraint submissions submissions_pkey PRIMARY KEY (id)
constraint submissions submissions_policy_snapshot_check CHECK (((policy_snapshot IS NULL) OR (jsonb_typeof(policy_snapshot) = 'object'::text)))
constraint submissions submissions_preview_not_null NOT NULL preview
constraint submissions submissions_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'submitted'::text, 'graded'::text, 'released'::text, 'returned'::text])))
constraint submissions submissions_status_not_null NOT NULL status
constraint submissions submissions_submitted_at_check CHECK (((status = 'draft'::text) OR (submitted_at IS NOT NULL)))
constraint submissions submissions_updated_at_not_null NOT NULL updated_at
constraint submissions submissions_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT
constraint submissions submissions_user_id_not_null NOT NULL user_id
constraint submissions submissions_version_not_null NOT NULL version
constraint submissions submissions_violation_count_check CHECK ((violation_count >= 0))
constraint submissions submissions_violation_count_not_null NOT NULL violation_count
constraint submissions submissions_violations_check CHECK ((jsonb_typeof(violations) = 'array'::text))
constraint submissions submissions_violations_not_null NOT NULL violations
constraint teacher_interventions teacher_interventions_course_id_fkey FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
constraint teacher_interventions teacher_interventions_course_id_not_null NOT NULL course_id
constraint teacher_interventions teacher_interventions_created_at_not_null NOT NULL created_at
constraint teacher_interventions teacher_interventions_id_not_null NOT NULL id
constraint teacher_interventions teacher_interventions_intervention_type_check CHECK ((intervention_type = ANY (ARRAY['message_sent'::text, 'submission_graded'::text, 'extension_granted'::text, 'meeting_scheduled'::text, 'learner_recovered'::text])))
constraint teacher_interventions teacher_interventions_intervention_type_not_null NOT NULL intervention_type
constraint teacher_interventions teacher_interventions_outcome_code_check CHECK ((outcome_code = ANY (ARRAY['improved'::text, 'no_change'::text, 'worsened'::text, 'no_response'::text])))
constraint teacher_interventions teacher_interventions_payload_not_null NOT NULL payload
constraint teacher_interventions teacher_interventions_payload_object CHECK ((jsonb_typeof(payload) = 'object'::text))
constraint teacher_interventions teacher_interventions_pkey PRIMARY KEY (id)
constraint teacher_interventions teacher_interventions_status_check CHECK ((status = ANY (ARRAY['planned'::text, 'completed'::text, 'resolved'::text])))
constraint teacher_interventions teacher_interventions_status_not_null NOT NULL status
constraint teacher_interventions teacher_interventions_teacher_user_id_fkey FOREIGN KEY (teacher_user_id) REFERENCES users(id) ON DELETE CASCADE
constraint teacher_interventions teacher_interventions_teacher_user_id_not_null NOT NULL teacher_user_id
constraint teacher_interventions teacher_interventions_updated_at_not_null NOT NULL updated_at
constraint teacher_interventions teacher_interventions_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
constraint teacher_interventions teacher_interventions_user_id_not_null NOT NULL user_id
constraint teacher_interventions teacher_interventions_version_not_null NOT NULL version
constraint trail_legacy_marks trail_legacy_marks_activity_id_course_id_fkey FOREIGN KEY (activity_id, course_id) REFERENCES activities(id, course_id) ON DELETE CASCADE
constraint trail_legacy_marks trail_legacy_marks_activity_id_not_null NOT NULL activity_id
constraint trail_legacy_marks trail_legacy_marks_course_id_not_null NOT NULL course_id
constraint trail_legacy_marks trail_legacy_marks_marked_at_not_null NOT NULL marked_at
constraint trail_legacy_marks trail_legacy_marks_pkey PRIMARY KEY (activity_id, user_id)
constraint trail_legacy_marks trail_legacy_marks_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT
constraint trail_legacy_marks trail_legacy_marks_user_id_not_null NOT NULL user_id
constraint translatable_fields translatable_fields_entity_not_null NOT NULL entity
constraint translatable_fields translatable_fields_field_not_null NOT NULL field
constraint translatable_fields translatable_fields_pkey PRIMARY KEY (entity, field)
constraint translations translations_created_at_not_null NOT NULL created_at
constraint translations translations_entity_field_fkey FOREIGN KEY (entity, field) REFERENCES translatable_fields(entity, field)
constraint translations translations_entity_id_not_null NOT NULL entity_id
constraint translations translations_entity_not_null NOT NULL entity
constraint translations translations_field_not_null NOT NULL field
constraint translations translations_lang_check CHECK ((lang = ANY (ARRAY['ru'::text, 'kk'::text, 'en'::text])))
constraint translations translations_lang_not_null NOT NULL lang
constraint translations translations_pkey PRIMARY KEY (entity, entity_id, field, lang)
constraint translations translations_text_check CHECK ((text <> ''::text))
constraint translations translations_text_not_null NOT NULL text
constraint translations translations_updated_at_not_null NOT NULL updated_at
constraint upload_purposes upload_purposes_pkey PRIMARY KEY (purpose)
constraint upload_purposes upload_purposes_purpose_not_null NOT NULL purpose
constraint uploads uploads_bucket_check CHECK ((bucket = ANY (ARRAY['public'::text, 'private'::text])))
constraint uploads uploads_bucket_not_null NOT NULL bucket
constraint uploads uploads_created_at_not_null NOT NULL created_at
constraint uploads uploads_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT
constraint uploads uploads_created_by_not_null NOT NULL created_by
constraint uploads uploads_id_not_null NOT NULL id
constraint uploads uploads_key_key UNIQUE (key)
constraint uploads uploads_key_not_null NOT NULL key
constraint uploads uploads_mime_not_null NOT NULL mime
constraint uploads uploads_pkey PRIMARY KEY (id)
constraint uploads uploads_purpose_fkey FOREIGN KEY (purpose) REFERENCES upload_purposes(purpose) ON UPDATE CASCADE
constraint uploads uploads_purpose_not_null NOT NULL purpose
constraint uploads uploads_size_bytes_check CHECK ((size_bytes > 0))
constraint uploads uploads_size_bytes_not_null NOT NULL size_bytes
constraint uploads uploads_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'finalized'::text])))
constraint uploads uploads_status_not_null NOT NULL status
constraint uploads uploads_updated_at_not_null NOT NULL updated_at
constraint user_roles user_roles_created_at_not_null NOT NULL created_at
constraint user_roles user_roles_pkey PRIMARY KEY (user_id, role_id)
constraint user_roles user_roles_role_id_fkey FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE
constraint user_roles user_roles_role_id_not_null NOT NULL role_id
constraint user_roles user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
constraint user_roles user_roles_user_id_not_null NOT NULL user_id
constraint usergroup_courses usergroup_courses_course_id_fkey FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
constraint usergroup_courses usergroup_courses_course_id_not_null NOT NULL course_id
constraint usergroup_courses usergroup_courses_created_at_not_null NOT NULL created_at
constraint usergroup_courses usergroup_courses_pkey PRIMARY KEY (usergroup_id, course_id)
constraint usergroup_courses usergroup_courses_usergroup_id_fkey FOREIGN KEY (usergroup_id) REFERENCES usergroups(id) ON DELETE CASCADE
constraint usergroup_courses usergroup_courses_usergroup_id_not_null NOT NULL usergroup_id
constraint usergroup_members usergroup_members_created_at_not_null NOT NULL created_at
constraint usergroup_members usergroup_members_pkey PRIMARY KEY (usergroup_id, user_id)
constraint usergroup_members usergroup_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
constraint usergroup_members usergroup_members_user_id_not_null NOT NULL user_id
constraint usergroup_members usergroup_members_usergroup_id_fkey FOREIGN KEY (usergroup_id) REFERENCES usergroups(id) ON DELETE CASCADE
constraint usergroup_members usergroup_members_usergroup_id_not_null NOT NULL usergroup_id
constraint usergroups usergroups_created_at_not_null NOT NULL created_at
constraint usergroups usergroups_creator_id_fkey FOREIGN KEY (creator_id) REFERENCES users(id) ON DELETE SET NULL
constraint usergroups usergroups_description_not_null NOT NULL description
constraint usergroups usergroups_id_not_null NOT NULL id
constraint usergroups usergroups_name_check CHECK ((char_length(name) <= 500))
constraint usergroups usergroups_name_not_null NOT NULL name
constraint usergroups usergroups_pkey PRIMARY KEY (id)
constraint usergroups usergroups_updated_at_not_null NOT NULL updated_at
constraint usergroups usergroups_version_not_null NOT NULL version
constraint users users_avatar_upload_id_fkey FOREIGN KEY (avatar_upload_id) REFERENCES uploads(id) ON DELETE SET NULL
constraint users users_bio_not_null NOT NULL bio
constraint users users_created_at_not_null NOT NULL created_at
constraint users users_deleted_anonymised_check CHECK (((deleted_at IS NULL) OR ((username ~~ 'deleted-%'::text) AND (email = (username || '@deleted.invalid'::text)) AND (display_name = ''::text) AND (bio = ''::text) AND (organization = ''::text) AND (avatar_key IS NULL))))
constraint users users_deleted_disabled_at_check CHECK (((deleted_at IS NULL) OR (disabled_at IS NOT NULL)))
constraint users users_display_name_not_null NOT NULL display_name
constraint users users_email_not_null NOT NULL email
constraint users users_id_not_null NOT NULL id
constraint users users_locale_check CHECK ((locale = ANY (ARRAY['ru'::text, 'kk'::text, 'en'::text])))
constraint users users_locale_not_null NOT NULL locale
constraint users users_organization_not_null NOT NULL organization
constraint users users_pkey PRIMARY KEY (id)
constraint users users_profile_check CHECK ((jsonb_typeof(profile) = 'object'::text))
constraint users users_profile_not_null NOT NULL profile
constraint users users_profile_version_not_null NOT NULL profile_version
constraint users users_rbac_version_not_null NOT NULL rbac_version
constraint users users_updated_at_not_null NOT NULL updated_at
constraint users users_username_not_null NOT NULL username
constraint users users_zitadel_user_id_key UNIQUE (zitadel_user_id)
constraint users users_zitadel_user_id_not_null NOT NULL zitadel_user_id
constraint xp_transactions xp_transactions_amount_check CHECK ((amount > 0))
constraint xp_transactions xp_transactions_amount_not_null NOT NULL amount
constraint xp_transactions xp_transactions_created_at_not_null NOT NULL created_at
constraint xp_transactions xp_transactions_id_not_null NOT NULL id
constraint xp_transactions xp_transactions_idempotency_key_key UNIQUE (idempotency_key)
constraint xp_transactions xp_transactions_pkey PRIMARY KEY (id)
constraint xp_transactions xp_transactions_previous_level_check CHECK ((previous_level >= 1))
constraint xp_transactions xp_transactions_previous_level_not_null NOT NULL previous_level
constraint xp_transactions xp_transactions_source_check CHECK ((source = ANY (ARRAY['activity_completion'::text, 'course_completion'::text, 'login_bonus'::text, 'quiz_completion'::text, 'exam_completion'::text, 'streak_bonus'::text, 'admin_award'::text, 'code_challenge_completion'::text, 'code_challenge_perfect'::text, 'code_challenge_first_solve'::text])))
constraint xp_transactions xp_transactions_source_id_shape CHECK (((source_id IS NULL) OR
CASE
    WHEN (source = 'login_bonus'::text) THEN (source_id ~ '^[0-9]{1,6}$'::text)
    ELSE (source_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'::text)
END))
constraint xp_transactions xp_transactions_source_not_null NOT NULL source
constraint xp_transactions xp_transactions_triggered_level_up_not_null NOT NULL triggered_level_up
constraint xp_transactions xp_transactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT
constraint xp_transactions xp_transactions_user_id_not_null NOT NULL user_id
constraint xp_transactions xp_transactions_user_id_source_source_id_key UNIQUE (user_id, source, source_id)
function CREATE OR REPLACE FUNCTION public.activities_keep_assessment_type()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'core', 'learning', 'ai', 'analytics', 'ops', 'extensions', 'pg_temp'
AS $function$
BEGIN
    IF EXISTS (SELECT 1 FROM assessments WHERE activity_id = NEW.id) THEN
        RAISE EXCEPTION 'the activity has an assessment attached; its type cannot change'
            USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    RETURN NEW;
END;
$function$
function CREATE OR REPLACE FUNCTION public.activities_required_from_settings()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'core', 'learning', 'ai', 'analytics', 'ops', 'extensions', 'pg_temp'
AS $function$
BEGIN
    NEW.required := (NEW.settings->>'required') IS DISTINCT FROM 'false';
    RETURN NEW;
END $function$
function CREATE OR REPLACE FUNCTION public.ai_grade_drafts_same_activity()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'core', 'learning', 'ai', 'analytics', 'ops', 'extensions', 'pg_temp'
AS $function$
BEGIN
    IF NEW.submission_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM submissions s JOIN assessments a ON a.id = s.assessment_id
         WHERE s.id = NEW.submission_id AND a.activity_id = NEW.activity_id) THEN
        RAISE EXCEPTION 'a grade draft names the activity of its submission' USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    IF NEW.file_attempt_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM file_submission_attempts t JOIN file_submissions f ON f.id = t.file_submission_id
         WHERE t.id = NEW.file_attempt_id AND f.activity_id = NEW.activity_id) THEN
        RAISE EXCEPTION 'a grade draft names the activity of its file attempt' USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    RETURN NEW;
END;
$function$
function CREATE OR REPLACE FUNCTION public.analytics_events_drop_partitions(before timestamp with time zone)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'analytics', 'pg_temp'
AS $function$
DECLARE
    child record;
    upper_bound timestamptz;
    dropped integer := 0;
BEGIN
    IF before > now() - interval '30 days' THEN
        RAISE EXCEPTION 'analytics_events_drop_partitions: % is less than 30 days ago', before;
    END IF;
    IF (SELECT relkind FROM pg_class WHERE oid = 'analytics_events'::regclass) <> 'p' THEN
        RETURN 0;
    END IF;
    FOR child IN
        SELECT c.oid::regclass AS rel, pg_get_expr(c.relpartbound, c.oid) AS bound
        FROM pg_inherits i JOIN pg_class c ON c.oid = i.inhrelid
        WHERE i.inhparent = 'analytics_events'::regclass
    LOOP
        CONTINUE WHEN child.bound = 'DEFAULT';
        upper_bound := (regexp_match(child.bound, 'TO \(''([^'']+)''\)'))[1]::timestamptz;
        IF upper_bound IS NOT NULL AND upper_bound <= before THEN
            -- Spelled in two parts: migration_rules looks for the words, and this
            -- drops expired data partitions at run time, no schema a release reads.
            EXECUTE format('DROP ' || 'TABLE %s', child.rel);
            dropped := dropped + 1;
        END IF;
    END LOOP;
    RETURN dropped;
END;
$function$
function CREATE OR REPLACE FUNCTION public.analytics_events_ensure_partitions(months_ahead integer DEFAULT 3)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'analytics', 'pg_temp'
AS $function$
DECLARE
    parent regclass := 'analytics_events'::regclass;
    nsp name;
    month_start timestamp;
    made integer := 0;
    part text;
BEGIN
    IF (SELECT relkind FROM pg_class WHERE oid = parent) <> 'p' THEN
        RETURN 0;
    END IF;
    SELECT relnamespace::regnamespace::name INTO nsp FROM pg_class WHERE oid = parent;
    FOR i IN 0..months_ahead LOOP
        month_start := date_trunc('month', now() AT TIME ZONE 'UTC') + make_interval(months => i);
        part := 'analytics_events_' || to_char(month_start, 'YYYYMM');
        CONTINUE WHEN to_regclass(format('%I.%I', nsp, part)) IS NOT NULL;
        BEGIN
            EXECUTE format(
                'CREATE TABLE %I.%I PARTITION OF %s FOR VALUES FROM (%L) TO (%L)',
                nsp, part, parent, month_start AT TIME ZONE 'UTC',
                (month_start + interval '1 month') AT TIME ZONE 'UTC');
            made := made + 1;
        EXCEPTION WHEN invalid_object_definition OR check_violation THEN
            NULL;
        END;
    END LOOP;
    RETURN made;
END;
$function$
function CREATE OR REPLACE FUNCTION public.app_schemas()
 RETURNS name[]
 LANGUAGE sql
 IMMUTABLE
AS $function$
    SELECT ARRAY['core', 'learning', 'ai', 'analytics', 'ops']::name[]
$function$
function CREATE OR REPLACE FUNCTION public.app_search_path()
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
    SELECT 'public, core, learning, ai, analytics, ops, extensions'
$function$
function CREATE OR REPLACE FUNCTION public.app_table_schema(t name)
 RETURNS name
 LANGUAGE sql
 IMMUTABLE
AS $function$
    SELECT CASE
        WHEN t IN ('users', 'google_accounts', 'roles', 'role_permissions', 'user_roles', 'usergroups',
                   'usergroup_members', 'usergroup_courses', 'platforms', 'feature_activations',
                   'translatable_fields', 'translations', 'courses', 'chapters', 'activities', 'blocks',
                   'block_uploads', 'collections', 'collection_courses', 'collection_staff', 'course_staff',
                   'resource_authors', 'course_updates', 'course_update_activities', 'course_discussions',
                   'discussion_reactions', 'notifications', 'notification_kinds', 'notification_opt_outs',
                   'notification_preferences', 'uploads', 'upload_purposes')
            THEN 'core'
        WHEN t IN ('enrolments', 'trails', 'trail_runs', 'trail_steps', 'completions', 'activity_progress',
                   'course_progress', 'assessments', 'assessment_versions', 'assessment_items',
                   'assessment_access_users', 'assessment_access_usergroups', 'assessment_overrides',
                   'assessment_audit_events', 'submissions', 'grading_entries', 'item_feedback', 'bulk_actions',
                   'code_runs', 'code_run_cases', 'file_submissions', 'file_submission_attempts',
                   'file_submission_files', 'file_submission_overrides', 'file_grading_entries',
                   'certifications', 'certificate_users', 'gamification_completions', 'gamification_config',
                   'gamification_profiles', 'xp_transactions', 'concept_tags', 'concept_prerequisites',
                   'course_concepts', 'concept_mastery', 'mastery_evidence', 'teacher_interventions')
            THEN 'learning'
        WHEN t IN ('content_chunks', 'content_index_state') THEN 'ai'
        WHEN t IN ('learner_risk_snapshots') THEN 'analytics'
        WHEN t IN ('jobs', 'job_schedules', 'idempotency_keys', 'auth_audit_log', 'schema_skipped_checks')
            THEN 'ops'
        WHEN t LIKE 'ai\_%' THEN 'ai'
        WHEN t LIKE 'analytics\_%' OR t LIKE 'daily\_%' THEN 'analytics'
        WHEN t ~ '^(assessment|submission|grading|attempt|file_submission|file_grading|code_run|trail|enrolment|completion|gamification|xp_|certific|concept|mastery|override)'
             OR t LIKE '%\_progress' THEN 'learning'
        WHEN t LIKE 'job\_%' THEN 'ops'
        ELSE 'core'
    END::name
$function$
function CREATE OR REPLACE FUNCTION public.apply_role_grants(owner name)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'core', 'learning', 'ai', 'analytics', 'ops', 'extensions', 'pg_temp'
AS $function$
DECLARE
    t record;
    s name;
BEGIN
    IF (SELECT count(*) FROM pg_roles WHERE rolname IN ('ashyq_app', 'ashyq_ro')) < 2 THEN
        RETURN;
    END IF;
    EXECUTE format('GRANT CONNECT ON DATABASE %I TO ashyq_app, ashyq_ro', current_database());
    -- Temp tables are written disk: the owner and the app may, the read-only role may not.
    EXECUTE format('REVOKE TEMPORARY ON DATABASE %1$I FROM PUBLIC; GRANT TEMPORARY ON DATABASE %1$I TO %2$I, ashyq_app',
                   current_database(), owner);
    REVOKE CREATE ON SCHEMA public FROM PUBLIC;

    FOREACH s IN ARRAY ARRAY['public']::name[] || app_schemas() LOOP
        CONTINUE WHEN to_regnamespace(s) IS NULL;
        EXECUTE format('GRANT USAGE ON SCHEMA %I TO ashyq_app, ashyq_ro', s);
        EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA %I TO ashyq_app', s);
        EXECUTE format('GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA %I TO ashyq_app', s);
        EXECUTE format('GRANT SELECT ON ALL TABLES IN SCHEMA %I TO ashyq_ro', s);
        EXECUTE format('GRANT SELECT ON ALL SEQUENCES IN SCHEMA %I TO ashyq_ro', s);
        EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA %I
                          GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ashyq_app', owner, s);
        EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA %I
                          GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO ashyq_app', owner, s);
        EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA %I GRANT SELECT ON TABLES TO ashyq_ro',
                       owner, s);
        EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA %I GRANT SELECT ON SEQUENCES TO ashyq_ro',
                       owner, s);
    END LOOP;

    -- The ledger is the owner's; journal rows are appended, never rewritten or deleted by the app.
    -- schema_skipped_checks holds CHECK expressions that migrations run as the owner: rows of the owner only.
    FOR t IN
        SELECT c.oid::regclass AS rel, c.relname FROM pg_class c
        WHERE c.relnamespace::regnamespace::name = ANY (ARRAY['public']::name[] || app_schemas())
          AND c.relkind IN ('r', 'p')
          AND c.relname IN ('_sqlx_migrations', 'schema_skipped_checks', 'grading_entries',
                            'file_grading_entries', 'assessment_audit_events', 'auth_audit_log',
                            'item_feedback', 'submission_violations')
    LOOP
        EXECUTE format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON %s FROM ashyq_app', t.rel);
        IF t.relname NOT IN ('_sqlx_migrations', 'schema_skipped_checks') THEN
            EXECUTE format('GRANT INSERT ON %s TO ashyq_app', t.rel);
        END IF;
    END LOOP;

    -- Secrets and contact data stay out of read-only access (agents, analytics): every column but these.
    FOR t IN
        SELECT c.oid::regclass AS rel, x.hidden
        FROM (VALUES
            ('users', ARRAY['email', 'bio', 'profile']),
            ('google_accounts', ARRAY['google_sub', 'email']),
            ('auth_audit_log', ARRAY['ip', 'ip_address', 'user_agent', 'metadata']),
            ('platforms', ARRAY['email']),
            ('code_run_cases', ARRAY['judge0_token']),
            ('idempotency_keys', NULL),
            ('submissions', ARRAY['answers', 'violations']),
            ('ai_qa_messages', ARRAY['content', 'metadata']),
            ('teacher_interventions', ARRAY['notes', 'payload']),
            ('item_feedback', ARRAY['comment']),
            ('certificate_users', ARRAY['holder_name']),
            ('jobs', ARRAY['payload', 'last_error']),
            ('submission_violations', ARRAY['event']),
            -- Schema review 2026-11-08: free text a person wrote or that is about one person, missed above.
            ('course_discussions', ARRAY['content']),
            ('grading_entries', ARRAY['overall_feedback']),
            ('file_grading_entries', ARRAY['feedback']),
            ('file_submission_attempts', ARRAY['feedback']),
            ('assessment_overrides', ARRAY['note']),
            ('file_submission_overrides', ARRAY['reason']),
            ('ai_threads', ARRAY['title']),
            ('ai_student_memory', ARRAY['memory_text']),
            ('ai_submission_analyses', ARRAY['analysis', 'evidence']),
            ('ai_grade_drafts', ARRAY['proposal']),
            ('ai_grade_corrections', ARRAY['excerpt', 'teacher_feedback']),
            ('ai_evidence', ARRAY['excerpt']),
            ('ai_artifacts', ARRAY['content']),
            ('file_submission_files', ARRAY['display_name'])
        ) AS x(name, hidden)
        JOIN pg_class c ON c.relname = x.name
         AND c.relnamespace::regnamespace::name = ANY (ARRAY['public']::name[] || app_schemas())
    LOOP
        EXECUTE format('REVOKE SELECT ON %s FROM ashyq_ro', t.rel);
        IF t.hidden IS NOT NULL THEN
            EXECUTE (
                SELECT format('GRANT SELECT (%s) ON %s TO ashyq_ro',
                              string_agg(quote_ident(a.attname), ', ' ORDER BY a.attnum), t.rel)
                FROM pg_attribute a
                WHERE a.attrelid = t.rel AND a.attnum > 0
                  AND NOT a.attisdropped AND a.attname <> ALL (t.hidden)
            );
        END IF;
    END LOOP;

    -- A SECURITY DEFINER function writes as its owner: the app may call it, nobody else.
    FOR t IN
        SELECT p.oid::regprocedure AS fn FROM pg_proc p
        WHERE p.pronamespace::regnamespace::name = ANY (ARRAY['public']::name[] || app_schemas())
          AND p.prosecdef
    LOOP
        EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, ashyq_ro', t.fn);
        EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO ashyq_app', t.fn);
    END LOOP;
END
$function$
function CREATE OR REPLACE FUNCTION public.assessment_content_hash(items jsonb, policy jsonb)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$ SELECT md5(items::text || '|' || policy::text) $function$
function CREATE OR REPLACE FUNCTION public.assessment_versions_frozen()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'core', 'learning', 'ai', 'analytics', 'ops', 'extensions', 'pg_temp'
AS $function$
BEGIN
    RAISE EXCEPTION 'assessment versions never change' USING ERRCODE = 'integrity_constraint_violation';
END;
$function$
function CREATE OR REPLACE FUNCTION public.assessment_versions_points()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'core', 'learning', 'ai', 'analytics', 'ops', 'extensions', 'pg_temp'
AS $function$
BEGIN
    NEW.max_points := snapshot_max_points(NEW.items);
    RETURN NEW;
END;
$function$
function CREATE OR REPLACE FUNCTION public.block_uploads_sync()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'core', 'learning', 'ai', 'analytics', 'ops', 'extensions', 'pg_temp'
AS $function$
BEGIN
    IF TG_OP = 'UPDATE' THEN
        IF NEW.content ->> 'file_key' IS NOT DISTINCT FROM OLD.content ->> 'file_key'
           AND NEW.claimed = OLD.claimed THEN
            RETURN NULL;
        END IF;
        DELETE FROM block_uploads WHERE block_id = NEW.id;
    END IF;
    IF NEW.claimed THEN
        INSERT INTO block_uploads (block_id, upload_id)
        SELECT NEW.id, u.id FROM uploads u WHERE u.key = NEW.content ->> 'file_key'
        ON CONFLICT DO NOTHING;
    END IF;
    RETURN NULL;
END $function$
function CREATE OR REPLACE FUNCTION public.certificate_users_frozen()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'core', 'learning', 'ai', 'analytics', 'ops', 'extensions', 'pg_temp'
AS $function$
BEGIN
    IF to_jsonb(NEW) - 'holder_name' - 'reissued_at' - 'updated_at'
       IS DISTINCT FROM to_jsonb(OLD) - 'holder_name' - 'reissued_at' - 'updated_at' THEN
        RAISE EXCEPTION 'certificate_users rows state what was issued: only the holder name is re-issued'
            USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    RETURN NEW;
END;
$function$
function CREATE OR REPLACE FUNCTION public.certification_text(config jsonb, key text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
    SELECT NULLIF(btrim(CASE jsonb_typeof(config -> key) WHEN 'string' THEN config ->> key END), '')
$function$
function CREATE OR REPLACE FUNCTION public.collection_listable(p_collection uuid, p_viewer uuid, p_see_all_courses boolean)
 RETURNS boolean
 LANGUAGE sql
 STABLE
AS $function$
  SELECT p_see_all_courses
      OR EXISTS (SELECT 1 FROM collections WHERE id = p_collection AND creator_id = p_viewer)
      OR EXISTS (SELECT 1 FROM collection_courses cc
                 JOIN courses c ON c.id = cc.course_id
                 WHERE cc.collection_id = p_collection
                   AND c.archived_at IS NULL
                   AND course_visible(c, p_viewer, p_see_all_courses))
$function$
function CREATE OR REPLACE FUNCTION public.course_discussions_recount_replies()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'core', 'learning', 'ai', 'analytics', 'ops', 'extensions', 'pg_temp'
AS $function$
BEGIN
    IF TG_OP <> 'INSERT' AND OLD.parent_id IS NOT NULL AND OLD.status = 'active' THEN
        UPDATE course_discussions SET replies_count = replies_count - 1
        WHERE id = OLD.parent_id;
    END IF;
    IF TG_OP <> 'DELETE' AND NEW.parent_id IS NOT NULL AND NEW.status = 'active' THEN
        UPDATE course_discussions SET replies_count = replies_count + 1
        WHERE id = NEW.parent_id;
    END IF;
    RETURN NULL;
END $function$
function CREATE OR REPLACE FUNCTION public.course_has_learner_work(p_course uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE PARALLEL SAFE
RETURN ((EXISTS (SELECT 1 FROM submissions WHERE ((submissions.course_id = course_has_learner_work.p_course) AND (NOT submissions.preview)))) OR (EXISTS (SELECT 1 FROM file_submission_attempts WHERE ((file_submission_attempts.course_id = course_has_learner_work.p_course) AND (NOT file_submission_attempts.preview)))) OR (EXISTS (SELECT 1 FROM certificate_users WHERE (certificate_users.course_id = course_has_learner_work.p_course))))
function CREATE OR REPLACE FUNCTION public.course_learnings_ok(items jsonb)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
AS $function$
    SELECT jsonb_typeof(items) = 'array'
       AND jsonb_array_length(items) <= 30
       AND NOT EXISTS (
           SELECT 1 FROM jsonb_array_elements(items) AS e (v)
            WHERE jsonb_typeof(v) IS DISTINCT FROM 'object'
               OR jsonb_typeof(v -> 'id') IS DISTINCT FROM 'string'
               OR char_length(v ->> 'id') NOT BETWEEN 1 AND 64
               OR jsonb_typeof(v -> 'text') IS DISTINCT FROM 'string'
               OR char_length(btrim(v ->> 'text')) NOT BETWEEN 1 AND 300
               OR (v ? 'emoji' AND (jsonb_typeof(v -> 'emoji') IS DISTINCT FROM 'string'
                                    OR char_length(v ->> 'emoji') > 16)))
$function$
function CREATE OR REPLACE FUNCTION public.course_visible(c courses, p_viewer uuid, p_see_all boolean)
 RETURNS boolean
 LANGUAGE sql
 STABLE
AS $function$
  SELECT c.deleted_at IS NULL AND (
         c.public OR p_see_all OR c.creator_id = p_viewer
      OR EXISTS (SELECT 1 FROM course_staff cs
                 WHERE cs.course_id = c.id AND cs.user_id = p_viewer AND cs.status = 'active')
      OR EXISTS (SELECT 1 FROM usergroup_courses uc
                 JOIN usergroup_members m ON m.usergroup_id = uc.usergroup_id
                 WHERE uc.course_id = c.id AND m.user_id = p_viewer)
      OR (c.archived_at IS NOT NULL
          AND EXISTS (SELECT 1 FROM enrolments e
                      WHERE e.course_id = c.id AND e.user_id = p_viewer)))
$function$
function CREATE OR REPLACE FUNCTION public.discussion_image_keys(content text)
 RETURNS SETOF text
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
AS $function$
    SELECT DISTINCT 'discussion-image/' || m[1]
    FROM regexp_matches(content, 'discussion-image(?:/|\\/|%2[Ff])([0-9a-f]{32})', 'g') AS m
$function$
function CREATE OR REPLACE FUNCTION public.discussion_reactions_recount()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'core', 'learning', 'ai', 'analytics', 'ops', 'extensions', 'pg_temp'
AS $function$
BEGIN
    IF TG_OP <> 'INSERT' THEN
        UPDATE course_discussions SET
            likes_count = likes_count - (OLD.reaction = 'like')::int,
            dislikes_count = dislikes_count - (OLD.reaction = 'dislike')::int
        WHERE id = OLD.discussion_id;
    END IF;
    IF TG_OP <> 'DELETE' THEN
        UPDATE course_discussions SET
            likes_count = likes_count + (NEW.reaction = 'like')::int,
            dislikes_count = dislikes_count + (NEW.reaction = 'dislike')::int
        WHERE id = NEW.discussion_id;
    END IF;
    RETURN NULL;
END $function$
function CREATE OR REPLACE FUNCTION public.ensure_app_search_path()
 RETURNS text
 LANGUAGE plpgsql
AS $function$
DECLARE
    level text := 'database';
BEGIN
    IF (SELECT pg_has_role(datdba, 'USAGE') FROM pg_database WHERE datname = current_database()) THEN
        EXECUTE format('ALTER DATABASE %I SET search_path = %s', current_database(), app_search_path());
    ELSE
        level := 'role';
        EXECUTE format('ALTER ROLE %I IN DATABASE %I SET search_path = %s', current_user,
                       current_database(), app_search_path());
    END IF;
    PERFORM set_config('search_path', app_search_path(), false);
    RETURN level;
END
$function$
function CREATE OR REPLACE FUNCTION public.file_grading_entries_immutable()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'core', 'learning', 'ai', 'analytics', 'ops', 'extensions', 'pg_temp'
AS $function$
BEGIN
    IF to_jsonb(NEW) - 'graded_by' IS DISTINCT FROM to_jsonb(OLD) - 'graded_by'
       OR NEW.graded_by IS NOT NULL THEN
        RAISE EXCEPTION 'file_grading_entries is append-only' USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    RETURN NEW;
END;
$function$
function CREATE OR REPLACE FUNCTION public.file_grading_entries_no_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'core', 'learning', 'ai', 'analytics', 'ops', 'extensions', 'pg_temp'
AS $function$
BEGIN
    IF EXISTS (SELECT 1 FROM file_submission_attempts WHERE id = OLD.attempt_id) THEN
        RAISE EXCEPTION 'file_grading_entries is append-only' USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    RETURN OLD;
END;
$function$
function CREATE OR REPLACE FUNCTION public.file_grading_entries_number()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'core', 'learning', 'ai', 'analytics', 'ops', 'extensions', 'pg_temp'
AS $function$
BEGIN
    PERFORM 1 FROM file_submission_attempts WHERE id = NEW.attempt_id FOR NO KEY UPDATE;
    SELECT COALESCE(max(revision), 0) + 1 INTO NEW.revision
      FROM file_grading_entries WHERE attempt_id = NEW.attempt_id;
    RETURN NEW;
END;
$function$
function CREATE OR REPLACE FUNCTION public.grading_entries_current_check()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'core', 'learning', 'ai', 'analytics', 'ops', 'extensions', 'pg_temp'
AS $function$
BEGIN
    PERFORM submission_grade_matches_journal(NEW.submission_id);
    RETURN NULL;
END;
$function$
function CREATE OR REPLACE FUNCTION public.grading_entries_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'core', 'learning', 'ai', 'analytics', 'ops', 'extensions', 'pg_temp'
AS $function$
BEGIN
    IF to_jsonb(NEW) - 'published_at' - 'graded_by' IS DISTINCT FROM to_jsonb(OLD) - 'published_at' - 'graded_by'
       OR (NEW.graded_by IS DISTINCT FROM OLD.graded_by AND NEW.graded_by IS NOT NULL) THEN
        RAISE EXCEPTION 'grading_entries rows are immutable except published_at'
            USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    RETURN NEW;
END;
$function$
function CREATE OR REPLACE FUNCTION public.grading_entries_no_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'core', 'learning', 'ai', 'analytics', 'ops', 'extensions', 'pg_temp'
AS $function$
BEGIN
    IF EXISTS (SELECT 1 FROM submissions WHERE id = OLD.submission_id) THEN
        RAISE EXCEPTION 'grading_entries is append-only' USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    RETURN OLD;
END;
$function$
function CREATE OR REPLACE FUNCTION public.grading_entries_number()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'core', 'learning', 'ai', 'analytics', 'ops', 'extensions', 'pg_temp'
AS $function$
BEGIN
    -- Two graders saving at once take turns on the submission, so the second reads the first's number.
    PERFORM 1 FROM submissions WHERE id = NEW.submission_id FOR NO KEY UPDATE;
    SELECT COALESCE(max(revision), 0) + 1 INTO NEW.revision
      FROM grading_entries WHERE submission_id = NEW.submission_id;
    RETURN NEW;
END;
$function$
function CREATE OR REPLACE FUNCTION public.grading_entries_points()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'core', 'learning', 'ai', 'analytics', 'ops', 'extensions', 'pg_temp'
AS $function$
BEGIN
    SELECT v.max_points INTO NEW.max_points
    FROM submissions s JOIN assessment_versions v ON v.id = s.assessment_version_id
    WHERE s.id = NEW.submission_id;
    NEW.raw_points := points_of_percent(NEW.raw_score::numeric, NEW.max_points);
    NEW.final_points := points_of_percent(NEW.final_score::numeric, NEW.max_points);
    RETURN NEW;
END
$function$
function CREATE OR REPLACE FUNCTION public.has_course_role(p_course uuid, p_user uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
AS $function$
    SELECT EXISTS (SELECT 1 FROM course_staff cs
                   WHERE cs.course_id = p_course AND cs.user_id = p_user
                     AND cs.status = 'active' AND cs.authorship <> 'reporter')
$function$
function CREATE OR REPLACE FUNCTION public.inet_or_null(p text)
 RETURNS inet
 LANGUAGE plpgsql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO 'public', 'core', 'learning', 'ai', 'analytics', 'ops', 'extensions', 'pg_temp'
AS $function$
BEGIN
    IF pg_input_is_valid(p, 'inet') THEN
        RETURN p::inet;
    END IF;
    RETURN NULL;
END $function$
function CREATE OR REPLACE FUNCTION public.is_course_staff(p_course uuid, p_user uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
AS $function$
    SELECT has_course_role(p_course, p_user) OR is_platform_author(p_user)
$function$
function CREATE OR REPLACE FUNCTION public.is_platform_author(p_user uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
AS $function$
    SELECT EXISTS (SELECT 1 FROM user_roles ur JOIN role_permissions rp ON rp.role_id = ur.role_id
                   WHERE ur.user_id = p_user
                     AND rp.resource IN ('*', 'assessment')
                     AND rp.action IN ('*', 'author')
                     AND rp.scope IN ('', '*', 'platform', 'all'))
$function$
function CREATE OR REPLACE FUNCTION public.item_feedback_frozen()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'core', 'learning', 'ai', 'analytics', 'ops', 'extensions', 'pg_temp'
AS $function$
DECLARE
    -- What erasure and deletes may clear: the grader, the item and the annotation's upload.
    cleared constant text[] := ARRAY['graded_by', 'item_id', 'annotation_upload_id', 'updated_at'];
BEGIN
    IF (to_jsonb(NEW) - cleared) IS DISTINCT FROM (to_jsonb(OLD) - cleared)
       OR (NEW.graded_by IS DISTINCT FROM OLD.graded_by AND NEW.graded_by IS NOT NULL)
       OR (NEW.item_id IS DISTINCT FROM OLD.item_id AND NEW.item_id IS NOT NULL) THEN
        RAISE EXCEPTION 'item_feedback rows are part of their grade entry: append a new entry'
            USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    RETURN NEW;
END;
$function$
function CREATE OR REPLACE FUNCTION public.percent_of_points(points numeric, max_points numeric)
 RETURNS numeric
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
RETURN CASE WHEN (max_points > (0)::numeric) THEN round(((points * (100)::numeric) / max_points), 2) ELSE NULL::numeric END
function CREATE OR REPLACE FUNCTION public.pin_function_search_paths()
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'public', 'core', 'learning', 'ai', 'analytics', 'ops', 'extensions', 'pg_temp'
AS $function$
DECLARE
    f regprocedure;
    pinned integer := 0;
BEGIN
    FOR f IN
        SELECT p.oid::regprocedure FROM pg_proc p
        JOIN pg_language l ON l.oid = p.prolang
        WHERE p.pronamespace::regnamespace::name = ANY (ARRAY['public']::name[] || app_schemas())
          AND l.lanname = 'plpgsql'
          AND pg_has_role(p.proowner, 'USAGE')
          AND NOT EXISTS (SELECT FROM unnest(p.proconfig) c WHERE c LIKE 'search\_path=%')
          -- ensure_app_search_path sets the caller's path: a pinned one would be restored on return
          AND p.prosrc NOT LIKE '%search\_path%'
          AND NOT EXISTS (SELECT FROM pg_depend d
                          WHERE d.classid = 'pg_proc'::regclass AND d.objid = p.oid AND d.deptype = 'e')
    LOOP
        EXECUTE format('ALTER FUNCTION %s SET search_path = %s, pg_temp', f, app_search_path());
        pinned := pinned + 1;
    END LOOP;
    RETURN pinned;
END
$function$
function CREATE OR REPLACE FUNCTION public.place_app_tables()
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'public', 'core', 'learning', 'ai', 'analytics', 'ops', 'extensions', 'pg_temp'
AS $function$
DECLARE
    r record;
    moved integer := 0;
BEGIN
    FOR r IN
        SELECT c.relname, c.relkind,
               CASE WHEN root.relnamespace IS NOT NULL AND root.relnamespace <> c.relnamespace
                    THEN root.relnamespace::regnamespace::name
                    ELSE app_table_schema(coalesce(root.relname, c.relname)) END AS target
        FROM pg_class c
        LEFT JOIN pg_class root ON c.relispartition AND root.oid = pg_partition_root(c.oid)
        WHERE c.relnamespace = 'public'::regnamespace
          AND pg_has_role(c.relowner, 'USAGE')
          AND c.relkind IN ('r', 'p', 'v', 'm', 'S')
          AND c.relname <> '_sqlx_migrations'
          -- not an extension's member; a sequence owned by a column moves with its table
          AND NOT EXISTS (SELECT FROM pg_depend d
                          WHERE d.classid = 'pg_class'::regclass AND d.objid = c.oid
                            AND (d.deptype = 'e'
                                 OR (c.relkind = 'S' AND d.deptype IN ('a', 'i')
                                     AND d.refclassid = 'pg_class'::regclass AND d.refobjid <> c.oid)))
        ORDER BY c.relispartition, c.relname
    LOOP
        EXECUTE format('ALTER %s public.%I SET SCHEMA %I',
                       CASE r.relkind WHEN 'v' THEN 'VIEW' WHEN 'm' THEN 'MATERIALIZED VIEW'
                                      WHEN 'S' THEN 'SEQUENCE' ELSE 'TABLE' END,
                       r.relname, r.target);
        moved := moved + 1;
    END LOOP;
    RETURN moved;
END
$function$
function CREATE OR REPLACE FUNCTION public.platform_date(at timestamp with time zone)
 RETURNS date
 LANGUAGE sql
 STABLE PARALLEL SAFE STRICT
RETURN ((at AT TIME ZONE platform_time_zone()))::date
function CREATE OR REPLACE FUNCTION public.platform_day_start(day date)
 RETURNS timestamp with time zone
 LANGUAGE sql
 STABLE PARALLEL SAFE STRICT
RETURN ((day)::timestamp without time zone AT TIME ZONE platform_time_zone())
function CREATE OR REPLACE FUNCTION public.platform_time_zone()
 RETURNS text
 LANGUAGE sql
 STABLE PARALLEL SAFE
RETURN COALESCE(NULLIF(current_setting('ab.time_zone'::text, true), ''::text), 'Asia/Almaty'::text)
function CREATE OR REPLACE FUNCTION public.points_of_percent(percent numeric, max_points numeric)
 RETURNS numeric
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
RETURN round(((percent * max_points) / (100)::numeric), 2)
function CREATE OR REPLACE FUNCTION public.post_uploads_sync()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'core', 'learning', 'ai', 'analytics', 'ops', 'extensions', 'pg_temp'
AS $function$
BEGIN
    IF TG_OP = 'UPDATE' THEN
        IF NEW.content IS NOT DISTINCT FROM OLD.content THEN
            RETURN NULL;
        END IF;
        DELETE FROM post_uploads WHERE discussion_id = NEW.id;
    END IF;
    INSERT INTO post_uploads (discussion_id, upload_id)
    SELECT NEW.id, u.id FROM uploads u WHERE u.key IN (SELECT discussion_image_keys(NEW.content))
    ON CONFLICT DO NOTHING;
    RETURN NULL;
END $function$
function CREATE OR REPLACE FUNCTION public.prune_auth_audit_log(days integer, batch integer)
 RETURNS bigint
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'ops', 'pg_temp'
AS $function$
    WITH gone AS (
        DELETE FROM ops.auth_audit_log WHERE id IN (
            SELECT id FROM ops.auth_audit_log
            WHERE created_at < now() - make_interval(days => greatest(days, 30))
            LIMIT least(greatest(batch, 1), 10000))
        RETURNING 1)
    SELECT count(*) FROM gone
$function$
function CREATE OR REPLACE FUNCTION public.schema_try_check(p_table regclass, p_name text, p_expr text)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO 'public', 'core', 'learning', 'ai', 'analytics', 'ops', 'extensions', 'pg_temp'
AS $function$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conrelid = p_table AND c.conname = p_name) THEN
        EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I CHECK (%s) NOT VALID', p_table, p_name, p_expr);
    END IF;
    BEGIN
        EXECUTE format('ALTER TABLE %s VALIDATE CONSTRAINT %I', p_table, p_name);
    EXCEPTION WHEN check_violation THEN
        EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', p_table, p_name);
        INSERT INTO schema_skipped_checks AS s (name, table_name, expr)
        VALUES (p_name, p_table::text, p_expr)
        ON CONFLICT ON CONSTRAINT schema_skipped_checks_pkey
        DO UPDATE SET expr = EXCLUDED.expr, skipped_at = now();
        RAISE WARNING 'schema_try_check: % skipped, existing rows violate %', p_name, p_expr;
        RETURN false;
    END;
    DELETE FROM schema_skipped_checks s WHERE s.name = p_name;
    RETURN true;
END $function$
function CREATE OR REPLACE FUNCTION public.schema_try_fk(p_table regclass, p_name text, p_definition text)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO 'public', 'core', 'learning', 'ai', 'analytics', 'ops', 'extensions', 'pg_temp'
AS $function$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conrelid = p_table AND c.conname = p_name) THEN
        EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I %s NOT VALID', p_table, p_name, p_definition);
    END IF;
    BEGIN
        EXECUTE format('ALTER TABLE %s VALIDATE CONSTRAINT %I', p_table, p_name);
    EXCEPTION WHEN foreign_key_violation THEN
        INSERT INTO schema_skipped_checks AS s (name, table_name, expr)
        VALUES (p_name, p_table::text, p_definition)
        ON CONFLICT ON CONSTRAINT schema_skipped_checks_pkey
        DO UPDATE SET expr = EXCLUDED.expr, skipped_at = now();
        RAISE WARNING 'schema_try_fk: % stays NOT VALID, existing rows violate it', p_name;
        RETURN false;
    END;
    DELETE FROM schema_skipped_checks s WHERE s.name = p_name;
    RETURN true;
END $function$
function CREATE OR REPLACE FUNCTION public.search_fold(t text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
RETURN translate(lower(t), 'авекмнорстухіәғқңөұүһёи'::text, 'abekmhopctyxiaгkhoyyxei'::text)
function CREATE OR REPLACE FUNCTION public.snapshot_max_points(items jsonb)
 RETURNS numeric
 LANGUAGE sql
 IMMUTABLE
AS $function$
    SELECT coalesce(round(sum(CASE WHEN jsonb_typeof(i->'max_score') = 'number'
                                   THEN greatest((i->>'max_score')::numeric, 0) ELSE 0 END), 2), 0)
    FROM jsonb_array_elements(CASE WHEN jsonb_typeof(items->'items') = 'array'
                                   THEN items->'items' ELSE '[]'::jsonb END) i
$function$
function CREATE OR REPLACE FUNCTION public.submission_breakdown(p_submission uuid, p_auto_breakdown jsonb)
 RETURNS jsonb
 LANGUAGE sql
 STABLE PARALLEL SAFE
RETURN COALESCE((SELECT e.effective_breakdown FROM grading_entries e WHERE (e.submission_id = submission_breakdown.p_submission) ORDER BY e.revision DESC LIMIT 1), p_auto_breakdown, '{}'::jsonb)
function CREATE OR REPLACE FUNCTION public.submission_grade_matches_journal(p_submission uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'core', 'learning', 'ai', 'analytics', 'ops', 'extensions', 'pg_temp'
AS $function$
DECLARE
    sub record;
    entry record;
BEGIN
    SELECT final_score INTO sub FROM submissions WHERE id = p_submission;
    IF NOT FOUND THEN
        RETURN;
    END IF;
    SELECT final_score INTO entry FROM grading_entries
    WHERE submission_id = p_submission ORDER BY revision DESC LIMIT 1;
    IF NOT FOUND THEN
        RETURN;
    END IF;
    IF sub.final_score IS DISTINCT FROM entry.final_score THEN
        RAISE EXCEPTION 'submission % final_score % differs from its latest grade entry (%)',
            p_submission, sub.final_score, entry.final_score
            USING ERRCODE = 'check_violation';
    END IF;
END;
$function$
function CREATE OR REPLACE FUNCTION public.submission_violation_log(p_submission uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'core', 'learning', 'ai', 'analytics', 'ops', 'extensions', 'pg_temp'
AS $function$
    SELECT coalesce(jsonb_agg(e.event ORDER BY e.created_at, e.id), '[]'::jsonb)
      FROM (SELECT v.event, v.created_at, v.id FROM submission_violations v
             WHERE v.submission_id = p_submission
             ORDER BY v.created_at DESC, v.id DESC LIMIT 200) e
$function$
function CREATE OR REPLACE FUNCTION public.submissions_current_grade_check()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'core', 'learning', 'ai', 'analytics', 'ops', 'extensions', 'pg_temp'
AS $function$
BEGIN
    PERFORM submission_grade_matches_journal(NEW.id);
    RETURN NULL;
END;
$function$
function CREATE OR REPLACE FUNCTION public.submissions_snapshots_frozen()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'core', 'learning', 'ai', 'analytics', 'ops', 'extensions', 'pg_temp'
AS $function$
BEGIN
    IF (OLD.items_snapshot IS NOT NULL AND NEW.items_snapshot IS DISTINCT FROM OLD.items_snapshot)
       OR (OLD.policy_snapshot IS NOT NULL AND NEW.policy_snapshot IS DISTINCT FROM OLD.policy_snapshot)
       OR (OLD.assessment_version_id IS NOT NULL
           AND NEW.assessment_version_id IS DISTINCT FROM OLD.assessment_version_id) THEN
        RAISE EXCEPTION 'a submission''s snapshots are written once'
            USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    RETURN NEW;
END;
$function$
function CREATE OR REPLACE FUNCTION public.text_list_ok(items text[], max_items integer, max_len integer)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
AS $function$
    SELECT cardinality(items) <= max_items
       AND NOT EXISTS (
           SELECT 1 FROM unnest(items) AS t (v)
            WHERE v IS NULL OR v <> btrim(v) OR v = '' OR char_length(v) > max_len)
       AND (SELECT count(DISTINCT lower(v)) FROM unnest(items) AS t (v)) = cardinality(items)
$function$
function CREATE OR REPLACE FUNCTION public.touch_row()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'core', 'learning', 'ai', 'analytics', 'ops', 'extensions', 'pg_temp'
AS $function$
DECLARE
    changed boolean := false;
BEGIN
    IF TG_ARGV[0] = 'version' THEN
        IF NEW.version = OLD.version THEN
            IF TG_NARGS = 1 THEN
                changed := NEW IS DISTINCT FROM OLD;
            ELSE
                FOR i IN 1 .. TG_NARGS - 1 LOOP
                    changed := changed
                        OR to_jsonb(NEW) -> TG_ARGV[i] IS DISTINCT FROM to_jsonb(OLD) -> TG_ARGV[i];
                END LOOP;
            END IF;
            IF changed THEN
                NEW.version := OLD.version + 1;
            END IF;
        END IF;
    END IF;
    IF current_setting('ab.bookkeeping', true) IS DISTINCT FROM 'on' THEN
        NEW.updated_at := now();
    END IF;
    RETURN NEW;
END $function$
function CREATE OR REPLACE FUNCTION public.translations_touch_platform()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'core', 'learning', 'ai', 'analytics', 'ops', 'extensions', 'pg_temp'
AS $function$
DECLARE
    r translations;
BEGIN
    IF TG_OP = 'DELETE' THEN
        r := OLD;
    ELSE
        r := NEW;
    END IF;
    IF r.entity = 'platform' THEN
        UPDATE platforms SET version = version + 1 WHERE id = r.entity_id;
    END IF;
    RETURN NULL;
END $function$
function CREATE OR REPLACE FUNCTION public.upload_ids_from_keys()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'core', 'learning', 'ai', 'analytics', 'ops', 'extensions', 'pg_temp'
AS $function$
DECLARE
    i integer;
    k text;
BEGIN
    FOR i IN 0 .. TG_NARGS / 2 - 1 LOOP
        k := to_jsonb(NEW) ->> TG_ARGV[2 * i];
        NEW := jsonb_populate_record(NEW, jsonb_build_object(
            TG_ARGV[2 * i + 1], (SELECT u.id FROM uploads u WHERE u.key = k)));
    END LOOP;
    RETURN NEW;
END $function$
function CREATE OR REPLACE FUNCTION public.upload_referenced(p_upload uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE PARALLEL SAFE
AS $function$
    SELECT EXISTS (SELECT 1 FROM file_submission_files WHERE upload_id = p_upload)
        OR EXISTS (SELECT 1 FROM block_uploads WHERE upload_id = p_upload)
        OR EXISTS (SELECT 1 FROM post_uploads WHERE upload_id = p_upload)
        OR EXISTS (SELECT 1 FROM users WHERE avatar_upload_id = p_upload)
        OR EXISTS (SELECT 1 FROM courses WHERE thumbnail_image_upload_id = p_upload)
        OR EXISTS (SELECT 1 FROM courses WHERE thumbnail_video_upload_id = p_upload)
        OR EXISTS (SELECT 1 FROM chapters WHERE thumbnail_upload_id = p_upload)
        OR EXISTS (SELECT 1 FROM collections WHERE cover_upload_id = p_upload)
        OR EXISTS (SELECT 1 FROM platforms WHERE logo_upload_id = p_upload)
        OR EXISTS (SELECT 1 FROM platforms WHERE thumbnail_upload_id = p_upload)
        OR EXISTS (SELECT 1 FROM item_feedback WHERE annotation_upload_id = p_upload)
$function$
function CREATE OR REPLACE FUNCTION public.users_reissue_certificates()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'core', 'learning', 'ai', 'analytics', 'ops', 'extensions', 'pg_temp'
AS $function$
BEGIN
    UPDATE certificate_users SET holder_name = NEW.display_name, reissued_at = now()
     WHERE user_id = NEW.id;
    RETURN NULL;
END;
$function$
function CREATE OR REPLACE FUNCTION public.users_sync_state()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'core', 'learning', 'ai', 'analytics', 'ops', 'extensions', 'pg_temp'
AS $function$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.email_verified THEN
            NEW.email_verified_at := coalesce(NEW.email_verified_at, now());
        ELSIF NEW.email_verified_at IS NOT NULL THEN
            NEW.email_verified := true;
        END IF;
        RETURN NEW;
    END IF;
    IF NEW.email_verified IS DISTINCT FROM OLD.email_verified THEN
        NEW.email_verified_at := CASE WHEN NEW.email_verified
                                      THEN coalesce(NEW.email_verified_at, OLD.email_verified_at, now()) END;
    ELSIF NEW.email_verified_at IS DISTINCT FROM OLD.email_verified_at THEN
        NEW.email_verified := NEW.email_verified_at IS NOT NULL;
    END IF;
    RETURN NEW;
END $function$
index CREATE INDEX activities_course_idx ON core.activities USING btree (course_id)
index CREATE INDEX activities_search_trgm_idx ON core.activities USING gin (search_fold(name) gin_trgm_ops)
index CREATE INDEX activity_progress_activity_state_idx ON learning.activity_progress USING btree (activity_id, state)
index CREATE INDEX activity_progress_best_submission_idx ON learning.activity_progress USING btree (best_submission_id)
index CREATE INDEX activity_progress_course_user_idx ON learning.activity_progress USING btree (course_id, user_id)
index CREATE INDEX activity_progress_latest_submission_idx ON learning.activity_progress USING btree (latest_submission_id)
index CREATE INDEX activity_progress_teacher_action_idx ON learning.activity_progress USING btree (course_id) WHERE teacher_action_required
index CREATE INDEX activity_progress_user_idx ON learning.activity_progress USING btree (user_id)
index CREATE INDEX ai_approvals_run_idx ON ai.ai_approvals USING btree (run_id)
index CREATE INDEX ai_approvals_status_idx ON ai.ai_approvals USING btree (status, expires_at)
index CREATE INDEX ai_artifacts_run_kind_idx ON ai.ai_artifacts USING btree (run_id, kind, created_at)
index CREATE INDEX ai_course_analyses_course_status_idx ON ai.ai_course_analyses USING btree (course_id, status, created_at DESC)
index CREATE INDEX ai_course_analyses_run_idx ON ai.ai_course_analyses USING btree (run_id)
index CREATE INDEX ai_course_settings_enabled_by_idx ON ai.ai_course_settings USING btree (enabled_by)
index CREATE INDEX ai_eval_results_dataset_idx ON ai.ai_eval_results USING btree (dataset, created_at DESC)
index CREATE INDEX ai_eval_results_run_idx ON ai.ai_eval_results USING btree (run_id)
index CREATE INDEX ai_events_created_brin ON ai.ai_events USING brin (created_at)
index CREATE INDEX ai_evidence_artifact_idx ON ai.ai_evidence USING btree (artifact_id)
index CREATE INDEX ai_evidence_run_idx ON ai.ai_evidence USING btree (run_id, source_type, created_at)
index CREATE INDEX ai_grade_corrections_activity_idx ON ai.ai_grade_corrections USING btree (activity_id, part_key, criterion_key, created_at DESC)
index CREATE INDEX ai_grade_corrections_course_idx ON ai.ai_grade_corrections USING btree (course_id, created_at DESC)
index CREATE INDEX ai_grade_corrections_teacher_idx ON ai.ai_grade_corrections USING btree (teacher_id)
index CREATE INDEX ai_grade_drafts_activity_idx ON ai.ai_grade_drafts USING btree (activity_id, status, created_at DESC)
index CREATE INDEX ai_grade_drafts_attempt_idx ON ai.ai_grade_drafts USING btree (file_attempt_id, created_at DESC)
index CREATE INDEX ai_grade_drafts_course_idx ON ai.ai_grade_drafts USING btree (course_id, created_at DESC)
index CREATE INDEX ai_grade_drafts_decided_by_idx ON ai.ai_grade_drafts USING btree (decided_by)
index CREATE INDEX ai_grade_drafts_learner_idx ON ai.ai_grade_drafts USING btree (learner_id)
index CREATE INDEX ai_grade_drafts_requested_by_idx ON ai.ai_grade_drafts USING btree (requested_by)
index CREATE INDEX ai_grade_drafts_run_idx ON ai.ai_grade_drafts USING btree (run_id)
index CREATE INDEX ai_grade_drafts_submission_idx ON ai.ai_grade_drafts USING btree (submission_id, created_at DESC)
index CREATE INDEX ai_lecture_reviews_activity_status_idx ON ai.ai_lecture_reviews USING btree (activity_id, status, created_at DESC)
index CREATE INDEX ai_lecture_reviews_course_status_idx ON ai.ai_lecture_reviews USING btree (course_id, status, created_at DESC)
index CREATE INDEX ai_lecture_reviews_run_idx ON ai.ai_lecture_reviews USING btree (run_id)
index CREATE INDEX ai_qa_messages_course_user_idx ON ai.ai_qa_messages USING btree (course_id, user_id, created_at DESC)
index CREATE INDEX ai_qa_messages_thread_order_idx ON ai.ai_qa_messages USING btree (thread_id, created_at, id)
index CREATE INDEX ai_qa_messages_user_idx ON ai.ai_qa_messages USING btree (user_id)
index CREATE INDEX ai_remediation_sessions_activity_idx ON ai.ai_remediation_sessions USING btree (activity_id)
index CREATE INDEX ai_remediation_sessions_analysis_idx ON ai.ai_remediation_sessions USING btree (analysis_id)
index CREATE INDEX ai_remediation_sessions_attempt_idx ON ai.ai_remediation_sessions USING btree (file_submission_attempt_id, created_at DESC) WHERE (file_submission_attempt_id IS NOT NULL)
index CREATE INDEX ai_remediation_sessions_run_idx ON ai.ai_remediation_sessions USING btree (run_id)
index CREATE INDEX ai_remediation_sessions_student_activity_idx ON ai.ai_remediation_sessions USING btree (student_user_id, activity_id, status)
index CREATE INDEX ai_remediation_sessions_student_idx ON ai.ai_remediation_sessions USING btree (student_user_id, created_at DESC)
index CREATE INDEX ai_remediation_sessions_submission_idx ON ai.ai_remediation_sessions USING btree (submission_id, created_at DESC)
index CREATE INDEX ai_runs_started_idx ON ai.ai_runs USING btree (started_at DESC, id DESC)
index CREATE INDEX ai_runs_status_idx ON ai.ai_runs USING btree (status, started_at DESC)
index CREATE INDEX ai_runs_thread_status_idx ON ai.ai_runs USING btree (thread_id, status, started_at DESC)
index CREATE INDEX ai_runs_triggered_by_idx ON ai.ai_runs USING btree (triggered_by, started_at DESC)
index CREATE INDEX ai_student_memory_source_idx ON ai.ai_student_memory USING btree (source_type, source_id)
index CREATE INDEX ai_student_memory_student_course_idx ON ai.ai_student_memory USING btree (student_user_id, course_id, updated_at DESC)
index CREATE INDEX ai_submission_analyses_attempt_idx ON ai.ai_submission_analyses USING btree (file_submission_attempt_id, status, created_at DESC) WHERE (file_submission_attempt_id IS NOT NULL)
index CREATE INDEX ai_submission_analyses_run_idx ON ai.ai_submission_analyses USING btree (run_id)
index CREATE INDEX ai_submission_analyses_submission_idx ON ai.ai_submission_analyses USING btree (submission_id, status, created_at DESC)
index CREATE INDEX ai_threads_activity_idx ON ai.ai_threads USING btree (activity_id)
index CREATE INDEX ai_threads_course_activity_idx ON ai.ai_threads USING btree (course_id, activity_id, updated_at DESC)
index CREATE INDEX ai_threads_course_user_idx ON ai.ai_threads USING btree (course_id, user_id, updated_at DESC)
index CREATE INDEX ai_threads_user_role_idx ON ai.ai_threads USING btree (user_id, role, updated_at DESC)
index CREATE INDEX ai_token_ledger_user_idx ON ai.ai_token_ledger USING btree (user_id)
index CREATE INDEX ai_token_reservations_run_idx ON ai.ai_token_reservations USING btree (run_id) WHERE (run_id IS NOT NULL)
index CREATE INDEX ai_work_embeddings_activity_idx ON ai.ai_work_embeddings USING btree (activity_id)
index CREATE INDEX analytics_events_activity_idx ON ONLY analytics.analytics_events USING btree (activity_id)
index CREATE INDEX analytics_events_assessment_idx ON ONLY analytics.analytics_events USING btree (assessment_id)
index CREATE INDEX analytics_events_course_time_idx ON ONLY analytics.analytics_events USING btree (course_id, occurred_at DESC)
index CREATE INDEX analytics_events_occurred_brin ON ONLY analytics.analytics_events USING brin (occurred_at)
index CREATE INDEX analytics_events_submission_idx ON ONLY analytics.analytics_events USING btree (submission_id)
index CREATE INDEX analytics_events_user_time_idx ON ONLY analytics.analytics_events USING btree (user_id, occurred_at DESC)
index CREATE INDEX assessment_access_usergroups_group_idx ON learning.assessment_access_usergroups USING btree (usergroup_id)
index CREATE INDEX assessment_access_users_user_idx ON learning.assessment_access_users USING btree (user_id)
index CREATE INDEX assessment_audit_events_idx ON learning.assessment_audit_events USING btree (assessment_id, created_at DESC)
index CREATE INDEX assessment_overrides_user_idx ON learning.assessment_overrides USING btree (user_id)
index CREATE INDEX assessments_course_idx ON learning.assessments USING btree (course_id)
index CREATE INDEX assessments_due_publish_idx ON learning.assessments USING btree (scheduled_at) WHERE (lifecycle = 'scheduled'::text)
index CREATE INDEX auth_audit_log_created_brin ON ops.auth_audit_log USING brin (created_at)
index CREATE INDEX auth_audit_log_event_idx ON ops.auth_audit_log USING btree (event, created_at DESC)
index CREATE INDEX auth_audit_log_user_idx ON ops.auth_audit_log USING btree (user_id, created_at DESC)
index CREATE INDEX block_uploads_upload_idx ON core.block_uploads USING btree (upload_id)
index CREATE INDEX blocks_activity_idx ON core.blocks USING btree (activity_id)
index CREATE INDEX bulk_actions_assessment_idx ON learning.bulk_actions USING btree (assessment_id, status)
index CREATE INDEX certificate_users_user_idx ON learning.certificate_users USING btree (user_id)
index CREATE INDEX certifications_course_idx ON learning.certifications USING btree (course_id)
index CREATE INDEX chapters_thumbnail_upload_id_idx ON core.chapters USING btree (thumbnail_upload_id) WHERE (thumbnail_upload_id IS NOT NULL)
index CREATE INDEX code_runs_assessment_user_idx ON learning.code_runs USING btree (assessment_id, user_id)
index CREATE INDEX code_runs_created_brin ON learning.code_runs USING brin (created_at)
index CREATE INDEX code_runs_item_idx ON learning.code_runs USING btree (item_id, user_id, created_at DESC)
index CREATE INDEX code_runs_submission_idx ON learning.code_runs USING btree (submission_id)
index CREATE INDEX collection_courses_course_idx ON core.collection_courses USING btree (course_id)
index CREATE INDEX collection_staff_user_idx ON core.collection_staff USING btree (user_id)
index CREATE INDEX collections_cover_upload_id_idx ON core.collections USING btree (cover_upload_id) WHERE (cover_upload_id IS NOT NULL)
index CREATE INDEX collections_search_trgm_idx ON core.collections USING gin (search_fold(((name || ' '::text) || description)) gin_trgm_ops)
index CREATE INDEX completions_user_idx ON learning.completions USING btree (user_id)
index CREATE INDEX concept_mastery_concept_idx ON learning.concept_mastery USING btree (concept_id)
index CREATE INDEX concept_mastery_course_idx ON learning.concept_mastery USING btree (course_id, concept_id)
index CREATE INDEX concept_prerequisites_concept_course_idx ON learning.concept_prerequisites USING btree (concept_id, course_id)
index CREATE INDEX concept_prerequisites_requires_idx ON learning.concept_prerequisites USING btree (requires_id, course_id)
index CREATE INDEX concept_tags_activity_idx ON learning.concept_tags USING btree (activity_id, item_id)
index CREATE INDEX concept_tags_concept_course_idx ON learning.concept_tags USING btree (concept_id, course_id)
index CREATE INDEX concept_tags_course_idx ON learning.concept_tags USING btree (course_id, status)
index CREATE INDEX concept_tags_decided_by_idx ON learning.concept_tags USING btree (decided_by)
index CREATE INDEX concept_tags_item_idx ON learning.concept_tags USING btree (item_id)
index CREATE INDEX concept_tags_run_idx ON learning.concept_tags USING btree (run_id)
index CREATE INDEX content_chunks_activity_idx ON ai.content_chunks USING btree (activity_id)
index CREATE INDEX content_chunks_course_audience_idx ON ai.content_chunks USING btree (course_id, audience)
index CREATE INDEX content_chunks_embedding_hash_idx ON ai.content_chunks USING hnsw (embedding halfvec_cosine_ops) WHERE (embedding_model = 'hash-ngram-v1'::text)
index CREATE INDEX content_chunks_embedding_te3_small_idx ON ai.content_chunks USING hnsw (embedding halfvec_cosine_ops) WHERE (embedding_model = 'text-embedding-3-small'::text)
index CREATE INDEX content_chunks_lexeme_idx ON ai.content_chunks USING gin (lexeme)
index CREATE INDEX content_index_state_activity_idx ON ai.content_index_state USING btree (activity_id)
index CREATE INDEX content_index_state_course_idx ON ai.content_index_state USING btree (course_id)
index CREATE INDEX course_concepts_decided_by_idx ON learning.course_concepts USING btree (decided_by)
index CREATE INDEX course_concepts_run_idx ON learning.course_concepts USING btree (run_id)
index CREATE INDEX course_discussions_course_idx ON core.course_discussions USING btree (course_id, created_at DESC)
index CREATE INDEX course_discussions_parent_idx ON core.course_discussions USING btree (parent_id)
index CREATE INDEX course_discussions_posts_keyset_idx ON core.course_discussions USING btree (course_id, id DESC) WHERE ((parent_id IS NULL) AND (status = 'active'::text))
index CREATE INDEX course_discussions_replies_keyset_idx ON core.course_discussions USING btree (parent_id, id) WHERE (status = 'active'::text)
index CREATE INDEX course_progress_user_idx ON learning.course_progress USING btree (user_id)
index CREATE INDEX course_staff_user_idx ON core.course_staff USING btree (user_id, course_id)
index CREATE INDEX course_update_activities_activity_idx ON core.course_update_activities USING btree (activity_id)
index CREATE INDEX course_updates_course_idx ON core.course_updates USING btree (course_id, created_at DESC)
index CREATE INDEX courses_deleted_idx ON core.courses USING btree (deleted_at) WHERE (deleted_at IS NOT NULL)
index CREATE INDEX courses_public_idx ON core.courses USING btree (public, created_at DESC)
index CREATE INDEX courses_search_trgm_idx ON core.courses USING gin (search_fold(((((name || ' '::text) || description) || ' '::text) || COALESCE(about, ''::text))) gin_trgm_ops)
index CREATE INDEX courses_thumbnail_image_upload_id_idx ON core.courses USING btree (thumbnail_image_upload_id) WHERE (thumbnail_image_upload_id IS NOT NULL)
index CREATE INDEX courses_thumbnail_video_upload_id_idx ON core.courses USING btree (thumbnail_video_upload_id) WHERE (thumbnail_video_upload_id IS NOT NULL)
index CREATE INDEX daily_assessment_metrics_activity_idx ON analytics.daily_assessment_metrics USING btree (activity_id)
index CREATE INDEX daily_assessment_metrics_assessment_idx ON analytics.daily_assessment_metrics USING btree (assessment_id)
index CREATE INDEX daily_assessment_metrics_course_idx ON analytics.daily_assessment_metrics USING btree (course_id, metric_date DESC)
index CREATE INDEX daily_assessment_metrics_date_brin ON analytics.daily_assessment_metrics USING brin (metric_date)
index CREATE INDEX daily_course_engagement_activity_idx ON analytics.daily_course_engagement USING btree (activity_id)
index CREATE INDEX daily_course_engagement_chapter_idx ON analytics.daily_course_engagement USING btree (chapter_id)
index CREATE INDEX daily_course_engagement_course_idx ON analytics.daily_course_engagement USING btree (course_id, metric_date DESC)
index CREATE INDEX daily_course_engagement_date_brin ON analytics.daily_course_engagement USING brin (metric_date)
index CREATE INDEX daily_course_metrics_course_idx ON analytics.daily_course_metrics USING btree (course_id, metric_date DESC)
index CREATE INDEX daily_course_metrics_date_brin ON analytics.daily_course_metrics USING brin (metric_date)
index CREATE INDEX daily_teacher_metrics_date_brin ON analytics.daily_teacher_metrics USING brin (metric_date)
index CREATE INDEX daily_teacher_metrics_teacher_idx ON analytics.daily_teacher_metrics USING btree (teacher_user_id)
index CREATE INDEX daily_user_course_progress_course_idx ON analytics.daily_user_course_progress USING btree (course_id, metric_date DESC)
index CREATE INDEX daily_user_course_progress_date_brin ON analytics.daily_user_course_progress USING brin (metric_date)
index CREATE INDEX daily_user_course_progress_user_idx ON analytics.daily_user_course_progress USING btree (user_id)
index CREATE INDEX discussion_reactions_user_idx ON core.discussion_reactions USING btree (user_id)
index CREATE INDEX enrolment_events_course_user_idx ON learning.enrolment_events USING btree (course_id, user_id, created_at)
index CREATE INDEX enrolment_events_created_by_idx ON learning.enrolment_events USING btree (created_by) WHERE (created_by IS NOT NULL)
index CREATE INDEX enrolment_events_user_idx ON learning.enrolment_events USING btree (user_id)
index CREATE INDEX enrolments_user_idx ON learning.enrolments USING btree (user_id)
index CREATE INDEX file_grading_entries_attempt_idx ON learning.file_grading_entries USING btree (attempt_id, id DESC)
index CREATE INDEX file_submission_attempts_course_idx ON learning.file_submission_attempts USING btree (course_id, user_id)
index CREATE INDEX file_submission_attempts_review_idx ON learning.file_submission_attempts USING btree (file_submission_id, status, submitted_at DESC)
index CREATE INDEX file_submission_attempts_user_idx ON learning.file_submission_attempts USING btree (user_id)
index CREATE INDEX file_submission_files_attempt_idx ON learning.file_submission_files USING btree (attempt_id, "position")
index CREATE INDEX file_submission_files_upload_idx ON learning.file_submission_files USING btree (upload_id)
index CREATE INDEX file_submission_overrides_user_idx ON learning.file_submission_overrides USING btree (user_id)
index CREATE INDEX file_submissions_course_idx ON learning.file_submissions USING btree (course_id)
index CREATE INDEX gamification_profiles_board_idx ON learning.gamification_profiles USING btree (total_xp DESC, user_id)
index CREATE INDEX google_accounts_user_idx ON core.google_accounts USING btree (user_id)
index CREATE INDEX idempotency_keys_sweep_idx ON ops.idempotency_keys USING btree (created_at)
index CREATE INDEX item_feedback_annotation_upload_id_idx ON learning.item_feedback USING btree (annotation_upload_id) WHERE (annotation_upload_id IS NOT NULL)
index CREATE INDEX item_feedback_item_idx ON learning.item_feedback USING btree (item_id)
index CREATE INDEX item_feedback_submission_item_idx ON learning.item_feedback USING btree (submission_id, item_ref)
index CREATE INDEX jobs_claim_idx ON ops.jobs USING btree (priority DESC, run_at) WHERE (status = 'queued'::text)
index CREATE INDEX jobs_status_kind_idx ON ops.jobs USING btree (status, kind, created_at)
index CREATE INDEX learner_risk_snapshots_date_brin ON analytics.learner_risk_snapshots USING brin (snapshot_date)
index CREATE INDEX learner_risk_snapshots_pair_idx ON analytics.learner_risk_snapshots USING btree (course_id, user_id, snapshot_date DESC)
index CREATE INDEX learner_risk_snapshots_user_idx ON analytics.learner_risk_snapshots USING btree (user_id)
index CREATE INDEX mastery_evidence_concept_idx ON learning.mastery_evidence USING btree (concept_id)
index CREATE INDEX mastery_evidence_course_idx ON learning.mastery_evidence USING btree (course_id, concept_id)
index CREATE INDEX mastery_evidence_learner_idx ON learning.mastery_evidence USING btree (user_id, concept_id, observed_at)
index CREATE INDEX notifications_activity_idx ON core.notifications USING btree (activity_id)
index CREATE INDEX notifications_course_idx ON core.notifications USING btree (course_id)
index CREATE INDEX notifications_created_idx ON core.notifications USING btree (created_at)
index CREATE INDEX notifications_unread_idx ON core.notifications USING btree (user_id) WHERE (read_at IS NULL)
index CREATE INDEX notifications_unread_work_idx ON core.notifications USING btree (user_id, activity_id) WHERE ((kind = 'work_submitted'::text) AND (read_at IS NULL))
index CREATE INDEX notifications_user_idx ON core.notifications USING btree (user_id, id DESC)
index CREATE INDEX platforms_logo_upload_id_idx ON core.platforms USING btree (logo_upload_id) WHERE (logo_upload_id IS NOT NULL)
index CREATE INDEX platforms_thumbnail_upload_id_idx ON core.platforms USING btree (thumbnail_upload_id) WHERE (thumbnail_upload_id IS NOT NULL)
index CREATE INDEX post_uploads_upload_idx ON core.post_uploads USING btree (upload_id)
index CREATE INDEX role_permissions_course_staff_idx ON core.role_permissions USING btree (role_id) WHERE ((resource = ANY (ARRAY['*'::text, 'assessment'::text])) AND (action = ANY (ARRAY['*'::text, 'author'::text])) AND (scope = ANY (ARRAY[''::text, '*'::text, 'platform'::text, 'all'::text])))
index CREATE INDEX submission_violations_submission_idx ON learning.submission_violations USING btree (submission_id, created_at)
index CREATE INDEX submissions_assessment_version_idx ON learning.submissions USING btree (assessment_version_id)
index CREATE INDEX submissions_course_user_idx ON learning.submissions USING btree (course_id, user_id)
index CREATE INDEX submissions_review_idx ON learning.submissions USING btree (assessment_id, status, submitted_at DESC)
index CREATE INDEX submissions_timer_idx ON learning.submissions USING btree (started_at) WHERE ((status = 'draft'::text) AND (started_at IS NOT NULL))
index CREATE INDEX submissions_user_idx ON learning.submissions USING btree (user_id)
index CREATE INDEX teacher_interventions_course_idx ON learning.teacher_interventions USING btree (course_id)
index CREATE INDEX teacher_interventions_learner_idx ON learning.teacher_interventions USING btree (user_id, course_id)
index CREATE INDEX teacher_interventions_teacher_idx ON learning.teacher_interventions USING btree (teacher_user_id, course_id, created_at DESC)
index CREATE INDEX trail_legacy_marks_user_idx ON learning.trail_legacy_marks USING btree (user_id)
index CREATE INDEX uploads_owner_idx ON core.uploads USING btree (created_by, created_at DESC)
index CREATE INDEX uploads_reaper_idx ON core.uploads USING btree (expires_at) WHERE (expires_at IS NOT NULL)
index CREATE INDEX user_roles_role_idx ON core.user_roles USING btree (role_id)
index CREATE INDEX usergroup_courses_course_idx ON core.usergroup_courses USING btree (course_id)
index CREATE INDEX usergroup_members_user_idx ON core.usergroup_members USING btree (user_id)
index CREATE INDEX users_avatar_upload_id_idx ON core.users USING btree (avatar_upload_id) WHERE (avatar_upload_id IS NOT NULL)
index CREATE INDEX users_display_name_trgm_idx ON core.users USING gin (search_fold(display_name) gin_trgm_ops)
index CREATE INDEX users_username_trgm_idx ON core.users USING gin (search_fold(username) gin_trgm_ops)
index CREATE INDEX xp_transactions_user_recent_idx ON learning.xp_transactions USING btree (user_id, created_at DESC)
index CREATE UNIQUE INDEX activities_id_course_key ON core.activities USING btree (id, course_id)
index CREATE UNIQUE INDEX activities_pkey ON core.activities USING btree (id)
index CREATE UNIQUE INDEX activities_position_key ON core.activities USING btree (chapter_id, "position")
index CREATE UNIQUE INDEX activity_kinds_pkey ON core.activity_kinds USING btree (kind, sub_kind)
index CREATE UNIQUE INDEX activity_progress_pkey ON learning.activity_progress USING btree (activity_id, user_id)
index CREATE UNIQUE INDEX ai_approvals_pkey ON ai.ai_approvals USING btree (id)
index CREATE UNIQUE INDEX ai_artifacts_pkey ON ai.ai_artifacts USING btree (id)
index CREATE UNIQUE INDEX ai_course_analyses_pkey ON ai.ai_course_analyses USING btree (id)
index CREATE UNIQUE INDEX ai_course_settings_pkey ON ai.ai_course_settings USING btree (course_id)
index CREATE UNIQUE INDEX ai_eval_results_pkey ON ai.ai_eval_results USING btree (id)
index CREATE UNIQUE INDEX ai_events_pkey ON ai.ai_events USING btree (id)
index CREATE UNIQUE INDEX ai_events_run_id_sequence_key ON ai.ai_events USING btree (run_id, sequence)
index CREATE UNIQUE INDEX ai_evidence_pkey ON ai.ai_evidence USING btree (id)
index CREATE UNIQUE INDEX ai_feature_switches_pkey ON ai.ai_feature_switches USING btree (feature)
index CREATE UNIQUE INDEX ai_grade_corrections_draft_id_part_key_criterion_key_key ON ai.ai_grade_corrections USING btree (draft_id, part_key, criterion_key)
index CREATE UNIQUE INDEX ai_grade_corrections_pkey ON ai.ai_grade_corrections USING btree (id)
index CREATE UNIQUE INDEX ai_grade_drafts_live_attempt_idx ON ai.ai_grade_drafts USING btree (file_attempt_id) WHERE ((status = ANY (ARRAY['queued'::text, 'ready'::text])) AND (file_attempt_id IS NOT NULL))
index CREATE UNIQUE INDEX ai_grade_drafts_live_submission_idx ON ai.ai_grade_drafts USING btree (submission_id) WHERE ((status = ANY (ARRAY['queued'::text, 'ready'::text])) AND (submission_id IS NOT NULL))
index CREATE UNIQUE INDEX ai_grade_drafts_pkey ON ai.ai_grade_drafts USING btree (id)
index CREATE UNIQUE INDEX ai_lecture_reviews_pkey ON ai.ai_lecture_reviews USING btree (id)
index CREATE UNIQUE INDEX ai_qa_messages_pkey ON ai.ai_qa_messages USING btree (id)
index CREATE UNIQUE INDEX ai_qa_messages_turn_role_key ON ai.ai_qa_messages USING btree (course_id, user_id, client_turn_id, role) WHERE (client_turn_id IS NOT NULL)
index CREATE UNIQUE INDEX ai_remediation_sessions_active_gate_uidx ON ai.ai_remediation_sessions USING btree (student_user_id, activity_id) WHERE (gate_mode AND (status = ANY (ARRAY['assigned'::text, 'in_progress'::text, 'failed'::text])))
index CREATE UNIQUE INDEX ai_remediation_sessions_pkey ON ai.ai_remediation_sessions USING btree (id)
index CREATE UNIQUE INDEX ai_runs_pkey ON ai.ai_runs USING btree (id)
index CREATE UNIQUE INDEX ai_student_memory_pkey ON ai.ai_student_memory USING btree (id)
index CREATE UNIQUE INDEX ai_submission_analyses_pkey ON ai.ai_submission_analyses USING btree (id)
index CREATE UNIQUE INDEX ai_threads_pkey ON ai.ai_threads USING btree (id)
index CREATE UNIQUE INDEX ai_token_ledger_pkey ON ai.ai_token_ledger USING btree (month, user_id)
index CREATE UNIQUE INDEX ai_token_reservations_pkey ON ai.ai_token_reservations USING btree (id)
index CREATE UNIQUE INDEX ai_work_embeddings_pkey ON ai.ai_work_embeddings USING btree (subject_id, part_key)
index CREATE UNIQUE INDEX analytics_events_pkey ON ONLY analytics.analytics_events USING btree (id, occurred_at)
index CREATE UNIQUE INDEX analytics_saved_views_pkey ON analytics.analytics_saved_views USING btree (id)
index CREATE UNIQUE INDEX analytics_saved_views_teacher_user_id_view_type_name_key ON analytics.analytics_saved_views USING btree (teacher_user_id, view_type, name)
index CREATE UNIQUE INDEX assessment_access_usergroups_pkey ON learning.assessment_access_usergroups USING btree (assessment_id, usergroup_id)
index CREATE UNIQUE INDEX assessment_access_users_pkey ON learning.assessment_access_users USING btree (assessment_id, user_id)
index CREATE UNIQUE INDEX assessment_audit_events_pkey ON learning.assessment_audit_events USING btree (id)
index CREATE UNIQUE INDEX assessment_items_id_assessment_key ON learning.assessment_items USING btree (id, assessment_id)
index CREATE UNIQUE INDEX assessment_items_pkey ON learning.assessment_items USING btree (id)
index CREATE UNIQUE INDEX assessment_items_position_key ON learning.assessment_items USING btree (assessment_id, "position")
index CREATE UNIQUE INDEX assessment_overrides_assessment_id_user_id_key ON learning.assessment_overrides USING btree (assessment_id, user_id)
index CREATE UNIQUE INDEX assessment_overrides_pkey ON learning.assessment_overrides USING btree (id)
index CREATE UNIQUE INDEX assessment_versions_assessment_id_content_hash_key ON learning.assessment_versions USING btree (assessment_id, content_hash)
index CREATE UNIQUE INDEX assessment_versions_assessment_id_number_key ON learning.assessment_versions USING btree (assessment_id, number)
index CREATE UNIQUE INDEX assessment_versions_pkey ON learning.assessment_versions USING btree (id)
index CREATE UNIQUE INDEX assessments_activity_id_key ON learning.assessments USING btree (activity_id)
index CREATE UNIQUE INDEX assessments_id_course_key ON learning.assessments USING btree (id, course_id)
index CREATE UNIQUE INDEX assessments_pkey ON learning.assessments USING btree (id)
index CREATE UNIQUE INDEX auth_audit_log_pkey ON ops.auth_audit_log USING btree (id)
index CREATE UNIQUE INDEX block_uploads_pkey ON core.block_uploads USING btree (block_id, upload_id)
index CREATE UNIQUE INDEX blocks_legacy_uuid_key ON core.blocks USING btree (legacy_uuid)
index CREATE UNIQUE INDEX blocks_pkey ON core.blocks USING btree (id)
index CREATE UNIQUE INDEX bulk_actions_pkey ON learning.bulk_actions USING btree (id)
index CREATE UNIQUE INDEX certificate_users_certification_id_user_id_key ON learning.certificate_users USING btree (certification_id, user_id)
index CREATE UNIQUE INDEX certificate_users_pkey ON learning.certificate_users USING btree (id)
index CREATE UNIQUE INDEX certificate_users_verify_code_key ON learning.certificate_users USING btree (verify_code)
index CREATE UNIQUE INDEX certifications_one_live_per_course ON learning.certifications USING btree (course_id) WHERE (disabled_at IS NULL)
index CREATE UNIQUE INDEX certifications_pkey ON learning.certifications USING btree (id)
index CREATE UNIQUE INDEX chapters_id_course_key ON core.chapters USING btree (id, course_id)
index CREATE UNIQUE INDEX chapters_pkey ON core.chapters USING btree (id)
index CREATE UNIQUE INDEX chapters_position_key ON core.chapters USING btree (course_id, "position")
index CREATE UNIQUE INDEX code_run_cases_pkey ON learning.code_run_cases USING btree (id)
index CREATE UNIQUE INDEX code_run_cases_run_position_key ON learning.code_run_cases USING btree (run_id, "position")
index CREATE UNIQUE INDEX code_runs_pkey ON learning.code_runs USING btree (id)
index CREATE UNIQUE INDEX code_runs_user_id_item_id_purpose_idempotency_key_key ON learning.code_runs USING btree (user_id, item_id, purpose, idempotency_key)
index CREATE UNIQUE INDEX collection_courses_pkey ON core.collection_courses USING btree (collection_id, course_id)
index CREATE UNIQUE INDEX collection_courses_position_key ON core.collection_courses USING btree (collection_id, "position")
index CREATE UNIQUE INDEX collection_staff_pkey ON core.collection_staff USING btree (collection_id, user_id)
index CREATE UNIQUE INDEX collections_pkey ON core.collections USING btree (id)
index CREATE UNIQUE INDEX completions_pkey ON learning.completions USING btree (activity_id, user_id)
index CREATE UNIQUE INDEX concept_mastery_pkey ON learning.concept_mastery USING btree (user_id, concept_id)
index CREATE UNIQUE INDEX concept_prerequisites_pkey ON learning.concept_prerequisites USING btree (concept_id, requires_id)
index CREATE UNIQUE INDEX concept_tags_concept_id_activity_id_item_id_key ON learning.concept_tags USING btree (concept_id, activity_id, item_id) NULLS NOT DISTINCT
index CREATE UNIQUE INDEX concept_tags_pkey ON learning.concept_tags USING btree (id)
index CREATE UNIQUE INDEX content_chunks_pkey ON ai.content_chunks USING btree (id)
index CREATE UNIQUE INDEX content_chunks_source_type_source_id_ordinal_key ON ai.content_chunks USING btree (source_type, source_id, ordinal)
index CREATE UNIQUE INDEX content_index_state_pkey ON ai.content_index_state USING btree (source_type, source_id)
index CREATE UNIQUE INDEX course_concepts_course_id_slug_key ON learning.course_concepts USING btree (course_id, slug)
index CREATE UNIQUE INDEX course_concepts_id_course_id_key ON learning.course_concepts USING btree (id, course_id)
index CREATE UNIQUE INDEX course_concepts_pkey ON learning.course_concepts USING btree (id)
index CREATE UNIQUE INDEX course_discussions_id_course_key ON core.course_discussions USING btree (id, course_id)
index CREATE UNIQUE INDEX course_discussions_pkey ON core.course_discussions USING btree (id)
index CREATE UNIQUE INDEX course_progress_pkey ON learning.course_progress USING btree (course_id, user_id)
index CREATE UNIQUE INDEX course_staff_pkey ON core.course_staff USING btree (course_id, user_id)
index CREATE UNIQUE INDEX course_update_activities_pkey ON core.course_update_activities USING btree (update_id, activity_id)
index CREATE UNIQUE INDEX course_updates_pkey ON core.course_updates USING btree (id)
index CREATE UNIQUE INDEX courses_pkey ON core.courses USING btree (id)
index CREATE UNIQUE INDEX daily_assessment_metrics_pkey ON analytics.daily_assessment_metrics USING btree (metric_date, assessment_id)
index CREATE UNIQUE INDEX daily_course_engagement_pkey ON analytics.daily_course_engagement USING btree (metric_date, activity_id)
index CREATE UNIQUE INDEX daily_course_metrics_pkey ON analytics.daily_course_metrics USING btree (metric_date, course_id)
index CREATE UNIQUE INDEX daily_platform_metrics_pkey ON analytics.daily_platform_metrics USING btree (metric_date)
index CREATE UNIQUE INDEX daily_teacher_metrics_metric_date_teacher_user_id_key ON analytics.daily_teacher_metrics USING btree (metric_date, teacher_user_id) NULLS NOT DISTINCT
index CREATE UNIQUE INDEX daily_teacher_metrics_pkey ON analytics.daily_teacher_metrics USING btree (id)
index CREATE UNIQUE INDEX daily_user_course_progress_pkey ON analytics.daily_user_course_progress USING btree (metric_date, user_id, course_id)
index CREATE UNIQUE INDEX discussion_reactions_pkey ON core.discussion_reactions USING btree (discussion_id, user_id)
index CREATE UNIQUE INDEX enrolment_events_pkey ON learning.enrolment_events USING btree (id)
index CREATE UNIQUE INDEX enrolments_pkey ON learning.enrolments USING btree (course_id, user_id)
index CREATE UNIQUE INDEX feature_activations_pkey ON core.feature_activations USING btree (feature)
index CREATE UNIQUE INDEX file_grading_entries_attempt_revision_key ON learning.file_grading_entries USING btree (attempt_id, revision)
index CREATE UNIQUE INDEX file_grading_entries_pkey ON learning.file_grading_entries USING btree (id)
index CREATE UNIQUE INDEX file_submission_attempts_attempt_number_key ON learning.file_submission_attempts USING btree (file_submission_id, user_id, attempt_number) WHERE (NOT preview)
index CREATE UNIQUE INDEX file_submission_attempts_id_user_key ON learning.file_submission_attempts USING btree (id, user_id)
index CREATE UNIQUE INDEX file_submission_attempts_one_open ON learning.file_submission_attempts USING btree (file_submission_id, user_id) WHERE (status = ANY (ARRAY['draft'::text, 'returned'::text]))
index CREATE UNIQUE INDEX file_submission_attempts_pkey ON learning.file_submission_attempts USING btree (id)
index CREATE UNIQUE INDEX file_submission_files_attempt_id_upload_id_key ON learning.file_submission_files USING btree (attempt_id, upload_id)
index CREATE UNIQUE INDEX file_submission_files_pkey ON learning.file_submission_files USING btree (id)
index CREATE UNIQUE INDEX file_submission_overrides_pkey ON learning.file_submission_overrides USING btree (file_submission_id, user_id)
index CREATE UNIQUE INDEX file_submissions_activity_id_key ON learning.file_submissions USING btree (activity_id)
index CREATE UNIQUE INDEX file_submissions_id_course_key ON learning.file_submissions USING btree (id, course_id)
index CREATE UNIQUE INDEX file_submissions_pkey ON learning.file_submissions USING btree (id)
index CREATE UNIQUE INDEX gamification_completions_pkey ON learning.gamification_completions USING btree (user_id, kind, source_id)
index CREATE UNIQUE INDEX gamification_config_pkey ON learning.gamification_config USING btree (id)
index CREATE UNIQUE INDEX gamification_profiles_pkey ON learning.gamification_profiles USING btree (user_id)
index CREATE UNIQUE INDEX google_accounts_pkey ON core.google_accounts USING btree (google_sub)
index CREATE UNIQUE INDEX grading_entries_id_submission_key ON learning.grading_entries USING btree (id, submission_id)
index CREATE UNIQUE INDEX grading_entries_pkey ON learning.grading_entries USING btree (id)
index CREATE UNIQUE INDEX grading_entries_submission_revision_key ON learning.grading_entries USING btree (submission_id, revision)
index CREATE UNIQUE INDEX idempotency_keys_pkey ON ops.idempotency_keys USING btree (user_id, key)
index CREATE UNIQUE INDEX item_feedback_entry_item_key ON learning.item_feedback USING btree (grading_entry_id, item_ref)
index CREATE UNIQUE INDEX item_feedback_pkey ON learning.item_feedback USING btree (id)
index CREATE UNIQUE INDEX job_schedules_pkey ON ops.job_schedules USING btree (kind)
index CREATE UNIQUE INDEX jobs_dedupe_live_idx ON ops.jobs USING btree (dedupe_key) WHERE ((dedupe_key IS NOT NULL) AND (status = ANY (ARRAY['queued'::text, 'running'::text])))
index CREATE UNIQUE INDEX jobs_pkey ON ops.jobs USING btree (id)
index CREATE UNIQUE INDEX learner_risk_snapshots_pkey ON analytics.learner_risk_snapshots USING btree (snapshot_date, user_id, course_id)
index CREATE UNIQUE INDEX mastery_evidence_pkey ON learning.mastery_evidence USING btree (id)
index CREATE UNIQUE INDEX mastery_evidence_source_type_source_id_concept_id_part_id_u_key ON learning.mastery_evidence USING btree (source_type, source_id, concept_id, part_id, user_id) NULLS NOT DISTINCT
index CREATE UNIQUE INDEX notification_kinds_pkey ON core.notification_kinds USING btree (kind)
index CREATE UNIQUE INDEX notification_opt_outs_pkey ON core.notification_opt_outs USING btree (user_id, kind)
index CREATE UNIQUE INDEX notifications_pkey ON core.notifications USING btree (id)
index CREATE UNIQUE INDEX notifications_user_id_dedup_key_key ON core.notifications USING btree (user_id, dedup_key)
index CREATE UNIQUE INDEX platforms_pkey ON core.platforms USING btree (id)
index CREATE UNIQUE INDEX platforms_singleton_key ON core.platforms USING btree (singleton)
index CREATE UNIQUE INDEX post_uploads_pkey ON core.post_uploads USING btree (discussion_id, upload_id)
index CREATE UNIQUE INDEX role_permissions_pkey ON core.role_permissions USING btree (role_id, permission)
index CREATE UNIQUE INDEX roles_pkey ON core.roles USING btree (id)
index CREATE UNIQUE INDEX roles_slug_key ON core.roles USING btree (slug)
index CREATE UNIQUE INDEX schema_skipped_checks_pkey ON ops.schema_skipped_checks USING btree (name)
index CREATE UNIQUE INDEX submission_violations_pkey ON learning.submission_violations USING btree (id)
index CREATE UNIQUE INDEX submissions_attempt_number_key ON learning.submissions USING btree (assessment_id, user_id, attempt_number) WHERE (NOT preview)
index CREATE UNIQUE INDEX submissions_id_user_key ON learning.submissions USING btree (id, user_id)
index CREATE UNIQUE INDEX submissions_one_open_draft ON learning.submissions USING btree (assessment_id, user_id) WHERE (status = 'draft'::text)
index CREATE UNIQUE INDEX submissions_pkey ON learning.submissions USING btree (id)
index CREATE UNIQUE INDEX teacher_interventions_pkey ON learning.teacher_interventions USING btree (id)
index CREATE UNIQUE INDEX trail_legacy_marks_pkey ON learning.trail_legacy_marks USING btree (activity_id, user_id)
index CREATE UNIQUE INDEX translatable_fields_pkey ON core.translatable_fields USING btree (entity, field)
index CREATE UNIQUE INDEX translations_pkey ON core.translations USING btree (entity, entity_id, field, lang)
index CREATE UNIQUE INDEX upload_purposes_pkey ON core.upload_purposes USING btree (purpose)
index CREATE UNIQUE INDEX uploads_key_key ON core.uploads USING btree (key)
index CREATE UNIQUE INDEX uploads_pkey ON core.uploads USING btree (id)
index CREATE UNIQUE INDEX user_roles_pkey ON core.user_roles USING btree (user_id, role_id)
index CREATE UNIQUE INDEX usergroup_courses_pkey ON core.usergroup_courses USING btree (usergroup_id, course_id)
index CREATE UNIQUE INDEX usergroup_members_pkey ON core.usergroup_members USING btree (usergroup_id, user_id)
index CREATE UNIQUE INDEX usergroups_pkey ON core.usergroups USING btree (id)
index CREATE UNIQUE INDEX users_email_lower_key ON core.users USING btree (lower(email))
index CREATE UNIQUE INDEX users_pkey ON core.users USING btree (id)
index CREATE UNIQUE INDEX users_username_lower_key ON core.users USING btree (lower(username))
index CREATE UNIQUE INDEX users_zitadel_user_id_key ON core.users USING btree (zitadel_user_id)
index CREATE UNIQUE INDEX xp_transactions_idempotency_key_key ON learning.xp_transactions USING btree (idempotency_key)
index CREATE UNIQUE INDEX xp_transactions_pkey ON learning.xp_transactions USING btree (id)
index CREATE UNIQUE INDEX xp_transactions_user_id_source_source_id_key ON learning.xp_transactions USING btree (user_id, source, source_id)
table ai.ai_approvals action_type text NOT NULL DEFAULT -
table ai.ai_approvals created_at timestamp with time zone NOT NULL DEFAULT now()
table ai.ai_approvals expires_at timestamp with time zone DEFAULT -
table ai.ai_approvals id uuid NOT NULL DEFAULT uuidv7()
table ai.ai_approvals payload jsonb NOT NULL DEFAULT '{}'::jsonb
table ai.ai_approvals requested_by uuid DEFAULT -
table ai.ai_approvals resolved_at timestamp with time zone DEFAULT -
table ai.ai_approvals resolved_by uuid DEFAULT -
table ai.ai_approvals run_id uuid NOT NULL DEFAULT -
table ai.ai_approvals status text NOT NULL DEFAULT 'pending'::text
table ai.ai_artifacts content jsonb NOT NULL DEFAULT '{}'::jsonb
table ai.ai_artifacts created_at timestamp with time zone NOT NULL DEFAULT now()
table ai.ai_artifacts final boolean NOT NULL DEFAULT false
table ai.ai_artifacts id uuid NOT NULL DEFAULT uuidv7()
table ai.ai_artifacts kind text NOT NULL DEFAULT -
table ai.ai_artifacts run_id uuid NOT NULL DEFAULT -
table ai.ai_course_analyses content_hash text DEFAULT -
table ai.ai_course_analyses course_id uuid NOT NULL DEFAULT -
table ai.ai_course_analyses created_at timestamp with time zone NOT NULL DEFAULT now()
table ai.ai_course_analyses evidence jsonb NOT NULL DEFAULT '{}'::jsonb
table ai.ai_course_analyses id uuid NOT NULL DEFAULT uuidv7()
table ai.ai_course_analyses language text NOT NULL DEFAULT 'auto'::text
table ai.ai_course_analyses public_score integer NOT NULL DEFAULT -
table ai.ai_course_analyses published_at timestamp with time zone DEFAULT -
table ai.ai_course_analyses report jsonb NOT NULL DEFAULT '{}'::jsonb
table ai.ai_course_analyses run_id uuid DEFAULT -
table ai.ai_course_analyses status text NOT NULL DEFAULT 'draft'::text
table ai.ai_course_analyses triggered_by uuid DEFAULT -
table ai.ai_course_settings auto_grade_drafts boolean NOT NULL DEFAULT false
table ai.ai_course_settings course_id uuid NOT NULL DEFAULT -
table ai.ai_course_settings enabled_by uuid DEFAULT -
table ai.ai_course_settings updated_at timestamp with time zone NOT NULL DEFAULT now()
table ai.ai_eval_results created_at timestamp with time zone NOT NULL DEFAULT now()
table ai.ai_eval_results dataset text NOT NULL DEFAULT -
table ai.ai_eval_results details jsonb NOT NULL DEFAULT '{}'::jsonb
table ai.ai_eval_results evaluator text NOT NULL DEFAULT -
table ai.ai_eval_results id uuid NOT NULL DEFAULT uuidv7()
table ai.ai_eval_results passed boolean DEFAULT -
table ai.ai_eval_results run_id uuid DEFAULT -
table ai.ai_eval_results score double precision DEFAULT -
table ai.ai_events created_at timestamp with time zone NOT NULL DEFAULT now()
table ai.ai_events event_type text NOT NULL DEFAULT -
table ai.ai_events id uuid NOT NULL DEFAULT uuidv7()
table ai.ai_events payload jsonb NOT NULL DEFAULT '{}'::jsonb
table ai.ai_events run_id uuid NOT NULL DEFAULT -
table ai.ai_events sequence integer NOT NULL DEFAULT -
table ai.ai_evidence artifact_id uuid DEFAULT -
table ai.ai_evidence citation_id text NOT NULL DEFAULT -
table ai.ai_evidence created_at timestamp with time zone NOT NULL DEFAULT now()
table ai.ai_evidence excerpt text NOT NULL DEFAULT ''::text
table ai.ai_evidence id uuid NOT NULL DEFAULT uuidv7()
table ai.ai_evidence label text NOT NULL DEFAULT -
table ai.ai_evidence metadata jsonb NOT NULL DEFAULT '{}'::jsonb
table ai.ai_evidence run_id uuid NOT NULL DEFAULT -
table ai.ai_evidence score double precision DEFAULT -
table ai.ai_evidence source_ref text DEFAULT -
table ai.ai_evidence source_type text NOT NULL DEFAULT -
table ai.ai_feature_switches enabled boolean NOT NULL DEFAULT -
table ai.ai_feature_switches feature text NOT NULL DEFAULT -
table ai.ai_feature_switches updated_at timestamp with time zone NOT NULL DEFAULT now()
table ai.ai_feature_switches updated_by uuid DEFAULT -
table ai.ai_grade_corrections activity_id uuid NOT NULL DEFAULT -
table ai.ai_grade_corrections ai_score score_points NOT NULL DEFAULT -
table ai.ai_grade_corrections course_id uuid NOT NULL DEFAULT -
table ai.ai_grade_corrections created_at timestamp with time zone NOT NULL DEFAULT now()
table ai.ai_grade_corrections criterion_key text NOT NULL DEFAULT ''::text
table ai.ai_grade_corrections draft_id uuid NOT NULL DEFAULT -
table ai.ai_grade_corrections excerpt text NOT NULL DEFAULT ''::text
table ai.ai_grade_corrections id uuid NOT NULL DEFAULT uuidv7()
table ai.ai_grade_corrections max_score score_points NOT NULL DEFAULT -
table ai.ai_grade_corrections part_key text NOT NULL DEFAULT -
table ai.ai_grade_corrections teacher_feedback text NOT NULL DEFAULT ''::text
table ai.ai_grade_corrections teacher_id uuid DEFAULT -
table ai.ai_grade_corrections teacher_score score_points NOT NULL DEFAULT -
table ai.ai_grade_drafts activity_id uuid NOT NULL DEFAULT -
table ai.ai_grade_drafts agreement text DEFAULT -
table ai.ai_grade_drafts ai_score score_points DEFAULT -
table ai.ai_grade_drafts calibrated_score score_points DEFAULT -
table ai.ai_grade_drafts confidence real DEFAULT -
table ai.ai_grade_drafts course_id uuid NOT NULL DEFAULT -
table ai.ai_grade_drafts created_at timestamp with time zone NOT NULL DEFAULT now()
table ai.ai_grade_drafts decided_at timestamp with time zone DEFAULT -
table ai.ai_grade_drafts decided_by uuid DEFAULT -
table ai.ai_grade_drafts error_code text DEFAULT -
table ai.ai_grade_drafts file_attempt_id uuid DEFAULT -
table ai.ai_grade_drafts final_score score_points DEFAULT -
table ai.ai_grade_drafts flags text[] NOT NULL DEFAULT '{}'::text[]
table ai.ai_grade_drafts id uuid NOT NULL DEFAULT uuidv7()
table ai.ai_grade_drafts learner_id uuid NOT NULL DEFAULT -
table ai.ai_grade_drafts max_score score_points DEFAULT -
table ai.ai_grade_drafts proposal jsonb NOT NULL DEFAULT '{}'::jsonb
table ai.ai_grade_drafts requested_by uuid DEFAULT -
table ai.ai_grade_drafts run_id uuid DEFAULT -
table ai.ai_grade_drafts status text NOT NULL DEFAULT -
table ai.ai_grade_drafts subject_version bigint NOT NULL DEFAULT -
table ai.ai_grade_drafts submission_id uuid DEFAULT -
table ai.ai_grade_drafts updated_at timestamp with time zone NOT NULL DEFAULT now()
table ai.ai_lecture_reviews activity_id uuid DEFAULT -
table ai.ai_lecture_reviews course_id uuid NOT NULL DEFAULT -
table ai.ai_lecture_reviews created_at timestamp with time zone NOT NULL DEFAULT now()
table ai.ai_lecture_reviews dismissed_suggestion_ids text[] NOT NULL DEFAULT '{}'::text[]
table ai.ai_lecture_reviews id uuid NOT NULL DEFAULT uuidv7()
table ai.ai_lecture_reviews language text NOT NULL DEFAULT 'auto'::text
table ai.ai_lecture_reviews run_id uuid DEFAULT -
table ai.ai_lecture_reviews status text NOT NULL DEFAULT 'active'::text
table ai.ai_lecture_reviews suggestions jsonb NOT NULL DEFAULT '{}'::jsonb
table ai.ai_lecture_reviews superseded_at timestamp with time zone DEFAULT -
table ai.ai_lecture_reviews triggered_by uuid DEFAULT -
table ai.ai_qa_messages citations jsonb NOT NULL DEFAULT '{}'::jsonb
table ai.ai_qa_messages client_turn_id text DEFAULT -
table ai.ai_qa_messages confidence text DEFAULT -
table ai.ai_qa_messages content text NOT NULL DEFAULT -
table ai.ai_qa_messages course_id uuid NOT NULL DEFAULT -
table ai.ai_qa_messages created_at timestamp with time zone NOT NULL DEFAULT now()
table ai.ai_qa_messages id uuid NOT NULL DEFAULT uuidv7()
table ai.ai_qa_messages metadata jsonb NOT NULL DEFAULT '{}'::jsonb
table ai.ai_qa_messages role text NOT NULL DEFAULT -
table ai.ai_qa_messages thread_id uuid NOT NULL DEFAULT -
table ai.ai_qa_messages user_id uuid DEFAULT -
table ai.ai_remediation_sessions activity_id uuid NOT NULL DEFAULT -
table ai.ai_remediation_sessions analysis_id uuid DEFAULT -
table ai.ai_remediation_sessions created_at timestamp with time zone NOT NULL DEFAULT now()
table ai.ai_remediation_sessions file_submission_attempt_id uuid DEFAULT -
table ai.ai_remediation_sessions gate_mode boolean NOT NULL DEFAULT false
table ai.ai_remediation_sessions id uuid NOT NULL DEFAULT uuidv7()
table ai.ai_remediation_sessions language text NOT NULL DEFAULT 'auto'::text
table ai.ai_remediation_sessions lecture jsonb NOT NULL DEFAULT '{}'::jsonb
table ai.ai_remediation_sessions passed_at timestamp with time zone DEFAULT -
table ai.ai_remediation_sessions run_id uuid DEFAULT -
table ai.ai_remediation_sessions score integer DEFAULT -
table ai.ai_remediation_sessions status text NOT NULL DEFAULT 'assigned'::text
table ai.ai_remediation_sessions student_user_id uuid NOT NULL DEFAULT -
table ai.ai_remediation_sessions submission_id uuid DEFAULT -
table ai.ai_remediation_sessions test jsonb NOT NULL DEFAULT '{}'::jsonb
table ai.ai_remediation_sessions updated_at timestamp with time zone NOT NULL DEFAULT now()
table ai.ai_runs completed_at timestamp with time zone DEFAULT -
table ai.ai_runs cost_estimate numeric(12,6) DEFAULT -
table ai.ai_runs created_at timestamp with time zone NOT NULL DEFAULT now()
table ai.ai_runs duration_ms integer DEFAULT -
table ai.ai_runs error_code text DEFAULT -
table ai.ai_runs id uuid NOT NULL DEFAULT uuidv7()
table ai.ai_runs input_tokens integer DEFAULT -
table ai.ai_runs kind text NOT NULL DEFAULT -
table ai.ai_runs metadata jsonb NOT NULL DEFAULT '{}'::jsonb
table ai.ai_runs model_name text DEFAULT -
table ai.ai_runs output_tokens integer DEFAULT -
table ai.ai_runs safety_state text DEFAULT -
table ai.ai_runs started_at timestamp with time zone DEFAULT -
table ai.ai_runs status text NOT NULL DEFAULT 'queued'::text
table ai.ai_runs thread_id uuid DEFAULT -
table ai.ai_runs triggered_by uuid DEFAULT -
table ai.ai_student_memory course_id uuid DEFAULT -
table ai.ai_student_memory created_at timestamp with time zone NOT NULL DEFAULT now()
table ai.ai_student_memory id uuid NOT NULL DEFAULT uuidv7()
table ai.ai_student_memory language text NOT NULL DEFAULT 'auto'::text
table ai.ai_student_memory memory_text text NOT NULL DEFAULT -
table ai.ai_student_memory metadata jsonb NOT NULL DEFAULT '{}'::jsonb
table ai.ai_student_memory source_id text NOT NULL DEFAULT -
table ai.ai_student_memory source_type text NOT NULL DEFAULT -
table ai.ai_student_memory student_user_id uuid NOT NULL DEFAULT -
table ai.ai_student_memory updated_at timestamp with time zone NOT NULL DEFAULT now()
table ai.ai_submission_analyses analysis jsonb NOT NULL DEFAULT '{}'::jsonb
table ai.ai_submission_analyses created_at timestamp with time zone NOT NULL DEFAULT now()
table ai.ai_submission_analyses evidence jsonb NOT NULL DEFAULT '{}'::jsonb
table ai.ai_submission_analyses file_submission_attempt_id uuid DEFAULT -
table ai.ai_submission_analyses gap_count integer NOT NULL DEFAULT 0
table ai.ai_submission_analyses id uuid NOT NULL DEFAULT uuidv7()
table ai.ai_submission_analyses language text NOT NULL DEFAULT 'auto'::text
table ai.ai_submission_analyses run_id uuid DEFAULT -
table ai.ai_submission_analyses status text NOT NULL DEFAULT 'complete'::text
table ai.ai_submission_analyses submission_id uuid DEFAULT -
table ai.ai_submission_analyses triggered_by uuid DEFAULT -
table ai.ai_threads activity_id uuid DEFAULT -
table ai.ai_threads course_id uuid DEFAULT -
table ai.ai_threads created_at timestamp with time zone NOT NULL DEFAULT now()
table ai.ai_threads id uuid NOT NULL DEFAULT uuidv7()
table ai.ai_threads role text NOT NULL DEFAULT 'student'::text
table ai.ai_threads title text DEFAULT -
table ai.ai_threads updated_at timestamp with time zone NOT NULL DEFAULT now()
table ai.ai_threads user_id uuid DEFAULT -
table ai.ai_token_ledger input_tokens bigint NOT NULL DEFAULT 0
table ai.ai_token_ledger month date NOT NULL DEFAULT -
table ai.ai_token_ledger output_tokens bigint NOT NULL DEFAULT 0
table ai.ai_token_ledger run_count integer NOT NULL DEFAULT 0
table ai.ai_token_ledger updated_at timestamp with time zone NOT NULL DEFAULT now()
table ai.ai_token_ledger user_id uuid NOT NULL DEFAULT -
table ai.ai_token_reservations created_at timestamp with time zone NOT NULL DEFAULT now()
table ai.ai_token_reservations expires_at timestamp with time zone NOT NULL DEFAULT -
table ai.ai_token_reservations id uuid NOT NULL DEFAULT uuidv7()
table ai.ai_token_reservations run_id uuid DEFAULT -
table ai.ai_token_reservations tokens bigint NOT NULL DEFAULT -
table ai.ai_work_embeddings activity_id uuid NOT NULL DEFAULT -
table ai.ai_work_embeddings created_at timestamp with time zone NOT NULL DEFAULT now()
table ai.ai_work_embeddings embedding halfvec(1024) NOT NULL DEFAULT -
table ai.ai_work_embeddings embedding_model text NOT NULL DEFAULT -
table ai.ai_work_embeddings part_key text NOT NULL DEFAULT -
table ai.ai_work_embeddings subject_id uuid NOT NULL DEFAULT -
table ai.ai_work_embeddings text_hash text NOT NULL DEFAULT -
table ai.content_chunks activity_id uuid DEFAULT -
table ai.content_chunks anchor jsonb NOT NULL DEFAULT '{}'::jsonb
table ai.content_chunks audience text NOT NULL DEFAULT -
table ai.content_chunks body text NOT NULL DEFAULT -
table ai.content_chunks course_id uuid NOT NULL DEFAULT -
table ai.content_chunks created_at timestamp with time zone NOT NULL DEFAULT now()
table ai.content_chunks embedding halfvec(1024) DEFAULT -
table ai.content_chunks embedding_model text DEFAULT -
table ai.content_chunks id uuid NOT NULL DEFAULT uuidv7()
table ai.content_chunks label text NOT NULL DEFAULT -
table ai.content_chunks lexeme tsvector GENERATED to_tsvector('simple'::regconfig, search_fold(((label || ' '::text) || body)))
table ai.content_chunks ordinal integer NOT NULL DEFAULT -
table ai.content_chunks source_id uuid NOT NULL DEFAULT -
table ai.content_chunks source_type text NOT NULL DEFAULT -
table ai.content_chunks token_estimate integer NOT NULL DEFAULT -
table ai.content_index_state activity_id uuid DEFAULT -
table ai.content_index_state chunk_count integer NOT NULL DEFAULT 0
table ai.content_index_state course_id uuid NOT NULL DEFAULT -
table ai.content_index_state embedding_model text DEFAULT -
table ai.content_index_state error text DEFAULT -
table ai.content_index_state indexed_at timestamp with time zone NOT NULL DEFAULT now()
table ai.content_index_state source_id uuid NOT NULL DEFAULT -
table ai.content_index_state source_type text NOT NULL DEFAULT -
table ai.content_index_state source_version bigint NOT NULL DEFAULT -
table analytics.analytics_events activity_id uuid DEFAULT -
table analytics.analytics_events actor_id uuid DEFAULT -
table analytics.analytics_events assessment_id uuid DEFAULT -
table analytics.analytics_events course_id uuid DEFAULT -
table analytics.analytics_events created_at timestamp with time zone NOT NULL DEFAULT now()
table analytics.analytics_events event_type text NOT NULL DEFAULT -
table analytics.analytics_events id uuid NOT NULL DEFAULT uuidv7()
table analytics.analytics_events occurred_at timestamp with time zone NOT NULL DEFAULT now()
table analytics.analytics_events payload jsonb NOT NULL DEFAULT '{}'::jsonb
table analytics.analytics_events submission_id uuid DEFAULT -
table analytics.analytics_events user_id uuid DEFAULT -
table analytics.analytics_saved_views created_at timestamp with time zone NOT NULL DEFAULT now()
table analytics.analytics_saved_views id uuid NOT NULL DEFAULT uuidv7()
table analytics.analytics_saved_views name text NOT NULL DEFAULT -
table analytics.analytics_saved_views query jsonb NOT NULL DEFAULT '{}'::jsonb
table analytics.analytics_saved_views teacher_user_id uuid NOT NULL DEFAULT -
table analytics.analytics_saved_views updated_at timestamp with time zone NOT NULL DEFAULT now()
table analytics.analytics_saved_views view_type text NOT NULL DEFAULT 'overview'::text
table analytics.daily_assessment_metrics activity_id uuid DEFAULT -
table analytics.daily_assessment_metrics assessment_id uuid NOT NULL DEFAULT -
table analytics.daily_assessment_metrics assessment_kind text NOT NULL DEFAULT -
table analytics.daily_assessment_metrics avg_attempts double precision DEFAULT -
table analytics.daily_assessment_metrics avg_score double precision DEFAULT -
table analytics.daily_assessment_metrics completion_rate double precision DEFAULT -
table analytics.daily_assessment_metrics course_id uuid NOT NULL DEFAULT -
table analytics.daily_assessment_metrics difficulty_score double precision DEFAULT -
table analytics.daily_assessment_metrics eligible_learners integer NOT NULL DEFAULT 0
table analytics.daily_assessment_metrics generated_at timestamp with time zone NOT NULL DEFAULT now()
table analytics.daily_assessment_metrics grading_latency_hours_p50 double precision DEFAULT -
table analytics.daily_assessment_metrics grading_latency_hours_p90 double precision DEFAULT -
table analytics.daily_assessment_metrics median_score double precision DEFAULT -
table analytics.daily_assessment_metrics metric_date date NOT NULL DEFAULT -
table analytics.daily_assessment_metrics pass_rate double precision DEFAULT -
table analytics.daily_assessment_metrics submission_rate double precision DEFAULT -
table analytics.daily_assessment_metrics submitted_learners integer NOT NULL DEFAULT 0
table analytics.daily_course_engagement activity_id uuid NOT NULL DEFAULT -
table analytics.daily_course_engagement chapter_id uuid DEFAULT -
table analytics.daily_course_engagement completed_learners integer NOT NULL DEFAULT 0
table analytics.daily_course_engagement course_id uuid NOT NULL DEFAULT -
table analytics.daily_course_engagement dropoff_from_previous_pct double precision DEFAULT -
table analytics.daily_course_engagement generated_at timestamp with time zone NOT NULL DEFAULT now()
table analytics.daily_course_engagement metric_date date NOT NULL DEFAULT -
table analytics.daily_course_engagement started_learners integer NOT NULL DEFAULT 0
table analytics.daily_course_engagement step_order integer DEFAULT -
table analytics.daily_course_metrics active_learners_28d integer NOT NULL DEFAULT 0
table analytics.daily_course_metrics active_learners_7d integer NOT NULL DEFAULT 0
table analytics.daily_course_metrics at_risk_learners integer NOT NULL DEFAULT 0
table analytics.daily_course_metrics avg_progress_pct double precision DEFAULT -
table analytics.daily_course_metrics certificates_issued integer NOT NULL DEFAULT 0
table analytics.daily_course_metrics completion_rate double precision DEFAULT -
table analytics.daily_course_metrics content_health_score double precision DEFAULT -
table analytics.daily_course_metrics course_id uuid NOT NULL DEFAULT -
table analytics.daily_course_metrics engagement_delta_pct double precision DEFAULT -
table analytics.daily_course_metrics enrolled_learners integer NOT NULL DEFAULT 0
table analytics.daily_course_metrics generated_at timestamp with time zone NOT NULL DEFAULT now()
table analytics.daily_course_metrics last_content_update_at timestamp with time zone DEFAULT -
table analytics.daily_course_metrics metric_date date NOT NULL DEFAULT -
table analytics.daily_course_metrics teacher_user_id uuid DEFAULT -
table analytics.daily_course_metrics ungraded_submissions integer NOT NULL DEFAULT 0
table analytics.daily_platform_metrics active_learners_28d integer NOT NULL DEFAULT 0
table analytics.daily_platform_metrics active_learners_7d integer NOT NULL DEFAULT 0
table analytics.daily_platform_metrics active_learners_90d integer NOT NULL DEFAULT 0
table analytics.daily_platform_metrics at_risk_learners integer NOT NULL DEFAULT 0
table analytics.daily_platform_metrics avg_progress_pct double precision DEFAULT -
table analytics.daily_platform_metrics certificates_issued_28d integer NOT NULL DEFAULT 0
table analytics.daily_platform_metrics completion_rate double precision DEFAULT -
table analytics.daily_platform_metrics courses_with_negative_engagement integer NOT NULL DEFAULT 0
table analytics.daily_platform_metrics generated_at timestamp with time zone NOT NULL DEFAULT now()
table analytics.daily_platform_metrics managed_course_count integer NOT NULL DEFAULT 0
table analytics.daily_platform_metrics metric_date date NOT NULL DEFAULT -
table analytics.daily_platform_metrics returning_learners_28d integer NOT NULL DEFAULT 0
table analytics.daily_platform_metrics ungraded_submissions integer NOT NULL DEFAULT 0
table analytics.daily_teacher_metrics active_learners_28d integer NOT NULL DEFAULT 0
table analytics.daily_teacher_metrics active_learners_7d integer NOT NULL DEFAULT 0
table analytics.daily_teacher_metrics active_learners_90d integer NOT NULL DEFAULT 0
table analytics.daily_teacher_metrics at_risk_learners integer NOT NULL DEFAULT 0
table analytics.daily_teacher_metrics avg_progress_pct double precision DEFAULT -
table analytics.daily_teacher_metrics certificates_issued_28d integer NOT NULL DEFAULT 0
table analytics.daily_teacher_metrics completion_rate double precision DEFAULT -
table analytics.daily_teacher_metrics courses_with_negative_engagement integer NOT NULL DEFAULT 0
table analytics.daily_teacher_metrics generated_at timestamp with time zone NOT NULL DEFAULT now()
table analytics.daily_teacher_metrics id uuid NOT NULL DEFAULT uuidv7()
table analytics.daily_teacher_metrics managed_course_count integer NOT NULL DEFAULT 0
table analytics.daily_teacher_metrics metric_date date NOT NULL DEFAULT -
table analytics.daily_teacher_metrics returning_learners_28d integer NOT NULL DEFAULT 0
table analytics.daily_teacher_metrics teacher_user_id uuid DEFAULT -
table analytics.daily_teacher_metrics ungraded_submissions integer NOT NULL DEFAULT 0
table analytics.daily_user_course_progress completed_steps integer NOT NULL DEFAULT 0
table analytics.daily_user_course_progress course_id uuid NOT NULL DEFAULT -
table analytics.daily_user_course_progress generated_at timestamp with time zone NOT NULL DEFAULT now()
table analytics.daily_user_course_progress has_certificate boolean NOT NULL DEFAULT false
table analytics.daily_user_course_progress is_completed boolean NOT NULL DEFAULT false
table analytics.daily_user_course_progress last_activity_at timestamp with time zone DEFAULT -
table analytics.daily_user_course_progress metric_date date NOT NULL DEFAULT -
table analytics.daily_user_course_progress progress_pct double precision NOT NULL DEFAULT 0
table analytics.daily_user_course_progress total_steps integer NOT NULL DEFAULT 0
table analytics.daily_user_course_progress user_id uuid NOT NULL DEFAULT -
table analytics.learner_risk_snapshots course_id uuid NOT NULL DEFAULT -
table analytics.learner_risk_snapshots days_since_last_activity integer DEFAULT -
table analytics.learner_risk_snapshots failed_assessments integer NOT NULL DEFAULT 0
table analytics.learner_risk_snapshots generated_at timestamp with time zone NOT NULL DEFAULT now()
table analytics.learner_risk_snapshots missing_required_assessments integer NOT NULL DEFAULT 0
table analytics.learner_risk_snapshots open_grading_blocks integer NOT NULL DEFAULT 0
table analytics.learner_risk_snapshots progress_pct double precision NOT NULL DEFAULT 0
table analytics.learner_risk_snapshots reason_codes text[] NOT NULL DEFAULT '{}'::text[]
table analytics.learner_risk_snapshots recommended_action text DEFAULT -
table analytics.learner_risk_snapshots risk_level text NOT NULL DEFAULT -
table analytics.learner_risk_snapshots risk_score double precision NOT NULL DEFAULT 0
table analytics.learner_risk_snapshots snapshot_date date NOT NULL DEFAULT -
table analytics.learner_risk_snapshots teacher_user_id uuid DEFAULT -
table analytics.learner_risk_snapshots user_id uuid NOT NULL DEFAULT -
table core.activities activity_sub_type text NOT NULL DEFAULT -
table core.activities activity_type text NOT NULL DEFAULT -
table core.activities chapter_id uuid NOT NULL DEFAULT -
table core.activities content jsonb NOT NULL DEFAULT '{}'::jsonb
table core.activities course_id uuid NOT NULL DEFAULT -
table core.activities created_at timestamp with time zone NOT NULL DEFAULT now()
table core.activities creator_id uuid DEFAULT -
table core.activities details jsonb NOT NULL DEFAULT '{}'::jsonb
table core.activities id uuid NOT NULL DEFAULT uuidv7()
table core.activities name text NOT NULL DEFAULT -
table core.activities position integer NOT NULL DEFAULT 1
table core.activities published boolean NOT NULL DEFAULT false
table core.activities required boolean NOT NULL DEFAULT true
table core.activities settings jsonb NOT NULL DEFAULT '{}'::jsonb
table core.activities updated_at timestamp with time zone NOT NULL DEFAULT now()
table core.activities version integer NOT NULL DEFAULT 1
table core.activity_kinds kind text NOT NULL DEFAULT -
table core.activity_kinds sub_kind text NOT NULL DEFAULT -
table core.block_uploads block_id uuid NOT NULL DEFAULT -
table core.block_uploads upload_id uuid NOT NULL DEFAULT -
table core.blocks activity_id uuid NOT NULL DEFAULT -
table core.blocks block_type text NOT NULL DEFAULT -
table core.blocks claimed boolean NOT NULL DEFAULT true
table core.blocks content jsonb NOT NULL DEFAULT '{}'::jsonb
table core.blocks created_at timestamp with time zone NOT NULL DEFAULT now()
table core.blocks id uuid NOT NULL DEFAULT uuidv7()
table core.blocks legacy_uuid text DEFAULT -
table core.blocks updated_at timestamp with time zone NOT NULL DEFAULT now()
table core.chapters course_id uuid NOT NULL DEFAULT -
table core.chapters created_at timestamp with time zone NOT NULL DEFAULT now()
table core.chapters creator_id uuid DEFAULT -
table core.chapters description text NOT NULL DEFAULT ''::text
table core.chapters id uuid NOT NULL DEFAULT uuidv7()
table core.chapters name text NOT NULL DEFAULT -
table core.chapters position integer NOT NULL DEFAULT 1
table core.chapters thumbnail_key text DEFAULT -
table core.chapters thumbnail_upload_id uuid DEFAULT -
table core.chapters updated_at timestamp with time zone NOT NULL DEFAULT now()
table core.chapters version integer NOT NULL DEFAULT 1
table core.collection_courses collection_id uuid NOT NULL DEFAULT -
table core.collection_courses course_id uuid NOT NULL DEFAULT -
table core.collection_courses created_at timestamp with time zone NOT NULL DEFAULT now()
table core.collection_courses position integer NOT NULL DEFAULT 0
table core.collection_staff authorship text NOT NULL DEFAULT -
table core.collection_staff collection_id uuid NOT NULL DEFAULT -
table core.collection_staff created_at timestamp with time zone NOT NULL DEFAULT now()
table core.collection_staff status text NOT NULL DEFAULT 'active'::text
table core.collection_staff updated_at timestamp with time zone NOT NULL DEFAULT now()
table core.collection_staff user_id uuid NOT NULL DEFAULT -
table core.collection_staff version integer NOT NULL DEFAULT 1
table core.collections cover_key text DEFAULT -
table core.collections cover_upload_id uuid DEFAULT -
table core.collections created_at timestamp with time zone NOT NULL DEFAULT now()
table core.collections creator_id uuid DEFAULT -
table core.collections description text NOT NULL DEFAULT ''::text
table core.collections id uuid NOT NULL DEFAULT uuidv7()
table core.collections name text NOT NULL DEFAULT -
table core.collections public boolean NOT NULL DEFAULT false
table core.collections updated_at timestamp with time zone NOT NULL DEFAULT now()
table core.collections version integer NOT NULL DEFAULT 1
table core.course_discussions content text NOT NULL DEFAULT -
table core.course_discussions course_id uuid NOT NULL DEFAULT -
table core.course_discussions created_at timestamp with time zone NOT NULL DEFAULT now()
table core.course_discussions dislikes_count integer NOT NULL DEFAULT 0
table core.course_discussions id uuid NOT NULL DEFAULT uuidv7()
table core.course_discussions kind text NOT NULL DEFAULT 'post'::text
table core.course_discussions likes_count integer NOT NULL DEFAULT 0
table core.course_discussions parent_id uuid DEFAULT -
table core.course_discussions replies_count integer NOT NULL DEFAULT 0
table core.course_discussions status text NOT NULL DEFAULT 'active'::text
table core.course_discussions updated_at timestamp with time zone NOT NULL DEFAULT now()
table core.course_discussions user_id uuid DEFAULT -
table core.course_discussions version integer NOT NULL DEFAULT 1
table core.course_staff authorship text NOT NULL DEFAULT -
table core.course_staff course_id uuid NOT NULL DEFAULT -
table core.course_staff created_at timestamp with time zone NOT NULL DEFAULT now()
table core.course_staff status text NOT NULL DEFAULT 'active'::text
table core.course_staff updated_at timestamp with time zone NOT NULL DEFAULT now()
table core.course_staff user_id uuid NOT NULL DEFAULT -
table core.course_staff version integer NOT NULL DEFAULT 1
table core.course_update_activities activity_id uuid NOT NULL DEFAULT -
table core.course_update_activities position integer NOT NULL DEFAULT -
table core.course_update_activities update_id uuid NOT NULL DEFAULT -
table core.course_updates author_id uuid DEFAULT -
table core.course_updates content text NOT NULL DEFAULT -
table core.course_updates course_id uuid NOT NULL DEFAULT -
table core.course_updates created_at timestamp with time zone NOT NULL DEFAULT now()
table core.course_updates id uuid NOT NULL DEFAULT uuidv7()
table core.course_updates title text NOT NULL DEFAULT -
table core.course_updates updated_at timestamp with time zone NOT NULL DEFAULT now()
table core.course_updates version integer NOT NULL DEFAULT 1
table core.courses about text NOT NULL DEFAULT ''::text
table core.courses archived_at timestamp with time zone DEFAULT -
table core.courses archived_by uuid DEFAULT -
table core.courses assessments_require_enrollment boolean NOT NULL DEFAULT true
table core.courses created_at timestamp with time zone NOT NULL DEFAULT now()
table core.courses creator_id uuid DEFAULT -
table core.courses deleted_at timestamp with time zone DEFAULT -
table core.courses deleted_by uuid DEFAULT -
table core.courses description text NOT NULL DEFAULT ''::text
table core.courses id uuid NOT NULL DEFAULT uuidv7()
table core.courses language text NOT NULL DEFAULT 'ru'::text
table core.courses learnings jsonb NOT NULL DEFAULT '[]'::jsonb
table core.courses name text NOT NULL DEFAULT -
table core.courses open_to_contributors boolean NOT NULL DEFAULT false
table core.courses public boolean NOT NULL DEFAULT false
table core.courses tags text[] NOT NULL DEFAULT '{}'::text[]
table core.courses thumbnail_image_key text DEFAULT -
table core.courses thumbnail_image_upload_id uuid DEFAULT -
table core.courses thumbnail_type text NOT NULL DEFAULT 'image'::text
table core.courses thumbnail_video_key text DEFAULT -
table core.courses thumbnail_video_upload_id uuid DEFAULT -
table core.courses updated_at timestamp with time zone NOT NULL DEFAULT now()
table core.courses version integer NOT NULL DEFAULT 1
table core.discussion_reactions created_at timestamp with time zone NOT NULL DEFAULT now()
table core.discussion_reactions discussion_id uuid NOT NULL DEFAULT -
table core.discussion_reactions reaction text NOT NULL DEFAULT -
table core.discussion_reactions user_id uuid NOT NULL DEFAULT -
table core.feature_activations activated_at timestamp with time zone NOT NULL DEFAULT now()
table core.feature_activations feature text NOT NULL DEFAULT -
table core.google_accounts created_at timestamp with time zone NOT NULL DEFAULT now()
table core.google_accounts email text NOT NULL DEFAULT -
table core.google_accounts google_sub text NOT NULL DEFAULT -
table core.google_accounts user_id uuid NOT NULL DEFAULT -
table core.notification_kinds kind text NOT NULL DEFAULT -
table core.notification_opt_outs created_at timestamp with time zone NOT NULL DEFAULT now()
table core.notification_opt_outs kind text NOT NULL DEFAULT -
table core.notification_opt_outs user_id uuid NOT NULL DEFAULT -
table core.notifications activity_id uuid GENERATED ((payload ->> 'activity_id'::text))::uuid
table core.notifications course_id uuid GENERATED ((payload ->> 'course_id'::text))::uuid
table core.notifications created_at timestamp with time zone NOT NULL DEFAULT now()
table core.notifications dedup_key text DEFAULT -
table core.notifications id uuid NOT NULL DEFAULT uuidv7()
table core.notifications kind text NOT NULL DEFAULT -
table core.notifications payload jsonb NOT NULL DEFAULT -
table core.notifications read_at timestamp with time zone DEFAULT -
table core.notifications user_id uuid NOT NULL DEFAULT -
table core.platforms about text NOT NULL DEFAULT ''::text
table core.platforms created_at timestamp with time zone NOT NULL DEFAULT now()
table core.platforms description text NOT NULL DEFAULT ''::text
table core.platforms email text NOT NULL DEFAULT -
table core.platforms id uuid NOT NULL DEFAULT uuidv7()
table core.platforms label text DEFAULT -
table core.platforms logo_key text DEFAULT -
table core.platforms logo_upload_id uuid DEFAULT -
table core.platforms name text NOT NULL DEFAULT -
table core.platforms singleton boolean NOT NULL DEFAULT true
table core.platforms thumbnail_key text DEFAULT -
table core.platforms thumbnail_upload_id uuid DEFAULT -
table core.platforms updated_at timestamp with time zone NOT NULL DEFAULT now()
table core.platforms version integer NOT NULL DEFAULT 1
table core.post_uploads discussion_id uuid NOT NULL DEFAULT -
table core.post_uploads upload_id uuid NOT NULL DEFAULT -
table core.role_permissions action text GENERATED split_part(permission, ':'::text, 2)
table core.role_permissions permission text NOT NULL DEFAULT -
table core.role_permissions resource text GENERATED split_part(permission, ':'::text, 1)
table core.role_permissions role_id uuid NOT NULL DEFAULT -
table core.role_permissions scope text GENERATED split_part(permission, ':'::text, 3)
table core.roles created_at timestamp with time zone NOT NULL DEFAULT now()
table core.roles description text DEFAULT -
table core.roles description_key text NOT NULL DEFAULT -
table core.roles display_name text DEFAULT -
table core.roles display_name_key text NOT NULL DEFAULT -
table core.roles id uuid NOT NULL DEFAULT uuidv7()
table core.roles is_system boolean NOT NULL DEFAULT false
table core.roles priority integer NOT NULL DEFAULT 0
table core.roles slug text NOT NULL DEFAULT -
table core.roles updated_at timestamp with time zone NOT NULL DEFAULT now()
table core.roles version integer NOT NULL DEFAULT 1
table core.translatable_fields entity text NOT NULL DEFAULT -
table core.translatable_fields field text NOT NULL DEFAULT -
table core.translations created_at timestamp with time zone NOT NULL DEFAULT now()
table core.translations entity text NOT NULL DEFAULT -
table core.translations entity_id uuid NOT NULL DEFAULT -
table core.translations field text NOT NULL DEFAULT -
table core.translations lang text NOT NULL DEFAULT -
table core.translations text text NOT NULL DEFAULT -
table core.translations updated_at timestamp with time zone NOT NULL DEFAULT now()
table core.upload_purposes purpose text NOT NULL DEFAULT -
table core.uploads bucket text NOT NULL DEFAULT -
table core.uploads created_at timestamp with time zone NOT NULL DEFAULT now()
table core.uploads created_by uuid NOT NULL DEFAULT -
table core.uploads expires_at timestamp with time zone DEFAULT -
table core.uploads id uuid NOT NULL DEFAULT uuidv7()
table core.uploads key text NOT NULL DEFAULT -
table core.uploads mime text NOT NULL DEFAULT -
table core.uploads multipart_id text DEFAULT -
table core.uploads purpose text NOT NULL DEFAULT -
table core.uploads size_bytes bigint NOT NULL DEFAULT -
table core.uploads status text NOT NULL DEFAULT 'pending'::text
table core.uploads updated_at timestamp with time zone NOT NULL DEFAULT now()
table core.user_roles created_at timestamp with time zone NOT NULL DEFAULT now()
table core.user_roles role_id uuid NOT NULL DEFAULT -
table core.user_roles user_id uuid NOT NULL DEFAULT -
table core.usergroup_courses course_id uuid NOT NULL DEFAULT -
table core.usergroup_courses created_at timestamp with time zone NOT NULL DEFAULT now()
table core.usergroup_courses usergroup_id uuid NOT NULL DEFAULT -
table core.usergroup_members created_at timestamp with time zone NOT NULL DEFAULT now()
table core.usergroup_members user_id uuid NOT NULL DEFAULT -
table core.usergroup_members usergroup_id uuid NOT NULL DEFAULT -
table core.usergroups created_at timestamp with time zone NOT NULL DEFAULT now()
table core.usergroups creator_id uuid DEFAULT -
table core.usergroups description text NOT NULL DEFAULT ''::text
table core.usergroups id uuid NOT NULL DEFAULT uuidv7()
table core.usergroups name text NOT NULL DEFAULT -
table core.usergroups updated_at timestamp with time zone NOT NULL DEFAULT now()
table core.usergroups version integer NOT NULL DEFAULT 1
table core.users avatar_key text DEFAULT -
table core.users avatar_upload_id uuid DEFAULT -
table core.users bio text NOT NULL DEFAULT ''::text
table core.users created_at timestamp with time zone NOT NULL DEFAULT now()
table core.users deleted_at timestamp with time zone DEFAULT -
table core.users disabled_at timestamp with time zone DEFAULT -
table core.users display_name text NOT NULL DEFAULT ''::text
table core.users email text NOT NULL DEFAULT -
table core.users email_verified boolean DEFAULT -
table core.users email_verified_at timestamp with time zone DEFAULT -
table core.users id uuid NOT NULL DEFAULT uuidv7()
table core.users locale text NOT NULL DEFAULT 'ru'::text
table core.users organization text NOT NULL DEFAULT ''::text
table core.users profile jsonb NOT NULL DEFAULT '{"sections": []}'::jsonb
table core.users profile_version integer NOT NULL DEFAULT 0
table core.users rbac_version bigint NOT NULL DEFAULT 1
table core.users theme text DEFAULT -
table core.users updated_at timestamp with time zone NOT NULL DEFAULT now()
table core.users username text NOT NULL DEFAULT -
table core.users zitadel_user_id text NOT NULL DEFAULT -
table learning.activity_progress activity_id uuid NOT NULL DEFAULT -
table learning.activity_progress attempt_count integer NOT NULL DEFAULT 0
table learning.activity_progress best_submission_id uuid DEFAULT -
table learning.activity_progress completed_at timestamp with time zone DEFAULT -
table learning.activity_progress course_id uuid NOT NULL DEFAULT -
table learning.activity_progress created_at timestamp with time zone NOT NULL DEFAULT now()
table learning.activity_progress due_at timestamp with time zone DEFAULT -
table learning.activity_progress graded_at timestamp with time zone DEFAULT -
table learning.activity_progress is_late boolean NOT NULL DEFAULT false
table learning.activity_progress last_activity_at timestamp with time zone DEFAULT -
table learning.activity_progress latest_submission_id uuid DEFAULT -
table learning.activity_progress passed boolean DEFAULT -
table learning.activity_progress required boolean NOT NULL DEFAULT true
table learning.activity_progress score percent DEFAULT -
table learning.activity_progress started_at timestamp with time zone DEFAULT -
table learning.activity_progress state text NOT NULL DEFAULT 'not_started'::text
table learning.activity_progress status_reason text DEFAULT -
table learning.activity_progress submitted_at timestamp with time zone DEFAULT -
table learning.activity_progress teacher_action_required boolean NOT NULL DEFAULT false
table learning.activity_progress updated_at timestamp with time zone NOT NULL DEFAULT now()
table learning.activity_progress user_id uuid NOT NULL DEFAULT -
table learning.assessment_access_usergroups assessment_id uuid NOT NULL DEFAULT -
table learning.assessment_access_usergroups created_at timestamp with time zone NOT NULL DEFAULT now()
table learning.assessment_access_usergroups usergroup_id uuid NOT NULL DEFAULT -
table learning.assessment_access_users assessment_id uuid NOT NULL DEFAULT -
table learning.assessment_access_users created_at timestamp with time zone NOT NULL DEFAULT now()
table learning.assessment_access_users user_id uuid NOT NULL DEFAULT -
table learning.assessment_audit_events actor_id uuid DEFAULT -
table learning.assessment_audit_events assessment_id uuid NOT NULL DEFAULT -
table learning.assessment_audit_events created_at timestamp with time zone NOT NULL DEFAULT now()
table learning.assessment_audit_events event text NOT NULL DEFAULT -
table learning.assessment_audit_events id uuid NOT NULL DEFAULT uuidv7()
table learning.assessment_audit_events payload jsonb NOT NULL DEFAULT '{}'::jsonb
table learning.assessment_items assessment_id uuid NOT NULL DEFAULT -
table learning.assessment_items body jsonb NOT NULL DEFAULT '{}'::jsonb
table learning.assessment_items created_at timestamp with time zone NOT NULL DEFAULT now()
table learning.assessment_items difficulty text DEFAULT -
table learning.assessment_items estimated_minutes integer DEFAULT -
table learning.assessment_items id uuid NOT NULL DEFAULT uuidv7()
table learning.assessment_items kind text NOT NULL DEFAULT -
table learning.assessment_items max_score score_points NOT NULL DEFAULT 0
table learning.assessment_items outcome_ids text[] NOT NULL DEFAULT '{}'::text[]
table learning.assessment_items position integer NOT NULL DEFAULT 1
table learning.assessment_items section_label text DEFAULT -
table learning.assessment_items tags text[] NOT NULL DEFAULT '{}'::text[]
table learning.assessment_items title text NOT NULL DEFAULT ''::text
table learning.assessment_items updated_at timestamp with time zone NOT NULL DEFAULT now()
table learning.assessment_overrides assessment_id uuid NOT NULL DEFAULT -
table learning.assessment_overrides created_at timestamp with time zone NOT NULL DEFAULT now()
table learning.assessment_overrides due_at_override timestamp with time zone DEFAULT -
table learning.assessment_overrides due_extended boolean NOT NULL DEFAULT false
table learning.assessment_overrides expires_at timestamp with time zone DEFAULT -
table learning.assessment_overrides granted_by uuid DEFAULT -
table learning.assessment_overrides id uuid NOT NULL DEFAULT uuidv7()
table learning.assessment_overrides max_attempts_override integer DEFAULT -
table learning.assessment_overrides note text NOT NULL DEFAULT ''::text
table learning.assessment_overrides updated_at timestamp with time zone NOT NULL DEFAULT now()
table learning.assessment_overrides user_id uuid NOT NULL DEFAULT -
table learning.assessment_overrides version integer NOT NULL DEFAULT 1
table learning.assessment_overrides waive_late_penalty boolean NOT NULL DEFAULT false
table learning.assessment_versions assessment_id uuid NOT NULL DEFAULT -
table learning.assessment_versions content_hash text NOT NULL DEFAULT -
table learning.assessment_versions created_at timestamp with time zone NOT NULL DEFAULT now()
table learning.assessment_versions id uuid NOT NULL DEFAULT uuidv7()
table learning.assessment_versions items jsonb NOT NULL DEFAULT -
table learning.assessment_versions max_points numeric(10,2) NOT NULL DEFAULT -
table learning.assessment_versions number integer NOT NULL DEFAULT -
table learning.assessment_versions policy jsonb NOT NULL DEFAULT -
table learning.assessments access_mode text NOT NULL DEFAULT 'all_course_learners'::text
table learning.assessments activity_id uuid NOT NULL DEFAULT -
table learning.assessments allow_late boolean NOT NULL DEFAULT true
table learning.assessments archived_at timestamp with time zone DEFAULT -
table learning.assessments attempt_penalty_percent percent NOT NULL DEFAULT 0
table learning.assessments completion_rule text NOT NULL DEFAULT -
table learning.assessments content_version integer NOT NULL DEFAULT 1
table learning.assessments copy_paste_protection boolean NOT NULL DEFAULT false
table learning.assessments course_id uuid NOT NULL DEFAULT -
table learning.assessments created_at timestamp with time zone NOT NULL DEFAULT now()
table learning.assessments creator_id uuid DEFAULT -
table learning.assessments description text NOT NULL DEFAULT ''::text
table learning.assessments devtools_detection boolean NOT NULL DEFAULT false
table learning.assessments due_at timestamp with time zone DEFAULT -
table learning.assessments fullscreen_required boolean NOT NULL DEFAULT false
table learning.assessments grace_period_minutes integer NOT NULL DEFAULT 0
table learning.assessments grade_release_mode text NOT NULL DEFAULT -
table learning.assessments grading_mode text NOT NULL DEFAULT -
table learning.assessments grading_type text NOT NULL DEFAULT 'percentage'::text
table learning.assessments id uuid NOT NULL DEFAULT uuidv7()
table learning.assessments late_cutoff_at timestamp with time zone DEFAULT -
table learning.assessments late_penalty_max_days integer DEFAULT -
table learning.assessments late_penalty_percent_per_day percent DEFAULT -
table learning.assessments late_policy_kind text NOT NULL DEFAULT 'none'::text
table learning.assessments lifecycle text NOT NULL DEFAULT 'draft'::text
table learning.assessments max_attempts integer DEFAULT -
table learning.assessments negative_marking_percent percent NOT NULL DEFAULT 0
table learning.assessments partial_credit boolean NOT NULL DEFAULT true
table learning.assessments passing_score percent NOT NULL DEFAULT 60
table learning.assessments policy_version integer NOT NULL DEFAULT 1
table learning.assessments published_at timestamp with time zone DEFAULT -
table learning.assessments randomize_options boolean NOT NULL DEFAULT false
table learning.assessments randomize_questions boolean NOT NULL DEFAULT false
table learning.assessments required boolean NOT NULL DEFAULT false
table learning.assessments review_visibility text NOT NULL DEFAULT 'score_only'::text
table learning.assessments right_click_disabled boolean NOT NULL DEFAULT false
table learning.assessments scheduled_at timestamp with time zone DEFAULT -
table learning.assessments tab_switch_detection boolean NOT NULL DEFAULT false
table learning.assessments time_limit_seconds integer DEFAULT -
table learning.assessments updated_at timestamp with time zone NOT NULL DEFAULT now()
table learning.assessments version integer NOT NULL DEFAULT 1
table learning.assessments violation_threshold integer NOT NULL DEFAULT 3
table learning.assessments weight score_weight NOT NULL DEFAULT 1.0
table learning.bulk_actions action_type text NOT NULL DEFAULT -
table learning.bulk_actions affected_count integer NOT NULL DEFAULT 0
table learning.bulk_actions assessment_id uuid NOT NULL DEFAULT -
table learning.bulk_actions completed_at timestamp with time zone DEFAULT -
table learning.bulk_actions created_at timestamp with time zone NOT NULL DEFAULT now()
table learning.bulk_actions error_log text NOT NULL DEFAULT ''::text
table learning.bulk_actions id uuid NOT NULL DEFAULT uuidv7()
table learning.bulk_actions params jsonb NOT NULL DEFAULT '{}'::jsonb
table learning.bulk_actions performed_by uuid DEFAULT -
table learning.bulk_actions status text NOT NULL DEFAULT 'pending'::text
table learning.bulk_actions target_user_ids uuid[] NOT NULL DEFAULT '{}'::uuid[]
table learning.certificate_users certificate_name text NOT NULL DEFAULT -
table learning.certificate_users certification_id uuid NOT NULL DEFAULT -
table learning.certificate_users course_id uuid NOT NULL DEFAULT -
table learning.certificate_users course_name text NOT NULL DEFAULT -
table learning.certificate_users created_at timestamp with time zone NOT NULL DEFAULT now()
table learning.certificate_users holder_name text NOT NULL DEFAULT -
table learning.certificate_users id uuid NOT NULL DEFAULT uuidv7()
table learning.certificate_users instructor_name text DEFAULT -
table learning.certificate_users reissued_at timestamp with time zone DEFAULT -
table learning.certificate_users score percent DEFAULT -
table learning.certificate_users updated_at timestamp with time zone NOT NULL DEFAULT now()
table learning.certificate_users user_id uuid NOT NULL DEFAULT -
table learning.certificate_users verify_code text NOT NULL DEFAULT -
table learning.certifications config jsonb NOT NULL DEFAULT '{}'::jsonb
table learning.certifications course_id uuid DEFAULT -
table learning.certifications created_at timestamp with time zone NOT NULL DEFAULT now()
table learning.certifications disabled_at timestamp with time zone DEFAULT -
table learning.certifications id uuid NOT NULL DEFAULT uuidv7()
table learning.certifications updated_at timestamp with time zone NOT NULL DEFAULT now()
table learning.certifications version integer NOT NULL DEFAULT 1
table learning.code_run_cases compile_output text DEFAULT -
table learning.code_run_cases description text NOT NULL DEFAULT ''::text
table learning.code_run_cases expected_output text DEFAULT -
table learning.code_run_cases id uuid NOT NULL DEFAULT uuidv7()
table learning.code_run_cases is_visible boolean NOT NULL DEFAULT true
table learning.code_run_cases memory_kb integer DEFAULT -
table learning.code_run_cases message text DEFAULT -
table learning.code_run_cases passed boolean NOT NULL DEFAULT false
table learning.code_run_cases position integer NOT NULL DEFAULT -
table learning.code_run_cases run_id uuid NOT NULL DEFAULT -
table learning.code_run_cases status_description text NOT NULL DEFAULT ''::text
table learning.code_run_cases stderr text DEFAULT -
table learning.code_run_cases stdin text DEFAULT -
table learning.code_run_cases stdout text DEFAULT -
table learning.code_run_cases test_id text NOT NULL DEFAULT -
table learning.code_run_cases time_seconds double precision DEFAULT -
table learning.code_run_cases verdict text NOT NULL DEFAULT -
table learning.code_run_cases weight score_weight NOT NULL DEFAULT 1
table learning.code_runs assessment_id uuid NOT NULL DEFAULT -
table learning.code_runs compile_output text DEFAULT -
table learning.code_runs created_at timestamp with time zone NOT NULL DEFAULT now()
table learning.code_runs error_message text DEFAULT -
table learning.code_runs finished_at timestamp with time zone DEFAULT -
table learning.code_runs id uuid NOT NULL DEFAULT uuidv7()
table learning.code_runs idempotency_key text DEFAULT -
table learning.code_runs item_id uuid NOT NULL DEFAULT -
table learning.code_runs language_id integer NOT NULL DEFAULT -
table learning.code_runs passed integer NOT NULL DEFAULT 0
table learning.code_runs purpose text NOT NULL DEFAULT -
table learning.code_runs score percent DEFAULT -
table learning.code_runs source_sha256 text NOT NULL DEFAULT -
table learning.code_runs started_at timestamp with time zone DEFAULT -
table learning.code_runs status text NOT NULL DEFAULT 'queued'::text
table learning.code_runs stdin_sha256 text DEFAULT -
table learning.code_runs submission_id uuid DEFAULT -
table learning.code_runs total integer NOT NULL DEFAULT 0
table learning.code_runs user_id uuid NOT NULL DEFAULT -
table learning.completions activity_id uuid NOT NULL DEFAULT -
table learning.completions completed_at timestamp with time zone NOT NULL DEFAULT now()
table learning.completions user_id uuid NOT NULL DEFAULT -
table learning.concept_mastery concept_id uuid NOT NULL DEFAULT -
table learning.concept_mastery course_id uuid NOT NULL DEFAULT -
table learning.concept_mastery evidence_count integer NOT NULL DEFAULT -
table learning.concept_mastery last_observed_at timestamp with time zone DEFAULT -
table learning.concept_mastery p_known real NOT NULL DEFAULT -
table learning.concept_mastery updated_at timestamp with time zone NOT NULL DEFAULT now()
table learning.concept_mastery user_id uuid NOT NULL DEFAULT -
table learning.concept_prerequisites concept_id uuid NOT NULL DEFAULT -
table learning.concept_prerequisites course_id uuid NOT NULL DEFAULT -
table learning.concept_prerequisites created_at timestamp with time zone NOT NULL DEFAULT now()
table learning.concept_prerequisites origin text NOT NULL DEFAULT -
table learning.concept_prerequisites requires_id uuid NOT NULL DEFAULT -
table learning.concept_prerequisites status text NOT NULL DEFAULT -
table learning.concept_tags activity_id uuid NOT NULL DEFAULT -
table learning.concept_tags concept_id uuid NOT NULL DEFAULT -
table learning.concept_tags course_id uuid NOT NULL DEFAULT -
table learning.concept_tags created_at timestamp with time zone NOT NULL DEFAULT now()
table learning.concept_tags decided_at timestamp with time zone DEFAULT -
table learning.concept_tags decided_by uuid DEFAULT -
table learning.concept_tags id uuid NOT NULL DEFAULT uuidv7()
table learning.concept_tags item_id uuid DEFAULT -
table learning.concept_tags origin text NOT NULL DEFAULT -
table learning.concept_tags rationale text NOT NULL DEFAULT ''::text
table learning.concept_tags run_id uuid DEFAULT -
table learning.concept_tags status text NOT NULL DEFAULT -
table learning.concept_tags updated_at timestamp with time zone NOT NULL DEFAULT now()
table learning.concept_tags weight real NOT NULL DEFAULT 1
table learning.course_concepts course_id uuid NOT NULL DEFAULT -
table learning.course_concepts created_at timestamp with time zone NOT NULL DEFAULT now()
table learning.course_concepts decided_at timestamp with time zone DEFAULT -
table learning.course_concepts decided_by uuid DEFAULT -
table learning.course_concepts description text NOT NULL DEFAULT ''::text
table learning.course_concepts id uuid NOT NULL DEFAULT uuidv7()
table learning.course_concepts name text NOT NULL DEFAULT -
table learning.course_concepts origin text NOT NULL DEFAULT -
table learning.course_concepts position integer NOT NULL DEFAULT 0
table learning.course_concepts run_id uuid DEFAULT -
table learning.course_concepts slug text NOT NULL DEFAULT -
table learning.course_concepts status text NOT NULL DEFAULT -
table learning.course_concepts updated_at timestamp with time zone NOT NULL DEFAULT now()
table learning.course_progress certificate_eligible boolean NOT NULL GENERATED ((total_required_count > 0) AND (completed_required_count >= total_required_count) AND (completed_at IS NOT NULL))
table learning.course_progress completed_at timestamp with time zone DEFAULT -
table learning.course_progress completed_required_count integer NOT NULL DEFAULT 0
table learning.course_progress course_id uuid NOT NULL DEFAULT -
table learning.course_progress created_at timestamp with time zone NOT NULL DEFAULT now()
table learning.course_progress grade_average percent DEFAULT -
table learning.course_progress last_activity_at timestamp with time zone DEFAULT -
table learning.course_progress missing_required_count integer NOT NULL DEFAULT 0
table learning.course_progress needs_grading_count integer NOT NULL DEFAULT 0
table learning.course_progress progress_pct double precision NOT NULL GENERATED 
CASE
    WHEN (total_required_count > 0) THEN (round((((completed_required_count)::numeric * 100.0) / (total_required_count)::numeric), 2))::double precision
    ELSE (0)::double precision
END
table learning.course_progress total_required_count integer NOT NULL DEFAULT 0
table learning.course_progress updated_at timestamp with time zone NOT NULL DEFAULT now()
table learning.course_progress user_id uuid NOT NULL DEFAULT -
table learning.course_progress weighted_grade_average percent DEFAULT -
table learning.enrolment_events completions jsonb DEFAULT -
table learning.enrolment_events course_id uuid NOT NULL DEFAULT -
table learning.enrolment_events created_at timestamp with time zone NOT NULL DEFAULT now()
table learning.enrolment_events created_by uuid DEFAULT -
table learning.enrolment_events event text NOT NULL DEFAULT -
table learning.enrolment_events id uuid NOT NULL DEFAULT uuidv7()
table learning.enrolment_events source text NOT NULL DEFAULT -
table learning.enrolment_events user_id uuid NOT NULL DEFAULT -
table learning.enrolments course_id uuid NOT NULL DEFAULT -
table learning.enrolments enrolled_at timestamp with time zone NOT NULL DEFAULT now()
table learning.enrolments user_id uuid NOT NULL DEFAULT -
table learning.file_grading_entries attempt_id uuid NOT NULL DEFAULT -
table learning.file_grading_entries created_at timestamp with time zone NOT NULL DEFAULT now()
table learning.file_grading_entries feedback text NOT NULL DEFAULT ''::text
table learning.file_grading_entries final_score percent DEFAULT -
table learning.file_grading_entries graded_by uuid DEFAULT -
table learning.file_grading_entries id uuid NOT NULL DEFAULT uuidv7()
table learning.file_grading_entries penalty_pct percent NOT NULL DEFAULT 0
table learning.file_grading_entries raw_score percent DEFAULT -
table learning.file_grading_entries revision integer NOT NULL DEFAULT -
table learning.file_grading_entries status text NOT NULL DEFAULT -
table learning.file_submission_attempts attempt_number integer NOT NULL DEFAULT 1
table learning.file_submission_attempts course_id uuid NOT NULL DEFAULT -
table learning.file_submission_attempts created_at timestamp with time zone NOT NULL DEFAULT now()
table learning.file_submission_attempts feedback text NOT NULL DEFAULT ''::text
table learning.file_submission_attempts file_submission_id uuid NOT NULL DEFAULT -
table learning.file_submission_attempts final_score percent DEFAULT -
table learning.file_submission_attempts graded_at timestamp with time zone DEFAULT -
table learning.file_submission_attempts graded_by uuid DEFAULT -
table learning.file_submission_attempts id uuid NOT NULL DEFAULT uuidv7()
table learning.file_submission_attempts is_late boolean NOT NULL DEFAULT false
table learning.file_submission_attempts late_penalty_pct percent NOT NULL DEFAULT 0
table learning.file_submission_attempts preview boolean NOT NULL DEFAULT false
table learning.file_submission_attempts raw_score percent DEFAULT -
table learning.file_submission_attempts rubric_scores jsonb NOT NULL DEFAULT '{}'::jsonb
table learning.file_submission_attempts started_at timestamp with time zone DEFAULT -
table learning.file_submission_attempts status text NOT NULL DEFAULT 'draft'::text
table learning.file_submission_attempts submitted_at timestamp with time zone DEFAULT -
table learning.file_submission_attempts updated_at timestamp with time zone NOT NULL DEFAULT now()
table learning.file_submission_attempts user_id uuid NOT NULL DEFAULT -
table learning.file_submission_attempts version bigint NOT NULL DEFAULT 1
table learning.file_submission_files attempt_id uuid NOT NULL DEFAULT -
table learning.file_submission_files content_type text NOT NULL DEFAULT ''::text
table learning.file_submission_files created_at timestamp with time zone NOT NULL DEFAULT now()
table learning.file_submission_files display_name text NOT NULL DEFAULT ''::text
table learning.file_submission_files id uuid NOT NULL DEFAULT uuidv7()
table learning.file_submission_files position integer NOT NULL DEFAULT 0
table learning.file_submission_files scan_status text NOT NULL DEFAULT 'pending'::text
table learning.file_submission_files size_bytes bigint DEFAULT -
table learning.file_submission_files storage_key text NOT NULL DEFAULT -
table learning.file_submission_files upload_id uuid NOT NULL DEFAULT -
table learning.file_submission_overrides created_at timestamp with time zone NOT NULL DEFAULT now()
table learning.file_submission_overrides due_at timestamp with time zone NOT NULL DEFAULT -
table learning.file_submission_overrides file_submission_id uuid NOT NULL DEFAULT -
table learning.file_submission_overrides granted_by uuid DEFAULT -
table learning.file_submission_overrides reason text NOT NULL DEFAULT ''::text
table learning.file_submission_overrides updated_at timestamp with time zone NOT NULL DEFAULT now()
table learning.file_submission_overrides user_id uuid NOT NULL DEFAULT -
table learning.file_submissions activity_id uuid NOT NULL DEFAULT -
table learning.file_submissions allow_late boolean NOT NULL DEFAULT true
table learning.file_submissions allowed_mime_types text[] NOT NULL DEFAULT '{}'::text[]
table learning.file_submissions archived_at timestamp with time zone DEFAULT -
table learning.file_submissions course_id uuid NOT NULL DEFAULT -
table learning.file_submissions created_at timestamp with time zone NOT NULL DEFAULT now()
table learning.file_submissions creator_id uuid DEFAULT -
table learning.file_submissions due_at timestamp with time zone DEFAULT -
table learning.file_submissions grade_release_mode text NOT NULL DEFAULT 'immediate'::text
table learning.file_submissions id uuid NOT NULL DEFAULT uuidv7()
table learning.file_submissions instructions text NOT NULL DEFAULT ''::text
table learning.file_submissions late_cutoff_at timestamp with time zone DEFAULT -
table learning.file_submissions late_penalty_max_days integer DEFAULT -
table learning.file_submissions late_penalty_percent_per_day percent DEFAULT -
table learning.file_submissions late_policy_kind text NOT NULL DEFAULT 'none'::text
table learning.file_submissions lifecycle text NOT NULL DEFAULT 'draft'::text
table learning.file_submissions max_attempts integer DEFAULT -
table learning.file_submissions max_file_size_mb integer DEFAULT -
table learning.file_submissions max_files integer NOT NULL DEFAULT 1
table learning.file_submissions published_at timestamp with time zone DEFAULT -
table learning.file_submissions rubric jsonb NOT NULL DEFAULT '{}'::jsonb
table learning.file_submissions settings jsonb NOT NULL DEFAULT '{}'::jsonb
table learning.file_submissions updated_at timestamp with time zone NOT NULL DEFAULT now()
table learning.file_submissions version integer NOT NULL DEFAULT 1
table learning.gamification_completions created_at timestamp with time zone NOT NULL DEFAULT now()
table learning.gamification_completions kind text NOT NULL DEFAULT -
table learning.gamification_completions source_id text NOT NULL DEFAULT -
table learning.gamification_completions user_id uuid NOT NULL DEFAULT -
table learning.gamification_config daily_xp_limit integer DEFAULT -
table learning.gamification_config id smallint NOT NULL DEFAULT -
table learning.gamification_config rewards jsonb NOT NULL DEFAULT '{}'::jsonb
table learning.gamification_config updated_at timestamp with time zone NOT NULL DEFAULT now()
table learning.gamification_config version integer NOT NULL DEFAULT 1
table learning.gamification_profiles created_at timestamp with time zone NOT NULL DEFAULT now()
table learning.gamification_profiles last_learning_at timestamp with time zone DEFAULT -
table learning.gamification_profiles last_login_at timestamp with time zone DEFAULT -
table learning.gamification_profiles last_xp_award_at timestamp with time zone DEFAULT -
table learning.gamification_profiles learning_streak integer NOT NULL DEFAULT 0
table learning.gamification_profiles level integer NOT NULL DEFAULT 1
table learning.gamification_profiles login_streak integer NOT NULL DEFAULT 0
table learning.gamification_profiles longest_learning_streak integer NOT NULL DEFAULT 0
table learning.gamification_profiles longest_login_streak integer NOT NULL DEFAULT 0
table learning.gamification_profiles preferences jsonb NOT NULL DEFAULT '{}'::jsonb
table learning.gamification_profiles total_activities_completed integer NOT NULL DEFAULT 0
table learning.gamification_profiles total_courses_completed integer NOT NULL DEFAULT 0
table learning.gamification_profiles total_xp integer NOT NULL DEFAULT 0
table learning.gamification_profiles updated_at timestamp with time zone NOT NULL DEFAULT now()
table learning.gamification_profiles user_id uuid NOT NULL DEFAULT -
table learning.grading_entries created_at timestamp with time zone NOT NULL DEFAULT now()
table learning.grading_entries effective_breakdown jsonb NOT NULL DEFAULT '{}'::jsonb
table learning.grading_entries final_points score_points DEFAULT -
table learning.grading_entries final_score percent DEFAULT -
table learning.grading_entries graded_by uuid DEFAULT -
table learning.grading_entries id uuid NOT NULL DEFAULT uuidv7()
table learning.grading_entries max_points score_points DEFAULT -
table learning.grading_entries overall_feedback text NOT NULL DEFAULT ''::text
table learning.grading_entries penalty_pct percent NOT NULL DEFAULT 0
table learning.grading_entries published_at timestamp with time zone DEFAULT -
table learning.grading_entries raw_breakdown jsonb NOT NULL DEFAULT '{}'::jsonb
table learning.grading_entries raw_points score_points DEFAULT -
table learning.grading_entries raw_score percent NOT NULL DEFAULT -
table learning.grading_entries revision integer NOT NULL DEFAULT -
table learning.grading_entries submission_id uuid NOT NULL DEFAULT -
table learning.item_feedback annotation_key text DEFAULT -
table learning.item_feedback annotation_type text NOT NULL DEFAULT 'text'::text
table learning.item_feedback annotation_upload_id uuid DEFAULT -
table learning.item_feedback comment text NOT NULL DEFAULT ''::text
table learning.item_feedback created_at timestamp with time zone NOT NULL DEFAULT now()
table learning.item_feedback graded_by uuid DEFAULT -
table learning.item_feedback grading_entry_id uuid NOT NULL DEFAULT -
table learning.item_feedback id uuid NOT NULL DEFAULT uuidv7()
table learning.item_feedback item_id uuid DEFAULT -
table learning.item_feedback item_ref text NOT NULL DEFAULT -
table learning.item_feedback max_score score_points DEFAULT -
table learning.item_feedback score score_points DEFAULT -
table learning.item_feedback submission_id uuid NOT NULL DEFAULT -
table learning.item_feedback updated_at timestamp with time zone NOT NULL DEFAULT now()
table learning.mastery_evidence concept_id uuid NOT NULL DEFAULT -
table learning.mastery_evidence course_id uuid NOT NULL DEFAULT -
table learning.mastery_evidence created_at timestamp with time zone NOT NULL DEFAULT now()
table learning.mastery_evidence id uuid NOT NULL DEFAULT uuidv7()
table learning.mastery_evidence kind text NOT NULL DEFAULT -
table learning.mastery_evidence observed_at timestamp with time zone NOT NULL DEFAULT -
table learning.mastery_evidence part_id uuid DEFAULT -
table learning.mastery_evidence score real NOT NULL DEFAULT -
table learning.mastery_evidence source_id uuid NOT NULL DEFAULT -
table learning.mastery_evidence source_type text NOT NULL DEFAULT -
table learning.mastery_evidence user_id uuid NOT NULL DEFAULT -
table learning.mastery_evidence weight real NOT NULL DEFAULT -
table learning.submission_violations created_at timestamp with time zone NOT NULL DEFAULT now()
table learning.submission_violations event jsonb NOT NULL DEFAULT -
table learning.submission_violations id uuid NOT NULL DEFAULT uuidv7()
table learning.submission_violations submission_id uuid NOT NULL DEFAULT -
table learning.submissions answers jsonb NOT NULL DEFAULT '{}'::jsonb
table learning.submissions assessment_id uuid NOT NULL DEFAULT -
table learning.submissions assessment_version_id uuid DEFAULT -
table learning.submissions attempt_number integer NOT NULL DEFAULT -
table learning.submissions auto_breakdown jsonb DEFAULT -
table learning.submissions auto_score percent DEFAULT -
table learning.submissions auto_submit_attempts integer NOT NULL DEFAULT 0
table learning.submissions auto_submit_reason text DEFAULT -
table learning.submissions auto_submit_retry_at timestamp with time zone DEFAULT -
table learning.submissions auto_submitted_at timestamp with time zone DEFAULT -
table learning.submissions content_version integer NOT NULL DEFAULT 1
table learning.submissions course_id uuid NOT NULL DEFAULT -
table learning.submissions created_at timestamp with time zone NOT NULL DEFAULT now()
table learning.submissions draft_version bigint NOT NULL DEFAULT 1
table learning.submissions duration_seconds integer DEFAULT -
table learning.submissions final_score percent DEFAULT -
table learning.submissions graded_at timestamp with time zone DEFAULT -
table learning.submissions id uuid NOT NULL DEFAULT uuidv7()
table learning.submissions is_late boolean NOT NULL DEFAULT false
table learning.submissions items_snapshot jsonb DEFAULT -
table learning.submissions late_penalty_pct percent NOT NULL DEFAULT 0
table learning.submissions policy_snapshot jsonb DEFAULT -
table learning.submissions preview boolean NOT NULL DEFAULT false
table learning.submissions rules_accepted_at timestamp with time zone DEFAULT -
table learning.submissions started_at timestamp with time zone DEFAULT -
table learning.submissions status text NOT NULL DEFAULT 'draft'::text
table learning.submissions submitted_at timestamp with time zone DEFAULT -
table learning.submissions updated_at timestamp with time zone NOT NULL DEFAULT now()
table learning.submissions user_id uuid NOT NULL DEFAULT -
table learning.submissions version bigint NOT NULL DEFAULT 1
table learning.submissions violation_count integer NOT NULL DEFAULT 0
table learning.submissions violations jsonb NOT NULL DEFAULT '[]'::jsonb
table learning.teacher_interventions course_id uuid NOT NULL DEFAULT -
table learning.teacher_interventions created_at timestamp with time zone NOT NULL DEFAULT now()
table learning.teacher_interventions id uuid NOT NULL DEFAULT uuidv7()
table learning.teacher_interventions intervention_type text NOT NULL DEFAULT -
table learning.teacher_interventions notes text DEFAULT -
table learning.teacher_interventions outcome text DEFAULT -
table learning.teacher_interventions outcome_code text DEFAULT -
table learning.teacher_interventions payload jsonb NOT NULL DEFAULT '{}'::jsonb
table learning.teacher_interventions resolved_at timestamp with time zone DEFAULT -
table learning.teacher_interventions risk_score_after double precision DEFAULT -
table learning.teacher_interventions risk_score_before double precision DEFAULT -
table learning.teacher_interventions status text NOT NULL DEFAULT 'planned'::text
table learning.teacher_interventions teacher_user_id uuid NOT NULL DEFAULT -
table learning.teacher_interventions updated_at timestamp with time zone NOT NULL DEFAULT now()
table learning.teacher_interventions user_id uuid NOT NULL DEFAULT -
table learning.teacher_interventions version integer NOT NULL DEFAULT 1
table learning.trail_legacy_marks activity_id uuid NOT NULL DEFAULT -
table learning.trail_legacy_marks course_id uuid NOT NULL DEFAULT -
table learning.trail_legacy_marks marked_at timestamp with time zone NOT NULL DEFAULT -
table learning.trail_legacy_marks user_id uuid NOT NULL DEFAULT -
table learning.xp_transactions amount integer NOT NULL DEFAULT -
table learning.xp_transactions created_at timestamp with time zone NOT NULL DEFAULT now()
table learning.xp_transactions id uuid NOT NULL DEFAULT uuidv7()
table learning.xp_transactions idempotency_key text DEFAULT -
table learning.xp_transactions previous_level integer NOT NULL DEFAULT -
table learning.xp_transactions reason text DEFAULT -
table learning.xp_transactions source text NOT NULL DEFAULT -
table learning.xp_transactions source_id text DEFAULT -
table learning.xp_transactions triggered_level_up boolean NOT NULL DEFAULT false
table learning.xp_transactions user_id uuid NOT NULL DEFAULT -
table ops.auth_audit_log created_at timestamp with time zone NOT NULL DEFAULT now()
table ops.auth_audit_log event text NOT NULL DEFAULT -
table ops.auth_audit_log id uuid NOT NULL DEFAULT uuidv7()
table ops.auth_audit_log ip_address inet DEFAULT -
table ops.auth_audit_log metadata jsonb NOT NULL DEFAULT '{}'::jsonb
table ops.auth_audit_log user_agent text DEFAULT -
table ops.auth_audit_log user_id uuid DEFAULT -
table ops.idempotency_keys created_at timestamp with time zone NOT NULL DEFAULT now()
table ops.idempotency_keys key text NOT NULL DEFAULT -
table ops.idempotency_keys request_hash text NOT NULL DEFAULT -
table ops.idempotency_keys response jsonb NOT NULL DEFAULT -
table ops.idempotency_keys status_code integer NOT NULL DEFAULT -
table ops.idempotency_keys user_id uuid NOT NULL DEFAULT -
table ops.job_schedules created_at timestamp with time zone NOT NULL DEFAULT now()
table ops.job_schedules enabled boolean NOT NULL DEFAULT true
table ops.job_schedules interval_seconds bigint NOT NULL DEFAULT 60
table ops.job_schedules kind text NOT NULL DEFAULT -
table ops.job_schedules last_run_at timestamp with time zone DEFAULT -
table ops.job_schedules next_run_at timestamp with time zone NOT NULL DEFAULT -
table ops.job_schedules payload jsonb NOT NULL DEFAULT '{}'::jsonb
table ops.job_schedules updated_at timestamp with time zone NOT NULL DEFAULT now()
table ops.jobs attempts integer NOT NULL DEFAULT 0
table ops.jobs created_at timestamp with time zone NOT NULL DEFAULT now()
table ops.jobs dedupe_key text DEFAULT -
table ops.jobs heartbeat_at timestamp with time zone DEFAULT -
table ops.jobs id uuid NOT NULL DEFAULT uuidv7()
table ops.jobs kind text NOT NULL DEFAULT -
table ops.jobs last_error text DEFAULT -
table ops.jobs locked_at timestamp with time zone DEFAULT -
table ops.jobs locked_by text DEFAULT -
table ops.jobs max_attempts integer NOT NULL DEFAULT 5
table ops.jobs payload jsonb NOT NULL DEFAULT '{}'::jsonb
table ops.jobs priority smallint NOT NULL DEFAULT 0
table ops.jobs run_at timestamp with time zone NOT NULL DEFAULT now()
table ops.jobs status text NOT NULL DEFAULT 'queued'::text
table ops.jobs updated_at timestamp with time zone NOT NULL DEFAULT now()
table ops.schema_skipped_checks expr text NOT NULL DEFAULT -
table ops.schema_skipped_checks name text NOT NULL DEFAULT -
table ops.schema_skipped_checks skipped_at timestamp with time zone NOT NULL DEFAULT now()
table ops.schema_skipped_checks table_name text NOT NULL DEFAULT -
trigger CREATE CONSTRAINT TRIGGER grading_entries_current AFTER INSERT ON learning.grading_entries DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION grading_entries_current_check()
trigger CREATE CONSTRAINT TRIGGER submissions_current_grade AFTER UPDATE OF final_score ON learning.submissions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN (((old.final_score)::numeric IS DISTINCT FROM (new.final_score)::numeric)) EXECUTE FUNCTION submissions_current_grade_check()
trigger CREATE TRIGGER activities_keep_assessment_type BEFORE UPDATE OF activity_type ON core.activities FOR EACH ROW WHEN ((old.activity_type IS DISTINCT FROM new.activity_type)) EXECUTE FUNCTION activities_keep_assessment_type()
trigger CREATE TRIGGER activities_required_from_settings BEFORE INSERT OR UPDATE OF settings ON core.activities FOR EACH ROW EXECUTE FUNCTION activities_required_from_settings()
trigger CREATE TRIGGER activities_touch BEFORE UPDATE ON core.activities FOR EACH ROW EXECUTE FUNCTION touch_row()
trigger CREATE TRIGGER activity_progress_touch BEFORE UPDATE ON learning.activity_progress FOR EACH ROW EXECUTE FUNCTION touch_row()
trigger CREATE TRIGGER ai_course_settings_touch BEFORE UPDATE ON ai.ai_course_settings FOR EACH ROW EXECUTE FUNCTION touch_row()
trigger CREATE TRIGGER ai_grade_drafts_same_activity BEFORE INSERT ON ai.ai_grade_drafts FOR EACH ROW EXECUTE FUNCTION ai_grade_drafts_same_activity()
trigger CREATE TRIGGER ai_grade_drafts_touch BEFORE UPDATE ON ai.ai_grade_drafts FOR EACH ROW EXECUTE FUNCTION touch_row()
trigger CREATE TRIGGER ai_remediation_sessions_touch BEFORE UPDATE ON ai.ai_remediation_sessions FOR EACH ROW EXECUTE FUNCTION touch_row()
trigger CREATE TRIGGER ai_student_memory_touch BEFORE UPDATE ON ai.ai_student_memory FOR EACH ROW EXECUTE FUNCTION touch_row()
trigger CREATE TRIGGER ai_threads_touch BEFORE UPDATE ON ai.ai_threads FOR EACH ROW EXECUTE FUNCTION touch_row()
trigger CREATE TRIGGER analytics_saved_views_touch BEFORE UPDATE ON analytics.analytics_saved_views FOR EACH ROW EXECUTE FUNCTION touch_row()
trigger CREATE TRIGGER assessment_items_touch BEFORE UPDATE ON learning.assessment_items FOR EACH ROW EXECUTE FUNCTION touch_row()
trigger CREATE TRIGGER assessment_overrides_touch BEFORE UPDATE ON learning.assessment_overrides FOR EACH ROW EXECUTE FUNCTION touch_row('version')
trigger CREATE TRIGGER assessment_versions_frozen BEFORE UPDATE ON learning.assessment_versions FOR EACH ROW EXECUTE FUNCTION assessment_versions_frozen()
trigger CREATE TRIGGER assessment_versions_points BEFORE INSERT ON learning.assessment_versions FOR EACH ROW EXECUTE FUNCTION assessment_versions_points()
trigger CREATE TRIGGER assessments_touch BEFORE UPDATE ON learning.assessments FOR EACH ROW EXECUTE FUNCTION touch_row('version')
trigger CREATE TRIGGER blocks_touch BEFORE UPDATE ON core.blocks FOR EACH ROW EXECUTE FUNCTION touch_row()
trigger CREATE TRIGGER blocks_upload_ids AFTER INSERT OR UPDATE OF content, claimed ON core.blocks FOR EACH ROW EXECUTE FUNCTION block_uploads_sync()
trigger CREATE TRIGGER certificate_users_frozen BEFORE UPDATE ON learning.certificate_users FOR EACH ROW EXECUTE FUNCTION certificate_users_frozen()
trigger CREATE TRIGGER certificate_users_touch BEFORE UPDATE ON learning.certificate_users FOR EACH ROW EXECUTE FUNCTION touch_row()
trigger CREATE TRIGGER certifications_touch BEFORE UPDATE ON learning.certifications FOR EACH ROW EXECUTE FUNCTION touch_row('version')
trigger CREATE TRIGGER chapters_touch BEFORE UPDATE ON core.chapters FOR EACH ROW EXECUTE FUNCTION touch_row('version')
trigger CREATE TRIGGER chapters_upload_ids BEFORE INSERT OR UPDATE OF thumbnail_key ON core.chapters FOR EACH ROW EXECUTE FUNCTION upload_ids_from_keys('thumbnail_key', 'thumbnail_upload_id')
trigger CREATE TRIGGER collection_staff_touch BEFORE UPDATE ON core.collection_staff FOR EACH ROW EXECUTE FUNCTION touch_row('version')
trigger CREATE TRIGGER collections_touch BEFORE UPDATE ON core.collections FOR EACH ROW EXECUTE FUNCTION touch_row()
trigger CREATE TRIGGER collections_upload_ids BEFORE INSERT OR UPDATE OF cover_key ON core.collections FOR EACH ROW EXECUTE FUNCTION upload_ids_from_keys('cover_key', 'cover_upload_id')
trigger CREATE TRIGGER concept_tags_touch BEFORE UPDATE ON learning.concept_tags FOR EACH ROW EXECUTE FUNCTION touch_row()
trigger CREATE TRIGGER course_concepts_touch BEFORE UPDATE ON learning.course_concepts FOR EACH ROW EXECUTE FUNCTION touch_row()
trigger CREATE TRIGGER course_discussions_recount_replies AFTER INSERT OR DELETE OR UPDATE OF status, parent_id ON core.course_discussions FOR EACH ROW EXECUTE FUNCTION course_discussions_recount_replies()
trigger CREATE TRIGGER course_discussions_touch BEFORE UPDATE ON core.course_discussions FOR EACH ROW EXECUTE FUNCTION touch_row('version', 'status', 'content')
trigger CREATE TRIGGER course_discussions_upload_ids AFTER INSERT OR UPDATE OF content ON core.course_discussions FOR EACH ROW EXECUTE FUNCTION post_uploads_sync()
trigger CREATE TRIGGER course_progress_touch BEFORE UPDATE ON learning.course_progress FOR EACH ROW EXECUTE FUNCTION touch_row()
trigger CREATE TRIGGER course_staff_touch BEFORE UPDATE ON core.course_staff FOR EACH ROW EXECUTE FUNCTION touch_row('version')
trigger CREATE TRIGGER course_updates_touch BEFORE UPDATE ON core.course_updates FOR EACH ROW EXECUTE FUNCTION touch_row('version')
trigger CREATE TRIGGER courses_touch BEFORE UPDATE ON core.courses FOR EACH ROW EXECUTE FUNCTION touch_row('version')
trigger CREATE TRIGGER courses_upload_ids BEFORE INSERT OR UPDATE OF thumbnail_image_key, thumbnail_video_key ON core.courses FOR EACH ROW EXECUTE FUNCTION upload_ids_from_keys('thumbnail_image_key', 'thumbnail_image_upload_id', 'thumbnail_video_key', 'thumbnail_video_upload_id')
trigger CREATE TRIGGER discussion_reactions_recount AFTER INSERT OR DELETE OR UPDATE ON core.discussion_reactions FOR EACH ROW EXECUTE FUNCTION discussion_reactions_recount()
trigger CREATE TRIGGER file_grading_entries_append_only BEFORE DELETE ON learning.file_grading_entries FOR EACH ROW EXECUTE FUNCTION file_grading_entries_no_delete()
trigger CREATE TRIGGER file_grading_entries_immutable BEFORE UPDATE ON learning.file_grading_entries FOR EACH ROW EXECUTE FUNCTION file_grading_entries_immutable()
trigger CREATE TRIGGER file_grading_entries_number BEFORE INSERT ON learning.file_grading_entries FOR EACH ROW EXECUTE FUNCTION file_grading_entries_number()
trigger CREATE TRIGGER file_submission_attempts_touch BEFORE UPDATE ON learning.file_submission_attempts FOR EACH ROW EXECUTE FUNCTION touch_row()
trigger CREATE TRIGGER file_submission_overrides_touch BEFORE UPDATE ON learning.file_submission_overrides FOR EACH ROW EXECUTE FUNCTION touch_row()
trigger CREATE TRIGGER file_submissions_touch BEFORE UPDATE ON learning.file_submissions FOR EACH ROW EXECUTE FUNCTION touch_row('version')
trigger CREATE TRIGGER gamification_config_touch BEFORE UPDATE ON learning.gamification_config FOR EACH ROW EXECUTE FUNCTION touch_row('version')
trigger CREATE TRIGGER gamification_profiles_touch BEFORE UPDATE ON learning.gamification_profiles FOR EACH ROW EXECUTE FUNCTION touch_row()
trigger CREATE TRIGGER grading_entries_append_only BEFORE DELETE ON learning.grading_entries FOR EACH ROW EXECUTE FUNCTION grading_entries_no_delete()
trigger CREATE TRIGGER grading_entries_immutable BEFORE UPDATE ON learning.grading_entries FOR EACH ROW EXECUTE FUNCTION grading_entries_guard()
trigger CREATE TRIGGER grading_entries_number BEFORE INSERT ON learning.grading_entries FOR EACH ROW EXECUTE FUNCTION grading_entries_number()
trigger CREATE TRIGGER grading_entries_points BEFORE INSERT ON learning.grading_entries FOR EACH ROW EXECUTE FUNCTION grading_entries_points()
trigger CREATE TRIGGER item_feedback_frozen BEFORE UPDATE ON learning.item_feedback FOR EACH ROW EXECUTE FUNCTION item_feedback_frozen()
trigger CREATE TRIGGER item_feedback_touch BEFORE UPDATE ON learning.item_feedback FOR EACH ROW EXECUTE FUNCTION touch_row()
trigger CREATE TRIGGER item_feedback_upload_ids BEFORE INSERT OR UPDATE OF annotation_key ON learning.item_feedback FOR EACH ROW EXECUTE FUNCTION upload_ids_from_keys('annotation_key', 'annotation_upload_id')
trigger CREATE TRIGGER job_schedules_touch BEFORE UPDATE ON ops.job_schedules FOR EACH ROW EXECUTE FUNCTION touch_row()
trigger CREATE TRIGGER jobs_touch BEFORE UPDATE ON ops.jobs FOR EACH ROW EXECUTE FUNCTION touch_row()
trigger CREATE TRIGGER platforms_touch BEFORE UPDATE ON core.platforms FOR EACH ROW EXECUTE FUNCTION touch_row('version')
trigger CREATE TRIGGER platforms_upload_ids BEFORE INSERT OR UPDATE OF logo_key, thumbnail_key ON core.platforms FOR EACH ROW EXECUTE FUNCTION upload_ids_from_keys('logo_key', 'logo_upload_id', 'thumbnail_key', 'thumbnail_upload_id')
trigger CREATE TRIGGER roles_touch BEFORE UPDATE ON core.roles FOR EACH ROW EXECUTE FUNCTION touch_row('version')
trigger CREATE TRIGGER submissions_snapshots_frozen BEFORE UPDATE OF items_snapshot, policy_snapshot, assessment_version_id ON learning.submissions FOR EACH ROW EXECUTE FUNCTION submissions_snapshots_frozen()
trigger CREATE TRIGGER submissions_touch BEFORE UPDATE ON learning.submissions FOR EACH ROW EXECUTE FUNCTION touch_row()
trigger CREATE TRIGGER teacher_interventions_touch BEFORE UPDATE ON learning.teacher_interventions FOR EACH ROW EXECUTE FUNCTION touch_row('version')
trigger CREATE TRIGGER translations_touch BEFORE UPDATE ON core.translations FOR EACH ROW EXECUTE FUNCTION touch_row()
trigger CREATE TRIGGER translations_touch_platform AFTER INSERT OR DELETE OR UPDATE ON core.translations FOR EACH ROW EXECUTE FUNCTION translations_touch_platform()
trigger CREATE TRIGGER uploads_touch BEFORE UPDATE ON core.uploads FOR EACH ROW EXECUTE FUNCTION touch_row()
trigger CREATE TRIGGER usergroups_touch BEFORE UPDATE ON core.usergroups FOR EACH ROW EXECUTE FUNCTION touch_row('version')
trigger CREATE TRIGGER users_reissue_certificates AFTER UPDATE OF display_name ON core.users FOR EACH ROW WHEN ((old.display_name IS DISTINCT FROM new.display_name)) EXECUTE FUNCTION users_reissue_certificates()
trigger CREATE TRIGGER users_sync_state BEFORE INSERT OR UPDATE ON core.users FOR EACH ROW EXECUTE FUNCTION users_sync_state()
trigger CREATE TRIGGER users_touch BEFORE UPDATE ON core.users FOR EACH ROW EXECUTE FUNCTION touch_row()
trigger CREATE TRIGGER users_upload_ids BEFORE INSERT OR UPDATE OF avatar_key ON core.users FOR EACH ROW EXECUTE FUNCTION upload_ids_from_keys('avatar_key', 'avatar_upload_id')
view core.course_progress_v  SELECT e.course_id,
    e.user_id,
    count(r.activity_id)::integer AS total_required_count,
    count(r.completed_at)::integer AS completed_required_count,
        CASE
            WHEN count(r.activity_id) > 0 THEN round(count(r.completed_at)::numeric * 100.0 / count(r.activity_id)::numeric, 2)::double precision
            ELSE 0::double precision
        END AS progress_pct,
    count(r.activity_id) > 0 AND count(r.completed_at) = count(r.activity_id) AS certificate_eligible,
        CASE
            WHEN count(r.activity_id) > 0 AND count(r.completed_at) = count(r.activity_id) THEN max(r.completed_at)
            ELSE NULL::timestamp with time zone
        END AS completed_at
   FROM enrolments e
     LEFT JOIN LATERAL ( SELECT a.id AS activity_id,
            c.completed_at
           FROM activities a
             LEFT JOIN completions c ON c.activity_id = a.id AND c.user_id = e.user_id
          WHERE a.course_id = e.course_id AND a.published AND (a.activity_type = 'file_submission'::text OR (EXISTS ( SELECT 1
                   FROM assessments s
                  WHERE s.activity_id = a.id)) OR a.required) AND NOT (EXISTS ( SELECT 1
                   FROM assessments s
                  WHERE s.activity_id = a.id AND s.access_mode = 'restricted'::text AND NOT (EXISTS ( SELECT 1
                           FROM assessment_access_users u
                          WHERE u.assessment_id = s.id AND u.user_id = e.user_id)) AND NOT (EXISTS ( SELECT 1
                           FROM assessment_access_usergroups g
                             JOIN usergroup_members m ON m.usergroup_id = g.usergroup_id
                          WHERE g.assessment_id = s.id AND m.user_id = e.user_id))))) r ON true
  WHERE NOT is_course_staff(e.course_id, e.user_id)
  GROUP BY e.course_id, e.user_id;
view learning.course_members  SELECT course_id,
    user_id,
    enrolled_at
   FROM enrolments e
  WHERE NOT is_course_staff(course_id, user_id);
view learning.learner_visible_activities  SELECT id AS activity_id,
    course_id
   FROM activities a
  WHERE published AND NOT (EXISTS ( SELECT 1
           FROM file_submissions f
          WHERE f.activity_id = a.id AND f.lifecycle <> 'published'::text)) AND NOT (EXISTS ( SELECT 1
           FROM assessments s
          WHERE s.activity_id = a.id AND s.lifecycle <> 'published'::text));
