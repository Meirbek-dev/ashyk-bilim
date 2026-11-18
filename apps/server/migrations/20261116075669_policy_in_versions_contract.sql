-- Policy in versions, contract (REWRITE 5.8 item 10, review note n7).
-- contract: 20261116075666 reads every policy from the assessment's current version and writes none into
-- `assessments`; the release before it, which read and wrote the columns, no longer runs. This file drops the
-- 28 policy columns of `assessments` (their checks and the switch's defaults with them) and the triggers that
-- kept them, the versions and the drafts' base versions in step for that release.
-- data-fix: a hand-in that release versioned after the switch (its own shape: the effective nine fields) is
-- rebuilt as the switch rebuilt the older ones, by the same function, before the columns it reads go.
SET LOCAL lock_timeout = '5s';
SET LOCAL ab.bookkeeping = 'on';

DROP TRIGGER assessments_policy_in_step ON assessments;
DROP TRIGGER assessments_version_created ON assessments;
DROP TRIGGER assessments_version_items ON assessments;
DROP TRIGGER submissions_base_version ON submissions;
DROP FUNCTION assessments_policy_in_step();
DROP FUNCTION assessments_version_sync();
DROP FUNCTION submissions_base_version();

DO $$
DECLARE
    r record;
BEGIN
    SELECT * INTO r FROM assessment_versions_rebuild();
    RAISE NOTICE 'policy in versions: % versions rebuilt, % merged, % keep a policy the assessment no longer has',
        r.rebuilt, r.merged, r.differ;
END $$;
DROP FUNCTION assessment_versions_rebuild();
DROP FUNCTION assessment_snapshot_value_ok(text, jsonb);
DROP FUNCTION assessment_policy_columns(learning.assessments);

ALTER TABLE assessments
    DROP COLUMN grading_mode,
    DROP COLUMN grade_release_mode,
    DROP COLUMN completion_rule,
    DROP COLUMN passing_score,
    DROP COLUMN max_attempts,
    DROP COLUMN time_limit_seconds,
    DROP COLUMN due_at,
    DROP COLUMN allow_late,
    DROP COLUMN late_policy_kind,
    DROP COLUMN late_penalty_percent_per_day,
    DROP COLUMN late_penalty_max_days,
    DROP COLUMN late_cutoff_at,
    DROP COLUMN required,
    DROP COLUMN review_visibility,
    DROP COLUMN randomize_questions,
    DROP COLUMN randomize_options,
    DROP COLUMN partial_credit,
    DROP COLUMN negative_marking_percent,
    DROP COLUMN grace_period_seconds,
    DROP COLUMN copy_paste_protection,
    DROP COLUMN tab_switch_detection,
    DROP COLUMN devtools_detection,
    DROP COLUMN right_click_disabled,
    DROP COLUMN fullscreen_required,
    DROP COLUMN violation_threshold,
    DROP COLUMN attempt_penalty_percent,
    DROP COLUMN draw_count,
    DROP COLUMN draw_strata;

-- A save still leaves `version` (If-Match) alone; the policy columns it left out are gone.
DROP TRIGGER assessments_touch ON assessments;
CREATE TRIGGER assessments_touch BEFORE UPDATE ON assessments FOR EACH ROW
    EXECUTE FUNCTION touch_row('version', '-current_version_id');

-- Readers join the current version: an assessment that commits without one would vanish from them. One a writer
-- left without a save gets the presets' base (`assessment_policy_default`), as the switch gave the previous
-- release's inserts; this release's writers save in the same transaction, so this finds it and does nothing.
CREATE FUNCTION assessments_first_version() RETURNS trigger LANGUAGE plpgsql
SET search_path = public, core, learning, ai, analytics, ops, extensions, pg_temp AS $$
BEGIN
    IF EXISTS (SELECT 1 FROM assessments WHERE id = NEW.id AND current_version_id IS NULL) THEN
        PERFORM assessment_version_save(NEW.id, NULL);
    END IF;
    RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER assessments_first_version AFTER INSERT OR UPDATE OF current_version_id ON assessments
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION assessments_first_version();

-- Every version is in the document's shape now: the check holds for all of them.
ALTER TABLE assessment_versions DROP CONSTRAINT IF EXISTS assessment_versions_policy_check;
SELECT schema_try_check('learning.assessment_versions', 'assessment_versions_policy_check',
                        $$policy ?& assessment_policy_keys() AND assessment_policy_ok(policy)$$);
