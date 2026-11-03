-- contract: analytics_events becomes a table partitioned by month (review
-- item 38). The name, columns, defaults, checks and foreign keys stay, so
-- both releases read and write it unchanged; the swap renames the plain
-- table, which is why this is a contract file.
--
-- No copy: the existing table becomes the first partition ("legacy", every
-- row before the next UTC month), attached with a validated range check so
-- the attach does not scan again. The (id, occurred_at) key it needs was
-- built CONCURRENTLY in 20261102030400. Writes to analytics_events wait for
-- the duration of the check's scan (one pass over the table, under a second
-- for a million rows). Later months get their own partitions from
-- analytics_events_ensure_partitions() (this file and every rollup run);
-- retention drops the legacy partition once its newest row is 400 days old.

SET LOCAL lock_timeout = '5s';

LOCK TABLE analytics_events IN ACCESS EXCLUSIVE MODE;

DO $$
DECLARE
    boundary timestamptz;
    idx record;
BEGIN
    SELECT (date_trunc('month', greatest(now(), max(occurred_at)) AT TIME ZONE 'UTC')
            + interval '1 month') AT TIME ZONE 'UTC'
    INTO boundary
    FROM analytics_events;

    EXECUTE format('ALTER TABLE analytics_events ADD CONSTRAINT analytics_events_legacy_range '
                   'CHECK (occurred_at < %L)', boundary);

    ALTER TABLE analytics_events RENAME TO analytics_events_legacy;
    FOR idx IN
        SELECT c.relname FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
        WHERE i.indrelid = 'analytics_events_legacy'::regclass
    LOOP
        EXECUTE format('ALTER INDEX %I RENAME TO %I', idx.relname,
                       replace(idx.relname, 'analytics_events_', 'analytics_events_legacy_'));
    END LOOP;

    CREATE TABLE analytics_events (
        LIKE analytics_events_legacy INCLUDING DEFAULTS INCLUDING CONSTRAINTS INCLUDING COMMENTS
    ) PARTITION BY RANGE (occurred_at);
    ALTER TABLE analytics_events DROP CONSTRAINT analytics_events_legacy_range;
    ALTER TABLE analytics_events ADD CONSTRAINT analytics_events_pkey PRIMARY KEY (id, occurred_at);
    ALTER TABLE analytics_events
        ADD CONSTRAINT analytics_events_activity_id_fkey FOREIGN KEY (activity_id)
            REFERENCES activities (id) ON DELETE CASCADE,
        ADD CONSTRAINT analytics_events_actor_id_fkey FOREIGN KEY (actor_id)
            REFERENCES users (id) ON DELETE SET NULL,
        ADD CONSTRAINT analytics_events_assessment_id_fkey FOREIGN KEY (assessment_id)
            REFERENCES assessments (id) ON DELETE CASCADE,
        ADD CONSTRAINT analytics_events_course_id_fkey FOREIGN KEY (course_id)
            REFERENCES courses (id) ON DELETE CASCADE,
        ADD CONSTRAINT analytics_events_submission_id_fkey FOREIGN KEY (submission_id)
            REFERENCES submissions (id) ON DELETE SET NULL,
        ADD CONSTRAINT analytics_events_user_id_fkey FOREIGN KEY (user_id)
            REFERENCES users (id) ON DELETE CASCADE;
    CREATE INDEX analytics_events_activity_idx ON analytics_events (activity_id);
    CREATE INDEX analytics_events_assessment_idx ON analytics_events (assessment_id);
    CREATE INDEX analytics_events_course_time_idx ON analytics_events (course_id, occurred_at DESC);
    CREATE INDEX analytics_events_occurred_brin ON analytics_events USING brin (occurred_at);
    CREATE INDEX analytics_events_submission_idx ON analytics_events (submission_id);
    CREATE INDEX analytics_events_user_time_idx ON analytics_events (user_id, occurred_at DESC);

    -- The partition's key is the parent's (id, occurred_at); (id) alone goes.
    ALTER TABLE analytics_events_legacy
        DROP CONSTRAINT analytics_events_legacy_pkey,
        ADD CONSTRAINT analytics_events_legacy_pkey
            PRIMARY KEY USING INDEX analytics_events_legacy_id_occurred_at_key;
    EXECUTE format('ALTER TABLE analytics_events ATTACH PARTITION analytics_events_legacy '
                   'FOR VALUES FROM (MINVALUE) TO (%L)', boundary);
    -- The partition bound holds the range now.
    ALTER TABLE analytics_events_legacy DROP CONSTRAINT analytics_events_legacy_range;
    CREATE TABLE analytics_events_default PARTITION OF analytics_events DEFAULT;
END;
$$;

SELECT analytics_events_ensure_partitions(3);
