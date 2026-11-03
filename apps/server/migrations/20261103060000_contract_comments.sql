-- Lane C's contract (20261103030300) replaces analytics_events by a table partitioned by month:
-- the new table needs the comment the old one had (schema_docs.rs) and the role grants
-- (default privileges cover the owner's new tables; re-applied for the column grants).

SET LOCAL lock_timeout = '5s';

COMMENT ON TABLE analytics_events IS
    'Domain events for analytics (submissions, grades, completions, views), partitioned by month (UTC); kept 400 days, expired months dropped whole.';

SELECT apply_role_grants(current_user);
