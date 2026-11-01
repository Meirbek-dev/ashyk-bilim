-- course_progress: the percent and the certificate flag follow from the row
-- (review items 14, 15), and the counts are coherent.
--
--   progress_pct         = completed / total * 100, two decimals (0 for an empty course)
--   certificate_eligible = every required activity done AND completed_at set
--
-- completed_at is the course completion: the projector sets it when a member
-- completes every required activity and clears it for a leaver (BUG-276),
-- so the flag needs no membership lookup. Rounding is numeric (ties away from
-- zero), the same as the projector's f64 round2 except on exact binary ties.
--
-- Expand step: a BEFORE trigger derives both columns on every write, so the
-- previous release's writes are overridden with the same rule; the new code
-- no longer writes them. The lane C contract migration replaces both with
-- virtual generated columns and drops the trigger.

SET LOCAL lock_timeout = '5s';

CREATE FUNCTION course_progress_derive() RETURNS trigger
    LANGUAGE plpgsql AS $$
BEGIN
    NEW.progress_pct := CASE WHEN NEW.total_required_count > 0
        THEN round(NEW.completed_required_count * 100.0 / NEW.total_required_count, 2)::double precision
        ELSE 0 END;
    NEW.certificate_eligible := NEW.total_required_count > 0
        AND NEW.completed_required_count >= NEW.total_required_count
        AND NEW.completed_at IS NOT NULL;
    RETURN NEW;
END;
$$;

CREATE TRIGGER course_progress_derive
    BEFORE INSERT OR UPDATE ON course_progress
    FOR EACH ROW EXECUTE FUNCTION course_progress_derive();

SELECT schema_try_check('course_progress', 'course_progress_counts_check',
    $$completed_required_count >= 0 AND completed_required_count <= total_required_count$$);
SELECT schema_try_check('course_progress', 'course_progress_completed_at_check',
    $$completed_at IS NULL OR (total_required_count > 0 AND completed_required_count >= total_required_count)$$);
