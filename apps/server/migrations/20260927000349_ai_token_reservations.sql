-- BUG-349: an admitted AI request holds its share of the monthly token
-- budget (input estimate + the output bound) until its run settles: a
-- success writes the ledger and drops the reservation in one commit, a
-- failure or abort drops it. The lease bounds a holder that crashed.
CREATE TABLE ai_token_reservations (
    id          uuid PRIMARY KEY DEFAULT uuidv7(),
    run_id      uuid REFERENCES ai_runs (id) ON DELETE CASCADE,
    tokens      bigint NOT NULL CHECK (tokens >= 0),
    expires_at  timestamptz NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ai_token_reservations_run_idx ON ai_token_reservations (run_id)
    WHERE run_id IS NOT NULL;
