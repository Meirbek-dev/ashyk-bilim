-- Points as the record, switch (REWRITE 5.8 item 10, review note n16, owner decisions 2026-11-18): a grade is
-- points of the attempt's version (each item's `max_score`, the version's `max_points`); its percentage is derived,
-- `percent_of_points(points, max)`: two decimals, half away from zero, 0 when there is nothing to earn.
--
-- - `submissions` gains `max_points` (the version's, written at hand-in), `auto_points` and `final_points`;
--   `grading_entries` has its points since 20261102070100. This release writes points only: `auto_score`,
--   `final_score` and the entries' `raw_score` / `final_score` are derived from them by the triggers below.
-- - Breakdown items (`score` / `max_score`) and a teacher's `score_override` are points (they were shares of 100).
-- - The release before (the rollback image) writes percentages and share-of-100 breakdowns: the same triggers turn
--   them into points of the attempt's maximum and derive the percentage back. Rolled back, it reads points in the
--   breakdowns: an item's ratio is unchanged, but an override reads as a percentage (a re-save of an overridden
--   grade under that release rescales it).
-- - A hand-in without a version (before 2026-11-02, no snapshot) is out of its assessment's items as they are now
--   (100 without items); its items keep the points they have now.
-- The contract (`20261116075664`) turns the percentages into generated columns and drops the triggers.
--
-- data-fix: every stored grade becomes points of the version it was graded on, once: `points_of_percent` of the
-- stored percentage (submissions, grade entries, AI grade drafts), breakdown items scaled from their share to the
-- item's points, an override to points of the maximum; the percentage is then derived again (a shift of at most
-- 0.5 / max_points percentage points, accepted by the owner). `activity_progress.score` / `passed` follow the
-- attempt they were projected from (passed both ways, against the assessment's `passing_score`); no notification,
-- certificate or XP is written. The migration prints the counts (NOTICE); docs/agents/DATA.md has the same counts as
-- a read-only query for before the deploy.
SET LOCAL lock_timeout = '5s';
-- The rewrite keeps each row's `updated_at` (touch_row).
SET LOCAL ab.bookkeeping = 'on';

-- The one rule (Rust: `ab_domain::grading::score::percent_of_points`). It returned NULL for max 0 before.
CREATE OR REPLACE FUNCTION percent_of_points(points numeric, max_points numeric) RETURNS numeric
LANGUAGE sql IMMUTABLE PARALLEL SAFE
RETURN CASE WHEN max_points > 0 THEN round(points * 100 / max_points, 2) WHEN max_points = 0 THEN points * 0 END;
COMMENT ON FUNCTION percent_of_points(numeric, numeric) IS
    'Percentage of max_points that points are, two decimals, half away from zero; 0 when max_points is 0.';

-- A JSON number as numeric; NULL for anything else.
CREATE FUNCTION json_number(value jsonb) RETURNS numeric LANGUAGE sql IMMUTABLE PARALLEL SAFE
RETURN CASE WHEN jsonb_typeof(value) = 'number' THEN (value #>> '{}')::numeric END;

-- What a hand-in is out of: its version's points, else (no version) its assessment's items now, else 100.
CREATE FUNCTION submission_max_points(p_version uuid, p_assessment uuid) RETURNS numeric
LANGUAGE sql STABLE PARALLEL SAFE
SET search_path = public, core, learning, ai, analytics, ops, extensions, pg_temp
RETURN COALESCE((SELECT v.max_points FROM assessment_versions v WHERE v.id = p_version),
                NULLIF((SELECT round(sum(greatest(i.max_score, 0)), 2) FROM assessment_items i
                         WHERE i.assessment_id = p_assessment), 0),
                100);

-- `{item id: points}` of a hand-in's items: the version's, then the assessment's items now (an item added since).
CREATE FUNCTION submission_item_points(p_version uuid, p_assessment uuid) RETURNS jsonb
LANGUAGE sql STABLE PARALLEL SAFE
SET search_path = public, core, learning, ai, analytics, ops, extensions, pg_temp AS $$
    SELECT COALESCE(jsonb_object_agg(id, points), '{}'::jsonb)
      FROM (SELECT DISTINCT ON (id) id, points
              FROM (SELECT i->>'id' AS id, greatest((i->>'max_score')::numeric, 0) AS points, 0 AS rank
                      FROM assessment_versions v,
                           jsonb_array_elements(CASE WHEN jsonb_typeof(v.items->'items') = 'array'
                                                     THEN v.items->'items' ELSE '[]'::jsonb END) i
                     WHERE v.id = p_version AND jsonb_typeof(i->'max_score') = 'number'
                       AND jsonb_typeof(i->'id') = 'string'
                    UNION ALL
                    SELECT i.id::text, greatest(i.max_score, 0), 1 FROM assessment_items i
                     WHERE i.assessment_id = p_assessment) s
             ORDER BY id, rank) d
$$;

-- Earned / possible × 100 over a breakdown's items (0 without points): the share-of-100 grader's raw.
CREATE FUNCTION breakdown_item_percent(breakdown jsonb) RETURNS numeric
LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path = public, core, learning, ai, analytics, ops, extensions, pg_temp AS $$
    SELECT CASE WHEN sum(m) > 0 THEN sum(s) / sum(m) * 100 ELSE 0 END
      FROM (SELECT CASE WHEN jsonb_typeof(i->'score') = 'number' THEN (i->>'score')::numeric ELSE 0 END AS s,
                   CASE WHEN jsonb_typeof(i->'max_score') = 'number' THEN (i->>'max_score')::numeric ELSE 0 END AS m
              FROM jsonb_array_elements(CASE WHEN jsonb_typeof(breakdown->'items') = 'array'
                                             THEN breakdown->'items' ELSE '[]'::jsonb END) i) t
$$;

-- A breakdown of the share-of-100 grader in points: each item of a known id gets its points as `max_score` and
-- its score scaled by the same factor (an item already in points stays as it is: the factor is 1). An override
-- (`score_override`, a percentage there) becomes `override_points`; NULL drops it.
CREATE FUNCTION breakdown_in_points(breakdown jsonb, points jsonb, override_points numeric) RETURNS jsonb
LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path = public, core, learning, ai, analytics, ops, extensions, pg_temp AS $$
    SELECT CASE
        WHEN breakdown IS NULL OR jsonb_typeof(breakdown) <> 'object' THEN breakdown
        ELSE (CASE WHEN override_points IS NULL THEN breakdown - 'score_override'
                   ELSE breakdown || jsonb_build_object('score_override', override_points) END)
             || CASE WHEN jsonb_typeof(breakdown->'items') = 'array' THEN jsonb_build_object('items', COALESCE((
                    SELECT jsonb_agg(CASE
                        WHEN NOT points ? (e.item->>'item_id') OR jsonb_typeof(e.item->'max_score') <> 'number'
                            THEN e.item
                        ELSE e.item || jsonb_build_object(
                            'max_score', (points->>(e.item->>'item_id'))::numeric,
                            'score', CASE WHEN (e.item->>'max_score')::numeric > 0
                                               AND jsonb_typeof(e.item->'score') = 'number'
                                          THEN round((e.item->>'score')::numeric
                                                     * (points->>(e.item->>'item_id'))::numeric
                                                     / (e.item->>'max_score')::numeric, 2)
                                          ELSE 0 END)
                        END ORDER BY e.n)
                      FROM jsonb_array_elements(breakdown->'items') WITH ORDINALITY AS e(item, n)), '[]'::jsonb))
                ELSE '{}'::jsonb END
    END
$$;

-- An entry of the share-of-100 grader: its override in points of `max`. A raw that differs from the items by a
-- hundredth or more was a manual adjustment (BUG-329) even without the flag; it gets the flag, so this release
-- tells an override from the flag alone.
CREATE FUNCTION entry_override_points(breakdown jsonb, raw_percent numeric, max numeric) RETURNS numeric
LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path = public, core, learning, ai, analytics, ops, extensions, pg_temp
RETURN CASE
    WHEN json_number(breakdown->'score_override') IS NOT NULL
        THEN points_of_percent(json_number(breakdown->'score_override'), max)
    WHEN jsonb_typeof(breakdown->'items') = 'array' AND jsonb_array_length(breakdown->'items') > 0
         AND abs(raw_percent - breakdown_item_percent(breakdown)) >= 0.01
        THEN points_of_percent(raw_percent, max)
END;

ALTER TABLE submissions
    ADD COLUMN max_points score_points,
    ADD COLUMN auto_points score_points,
    ADD COLUMN final_points score_points;
COMMENT ON COLUMN submissions.max_points IS
    'What the attempt is out of: its version''s max_points, written at hand-in (submission_max_points); NULL on a draft.';
COMMENT ON COLUMN submissions.auto_points IS 'The auto-grader''s points (of max_points).';
COMMENT ON COLUMN submissions.final_points IS 'The grade of record in points, the latest grade entry''s final_points.';
COMMENT ON COLUMN grading_entries.max_points IS 'What the attempt is out of: its submissions.max_points.';
COMMENT ON COLUMN grading_entries.raw_points IS 'The grade before the penalties, in points (written by the server).';
COMMENT ON COLUMN grading_entries.final_points IS 'The grade of record in points; NULL for a draft save.';
COMMENT ON COLUMN submissions.auto_score IS 'percent_of_points(auto_points, max_points), derived.';
COMMENT ON COLUMN submissions.final_score IS 'percent_of_points(final_points, max_points), derived.';
COMMENT ON COLUMN grading_entries.raw_score IS 'percent_of_points(raw_points, max_points), derived.';
COMMENT ON COLUMN grading_entries.final_score IS 'percent_of_points(final_points, max_points), derived.';

-- The rows before the fix, for the counts.
CREATE TEMP TABLE points_before ON COMMIT DROP AS
SELECT s.id, s.auto_score, s.final_score, (s.final_score >= a.passing_score) AS passed
  FROM submissions s JOIN assessments a ON a.id = s.assessment_id
 WHERE s.status <> 'draft' AND NOT s.preview;

-- A hand-in without a version is out of the items its breakdown graded, at their points now.
UPDATE submissions s
   SET max_points = COALESCE(
           CASE WHEN s.assessment_version_id IS NULL THEN NULLIF((
               SELECT round(sum(COALESCE((p.points->>(i->>'item_id'))::numeric, json_number(i->'max_score'), 0)), 2)
                 FROM (SELECT submission_item_points(NULL, s.assessment_id) AS points) p,
                      jsonb_array_elements(CASE WHEN jsonb_typeof(b.breakdown->'items') = 'array'
                                                THEN b.breakdown->'items' ELSE '[]'::jsonb END) i), 0) END,
           submission_max_points(s.assessment_version_id, s.assessment_id))
  FROM (SELECT id, submission_breakdown(id, auto_breakdown) AS breakdown FROM submissions) b
 WHERE b.id = s.id AND s.status <> 'draft';

ALTER TABLE grading_entries DISABLE TRIGGER grading_entries_immutable;
UPDATE grading_entries g
   SET max_points = x.max,
       raw_points = points_of_percent(g.raw_score, x.max),
       final_points = points_of_percent(g.final_score, x.max),
       raw_score = percent_of_points(points_of_percent(g.raw_score, x.max), x.max),
       final_score = percent_of_points(points_of_percent(g.final_score, x.max), x.max),
       raw_breakdown = breakdown_in_points(g.raw_breakdown, x.points,
                                           points_of_percent(json_number(g.raw_breakdown->'score_override'), x.max)),
       effective_breakdown = breakdown_in_points(g.effective_breakdown, x.points,
                                                 entry_override_points(g.effective_breakdown, g.raw_score, x.max))
  FROM (SELECT s.id, s.max_points AS max, submission_item_points(s.assessment_version_id, s.assessment_id) AS points
          FROM submissions s) x
 WHERE x.id = g.submission_id;
ALTER TABLE grading_entries ENABLE TRIGGER grading_entries_immutable;

-- The entries already match: the journal check runs now, not at COMMIT (an ALTER would refuse pending events).
SET CONSTRAINTS submissions_current_grade IMMEDIATE;
UPDATE submissions s
   SET auto_points = points_of_percent(s.auto_score, s.max_points),
       final_points = points_of_percent(s.final_score, s.max_points),
       auto_score = percent_of_points(points_of_percent(s.auto_score, s.max_points), s.max_points),
       final_score = percent_of_points(points_of_percent(s.final_score, s.max_points), s.max_points),
       auto_breakdown = breakdown_in_points(s.auto_breakdown,
                                            submission_item_points(s.assessment_version_id, s.assessment_id),
                                            points_of_percent(json_number(s.auto_breakdown->'score_override'),
                                                              s.max_points))
 WHERE s.status <> 'draft';
SET CONSTRAINTS submissions_current_grade DEFERRED;

ALTER TABLE submissions
    ADD CONSTRAINT submissions_points_check CHECK (
        (status = 'draft' OR max_points IS NOT NULL)
        AND (auto_points IS NULL OR auto_points <= max_points)
        AND (final_points IS NULL OR final_points <= max_points));

-- The journal check compares points: this release writes `final_points` alone, which an `UPDATE OF final_score`
-- trigger never sees (the percentage is set by the BEFORE trigger, not by the statement).
CREATE OR REPLACE FUNCTION submission_grade_matches_journal(p_submission uuid) RETURNS void
LANGUAGE plpgsql
SET search_path = public, core, learning, ai, analytics, ops, extensions, pg_temp AS $$
DECLARE
    sub record;
    entry record;
BEGIN
    SELECT final_points INTO sub FROM submissions WHERE id = p_submission;
    IF NOT FOUND THEN
        RETURN;
    END IF;
    SELECT final_points INTO entry FROM grading_entries
    WHERE submission_id = p_submission ORDER BY id DESC LIMIT 1;
    IF NOT FOUND THEN
        RETURN;
    END IF;
    IF sub.final_points IS DISTINCT FROM entry.final_points THEN
        RAISE EXCEPTION 'submission % final_points % differs from its latest grade entry (%)',
            p_submission, sub.final_points, entry.final_points
            USING ERRCODE = 'check_violation';
    END IF;
END $$;
DROP TRIGGER submissions_current_grade ON submissions;
CREATE CONSTRAINT TRIGGER submissions_current_grade AFTER UPDATE OF final_score, final_points ON submissions
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
    WHEN (OLD.final_points IS DISTINCT FROM NEW.final_points)
    EXECUTE FUNCTION submissions_current_grade_check();

-- The projection follows the attempt it was taken from: the best released one, else a returned latest one.
CREATE TEMP TABLE progress_before ON COMMIT DROP AS
SELECT p.activity_id, p.user_id, p.passed FROM activity_progress p WHERE p.score IS NOT NULL;
UPDATE activity_progress p
   SET score = n.score, passed = n.score >= n.passing_score
  FROM (SELECT p2.activity_id, p2.user_id, a.passing_score,
               CASE WHEN p2.best_submission_id IS NOT NULL THEN b.final_score
                    ELSE COALESCE(l.final_score, l.auto_score) END AS score,
               CASE WHEN p2.best_submission_id IS NOT NULL THEN ob.final_score
                    ELSE COALESCE(ol.final_score, ol.auto_score) END AS old_score
          FROM activity_progress p2
          JOIN assessments a ON a.activity_id = p2.activity_id
          LEFT JOIN submissions b ON b.id = p2.best_submission_id
          LEFT JOIN points_before ob ON ob.id = p2.best_submission_id
          LEFT JOIN submissions l ON l.id = p2.latest_submission_id AND l.status = 'returned'
          LEFT JOIN points_before ol ON ol.id = l.id
         WHERE p2.score IS NOT NULL) n
 WHERE p.activity_id = n.activity_id AND p.user_id = n.user_id
   AND n.score IS NOT NULL AND p.score = n.old_score
   AND (p.score, p.passed) IS DISTINCT FROM (n.score, n.score >= n.passing_score);

-- AI drafts of a submission proposed percentages of 100: points of the attempt's maximum now.
UPDATE ai_grade_drafts d
   SET ai_score = points_of_percent(d.ai_score, s.max_points),
       calibrated_score = points_of_percent(d.calibrated_score, s.max_points),
       final_score = points_of_percent(d.final_score, s.max_points),
       max_score = s.max_points
  FROM submissions s
 WHERE s.id = d.submission_id AND s.max_points IS NOT NULL AND d.max_score IS DISTINCT FROM s.max_points
   AND NOT EXISTS (SELECT 1 FROM file_submissions f WHERE f.id = s.assessment_id);

DO $$
DECLARE
    changed bigint;
    auto_changed bigint;
    to_passed bigint;
    to_failed bigint;
    progress_to_passed bigint;
    progress_to_failed bigint;
BEGIN
    SELECT count(*) FILTER (WHERE b.final_score IS DISTINCT FROM s.final_score),
           count(*) FILTER (WHERE b.auto_score IS DISTINCT FROM s.auto_score),
           count(*) FILTER (WHERE NOT b.passed AND s.final_score >= a.passing_score),
           count(*) FILTER (WHERE b.passed AND s.final_score < a.passing_score)
      INTO changed, auto_changed, to_passed, to_failed
      FROM points_before b JOIN submissions s ON s.id = b.id JOIN assessments a ON a.id = s.assessment_id;
    SELECT count(*) FILTER (WHERE b.passed IS DISTINCT FROM true AND p.passed),
           count(*) FILTER (WHERE b.passed AND p.passed IS DISTINCT FROM true)
      INTO progress_to_passed, progress_to_failed
      FROM progress_before b JOIN activity_progress p USING (activity_id, user_id);
    RAISE NOTICE 'points as the record: % attempts changed their percentage (% auto scores); passed % -> true, % -> false; activity progress passed % -> true, % -> false',
        changed, auto_changed, to_passed, to_failed, progress_to_passed, progress_to_failed;
END $$;

-- The release before writes percentages and share-of-100 breakdowns; this release writes points. Either way the
-- percentages are derived from the points.
CREATE FUNCTION submissions_points() RETURNS trigger LANGUAGE plpgsql
SET search_path = public, core, learning, ai, analytics, ops, extensions, pg_temp AS $$
DECLARE
    points_set boolean;
    percent_set boolean;
BEGIN
    IF TG_OP = 'INSERT' THEN
        points_set := NEW.auto_points IS NOT NULL OR NEW.final_points IS NOT NULL;
        percent_set := NEW.auto_score IS NOT NULL OR NEW.final_score IS NOT NULL;
    ELSE
        points_set := NEW.auto_points IS DISTINCT FROM OLD.auto_points
                      OR NEW.final_points IS DISTINCT FROM OLD.final_points;
        percent_set := NEW.auto_score IS DISTINCT FROM OLD.auto_score
                       OR NEW.final_score IS DISTINCT FROM OLD.final_score;
        IF NOT points_set AND NOT percent_set AND NEW.status = OLD.status
           AND NEW.max_points IS NOT DISTINCT FROM OLD.max_points THEN
            RETURN NEW;
        END IF;
    END IF;
    IF NEW.status <> 'draft' AND NEW.max_points IS NULL THEN
        NEW.max_points := submission_max_points(NEW.assessment_version_id, NEW.assessment_id);
    END IF;
    IF percent_set AND NOT points_set THEN
        NEW.auto_points := points_of_percent(NEW.auto_score, NEW.max_points);
        NEW.final_points := points_of_percent(NEW.final_score, NEW.max_points);
        IF TG_OP = 'INSERT' OR NEW.auto_breakdown IS DISTINCT FROM OLD.auto_breakdown THEN
            NEW.auto_breakdown := breakdown_in_points(
                NEW.auto_breakdown, submission_item_points(NEW.assessment_version_id, NEW.assessment_id),
                points_of_percent(json_number(NEW.auto_breakdown->'score_override'), NEW.max_points));
        END IF;
    END IF;
    NEW.auto_score := percent_of_points(NEW.auto_points, NEW.max_points);
    NEW.final_score := percent_of_points(NEW.final_points, NEW.max_points);
    RETURN NEW;
END $$;
CREATE TRIGGER submissions_points BEFORE INSERT OR UPDATE ON submissions
    FOR EACH ROW EXECUTE FUNCTION submissions_points();

CREATE FUNCTION grading_entries_points() RETURNS trigger LANGUAGE plpgsql
SET search_path = public, core, learning, ai, analytics, ops, extensions, pg_temp AS $$
DECLARE
    sub record;
BEGIN
    IF NEW.raw_score IS NOT NULL THEN
        -- The release before: percentages of the attempt and a share-of-100 breakdown.
        SELECT COALESCE(s.max_points, submission_max_points(s.assessment_version_id, s.assessment_id)) AS max,
               submission_item_points(s.assessment_version_id, s.assessment_id) AS points
          INTO sub FROM submissions s WHERE s.id = NEW.submission_id;
        NEW.max_points := sub.max;
        NEW.raw_points := points_of_percent(NEW.raw_score, sub.max);
        NEW.final_points := points_of_percent(NEW.final_score, sub.max);
        NEW.raw_breakdown := breakdown_in_points(NEW.raw_breakdown, sub.points,
            points_of_percent(json_number(NEW.raw_breakdown->'score_override'), sub.max));
        NEW.effective_breakdown := breakdown_in_points(NEW.effective_breakdown, sub.points,
            entry_override_points(NEW.effective_breakdown, NEW.raw_score, sub.max));
    END IF;
    NEW.raw_score := COALESCE(percent_of_points(NEW.raw_points, NEW.max_points), 0);
    NEW.final_score := percent_of_points(NEW.final_points, NEW.max_points);
    RETURN NEW;
END $$;
CREATE TRIGGER grading_entries_points BEFORE INSERT ON grading_entries
    FOR EACH ROW EXECUTE FUNCTION grading_entries_points();
