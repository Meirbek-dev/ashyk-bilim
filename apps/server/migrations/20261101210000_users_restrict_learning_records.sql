-- Schema review item 2: a DELETE FROM users no longer wipes what the person
-- made or earned. Learning records (attempts, submissions and through them
-- the append-only grade journal, code runs, issued certificates, progress,
-- enrolments, XP, uploaded files) refuse the delete (RESTRICT) instead of
-- cascading. The app never deletes a users row: self-deletion anonymises
-- (20261024000020_users_deleted_at) and admins disable accounts. A manual
-- erasure now deletes or anonymises these rows explicitly first
-- (docs/RUNBOOK.md "Erasing a person").
--
-- Each key is re-created with the same name. The old key already guaranteed
-- every row, so NOT VALID + VALIDATE only re-checks clean data.

ALTER TABLE submissions DROP CONSTRAINT submissions_user_id_fkey,
    ADD CONSTRAINT submissions_user_id_fkey FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE RESTRICT NOT VALID;
ALTER TABLE file_submission_attempts DROP CONSTRAINT file_submission_attempts_user_id_fkey,
    ADD CONSTRAINT file_submission_attempts_user_id_fkey FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE RESTRICT NOT VALID;
ALTER TABLE code_runs DROP CONSTRAINT code_runs_user_id_fkey,
    ADD CONSTRAINT code_runs_user_id_fkey FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE RESTRICT NOT VALID;
ALTER TABLE certificate_users DROP CONSTRAINT certificate_users_user_id_fkey,
    ADD CONSTRAINT certificate_users_user_id_fkey FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE RESTRICT NOT VALID;
ALTER TABLE activity_progress DROP CONSTRAINT activity_progress_user_id_fkey,
    ADD CONSTRAINT activity_progress_user_id_fkey FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE RESTRICT NOT VALID;
ALTER TABLE course_progress DROP CONSTRAINT course_progress_user_id_fkey,
    ADD CONSTRAINT course_progress_user_id_fkey FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE RESTRICT NOT VALID;
ALTER TABLE trails DROP CONSTRAINT trails_user_id_fkey,
    ADD CONSTRAINT trails_user_id_fkey FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE RESTRICT NOT VALID;
ALTER TABLE trail_runs DROP CONSTRAINT trail_runs_user_id_fkey,
    ADD CONSTRAINT trail_runs_user_id_fkey FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE RESTRICT NOT VALID;
ALTER TABLE trail_steps DROP CONSTRAINT trail_steps_user_id_fkey,
    ADD CONSTRAINT trail_steps_user_id_fkey FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE RESTRICT NOT VALID;
ALTER TABLE gamification_profiles DROP CONSTRAINT gamification_profiles_user_id_fkey,
    ADD CONSTRAINT gamification_profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE RESTRICT NOT VALID;
ALTER TABLE gamification_completions DROP CONSTRAINT gamification_completions_user_id_fkey,
    ADD CONSTRAINT gamification_completions_user_id_fkey FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE RESTRICT NOT VALID;
ALTER TABLE xp_transactions DROP CONSTRAINT xp_transactions_user_id_fkey,
    ADD CONSTRAINT xp_transactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE RESTRICT NOT VALID;
ALTER TABLE uploads DROP CONSTRAINT uploads_created_by_fkey,
    ADD CONSTRAINT uploads_created_by_fkey FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE RESTRICT NOT VALID;

ALTER TABLE submissions VALIDATE CONSTRAINT submissions_user_id_fkey;
ALTER TABLE file_submission_attempts VALIDATE CONSTRAINT file_submission_attempts_user_id_fkey;
ALTER TABLE code_runs VALIDATE CONSTRAINT code_runs_user_id_fkey;
ALTER TABLE certificate_users VALIDATE CONSTRAINT certificate_users_user_id_fkey;
ALTER TABLE activity_progress VALIDATE CONSTRAINT activity_progress_user_id_fkey;
ALTER TABLE course_progress VALIDATE CONSTRAINT course_progress_user_id_fkey;
ALTER TABLE trails VALIDATE CONSTRAINT trails_user_id_fkey;
ALTER TABLE trail_runs VALIDATE CONSTRAINT trail_runs_user_id_fkey;
ALTER TABLE trail_steps VALIDATE CONSTRAINT trail_steps_user_id_fkey;
ALTER TABLE gamification_profiles VALIDATE CONSTRAINT gamification_profiles_user_id_fkey;
ALTER TABLE gamification_completions VALIDATE CONSTRAINT gamification_completions_user_id_fkey;
ALTER TABLE xp_transactions VALIDATE CONSTRAINT xp_transactions_user_id_fkey;
ALTER TABLE uploads VALIDATE CONSTRAINT uploads_created_by_fkey;
