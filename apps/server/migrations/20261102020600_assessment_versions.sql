-- Assessment versions (schema review 2, item 4; REWRITE 5.6 n7), first step.
--
-- Every hand-in copies the assessment's items and policy into its own
-- items_snapshot / policy_snapshot: a 200-learner exam stores the same
-- question bank 200 times. `assessment_versions` holds each distinct
-- (items, policy) pair an attempt was handed in against once, numbered per
-- assessment; `submissions.assessment_version_id` names it. A version is
-- content-addressed (`content_hash` = md5 of the two snapshots' text), so
-- the same content handed in twice is one row, and it never changes.
--
-- Expand step: the snapshots stay the record (the previous release reads
-- them, item 9 guards them); this release also writes the version at
-- hand-in. Existing hand-ins are backfilled here: one version per distinct
-- snapshot pair, numbered by its first hand-in. What remains (REWRITE 5.6
-- n7): readers move to the version, the snapshots and content_version go
-- in a contract release, and the policy columns of `assessments` move into
-- the version's typed policy.

SET LOCAL lock_timeout = '5s';
SET LOCAL ab.bookkeeping = 'on';

CREATE TABLE assessment_versions (
    id            uuid PRIMARY KEY DEFAULT uuidv7(),
    assessment_id uuid NOT NULL REFERENCES assessments (id) ON DELETE CASCADE,
    number        integer NOT NULL CHECK (number >= 1),
    items         jsonb NOT NULL CHECK (jsonb_typeof(items) = 'object'),
    policy        jsonb NOT NULL CHECK (jsonb_typeof(policy) = 'object'),
    content_hash  text NOT NULL,
    -- What the items are worth together (item 6): an attempt's points are
    -- its percentage of this. Set from `items` on insert.
    max_points    numeric(10, 2) NOT NULL CHECK (max_points >= 0),
    created_at    timestamptz NOT NULL DEFAULT now(),
    UNIQUE (assessment_id, number),
    UNIQUE (assessment_id, content_hash)
);

CREATE FUNCTION assessment_versions_frozen() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'assessment versions never change' USING ERRCODE = 'integrity_constraint_violation';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER assessment_versions_frozen BEFORE UPDATE ON assessment_versions
    FOR EACH ROW EXECUTE FUNCTION assessment_versions_frozen();

-- The items' total max_score; non-numeric or missing values count 0.
CREATE FUNCTION snapshot_max_points(items jsonb) RETURNS numeric LANGUAGE sql IMMUTABLE AS $$
    SELECT coalesce(round(sum(CASE WHEN jsonb_typeof(i->'max_score') = 'number'
                                   THEN greatest((i->>'max_score')::numeric, 0) ELSE 0 END), 2), 0)
    FROM jsonb_array_elements(CASE WHEN jsonb_typeof(items->'items') = 'array'
                                   THEN items->'items' ELSE '[]'::jsonb END) i
$$;

CREATE FUNCTION assessment_versions_points() RETURNS trigger AS $$
BEGIN
    NEW.max_points := snapshot_max_points(NEW.items);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER assessment_versions_points BEFORE INSERT ON assessment_versions
    FOR EACH ROW EXECUTE FUNCTION assessment_versions_points();

-- The content hash of a snapshot pair (`ab_db::assessment_versions`).
CREATE FUNCTION assessment_content_hash(items jsonb, policy jsonb) RETURNS text
LANGUAGE sql IMMUTABLE AS $$ SELECT md5(items::text || '|' || policy::text) $$;

ALTER TABLE submissions ADD COLUMN assessment_version_id uuid REFERENCES assessment_versions (id);

-- Backfill: one version per distinct pair, numbered in first hand-in order.
INSERT INTO assessment_versions (assessment_id, number, items, policy, content_hash, created_at)
SELECT assessment_id,
       row_number() OVER (PARTITION BY assessment_id ORDER BY first_at, content_hash),
       items_snapshot, policy_snapshot, content_hash, first_at
FROM (
    SELECT DISTINCT ON (assessment_id, content_hash)
           assessment_id, items_snapshot, policy_snapshot, content_hash,
           coalesce(submitted_at, created_at) AS first_at
    FROM (SELECT s.*, assessment_content_hash(items_snapshot, policy_snapshot) AS content_hash
          FROM submissions s
          WHERE items_snapshot IS NOT NULL AND policy_snapshot IS NOT NULL
            AND jsonb_typeof(items_snapshot) = 'object' AND jsonb_typeof(policy_snapshot) = 'object') s
    ORDER BY assessment_id, content_hash, coalesce(submitted_at, created_at)
) d;

-- data-fix: link existing hand-ins to their version (deterministic by hash).
UPDATE submissions s SET assessment_version_id = v.id
FROM assessment_versions v
WHERE v.assessment_id = s.assessment_id
  AND s.items_snapshot IS NOT NULL AND s.policy_snapshot IS NOT NULL
  AND v.content_hash = assessment_content_hash(s.items_snapshot, s.policy_snapshot);

-- A hand-in's version is written once, like its snapshots (item 9).
CREATE OR REPLACE FUNCTION submissions_snapshots_frozen() RETURNS trigger AS $$
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
$$ LANGUAGE plpgsql;
DROP TRIGGER submissions_snapshots_frozen ON submissions;
CREATE TRIGGER submissions_snapshots_frozen
    BEFORE UPDATE OF items_snapshot, policy_snapshot, assessment_version_id ON submissions
    FOR EACH ROW EXECUTE FUNCTION submissions_snapshots_frozen();
