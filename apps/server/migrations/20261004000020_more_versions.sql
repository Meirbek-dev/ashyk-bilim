-- S-GAPS-2 IFM: the S-04 optimistic lock on the rows the new web deletes or
-- replaces without one so far (additive; the old web never sends If-Match).
-- `bump_version()` is the trigger of 20261003000002.
--
-- Discussions bump on content / status edits only: the reaction and reply
-- counters are trigger-maintained on the same row, and a like must not make
-- a moderator's delete stale.
ALTER TABLE course_discussions ADD COLUMN version integer NOT NULL DEFAULT 1;
CREATE TRIGGER course_discussions_bump_version BEFORE UPDATE OF content, status ON course_discussions
    FOR EACH ROW EXECUTE FUNCTION bump_version();

ALTER TABLE file_submissions ADD COLUMN version integer NOT NULL DEFAULT 1;
CREATE TRIGGER file_submissions_bump_version BEFORE UPDATE ON file_submissions
    FOR EACH ROW EXECUTE FUNCTION bump_version();

ALTER TABLE gamification_config ADD COLUMN version integer NOT NULL DEFAULT 1;
CREATE TRIGGER gamification_config_bump_version BEFORE UPDATE ON gamification_config
    FOR EACH ROW EXECUTE FUNCTION bump_version();

ALTER TABLE assessment_overrides ADD COLUMN version integer NOT NULL DEFAULT 1;
CREATE TRIGGER assessment_overrides_bump_version BEFORE UPDATE ON assessment_overrides
    FOR EACH ROW EXECUTE FUNCTION bump_version();
