-- Cluster G (owner, 2026-10-10): a course setting - only enrolled learners
-- take its assessments (quiz, exam, code, file task). On (the default, also
-- for every existing course) a signed-in visitor of a public course must
-- enrol first; taking a test no longer enrols them by the way. Off keeps the
-- open rule. Linked-usergroup members count as enrolled (DECISIONS
-- 2026-10-10 "Assessments need an enrolment").
ALTER TABLE courses ADD COLUMN assessments_require_enrollment boolean NOT NULL DEFAULT true;
