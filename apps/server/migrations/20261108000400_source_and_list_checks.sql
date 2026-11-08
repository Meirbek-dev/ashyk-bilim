-- Schema review 2026-11-08, items 23 and 29: value checks the writers already satisfy (production copy: every row).
--
-- The XP and completion journals key an award by `source_id` text: an activity, course or submission id, or for the
-- login bonus the platform day as days since 1970-01-01 (`gamification::login`). The shape check keeps a
-- typo or a foreign id from becoming a second award for the same fact. Columns typed uuid + day wait for the
-- journal rework (item 23); this is the expand-safe half.
--
-- The item tag and outcome lists get the same bounds as `courses.tags` (`text_list_ok`): the garde caps of the
-- item metadata DTO (50 entries, 64 characters), trimmed and non-empty as `normalize_tags` writes them. A lecture
-- review dismisses only ids its suggestions carry (`sug_<hex>`, at most 200 characters by the DTO).

SET LOCAL lock_timeout = '5s';

SELECT schema_try_check('xp_transactions', 'xp_transactions_source_id_shape', $$
    source_id IS NULL
    OR CASE WHEN source = 'login_bonus' THEN source_id ~ '^[0-9]{1,6}$'
            ELSE source_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' END$$);

SELECT schema_try_check('gamification_completions', 'gamification_completions_source_id_shape',
    $$source_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'$$);

SELECT schema_try_check('assessment_items', 'assessment_items_tags_check', 'text_list_ok(tags, 50, 64)');
SELECT schema_try_check('assessment_items', 'assessment_items_outcome_ids_check', 'text_list_ok(outcome_ids, 50, 64)');
SELECT schema_try_check('ai_lecture_reviews', 'ai_lecture_reviews_dismissed_suggestion_ids_check',
    'text_list_ok(dismissed_suggestion_ids, 500, 200)');
