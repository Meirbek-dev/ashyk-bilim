-- Schema review 2026-11-08, item 16: the platform aggregate gets its own rollup table, keyed by the day.
--
-- daily_teacher_metrics held it as the row with a NULL teacher, which is why that table carries a surrogate id and
-- a UNIQUE NULLS NOT DISTINCT key instead of a (metric_date, teacher_user_id) primary key. The rollup writes both
-- for one release (the previous release reads the NULL row); a contract then deletes the NULL rows, makes
-- teacher_user_id NOT NULL and the pair the key (pending-contracts.tsv).

SET LOCAL lock_timeout = '5s';

CREATE TABLE analytics.daily_platform_metrics (
    metric_date                      date PRIMARY KEY,
    managed_course_count             integer NOT NULL DEFAULT 0,
    active_learners_7d               integer NOT NULL DEFAULT 0,
    active_learners_28d              integer NOT NULL DEFAULT 0,
    active_learners_90d              integer NOT NULL DEFAULT 0,
    returning_learners_28d           integer NOT NULL DEFAULT 0,
    completion_rate                  double precision,
    avg_progress_pct                 double precision,
    at_risk_learners                 integer NOT NULL DEFAULT 0,
    ungraded_submissions             integer NOT NULL DEFAULT 0,
    courses_with_negative_engagement integer NOT NULL DEFAULT 0,
    certificates_issued_28d          integer NOT NULL DEFAULT 0,
    generated_at                     timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE analytics.daily_platform_metrics IS
    'Rollup: the platform-wide teacher metrics of one platform day (every course). Rebuilt with the day; kept 2 years.';

INSERT INTO analytics.daily_platform_metrics
    (metric_date, managed_course_count, active_learners_7d, active_learners_28d, active_learners_90d,
     returning_learners_28d, completion_rate, avg_progress_pct, at_risk_learners, ungraded_submissions,
     courses_with_negative_engagement, certificates_issued_28d, generated_at)
SELECT metric_date, managed_course_count, active_learners_7d, active_learners_28d, active_learners_90d,
       returning_learners_28d, completion_rate, avg_progress_pct, at_risk_learners, ungraded_submissions,
       courses_with_negative_engagement, certificates_issued_28d, generated_at
  FROM daily_teacher_metrics
 WHERE teacher_user_id IS NULL;

SELECT apply_role_grants(current_user);
