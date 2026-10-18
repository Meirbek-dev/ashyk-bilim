# Finding real data (dev stack)

Run SQL with `just db sql [--slot N | --db NAME] "<sql>"` (or `-f file.sql`): the slot's database, Unicode-safe,
`|`-separated with a header. Sign in as anyone with `just login-as <username|email> <slot>`; screenshot pages with
`just shoot`. On a restored backup (`ashyq_restore`) change rows freely; never on prod.

## Where things live

| Word in the UI                    | Table / column                                                                       |
| --------------------------------- | ------------------------------------------------------------------------------------ |
| course, its picture               | `courses` (`public`, `archived_at`; `thumbnail_image_key` under `/content/<key>`)    |
| chapter, activity                 | `chapters`, `activities` (`activity_type`, `activity_sub_type`, `published`, `content`) |
| enrolled learner                  | `trail_runs` (`user_id`, `course_id`); per activity: `trail_steps`, `activity_progress` |
| course teacher / author           | `resource_authors` (`course_id`, `user_id`, `authorship`, `status`)                  |
| quiz, exam, code challenge        | `assessments` (`activity_id`, `kind`, `lifecycle`) + `assessment_items` (`body` json)   |
| code statement, tests, languages  | `assessment_items.body`: `prompt`, `tests[]`, `languages[]`, `time_limit_seconds`     |
| attempt (quiz, exam, code)        | `submissions` (`status` draft / pending / graded / published)                       |
| code "Run"                        | `code_runs` (+ `code_run_cases`)                                                     |
| file task, its hand-ins           | `file_submissions` (`lifecycle`, `instructions`) + `file_submission_attempts`        |
| lesson media                      | `activities.content->>'filename'` (video, PDF), `blocks.content` (page blocks)       |
| role, permission                  | `user_roles` -> `roles` (`slug`); permissions in `role_permissions`                 |
| group                             | `usergroups`, `usergroup_members`, `usergroup_courses`                               |
| course progress                   | `course_progress` (`progress_pct`, `completed_at`)                                   |

A learner sees an activity when it is `published` and, for a file task, its `file_submissions.lifecycle` is
`published`; an assessment needs `assessments.lifecycle = 'published'`.

## Ready queries

A user's id and roles:

```sql
select u.id, u.username, string_agg(r.slug, ',') from users u left join user_roles ur on ur.user_id = u.id
left join roles r on r.id = ur.role_id where u.username = 'ast.dinara1987.4301' or u.email = 'ast.dinara1987.4301'
group by 1, 2
```

Published activities of a type in courses a user is enrolled in (types: dynamic, video, document, exam,
code_challenge, file_submission):

```sql
select a.course_id, a.id, a.name from activities a join trail_runs t on t.course_id = a.course_id
join users u on u.id = t.user_id where u.username = 'ast.dinara1987.4301'
and a.activity_type = 'code_challenge' and a.published limit 5
```

Activities with learner work, most first (good review data):

```sql
select s.assessment_id, a.activity_id, count(*) from submissions s join assessments a on a.id = s.assessment_id
group by 1, 2 order by 3 desc limit 5
```

Courses a teacher can edit:

```sql
select c.id, c.name from courses c join resource_authors ra on ra.course_id = c.id
join users u on u.id = ra.user_id where u.email = 'aizhan0212@mail.ru' and c.archived_at is null
```

Make a file task reviewable (published, with instructions and a deadline in 3 days):

```sql
update activities set published = true where id = '<activity>';
update file_submissions set lifecycle = 'published', published_at = now(), instructions = 'Ответьте на вопросы.',
  max_files = 2, due_at = now() + interval '3 days' where activity_id = '<activity>';
```

Media referenced by the database but missing from local storage: `just restore-media --slot N` copies them from
production's public `/content/` (a sample, size-capped).
