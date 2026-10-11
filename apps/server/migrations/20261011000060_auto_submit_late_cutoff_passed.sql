-- A draft handed in at the late cutoff records `late_cutoff_passed` (DECISIONS 2026-10-11); a
-- strict due date stays `deadline_passed`. Earlier cutoff hand-ins keep `deadline_passed`.
ALTER TABLE submissions DROP CONSTRAINT submissions_auto_submit_reason_check;
ALTER TABLE submissions ADD CONSTRAINT submissions_auto_submit_reason_check
    CHECK (auto_submit_reason IS NULL
           OR auto_submit_reason IN ('time_expired', 'integrity_violation', 'deadline_passed',
                                     'late_cutoff_passed'));
