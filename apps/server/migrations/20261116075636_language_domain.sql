-- Language, units, hashes, part 1 (REWRITE 5.8 item 6): one language domain.
--
-- The interface language of an account (`users.locale`), the language a course is taught in (`courses.language`)
-- and the language of a translation (`translations.lang`) each spelled the same value set in its own check. They are
-- the domain `language_code` now. The domain is text, so the previous release reads and writes them unchanged
-- (Postgres reports a domain column as its base type).
--
-- The AI tables' `language` is the language an answer is asked in: `auto` (the course's, the model decides) or a
-- platform language. Their check accepted any BCP 47 tag, the API a region tag too (`ru-RU`); both take the bare
-- code now. Old rows keep their language without the region; anything else asked for nothing the platform speaks
-- and becomes `auto`.
SET LOCAL lock_timeout = '5s';

CREATE DOMAIN language_code AS text CHECK (VALUE IN ('ru', 'kk', 'en'));
COMMENT ON DOMAIN language_code IS 'A language of the platform: the interface, a course, a translation.';

ALTER TABLE users DROP CONSTRAINT users_locale_check, ALTER COLUMN locale TYPE language_code;
ALTER TABLE courses DROP CONSTRAINT courses_language_check, ALTER COLUMN language TYPE language_code;
ALTER TABLE translations DROP CONSTRAINT translations_lang_check, ALTER COLUMN lang TYPE language_code;

SET LOCAL ab.bookkeeping = 'on';
-- data-fix: an AI language without its region tag; one the platform does not speak is `auto`.
UPDATE ai_course_analyses SET language = CASE WHEN split_part(language, '-', 1) IN ('ru', 'kk', 'en')
    THEN split_part(language, '-', 1) ELSE 'auto' END WHERE language NOT IN ('auto', 'ru', 'kk', 'en');
UPDATE ai_lecture_reviews SET language = CASE WHEN split_part(language, '-', 1) IN ('ru', 'kk', 'en')
    THEN split_part(language, '-', 1) ELSE 'auto' END WHERE language NOT IN ('auto', 'ru', 'kk', 'en');
UPDATE ai_remediation_sessions SET language = CASE WHEN split_part(language, '-', 1) IN ('ru', 'kk', 'en')
    THEN split_part(language, '-', 1) ELSE 'auto' END WHERE language NOT IN ('auto', 'ru', 'kk', 'en');
UPDATE ai_student_memory SET language = CASE WHEN split_part(language, '-', 1) IN ('ru', 'kk', 'en')
    THEN split_part(language, '-', 1) ELSE 'auto' END WHERE language NOT IN ('auto', 'ru', 'kk', 'en');
UPDATE ai_submission_analyses SET language = CASE WHEN split_part(language, '-', 1) IN ('ru', 'kk', 'en')
    THEN split_part(language, '-', 1) ELSE 'auto' END WHERE language NOT IN ('auto', 'ru', 'kk', 'en');

-- `auto` or the domain: a cast to `language_code` refuses any other value.
SELECT schema_try_check(t::regclass, t || '_language_check', 'language = ''auto'' OR language::language_code IS NOT NULL')
FROM (VALUES ('ai_course_analyses'), ('ai_lecture_reviews'), ('ai_remediation_sessions'), ('ai_student_memory'),
             ('ai_submission_analyses')) AS x(t);
ALTER TABLE ai_course_analyses DROP CONSTRAINT IF EXISTS ai_course_analyses_language_tag;
ALTER TABLE ai_lecture_reviews DROP CONSTRAINT IF EXISTS ai_lecture_reviews_language_tag;
ALTER TABLE ai_remediation_sessions DROP CONSTRAINT IF EXISTS ai_remediation_sessions_language_tag;
ALTER TABLE ai_student_memory DROP CONSTRAINT IF EXISTS ai_student_memory_language_tag;
ALTER TABLE ai_submission_analyses DROP CONSTRAINT IF EXISTS ai_submission_analyses_language_tag;
