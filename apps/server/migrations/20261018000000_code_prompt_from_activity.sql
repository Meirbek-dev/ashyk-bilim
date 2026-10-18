-- Legacy code challenges kept their statement on the activity (`content.description`); the ETL copied the item body
-- as it was, with an empty `prompt`, so the arena showed the learner no statement. Copy the description into the
-- prompt where the prompt is still empty. Nothing in this server writes `content.description`, so only migrated rows
-- match; a statement a teacher has written since is never touched.
UPDATE assessment_items ai
SET body = jsonb_set(ai.body, '{prompt}', to_jsonb(act.content ->> 'description')),
    updated_at = now()
FROM assessments a
JOIN activities act ON act.id = a.activity_id
WHERE ai.assessment_id = a.id
  AND ai.body ->> 'kind' = 'code'
  AND coalesce(ai.body ->> 'prompt', '') = ''
  AND coalesce(btrim(act.content ->> 'description'), '') <> '';
