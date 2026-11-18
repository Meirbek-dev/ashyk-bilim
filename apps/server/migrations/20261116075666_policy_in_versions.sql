-- Policy in versions, switch (REWRITE 5.8 item 10, review note n7; owner decisions 2026-11-18).
--
-- An assessment's policy (the block `PUT /assessments/{id}/policy` replaces: attempts, time limit, due date and
-- lateness, passing score, grading and release, review, randomisation and draws, anti-cheat) lives in its
-- versions. Every save writes one (drafts too): `assessments.current_version_id` names the version in force, its
-- `policy` is the canonical document `assessment_policy_doc()` builds, and readers take it typed through
-- `assessment_policy_v`. `assessments` keeps identity, status, the details (description, weight, grading kind),
-- the access marker and the counters. A version also gets `items_sha256`, the hash of its items alone: an
-- attempt is stale when the version it started on (`submissions.base_version_id`) has other items than the
-- current one, so a policy-only save stales nothing.
--
-- data-fix: old versions are rebuilt to the new shape. A version's policy was the hand-in's effective nine fields
-- (an override's due date and attempts, a preview's lifted cap); it becomes the assessment's policy apart from
-- `assessment_overrides`: each field is the assessment's stored value, except a snapshot value that differs and
-- that no override (of a learner who handed in against the version) or preview explains, which counts as the
-- assessment's policy at that time. A file task's caps and rubric stay in its hand-in versions. Versions the
-- rebuild makes identical merge into the lowest number (their hand-ins name it), past the frozen rows' guards as
-- earlier data fixes did.
--
-- The previous release reads and writes the policy columns of `assessments`, `content_version` and
-- `submissions.content_version` and knows no version but its hand-in's, so triggers keep both sides in step
-- until the contract drops the columns: a current version this release sets fills the columns, a policy the
-- previous release writes becomes a version, an assessment it creates or whose items it changes gets one at
-- commit, and a draft it opens or re-syncs names the current version while its `content_version` is current.
SET LOCAL lock_timeout = '5s';
SET LOCAL ab.bookkeeping = 'on';

-- ── The policy document ─────────────────────────────────────────────────────

-- The one canonical form of a policy: the 28 keys, typed, percentages to two decimals, instants as epoch
-- seconds. The server and the triggers build every version's policy through it, so equal policies are equal
-- text (and hash alike).
CREATE FUNCTION assessment_policy_doc(p jsonb) RETURNS jsonb LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path = public, core, learning, ai, analytics, ops, extensions, pg_temp
RETURN jsonb_build_object(
    'grading_mode', p ->> 'grading_mode',
    'grade_release_mode', p ->> 'grade_release_mode',
    'completion_rule', p ->> 'completion_rule',
    'passing_score', round((p ->> 'passing_score')::numeric, 2),
    'max_attempts', (p ->> 'max_attempts')::integer,
    'time_limit_seconds', (p ->> 'time_limit_seconds')::integer,
    'due_at', round((p ->> 'due_at')::numeric)::bigint,
    'allow_late', (p ->> 'allow_late')::boolean,
    'late_policy_kind', p ->> 'late_policy_kind',
    'late_penalty_percent_per_day', round((p ->> 'late_penalty_percent_per_day')::numeric, 2),
    'late_penalty_max_days', (p ->> 'late_penalty_max_days')::integer,
    'late_cutoff_at', round((p ->> 'late_cutoff_at')::numeric)::bigint,
    'required', (p ->> 'required')::boolean,
    'review_visibility', p ->> 'review_visibility',
    'randomize_questions', (p ->> 'randomize_questions')::boolean,
    'randomize_options', (p ->> 'randomize_options')::boolean,
    'partial_credit', (p ->> 'partial_credit')::boolean,
    'negative_marking_percent', round((p ->> 'negative_marking_percent')::numeric, 2),
    'grace_period_seconds', (p ->> 'grace_period_seconds')::integer,
    'copy_paste_protection', (p ->> 'copy_paste_protection')::boolean,
    'tab_switch_detection', (p ->> 'tab_switch_detection')::boolean,
    'devtools_detection', (p ->> 'devtools_detection')::boolean,
    'right_click_disabled', (p ->> 'right_click_disabled')::boolean,
    'fullscreen_required', (p ->> 'fullscreen_required')::boolean,
    'violation_threshold', (p ->> 'violation_threshold')::integer,
    'attempt_penalty_percent', round((p ->> 'attempt_penalty_percent')::numeric, 2),
    'draw_count', (p ->> 'draw_count')::integer,
    'draw_strata', CASE WHEN jsonb_typeof(p -> 'draw_strata') = 'array' THEN p -> 'draw_strata' END);

-- The keys of the document (what a hand-in version keeps beside them is its own: a file task's caps, rubric).
CREATE FUNCTION assessment_policy_keys() RETURNS text[] LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path = public, core, learning, ai, analytics, ops, extensions, pg_temp
RETURN ARRAY['grading_mode', 'grade_release_mode', 'completion_rule', 'passing_score', 'max_attempts',
             'time_limit_seconds', 'due_at', 'allow_late', 'late_policy_kind', 'late_penalty_percent_per_day',
             'late_penalty_max_days', 'late_cutoff_at', 'required', 'review_visibility', 'randomize_questions',
             'randomize_options', 'partial_credit', 'negative_marking_percent', 'grace_period_seconds',
             'copy_paste_protection', 'tab_switch_detection', 'devtools_detection', 'right_click_disabled',
             'fullscreen_required', 'violation_threshold', 'attempt_penalty_percent', 'draw_count', 'draw_strata'];

-- A new assessment's policy before its first save names one (the presets' base, `PolicyInput::preset`).
CREATE FUNCTION assessment_policy_default() RETURNS jsonb LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path = public, core, learning, ai, analytics, ops, extensions, pg_temp
RETURN assessment_policy_doc('{"grading_mode": "auto", "grade_release_mode": "immediate",
    "completion_rule": "passed", "passing_score": 60, "allow_late": true, "late_policy_kind": "none",
    "required": false, "review_visibility": "score_only", "randomize_questions": false,
    "randomize_options": false, "partial_credit": true, "negative_marking_percent": 0,
    "grace_period_seconds": 0, "copy_paste_protection": false, "tab_switch_detection": false,
    "devtools_detection": false, "right_click_disabled": false, "fullscreen_required": false,
    "violation_threshold": 3, "attempt_penalty_percent": 0}');

-- The policy the previous release keeps in the columns (the triggers below; the contract drops it).
CREATE FUNCTION assessment_policy_columns(a learning.assessments) RETURNS jsonb LANGUAGE sql STABLE
SET search_path = public, core, learning, ai, analytics, ops, extensions, pg_temp
RETURN assessment_policy_doc(to_jsonb(a) || jsonb_build_object('due_at', extract(epoch FROM a.due_at),
                                                               'late_cutoff_at', extract(epoch FROM a.late_cutoff_at)));

-- ── Versions ────────────────────────────────────────────────────────────────

CREATE FUNCTION assessment_items_sha256(items jsonb) RETURNS bytea LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path = public, core, learning, ai, analytics, ops, extensions, pg_temp
RETURN sha256(convert_to(items::text, 'UTF8'));

ALTER TABLE assessment_versions
    ADD COLUMN items_sha256 bytea GENERATED ALWAYS AS (assessment_items_sha256(items)) STORED,
    ADD CONSTRAINT assessment_versions_items_sha256_check CHECK (octet_length(items_sha256) = 32);
COMMENT ON COLUMN assessment_versions.items_sha256 IS
    'sha256 of the items alone: an attempt is stale when its base version''s differs from the current one''s.';
COMMENT ON TABLE assessment_versions IS
    'An assessment''s items + policy as saved (every save; the current one is assessments.current_version_id) '
    'or as handed in (a draw''s questions); content-addressed, numbered per assessment, frozen.';

-- The assessment's items as a version holds them (a file task: its one hand-in item, worth 100).
CREATE FUNCTION assessment_items_doc(a uuid) RETURNS jsonb LANGUAGE sql STABLE
SET search_path = public, core, learning, ai, analytics, ops, extensions, pg_temp
RETURN CASE WHEN EXISTS (SELECT 1 FROM file_submissions f WHERE f.id = a)
            THEN '{"items": [{"kind": "files", "max_score": 100}]}'::jsonb
            ELSE jsonb_build_object('items', coalesce(
                (SELECT jsonb_agg(jsonb_build_object('id', i.id, 'kind', i.kind, 'title', i.title,
                                                     'max_score', i.max_score, 'position', i.position,
                                                     'body', i.body) ORDER BY i.position, i.id)
                   FROM assessment_items i WHERE i.assessment_id = a), '[]'::jsonb)) END;

-- The version holding exactly these items and this policy (equal as JSON values), created when new; the
-- current one first. The advisory lock is `ab_db::assessment_versions::ensure`'s: numbering serialises.
CREATE FUNCTION assessment_version_for(p_assessment uuid, p_items jsonb, p_policy jsonb) RETURNS uuid
LANGUAGE plpgsql SET search_path = public, core, learning, ai, analytics, ops, extensions, pg_temp AS $$
DECLARE
    found_id uuid;
BEGIN
    PERFORM pg_advisory_xact_lock(hashtextextended('assessment-version:' || p_assessment::text, 0));
    SELECT v.id INTO found_id FROM assessment_versions v
     WHERE v.assessment_id = p_assessment AND v.items = p_items AND v.policy = p_policy
     ORDER BY v.id = (SELECT a.current_version_id FROM assessments a WHERE a.id = p_assessment) DESC NULLS LAST,
              v.number DESC
     LIMIT 1;
    IF found_id IS NULL THEN
        INSERT INTO assessment_versions (assessment_id, number, items, policy)
        SELECT p_assessment, coalesce(max(v.number), 0) + 1, p_items, p_policy
          FROM assessment_versions v WHERE v.assessment_id = p_assessment
        RETURNING id INTO found_id;
    END IF;
    RETURN found_id;
END $$;

-- A save: the assessment's items as they are now and its policy (`p_patch` over the current one; NULL keeps
-- it) become its current version. `p_cosmetic` (a wording edit, a reorder: the answer key is the same) moves
-- the drafts that were on the current items with it. Returns the version.
CREATE FUNCTION assessment_version_save(p_assessment uuid, p_patch jsonb, p_cosmetic boolean DEFAULT false)
RETURNS uuid LANGUAGE plpgsql
SET search_path = public, core, learning, ai, analytics, ops, extensions, pg_temp AS $$
DECLARE
    cur assessment_versions;
    new_items jsonb;
    new_policy jsonb;
    saved uuid;
BEGIN
    SELECT v.* INTO cur FROM assessment_versions v
      JOIN assessments a ON a.current_version_id = v.id WHERE a.id = p_assessment;
    new_items := assessment_items_doc(p_assessment);
    IF cur.items = new_items THEN
        new_items := cur.items;
    END IF;
    new_policy := assessment_policy_doc(coalesce(cur.policy, assessment_policy_default()) || coalesce(p_patch, '{}'));
    IF cur.policy = new_policy THEN
        new_policy := cur.policy;
    END IF;
    saved := assessment_version_for(p_assessment, new_items, new_policy);
    IF saved IS DISTINCT FROM cur.id THEN
        UPDATE assessments SET current_version_id = saved WHERE id = p_assessment;
        IF p_cosmetic AND cur.id IS NOT NULL THEN
            UPDATE submissions s SET base_version_id = saved
              FROM assessment_versions b
             WHERE s.assessment_id = p_assessment AND s.status = 'draft'
               AND b.id = s.base_version_id AND b.items_sha256 = cur.items_sha256;
        END IF;
    END IF;
    RETURN saved;
END $$;

ALTER TABLE assessments ADD COLUMN current_version_id uuid,
    ADD CONSTRAINT assessments_current_version_fkey FOREIGN KEY (current_version_id, id)
        REFERENCES assessment_versions (id, assessment_id);
COMMENT ON COLUMN assessments.current_version_id IS
    'The version in force: its policy is the assessment''s (assessment_policy_v), its items the ones saved last.';

ALTER TABLE submissions ADD COLUMN base_version_id uuid,
    ADD CONSTRAINT submissions_base_version_fkey FOREIGN KEY (base_version_id, assessment_id)
        REFERENCES assessment_versions (id, assessment_id);
COMMENT ON COLUMN submissions.base_version_id IS
    'The version a draft started on (or re-synced to): stale when its items_sha256 is not the current one''s; NULL: '
    'behind.';

-- The assessment's policy, typed: what every reader takes (the version's document, `assessment_policy_doc`).
CREATE VIEW learning.assessment_policy_v AS
SELECT a.id AS assessment_id, v.id AS version_id, v.items_sha256,
       v.policy ->> 'grading_mode' AS grading_mode,
       v.policy ->> 'grade_release_mode' AS grade_release_mode,
       v.policy ->> 'completion_rule' AS completion_rule,
       (v.policy ->> 'passing_score')::numeric AS passing_score,
       (v.policy ->> 'max_attempts')::integer AS max_attempts,
       (v.policy ->> 'time_limit_seconds')::integer AS time_limit_seconds,
       to_timestamp((v.policy ->> 'due_at')::bigint) AS due_at,
       (v.policy ->> 'allow_late')::boolean AS allow_late,
       v.policy ->> 'late_policy_kind' AS late_policy_kind,
       (v.policy ->> 'late_penalty_percent_per_day')::numeric AS late_penalty_percent_per_day,
       (v.policy ->> 'late_penalty_max_days')::integer AS late_penalty_max_days,
       to_timestamp((v.policy ->> 'late_cutoff_at')::bigint) AS late_cutoff_at,
       (v.policy ->> 'required')::boolean AS required,
       v.policy ->> 'review_visibility' AS review_visibility,
       (v.policy ->> 'randomize_questions')::boolean AS randomize_questions,
       (v.policy ->> 'randomize_options')::boolean AS randomize_options,
       (v.policy ->> 'partial_credit')::boolean AS partial_credit,
       (v.policy ->> 'negative_marking_percent')::numeric AS negative_marking_percent,
       (v.policy ->> 'grace_period_seconds')::integer AS grace_period_seconds,
       (v.policy ->> 'copy_paste_protection')::boolean AS copy_paste_protection,
       (v.policy ->> 'tab_switch_detection')::boolean AS tab_switch_detection,
       (v.policy ->> 'devtools_detection')::boolean AS devtools_detection,
       (v.policy ->> 'right_click_disabled')::boolean AS right_click_disabled,
       (v.policy ->> 'fullscreen_required')::boolean AS fullscreen_required,
       (v.policy ->> 'violation_threshold')::integer AS violation_threshold,
       (v.policy ->> 'attempt_penalty_percent')::numeric AS attempt_penalty_percent,
       (v.policy ->> 'draw_count')::integer AS draw_count,
       nullif(v.policy -> 'draw_strata', 'null'::jsonb) AS draw_strata
  FROM learning.assessments a
  JOIN learning.assessment_versions v ON v.id = a.current_version_id;
COMMENT ON VIEW learning.assessment_policy_v IS
    'An assessment''s policy, typed, from its current version (assessments.current_version_id).';

-- ── Rebuild of the old versions ─────────────────────────────────────────────

-- Whether a hand-in snapshot's value can stand in the document (old rows may hold anything).
CREATE FUNCTION assessment_snapshot_value_ok(k text, v jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE
SET search_path = public, core, learning, ai, analytics, ops, extensions, pg_temp
RETURN CASE k
    WHEN 'max_attempts' THEN v = 'null' OR (jsonb_typeof(v) = 'number' AND v::text::numeric BETWEEN 1 AND 50
                                           AND v::text::numeric = trunc(v::text::numeric))
    WHEN 'time_limit_seconds' THEN v = 'null' OR (jsonb_typeof(v) = 'number'
                                                 AND v::text::numeric BETWEEN 1 AND 2147483647
                                                 AND v::text::numeric = trunc(v::text::numeric))
    WHEN 'due_at' THEN v = 'null' OR jsonb_typeof(v) = 'number'
    WHEN 'allow_late' THEN jsonb_typeof(v) = 'boolean'
    WHEN 'passing_score' THEN jsonb_typeof(v) = 'number' AND v::text::numeric BETWEEN 0 AND 100
    WHEN 'attempt_penalty_percent' THEN jsonb_typeof(v) = 'number' AND v::text::numeric BETWEEN 0 AND 100
    WHEN 'grading_mode' THEN jsonb_typeof(v) = 'string' AND v #>> '{}' IN ('auto', 'manual', 'auto_then_manual')
    WHEN 'grade_release_mode' THEN jsonb_typeof(v) = 'string' AND v #>> '{}' IN ('immediate', 'batch')
    WHEN 'completion_rule' THEN jsonb_typeof(v) = 'string'
                                AND v #>> '{}' IN ('viewed', 'submitted', 'graded', 'passed', 'teacher_verified')
    ELSE false END;

-- Every version not yet in the new shape (its policy lacks the document's keys) gets the assessment's policy
-- apart from the overrides; versions that become equal to another of the assessment merge into it (one already
-- in the new shape first, else the lowest number), their hand-ins and drafts naming it. Run here and again by
-- the contract, for hand-ins the previous release versioned in between.
CREATE FUNCTION assessment_versions_rebuild(OUT rebuilt integer, OUT merged integer, OUT differ integer)
LANGUAGE plpgsql SET search_path = public, core, learning, ai, analytics, ops, extensions, pg_temp AS $$
BEGIN
    CREATE TEMP TABLE version_rebuild ON COMMIT DROP AS
    WITH v AS (
        SELECT v.id, v.assessment_id, v.number, v.items, v.policy AS snapshot,
               assessment_policy_columns(a) AS stored
          FROM assessment_versions v JOIN assessments a ON a.id = v.assessment_id
         WHERE NOT v.policy ?& assessment_policy_keys()
    ), kept AS (
        SELECT v.id, coalesce(jsonb_object_agg(s.k, s.val) FILTER (WHERE s.k IS NOT NULL), '{}'::jsonb) AS at_the_time
          FROM v
          LEFT JOIN LATERAL (
              SELECT e.key AS k, e.value AS val FROM jsonb_each(v.snapshot) e
               WHERE e.key IN ('max_attempts', 'time_limit_seconds', 'due_at', 'allow_late', 'passing_score',
                               'grading_mode', 'grade_release_mode', 'completion_rule', 'attempt_penalty_percent')
                 AND assessment_snapshot_value_ok(e.key, e.value)
                 AND e.value IS DISTINCT FROM v.stored -> e.key
                 -- An attempt cap an override or a preview explains is not the assessment's.
                 AND NOT (e.key = 'max_attempts'
                          AND ((e.value = 'null' AND EXISTS (SELECT 1 FROM submissions s
                                                              WHERE s.assessment_version_id = v.id AND s.preview))
                               OR EXISTS (SELECT 1 FROM submissions s
                                            JOIN assessment_overrides o ON o.assessment_id = s.assessment_id
                                                                       AND o.user_id = s.user_id
                                           WHERE s.assessment_version_id = v.id
                                             AND o.max_attempts_override IS NOT NULL
                                             AND to_jsonb(o.max_attempts_override) = e.value)))
                 -- Nor is a due date an override explains.
                 AND NOT (e.key = 'due_at' AND jsonb_typeof(e.value) = 'number'
                          AND EXISTS (SELECT 1 FROM submissions s
                                        JOIN assessment_overrides o ON o.assessment_id = s.assessment_id
                                                                   AND o.user_id = s.user_id
                                       WHERE s.assessment_version_id = v.id AND o.due_at_override IS NOT NULL
                                         AND extract(epoch FROM o.due_at_override)::bigint
                                             = round(e.value::text::numeric)::bigint))
          ) s ON true
         GROUP BY v.id
    )
    SELECT v.id, v.assessment_id, v.number, v.items,
           assessment_policy_doc(v.stored || k.at_the_time) || (v.snapshot - assessment_policy_keys()) AS policy,
           k.at_the_time <> '{}'::jsonb AS differs
      FROM v JOIN kept k USING (id);

    CREATE TEMP TABLE version_merge ON COMMIT DROP AS
    WITH candidates AS (
        SELECT r.id, r.assessment_id, r.number, r.items, r.policy, true AS rebuilt FROM version_rebuild r
        UNION ALL
        SELECT v.id, v.assessment_id, v.number, v.items, v.policy, false FROM assessment_versions v
         WHERE v.policy ?& assessment_policy_keys()
           AND v.assessment_id IN (SELECT r.assessment_id FROM version_rebuild r)
    )
    SELECT r.id AS dup, k.id AS keeper
      FROM version_rebuild r
      JOIN LATERAL (SELECT c.id FROM candidates c
                     WHERE c.assessment_id = r.assessment_id AND c.items = r.items AND c.policy = r.policy
                     ORDER BY c.rebuilt, c.number LIMIT 1) k ON k.id <> r.id;

    ALTER TABLE submissions DISABLE TRIGGER submissions_snapshots_frozen;
    UPDATE submissions s SET assessment_version_id = m.keeper
      FROM version_merge m WHERE s.assessment_version_id = m.dup;
    ALTER TABLE submissions ENABLE TRIGGER submissions_snapshots_frozen;
    UPDATE submissions s SET base_version_id = m.keeper FROM version_merge m WHERE s.base_version_id = m.dup;
    DELETE FROM assessment_versions v USING version_merge m WHERE v.id = m.dup;

    ALTER TABLE assessment_versions DISABLE TRIGGER assessment_versions_frozen;
    UPDATE assessment_versions v SET policy = r.policy
      FROM version_rebuild r
     WHERE v.id = r.id AND v.policy::text IS DISTINCT FROM r.policy::text;
    ALTER TABLE assessment_versions ENABLE TRIGGER assessment_versions_frozen;

    SELECT count(*), count(*) FILTER (WHERE r.differs) INTO rebuilt, differ FROM version_rebuild r;
    SELECT count(*) INTO merged FROM version_merge;
END $$;

DO $$
DECLARE
    r record;
BEGIN
    SELECT * INTO r FROM assessment_versions_rebuild();
    RAISE NOTICE 'policy in versions: % versions rebuilt, % merged, % keep a policy the assessment no longer has',
        r.rebuilt, r.merged, r.differ;
END $$;

-- ── Every assessment's current version ──────────────────────────────────────

-- The backfill writes no `version` (If-Match) bump: nothing an editor sees changes.
ALTER TABLE assessments DISABLE TRIGGER assessments_touch;
DO $$
DECLARE
    created integer;
    before integer;
BEGIN
    SELECT count(*) INTO before FROM assessment_versions;
    PERFORM assessment_version_save(a.id, assessment_policy_columns(a)) FROM assessments a ORDER BY a.id;
    SELECT count(*) - before INTO created FROM assessment_versions;
    RAISE NOTICE 'policy in versions: % assessments, % versions created for them',
        (SELECT count(*) FROM assessments), created;
END $$;
ALTER TABLE assessments ENABLE TRIGGER assessments_touch;

-- An open draft whose content is current started on the current version; one behind has none (stale).
UPDATE submissions s SET base_version_id = a.current_version_id
  FROM assessments a
 WHERE a.id = s.assessment_id AND s.status = 'draft' AND s.content_version = a.content_version;

-- The checks the policy columns had, over a version's document: a writer that skips the server's validation is
-- refused as it was on the columns. A version in the old shape (the previous release's hand-ins) is not checked.
CREATE FUNCTION assessment_policy_ok(p jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path = public, core, learning, ai, analytics, ops, extensions, pg_temp
RETURN coalesce(
    p ->> 'grading_mode' IN ('auto', 'manual', 'auto_then_manual')
    AND p ->> 'grade_release_mode' IN ('immediate', 'batch')
    AND p ->> 'completion_rule' IN ('viewed', 'submitted', 'graded', 'passed', 'teacher_verified')
    AND p ->> 'review_visibility' IN ('none', 'score_only', 'full')
    AND (p ->> 'passing_score')::numeric BETWEEN 0 AND 100
    AND (p ->> 'negative_marking_percent')::numeric BETWEEN 0 AND 100
    AND (p ->> 'attempt_penalty_percent')::numeric BETWEEN 0 AND 100
    AND (p ->> 'grace_period_seconds')::integer >= 0
    AND (p ->> 'violation_threshold')::integer >= 1
    AND coalesce((p ->> 'max_attempts')::integer BETWEEN 1 AND 50, true)
    AND coalesce((p ->> 'time_limit_seconds')::integer >= 1, true)
    AND coalesce((p ->> 'draw_count')::integer BETWEEN 1 AND 200, true)
    AND (p -> 'draw_strata' = 'null' OR draw_strata_ok(p -> 'draw_strata'))
    AND (SELECT bool_and(jsonb_typeof(p -> k) = 'boolean')
           FROM unnest(ARRAY['allow_late', 'required', 'randomize_questions', 'randomize_options', 'partial_credit',
                             'copy_paste_protection', 'tab_switch_detection', 'devtools_detection',
                             'right_click_disabled', 'fullscreen_required']) k)
    AND CASE p ->> 'late_policy_kind'
            WHEN 'none' THEN p -> 'late_penalty_percent_per_day' = 'null' AND p -> 'late_penalty_max_days' = 'null'
                             AND p -> 'late_cutoff_at' = 'null'
            WHEN 'penalty' THEN (p ->> 'late_penalty_percent_per_day')::numeric BETWEEN 0 AND 100
                                AND (p ->> 'late_penalty_max_days')::integer >= 1 AND p -> 'late_cutoff_at' = 'null'
            WHEN 'cutoff' THEN p -> 'late_cutoff_at' <> 'null' AND p -> 'late_penalty_percent_per_day' = 'null'
                               AND p -> 'late_penalty_max_days' = 'null'
        END,
    false);
SELECT schema_try_check('learning.assessment_versions', 'assessment_versions_policy_check',
                        $$NOT policy ?& assessment_policy_keys() OR assessment_policy_ok(policy)$$);

-- ── The previous release, kept in step (the contract drops these) ───────────

-- This release names no policy column; the three without a default get the presets' base (the version
-- overwrites them through `assessments_policy_in_step`).
ALTER TABLE assessments
    ALTER COLUMN grading_mode SET DEFAULT 'auto',
    ALTER COLUMN grade_release_mode SET DEFAULT 'immediate',
    ALTER COLUMN completion_rule SET DEFAULT 'passed';

-- A current version this release sets fills the columns the previous release reads; a policy the previous
-- release writes into them becomes a version (the current items with it), and the current one.
CREATE FUNCTION assessments_policy_in_step() RETURNS trigger LANGUAGE plpgsql
SET search_path = public, core, learning, ai, analytics, ops, extensions, pg_temp AS $$
DECLARE
    p jsonb;
    doc jsonb;
    cur_items jsonb;
    cur_policy jsonb;
BEGIN
    IF NEW.current_version_id IS DISTINCT FROM OLD.current_version_id THEN
        IF NEW.current_version_id IS NOT NULL THEN
            SELECT v.policy INTO p FROM assessment_versions v WHERE v.id = NEW.current_version_id;
            NEW := jsonb_populate_record(NEW, (p - 'due_at' - 'late_cutoff_at') || jsonb_build_object(
                'due_at', to_timestamp((p ->> 'due_at')::float8),
                'late_cutoff_at', to_timestamp((p ->> 'late_cutoff_at')::float8)));
        END IF;
    ELSIF NEW.current_version_id IS NOT NULL THEN
        doc := assessment_policy_columns(NEW);
        SELECT v.items, v.policy INTO cur_items, cur_policy FROM assessment_versions v
         WHERE v.id = NEW.current_version_id;
        IF doc IS DISTINCT FROM cur_policy THEN
            NEW.current_version_id := assessment_version_for(NEW.id, cur_items, doc);
            -- Its policy write moves `version` (If-Match) as it did; `assessments_touch` leaves these columns out.
            IF NEW.version = OLD.version THEN
                NEW.version := OLD.version + 1;
            END IF;
        END IF;
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER assessments_policy_in_step BEFORE UPDATE ON assessments
    FOR EACH ROW EXECUTE FUNCTION assessments_policy_in_step();

-- A save moves `current_version_id` (and, through the trigger above, the columns it fills): not an edit of the
-- row, so `version` (If-Match) stays, as it did when a rename or a reorder touched the items only. touch_row's
-- arguments after 'version' that start with '-' name the columns whose change does not bump it; without them it
-- behaves as before.
CREATE OR REPLACE FUNCTION touch_row() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, core, learning, ai, analytics, ops, extensions, pg_temp AS $$
DECLARE
    changed boolean := false;
    skipped text[] := '{}';
BEGIN
    IF TG_ARGV[0] = 'version' THEN
        IF NEW.version = OLD.version THEN
            IF TG_NARGS = 1 THEN
                changed := NEW IS DISTINCT FROM OLD;
            ELSIF left(TG_ARGV[1], 1) = '-' THEN
                FOR i IN 1 .. TG_NARGS - 1 LOOP
                    skipped := skipped || substr(TG_ARGV[i], 2);
                END LOOP;
                changed := (to_jsonb(NEW) - skipped - 'updated_at') IS DISTINCT FROM (to_jsonb(OLD) - skipped - 'updated_at');
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
END $$;
DROP TRIGGER assessments_touch ON assessments;
CREATE TRIGGER assessments_touch BEFORE UPDATE ON assessments FOR EACH ROW
    EXECUTE FUNCTION touch_row('version', '-current_version_id', '-grading_mode', '-grade_release_mode',
                               '-completion_rule', '-passing_score', '-max_attempts', '-time_limit_seconds', '-due_at',
                               '-allow_late', '-late_policy_kind', '-late_penalty_percent_per_day',
                               '-late_penalty_max_days', '-late_cutoff_at', '-required', '-review_visibility',
                               '-randomize_questions', '-randomize_options', '-partial_credit',
                               '-negative_marking_percent', '-grace_period_seconds', '-copy_paste_protection',
                               '-tab_switch_detection', '-devtools_detection', '-right_click_disabled',
                               '-fullscreen_required', '-violation_threshold', '-attempt_penalty_percent',
                               '-draw_count', '-draw_strata');

-- At commit: an assessment the previous release created gets its first version from the columns; items it
-- changed (it bumps `content_version`) become a version, and the drafts it counts as current move to it.
-- For this release's own writes it finds the version already saved and does nothing.
CREATE FUNCTION assessments_version_sync() RETURNS trigger LANGUAGE plpgsql
SET search_path = public, core, learning, ai, analytics, ops, extensions, pg_temp AS $$
DECLARE
    a assessments;
    saved uuid;
BEGIN
    SELECT * INTO a FROM assessments WHERE id = NEW.id;
    IF NOT FOUND THEN
        RETURN NULL;
    END IF;
    saved := assessment_version_save(a.id, CASE WHEN a.current_version_id IS NULL
                                                THEN assessment_policy_columns(a) END);
    IF saved IS DISTINCT FROM a.current_version_id THEN
        UPDATE submissions SET base_version_id = saved
         WHERE assessment_id = a.id AND status = 'draft' AND content_version = a.content_version
           AND base_version_id IS DISTINCT FROM saved;
    END IF;
    RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER assessments_version_created AFTER INSERT ON assessments
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION assessments_version_sync();
CREATE CONSTRAINT TRIGGER assessments_version_items AFTER UPDATE OF content_version ON assessments
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
    WHEN (OLD.content_version IS DISTINCT FROM NEW.content_version)
    EXECUTE FUNCTION assessments_version_sync();

-- A draft the previous release opens or re-syncs names the current version while its content is current.
CREATE FUNCTION submissions_base_version() RETURNS trigger LANGUAGE plpgsql
SET search_path = public, core, learning, ai, analytics, ops, extensions, pg_temp AS $$
DECLARE
    unset boolean;
BEGIN
    IF TG_OP = 'INSERT' THEN
        unset := NEW.base_version_id IS NULL;
    ELSE
        unset := NEW.base_version_id IS NOT DISTINCT FROM OLD.base_version_id;
    END IF;
    IF NEW.status = 'draft' AND unset THEN
        NEW.base_version_id := coalesce((SELECT a.current_version_id FROM assessments a
                                          WHERE a.id = NEW.assessment_id AND a.content_version = NEW.content_version),
                                        NEW.base_version_id);
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER submissions_base_version BEFORE INSERT OR UPDATE OF content_version ON submissions
    FOR EACH ROW EXECUTE FUNCTION submissions_base_version();
