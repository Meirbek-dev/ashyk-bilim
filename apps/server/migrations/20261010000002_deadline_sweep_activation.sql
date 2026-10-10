-- Cluster G (owner, 2026-10-10): the deadline hand-in (strict due date, late
-- cutoff) only closes drafts whose date passed after it went live - this
-- migration's run on each database records that instant. Drafts whose date
-- passed earlier stay as they are (the learner cannot hand them in anyway);
-- the time-limit sweep is older and not affected. No row = no date hand-ins.
CREATE TABLE feature_activations (
    feature       text PRIMARY KEY CHECK (feature IN ('deadline_auto_submit')),
    activated_at  timestamptz NOT NULL DEFAULT now()
);
INSERT INTO feature_activations (feature) VALUES ('deadline_auto_submit');
