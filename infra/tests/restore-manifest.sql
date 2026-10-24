-- Stable user data, including identities and relationships; print only counts and hashes.
SELECT format(
  'SELECT %L || ''|'' || count(*) || ''|'' || coalesce(md5(string_agg(to_jsonb(t)::text, '''' ORDER BY to_jsonb(t)::text)), md5('''')) FROM %I t;',
  tablename, tablename)
FROM unnest(ARRAY[
  'users', 'courses', 'chapters', 'activities', 'assessments', 'assessment_items',
  'submissions', 'grading_entries', 'file_submission_attempts', 'file_grading_entries',
  'certifications', 'certificate_users', 'course_discussions', 'uploads', 'blocks',
  'roles', 'role_permissions', 'user_roles', 'usergroups', 'usergroup_members', 'usergroup_courses',
  'trails', 'trail_runs', 'trail_steps', 'collections', 'collection_courses'
]) AS tables(tablename)
ORDER BY tablename
\gexec
