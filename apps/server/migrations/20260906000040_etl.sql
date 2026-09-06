-- ETL bookkeeping (P10). The id map makes `ashyq admin etl` idempotent and
-- resumable: a legacy row is minted one UUIDv7 (timestamped at the legacy
-- created_at, so id order ≈ time order) and every re-run reuses it, which
-- turns every load into an upsert keyed by the primary key.
--
-- These tables are operational, not domain data: nothing in the API reads
-- them. They stay after cutover as the legacy → v2 lookup for support work
-- and are dropped with the legacy DB (MIGRATION §6, T+30d).

CREATE TABLE etl_id_map (
    entity      text NOT NULL,
    legacy_id   text NOT NULL,
    legacy_uuid text,
    new_id      uuid NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (entity, legacy_id)
);
CREATE INDEX etl_id_map_uuid_idx ON etl_id_map (entity, legacy_uuid)
    WHERE legacy_uuid IS NOT NULL;
CREATE INDEX etl_id_map_new_idx ON etl_id_map (new_id);

CREATE TABLE etl_runs (
    id          uuid PRIMARY KEY DEFAULT uuidv7(),
    started_at  timestamptz NOT NULL DEFAULT now(),
    finished_at timestamptz,
    options     jsonb NOT NULL DEFAULT '{}'::jsonb,
    report      jsonb NOT NULL DEFAULT '{}'::jsonb,
    ok          boolean
);

-- Every legacy row the ETL skipped, with the reason. Verification prints
-- the per-domain summary; support reads the detail.
CREATE TABLE etl_drop_log (
    id         uuid PRIMARY KEY DEFAULT uuidv7(),
    run_id     uuid REFERENCES etl_runs (id) ON DELETE CASCADE,
    domain     text NOT NULL,
    entity     text NOT NULL,
    legacy_key text NOT NULL,
    reason     text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX etl_drop_log_run_idx ON etl_drop_log (run_id, domain);
