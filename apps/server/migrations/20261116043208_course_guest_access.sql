-- Owner, 2026-11-16: a course setting - the published lessons of a public course open in the player without
-- signing in or enrolling (a review committee reads the course by its link). Off (the default, every existing
-- course) keeps the rule: the programme is public, the player is for enrolled learners. Graded work still needs
-- sign-in and, with `assessments_require_enrollment`, an enrolment. The API already answered the lessons of a
-- public course to anyone; the flag is what the web offers.
SET LOCAL lock_timeout = '5s';

ALTER TABLE courses ADD COLUMN guest_access boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN courses.guest_access IS
    'Lessons of the public course open in the player without sign-in or enrolment (graded work does not).';
