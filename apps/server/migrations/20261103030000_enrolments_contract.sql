-- contract: the trail_runs -> enrolments mirror trigger goes (REWRITE 5.6 n5).
-- It kept the release before 20261102030100 writing memberships; every
-- release since writes enrolments itself, in the run's transaction.

SET LOCAL lock_timeout = '5s';

DROP TRIGGER trail_runs_sync_enrolment ON trail_runs;
DROP FUNCTION trail_runs_sync_enrolment();
