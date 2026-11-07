# Questions for the owner

Agents append here when blocked on something only you can decide/do.
Answer inline (any format); agents check this file each session and move
answered items into the docs.

## Q-2026-11-02-1: accounts whose email state Zitadel cannot tell (schema review 28)

`users.email_verified` goes once no row has it NULL ("not known yet": accounts older than the column, until a
profile read asked Zitadel). `ashyq admin resolve-email-verified [--dry-run]` asks Zitadel for every such row
and stores the answer. Rows it cannot resolve (the Zitadel user is gone or errors: typically anonymised
accounts, RUNBOOK 2.3) stay NULL and are counted as `failed`. Which rule closes them before the column drops?
Proposal: an account Zitadel does not know has no address it can confirm, so "not confirmed"
(`email_verified_at` NULL); a deleted (anonymised) account likewise. The server today answers "verified" when
Zitadel is unreachable, so the other candidate is "verified at `created_at`".

## Q-2026-11-07-1: cohorts (schema review 31)

A course exists once, with absolute deadlines; only per-person exceptions exist. A second intake of the same course
today means copying it or moving every deadline. Do you need cohorts or semesters (one course, several runs, each with
its own dates and roster)? The answer decides whether deadlines move to a `course_runs` table. Until then nothing changes.

## Q-2026-11-07-2: row-level security (schema review 47)

No table uses RLS, and most QA access bugs are a forgotten permission check. RLS on `submissions` and
`grading_entries` would be a second wall, but every query must then run with the acting user set
(`SET LOCAL app.user_id`), which costs a transaction per request and a rewrite of the workers' access. Proposal: not
now; keep `permission_matrix.rs` as the gate and revisit after the v3 auth switch. Agree?

## Q-2026-11-07-3: file_submission_files.scan_status (schema review 42)

The column is only ever read, so every file stays `pending` and nothing scans uploads. Connect an antivirus (ClamAV as
one more container and a job per upload), or drop the column with the copies `storage_key`, `content_type`, `size_bytes`
(then a file reads them through `uploads`)? Proposal: drop; 0 file attempts in production so far.

## Q-2026-11-07-4: assessments.required and the points columns (schema review 29, 36)

`assessments.required` is written and returned by the API but decides nothing (FINDINGS 18): only `activities.required`
counts. `max_points`, `raw_points`, `final_points` are filled by triggers and read by nothing. You asked to delete no
function, and these are columns without one. Proposal: stop writing and drop both (a contract migration a release
later). Or should they start to mean something: a required assessment that gates completion, grades shown in points?

## Q-2026-11-07-5: what is left of the schema review (items 23, 32, 33, 37, 41, 44, 45)

Agents stopped short of these on purpose; each changes much and fixes little at today's volumes. Say which you want.

- 23, baseline for new installs: the 227 migrations build a database in seconds and there is one production. Not worth a
  second way to build the schema.
- 32, one assessment version per publish: the policy a hand-in stores includes the learner's own overrides, so one
  assessment has several versions at one moment. Moving the 43 policy columns into a version's jsonb also loses their
  checks and types. Proposal: keep versions as they are, written at hand-in.
- 33, `submission_drafts`: 115 submissions in production, and it touches autosave during exams. Proposal: not now.
- 37, a `Score` type instead of `::float8`: SQLx already refuses a `numeric` column without the cast at compile time, so a
  forgotten cast cannot ship. Scores are two decimals, safe in `f64`. Proposal: drop the item.
- 41, `*_upload_id` as the primary value: about 85 lines in 21 files for no behaviour change; the triggers only derive a
  key. Proposal: not now.
- 44, arcs instead of polymorphic references: rows already go with their course and activity keys, and `mastery_evidence`
  and `ai_work_embeddings` are empty. Proposal: `ai_work_embeddings` gets its key with the file merge (REWRITE 5.6 n6), the
  rest stays.
- 45, morphology by `courses.language`: nothing sets the language. It needs a field in the course form. Do you want one?
