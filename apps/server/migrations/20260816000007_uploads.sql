-- Upload ledger for direct-to-storage transfers (ARCHITECTURE §11).
-- pending → finalized; unreferenced objects are reaped on a schedule.
CREATE TABLE uploads (
    id               uuid PRIMARY KEY DEFAULT uuidv7(),
    created_by       uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    purpose          text NOT NULL CHECK (purpose IN (
                         'avatar', 'course-thumbnail', 'block-image',
                         'block-pdf', 'block-video', 'file-submission')),
    bucket           text NOT NULL CHECK (bucket IN ('public', 'private')),
    key              text NOT NULL UNIQUE,
    mime             text NOT NULL,
    size_bytes       bigint NOT NULL CHECK (size_bytes > 0),
    status           text NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending', 'finalized')),
    referenced_count integer NOT NULL DEFAULT 0 CHECK (referenced_count >= 0),
    -- pending: claim window; finalized+unreferenced: grace before reaping.
    expires_at       timestamptz,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER uploads_set_updated_at BEFORE UPDATE ON uploads
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE INDEX uploads_reaper_idx ON uploads (expires_at)
    WHERE expires_at IS NOT NULL;
CREATE INDEX uploads_owner_idx ON uploads (created_by, created_at DESC);
