-- S-GAPS-2 (additive; the old web reads neither).
--
-- INTERVENTIONS: a closed outcome next to the free-text `outcome` (teacher
-- prose, kept), and the S-04 version for the update op's If-Match.
ALTER TABLE teacher_interventions
    ADD COLUMN outcome_code text
        CHECK (outcome_code IN ('improved', 'no_change', 'worsened', 'no_response')),
    ADD COLUMN version integer NOT NULL DEFAULT 1;
CREATE TRIGGER teacher_interventions_bump_version BEFORE UPDATE ON teacher_interventions
    FOR EACH ROW EXECUTE FUNCTION bump_version();

-- EXAM-CONSENT: when the learner accepted the exam rules at start.
ALTER TABLE submissions ADD COLUMN rules_accepted_at timestamptz;
