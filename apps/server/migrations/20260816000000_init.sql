-- Baseline: extensions and shared trigger machinery.
-- Postgres 18+: uuidv7() is native, no extension needed.

CREATE EXTENSION IF NOT EXISTS vector;

-- Single shared updated_at maintainer. Applied to every table that has an
-- updated_at column:
--   CREATE TRIGGER <table>_set_updated_at BEFORE UPDATE ON <table>
--   FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;
