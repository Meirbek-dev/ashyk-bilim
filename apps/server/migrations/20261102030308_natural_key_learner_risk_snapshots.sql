-- no-transaction
CREATE UNIQUE INDEX CONCURRENTLY learner_risk_snapshots_natural_key ON learner_risk_snapshots (snapshot_date, user_id, course_id);
