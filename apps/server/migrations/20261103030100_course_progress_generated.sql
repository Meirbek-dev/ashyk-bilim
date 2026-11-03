-- contract: course_progress.progress_pct and certificate_eligible become
-- virtual generated columns (review items 14, 15), replacing the BEFORE
-- trigger of 20261102030200 with the same rule. The release since that
-- migration never writes either column; a write is refused from here on.
-- Virtual: computed on read, no table rewrite, no stored copy to drift.

SET LOCAL lock_timeout = '5s';

DROP TRIGGER course_progress_derive ON course_progress;
DROP FUNCTION course_progress_derive();

ALTER TABLE course_progress
    DROP COLUMN progress_pct,
    ADD COLUMN progress_pct double precision NOT NULL GENERATED ALWAYS AS (
        CASE WHEN total_required_count > 0
            THEN round(completed_required_count * 100.0 / total_required_count, 2)::double precision
            ELSE 0 END) VIRTUAL,
    DROP COLUMN certificate_eligible,
    ADD COLUMN certificate_eligible boolean NOT NULL GENERATED ALWAYS AS (
        total_required_count > 0
        AND completed_required_count >= total_required_count
        AND completed_at IS NOT NULL) VIRTUAL;
