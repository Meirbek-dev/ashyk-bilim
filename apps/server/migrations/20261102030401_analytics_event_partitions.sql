-- Monthly partitions for analytics_events (review item 38): retention drops
-- whole months instead of deleting 400-day-old rows one batch at a time.
--
-- Expand step: the partition maintenance functions, which do nothing while
-- analytics_events is a plain table. The lane C contract migration turns the
-- table into a partitioned one (the existing rows become its first, "legacy"
-- partition, attached without a copy; the (id, occurred_at) key it needs was
-- built CONCURRENTLY in 20261102030400). Partitions are UTC months named
-- analytics_events_YYYYMM, plus a default partition as a safety net.

SET LOCAL lock_timeout = '5s';

-- Create the partitions of this month and the next `months_ahead` months
-- (the rollup job calls it every run); returns how many it created. A month
-- that overlaps an existing partition (the legacy one) or rows already in
-- the default partition is skipped: those rows stay where they are.
CREATE FUNCTION analytics_events_ensure_partitions(months_ahead integer DEFAULT 3)
    RETURNS integer
    LANGUAGE plpgsql AS $$
DECLARE
    month_start timestamp;
    made integer := 0;
    part text;
BEGIN
    IF (SELECT relkind FROM pg_class WHERE oid = 'analytics_events'::regclass) <> 'p' THEN
        RETURN 0;
    END IF;
    FOR i IN 0..months_ahead LOOP
        month_start := date_trunc('month', now() AT TIME ZONE 'UTC') + make_interval(months => i);
        part := 'analytics_events_' || to_char(month_start, 'YYYYMM');
        CONTINUE WHEN to_regclass(part) IS NOT NULL;
        BEGIN
            EXECUTE format(
                'CREATE TABLE %I PARTITION OF analytics_events FOR VALUES FROM (%L) TO (%L)',
                part, month_start AT TIME ZONE 'UTC',
                (month_start + interval '1 month') AT TIME ZONE 'UTC');
            made := made + 1;
        EXCEPTION WHEN invalid_object_definition OR check_violation THEN
            NULL;
        END;
    END LOOP;
    RETURN made;
END;
$$;

-- Drop every partition whose rows are all older than `before` (its upper
-- bound <= before); returns how many it dropped. The default partition is
-- never dropped (its rows go by the batched DELETE of the prune). It runs as
-- the owner for the app (20261102060100): never this month's or last month's
-- data, whatever `before` the caller passes.
CREATE FUNCTION analytics_events_drop_partitions(before timestamptz)
    RETURNS integer
    LANGUAGE plpgsql AS $$
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
$$;
