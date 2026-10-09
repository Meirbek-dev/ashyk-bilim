-- QA-D: a draft still open when a strict due date (allow_late off) passes is
-- handed in by the timer sweep with what was saved (DECISIONS 2026-10-09).
ALTER TABLE submissions DROP CONSTRAINT submissions_auto_submit_reason_check;
ALTER TABLE submissions ADD CONSTRAINT submissions_auto_submit_reason_check
    CHECK (auto_submit_reason IS NULL
           OR auto_submit_reason IN ('time_expired', 'integrity_violation', 'deadline_passed'));
