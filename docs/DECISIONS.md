# Decision log (deviations & refinements vs ARCHITECTURE.md)

## 2026-08-16 — Zitadel is fully internal; passkeys dropped; first-party Google OAuth

Owner declined a dedicated auth subdomain (QUESTIONS.md #1). Passkeys/WebAuthn
are origin-bound and thus dropped (owner's explicit trade). That removes the
last reason for any public Zitadel surface:

- **Zitadel gets no public route.** It lives on the internal network only; the
  Rust BFF is its sole client (Session API for password/TOTP checks, User API
  for lifecycle). No EXTERNALDOMAIN exposure, no TLS termination for it, no
  nginx route.
- **Google login is first-party**: the Rust server runs the authorization-code
  flow against Google directly (port of the legacy
  `src/services/auth/google_oauth.py` semantics), then finds-or-creates the
  Zitadel user (`PasswordSpec::None`) and stores the Google `sub` linkage in
  our own DB. No Zitadel IdP intents.
- **Email verification stays headless**: Zitadel v2 user APIs return
  verification codes to the caller (`returnCode`) — we send them via Resend
  and confirm via API. No Zitadel-hosted UI is ever linked.
- **MFA = TOTP only**, optional, enrolled/verified through the BFF.

## 2026-08-16 — zitadel-setup collapses to zitadel-check

The original 0.10 plan (`ashyq admin zitadel-setup` creating org/project/OIDC
app/IdP/custom texts) assumed a public Zitadel with hosted flows. With Zitadel
internal-only (see above), no OIDC app, no IdP config, and no custom texts
exist to provision — the `ZITADEL_FIRSTINSTANCE_*` compose env vars already
create the org and the provisioner PAT declaratively. What remains is
fail-fast deploy diagnostics: `ashyq admin zitadel-check` verifies
reachability, PAT validity, and prints the org — run it in the cutover
runbook after boot. If provisioning needs ever grow (SMTP config, policies),
they extend this command.

## 2026-08-16 — Observability backend decided at cutover

OTLP wiring is vendor-neutral and disabled by default (0.12). Logfire remains
the default recommendation; the P11 runbook includes a paste-able setup
checklist for whichever backend is current-best then (QUESTIONS.md #2).


## 2026-08-16 — Schedules are interval-based, not cron expressions

ARCHITECTURE §9 sketched `job_schedules.cron_expr`. Implemented as
`interval_seconds` instead: every legacy schedule (assessment auto-publish
*/2min, assessment timer poll, plagiarism sweep */10min, upload reaper 6h) is a
plain interval, and the available Rust cron crates (croner, cron) are
chrono-based — pulling chrono into a jiff codebase for expressiveness nothing
uses yet is a bad trade. Anchored times ("daily at 02:00 Almaty") can be
expressed by seeding `next_run_at` at the anchor with a 24h interval; if real
cron expressiveness is ever needed, swap the column back and parse at that point.
Leadership: no persistent leader — every worker ticks, correctness comes from
`pg_try_advisory_xact_lock` + `FOR UPDATE SKIP LOCKED` + enqueue dedupe keys.

## Same-origin object storage routing (no new domains)

Presigned S3 URLs must be reachable from browsers, and the "no new domains"
constraint rules out a storage subdomain. SigV4 signs host + path, so nginx
cannot rewrite either. Resolution: the server's storage endpoint is the
public origin itself; presigned URLs come out as
`https://<domain>/ab-public/<key>?X-Amz-...`, and nginx proxies
`^/(ab-public|ab-private)/` VERBATIM to RustFS with `Host` preserved —
signatures verify because nothing in the signed material changed. Public
media additionally gets the friendly anonymous route `/content/<key>` →
rewrite to `/ab-public/<key>` (immutable cache; requires a public-read
bucket policy on `ab-public`, applied by the cutover runbook). Template:
`extra/nginx.v2.conf.template`, swapped in at cutover. Consequence for
config: production `AB_STORAGE__ENDPOINT` is the public origin, not the
compose-internal `http://rustfs:9000`; internal presign/head/delete calls
loop through nginx, which is acceptable at this scale.

## Anonymous catalog reads via a nil actor

Public browse (landing pages, course catalog, search) works without a
session. Instead of `Option<Actor>` rippling through every service
signature, `Actor::anonymous()` is a real actor with the nil UUID and zero
grants: it owns nothing and passes no `require()`, so every existing
visibility rule degrades to public-only with no special-casing. The
`MaybeActor` extractor maps missing, expired, or garbage cookies to it —
catalog GETs use `MaybeActor`, mutations keep `CurrentActor`.

## Assessments schema fold (2026-09-05, P3.1)

The legacy `assessment` row and its `assessment_policy` row (1:1 through the
activity, back-linked by a nullable `policy_id`, created lazily *inside GET
handlers* when missing) collapse into one `assessments` row: a policy always
exists, read paths never write. Every scalar the legacy hid in
`settings_json` / `anti_cheat_json` / `late_policy_json` is a real column with
a CHECK — one canonical spelling (`right_click_disabled`, `fullscreen_required`)
where the legacy stored one name and read two, and no duplicated
`due_at`/`due_date_iso`/`due_date` or minutes-vs-seconds aliases; the ETL
maps them. The access-policy indirection row is gone too (`access_mode` on the
assessment, allowlists keyed by `assessment_id`), and the phantom
`time_limit_override` the legacy API accepted then rejected is not carried.

Quizzes get a real activity type pair (`quiz`/`quiz_standard`); the legacy
parked them on `custom`/`custom` and had no reverse mapping. Item positions
are 1-based contiguous and renumbered on reorder/delete (legacy wrote
client-supplied integers verbatim). Lifecycle transitions and override
changes are written to `assessment_audit_events` — the legacy defined those
event types but the only code path that emitted them was an unused duplicate
service.

Consciously dropped: `weight` and `grading_type` are kept as columns for data
fidelity but, as in legacy, nothing scores with them; the two competing
"is this assessment locked" definitions (any submission incl. drafts vs.
non-draft only) become one rule in P4 — non-draft submissions lock content.

## Cohort membership grants course visibility (2026-09-05, P3.4)

The legacy `user_has_course_access` (public course, active ResourceAuthor,
or membership of a usergroup linked to the course) gated assessment
submission but the v2 course read path only knew public / creator /
`course:read:all`, so a learner whose only route to a private course was
their cohort could not see the course — or anything under it. Course
visibility now includes "member of a usergroup linked to the course", both
for single reads and in the listing query. Assessment access lists narrow
this (a restricted allowlist can only remove learners who already have
course access; it never widens it), and the legacy fallback that treated
every usergroup on the platform as eligible when a course had no linked
groups is gone — a group must be linked to the course to be allowlisted.

## Submissions schema (2026-09-05, P4.1)

Against the legacy `submission` + `grading_entry` + `item_feedback` +
`bulk_action` + `code_run` tables:

- `submissions` reference the assessment (1:1 with its activity) and carry a
  denormalized `course_id` for gradebook queries. `user_id` and
  `assessment_id` are NOT NULL (the legacy DDL left both nullable by
  accident).
- "One open draft per learner" is a partial unique index, not a `.first()`.
- `metadata_json` is gone. Its scalars are columns (`violation_count`,
  `auto_submit_reason`/`auto_submitted_at`, the timer's backoff counters —
  which the legacy wrote into a schema that rejected them —
  `duration_seconds`); `violations` stays jsonb as an event list; code-run
  records are rows in `code_runs` with a `submission_id` FK instead of
  copies in metadata. Plagiarism fields are not carried (the sweep was
  inert: impossible type filter + wrong nesting level; FINDINGS).
- `raw_grading_json` leaves the submission: the raw auto-grade is the
  `raw_breakdown` of the grading entry that produced it; the submission
  keeps only the effective breakdown. Two copies, not three.
- `grading_entries.graded_by` is NULL for the auto-grader; the legacy wrote
  the student's id. Immutability (only `published_at` may change, no
  deletes except the parent cascade) is a DB trigger, not ORM listeners.
- `code_runs` / `code_run_cases` get real FKs (legacy had none). Run-level
  stdout/stderr — which the legacy overwrote with the last case's values —
  are dropped; `compile_output` stays at run level.
- `idempotency_keys (user_id, key)` backs the `Idempotency-Key` contract
  for submit (24h sweep), replacing the legacy metadata-stored key.
- The legacy attempt-penalty cap came from `activity.settings`; it becomes
  `assessments.attempt_penalty_percent` (policy knob).
- Progress projections (`activity_progress`, `course_progress`) are P6; the
  gradebook and work queue are computed from submissions until then.

## Submission lifecycle and grading pipeline (2026-09-05, P4.2–4.3)

Ported from `attempt_service.py` + `pipeline/*`, with these deltas:

- **One attempt-limit check, not three.** The legacy counted attempts in
  the start path, the submit path and the constraint validator with three
  slightly different predicates; v2 has `count_completed_attempts` (every
  non-draft row) used everywhere, and the DB's one-open-draft index makes
  `start` idempotent — a second start returns the open draft (200) instead
  of racing to create another.
- **Optimistic lock on the wire.** Draft saves require
  `If-Match: "<draft_version>"`; responses carry the version as `ETag`.
  A stale save is 409 with `details: {expected, actual}` (the Problem
  envelope gained a `details` object for exactly this). The teacher's
  grade lock (`version`, 412) is separate and lands in 4.5.
- **Throttle only successful-shaped saves.** The legacy 5s autosave
  throttle ran first, so an invalid or expired save locked the client out
  for 5s. v2 validates, checks the timer and merges before the Redis
  counter is touched.
- **Anti-cheat count is server-side.** `POST /submissions/{id}/violations`
  appends the event (last 200 kept) and bumps `violation_count`; the
  client's number on submit can only raise the stored count, never lower
  it. Zeroing still needs a detector enabled *and* the threshold reached
  (legacy semantics), and is recorded as `auto_submit_reason =
  integrity_violation` even when the learner pressed submit themselves.
- **Late penalty survives manual review.** The legacy stored 0 for
  essays and never penalised them; v2 computes and stores `late_penalty_pct`
  regardless, and the teacher's grade path applies it.
- **Code challenges without a final run go to manual review** instead of
  scoring zero — 4.4 runs Judge0 at submit so this only bites when the
  runner is down (DEGRADED path).
- **Idempotency is per user, key and route** (`submit:{id}:{key}`), body
  hashed with SHA-256; a reused key with a different body is 422, not a
  silent replay. Keys are swept after 24h by a job.
- **Timer sweep backs off per row** (120s·2ⁿ ≤ 1h, five tries) using the
  real `auto_submit_*` columns; the legacy wrote these into a schema that
  rejected them, so its retry counter never advanced.
- **Release visibility** follows one rule: `published` or a published
  grading entry → visible; `graded` without one → `awaiting_release`
  (scores, breakdown, graded_at and late % all hidden); `pending`/`draft`
  → hidden; `returned` → visible with the revision flag.

## Code execution (2026-09-05, P4.4)

Ported from `services/code_execution/service.py` (the official Judge0
Python SDK underneath) and the attempt/orchestrator call sites:

- **Own Judge0 client, same wire.** Batch create (`POST /submissions/batch?
  base64_encoded=true`) then batch poll until every status id is past
  "Processing", chunked at Judge0's default batch size of 20; Judge0's own
  `expected_output` check is not used so the platform's match modes
  (exact / trimmed / ignore-whitespace / numeric-tolerance; `custom_checker`
  falls back to exact, as in legacy) stay authoritative. Poll budget is
  25s by default (legacy 30s) because runs execute inside the request and
  the API's request timeout is 30s.
- **Breaker semantics kept** (5 consecutive failures → open 30s → single
  probe), but a Judge0 *rejection* (4xx on our payload) no longer counts
  as a failure and the run is recorded `internal_error`, not `degraded`:
  retrying a bad payload cannot help, and it must not open the breaker for
  everyone else.
- **Concurrency cap; saturation is not an outage** (2026-09-30, BUG-372).
  Each process sends at most `AB__JUDGE0__MAX_CONCURRENCY` batches (default
  2, matching judge0.conf `COUNT=2`) to Judge0; later batches wait for a
  slot inside the same `poll_max_wait` budget. Waiting out that budget —
  for a slot or for results — is `Busy`: the run is `degraded` (503,
  retryable) but the breaker is untouched. Only transport errors, 5xx and
  429 count toward it. Ceiling: dead workers behind a live Judge0 API make
  every run wait the full budget instead of failing fast.
- **In-flight keys answer 409** (2026-09-30, BUG-371): a key whose run is
  still `queued`/`running` is `idempotency-in-progress`, never re-executed;
  a run left `running` for 2 minutes is marked abandoned (`internal_error`)
  and its key freed. The timer's final run never blocks a hand-in: any
  error from it sends the attempt to manual review (BUG-370).
- **Hidden tests are stored in full and masked on read.** The legacy nulled
  stdin/expected/stdout of hidden cases in `code_run_case` itself, so a
  teacher could never see what a learner's program printed on the test
  that failed. v2 masks in the service for non-authors; authors see all.
- **Reference check is author-only.** The legacy endpoint required only
  submit access, so any learner could execute the stored reference
  solutions (FINDINGS #17).
- **Submit-time behaviour by path.** Learner submit: compile error → 422
  `compile-error` carrying `compile_output` (the legacy contract), runner
  down → 503 `code-runner-degraded` with `is_retryable` and `Retry-After`,
  draft untouched in both cases. Timer auto-submit cannot show anyone an
  error: a compile error grades what it earned (0/N), a down runner hands
  the attempt to manual review (`pending`) instead of retrying forever
  (the legacy timer raised, backed off, and left the draft open). Blank
  source scores zero without touching Judge0 (legacy).
- **Runs are keyed by header, not body.** `Idempotency-Key` is a request
  header like on submit; scope is (user, item, purpose, key). A finished
  accepted/wrong-answer run replays (200), a different source/stdin/
  language under the key is 409, and a failed run frees the key for a
  retry — all legacy rules.
- **Rate limit on runs** (new): 20 per minute per user in Redis. The legacy
  had none; the breaker was its only protection.
- **Language allowlist is config** (`AB__JUDGE0__LIMITS__ALLOWED_LANGUAGE_IDS`,
  legacy default set) ∩ the item's `languages`; `GET /code/languages` is
  the intersection with what Judge0 reports, cached 10 minutes in-process.
- **Sandbox policy is code, not config**: JVM (26/27/28/62/78) and Go
  (22/60) memory floors, 64 MB stack, 128 processes and the compiler flags
  the legacy hardcoded — they pair with the `languages` table patch (5.3).
- Judge0 is optional in v2 config: without `AB__JUDGE0__BASE_URL` code runs
  answer 503 and code challenges go to manual review, so a deployment can
  boot without the execution tier.

## Teacher grading surface and bulk actions (2026-09-05, P4.5–4.6)

Ported from `grading/teacher.py`, `assessments/review_service.py`,
`grading/gradebook_cursor.py` and `grading/bulk.py`:

- **One grade-save endpoint** (`PATCH /submissions/{id}/grade`) replaces
  the legacy pair (`TeacherGradeInput` with a mandatory final score, and
  the item-level `GradingDraftSave` that recomputed it). The raw score is
  optional: given → used as is; omitted → earned / possible × 100 over the
  breakdown. Item scores are entered on the item's own `max_score` scale
  and converted into the breakdown's share-of-100 points, so auto-graded
  and hand-graded items add up (the legacy grading draft summed only the
  items in the request, silently dropping auto-graded ones).
- **`If-Match` is mandatory** on grade saves and carries `version`; a
  mismatch is 412 `precondition-failed` with `{expected, actual}` (the
  legacy made the header optional, so two graders could overwrite each
  other by omitting it). The learner's draft lock stays 409 — different
  actors, different codes.
- **Transition table kept verbatim**: pending/graded → graded | published
  | returned; returned → graded | pending | published; published →
  published only; drafts are never gradable (409).
- **Returned work lifts the attempt cap**: the legacy exposed
  `can_start_revision`; v2 folds it into `attempt_state.revision_requested`
  and `can_start`, and the revision is attempt n+1.
- **Item feedback rows are written by the grade save itself** (one per item
  grade with a score or comment), tied to the grading entry, so the learner
  endpoint shows only feedback from published entries. The separate
  `/grading/feedback` CRUD router is not ported until a UI needs it.
- **Bulk release** inserts a published entry per held grade (copying the
  latest entry, else the stored breakdown) and flips the submission —
  legacy semantics, single audit event.
- **Review queue is keyset-paged** (id desc, newest first) instead of
  page/page_size with four sort orders; stats carry the distribution the
  UI used the sorted list for. Search covers username and display name
  (v2 has no first/last name columns).
- **Gradebook is derived from submissions** (latest non-draft per learner
  × assessment, keyset on the pair) until P6 lands the progress
  projections the legacy read; the response also ships the users and
  assessments the cells reference so the client needs no second call.
- **Deadline extensions are transactional jobs**: the `bulk_actions` row
  and the `grading:bulk-action` job commit together (ARCHITECTURE §7),
  the API answers 202, the worker executes, and a failure is recorded on
  the row rather than retried. The legacy's `execute_inline` test path is
  what the e2e test does by calling the executor directly.
- **Batch grading (`PATCH /grading/submissions/batch`) is not ported**:
  the generated client exists but nothing in `apps/web` calls it. Cheap
  to add on top of `save_grade` if P9 finds a use.
- **XP on publish** (gamification) and SSE events for `grade.published`,
  `submission.returned`, `deadline.extended` are left as marked hooks for
  P6 and 4.7.

## Grading SSE on Redis Streams (2026-09-05, P4.7)

Ported from `routers/grading/sse.py` + `services/grading/events.py`
(pub/sub + a sorted-set replay log with a 5-minute window):

- **One primitive instead of two.** The legacy published to a pub/sub
  channel *and* wrote a sorted set for replay, then filtered the set by
  ULID on reconnect. v2 appends to a Redis Stream per submission; the
  stream id is the SSE `id:`, so `Last-Event-ID` is a plain `XRANGE (id +`
  and live delivery is `XREAD BLOCK` from the same cursor — no gap between
  "replayed" and "live", no event-id search, and `MAXLEN ~1024` + a 7-day
  TTL bound memory instead of a 5-minute replay window.
- **A dedicated connection per subscriber** for the blocking read; the
  shared multiplexed connection only publishes and counts slots.
- **Publishing never fails the request.** Grade saves, releases and
  deadline extensions publish best-effort after the DB write and log a
  warning on failure; events are advisory (the client refetches on
  reconnect). The legacy queued publishes through taskiq with retries —
  v2 does not carry a durable outbox for advisory events.
- **The worker publishes too** (deadline extensions) when `AB__REDIS__URL`
  is set; without Redis the worker still runs and skips events.
- Route is `GET /submissions/{id}/events` (legacy `feedback-stream`);
  access = owner or a grader of the assessment, 404 otherwise; the
  per-user cap stays 5 with the legacy `sse_conn:{user}` counter shape
  and a 429 + `Retry-After: 60`.
- Event names unchanged: `connected`, `grade.published`,
  `submission.returned`, `deadline.extended`. `data` is
  `{event_id, event, submission_id, payload, sent_at}` (unix seconds; the
  legacy sent ISO strings).

## File submissions (2026-09-05, P5.1)

Ported from `services/file_submissions.py` + `routers/file_submissions.py`:

- **Files are uploads.** The legacy accepted multipart bodies through the
  API and streamed them to storage itself. v2 reuses the P2 upload
  pipeline: the client creates a `file-submission` upload, PUTs to the
  presigned URL, finalizes, then attaches the upload id to the draft. The
  activity's own policy (mime allowlist, per-file size cap, max files) is
  checked at attach time; the platform-wide 100 MB private-bucket cap
  applies at upload time. Attaching moves the upload's reference count so
  the reaper never collects a file that is part of an attempt.
- **One open attempt per learner** (`draft` or `returned`) is a partial
  unique index, so the double-click race collapses to the same row.
  Submitted/graded attempts count toward `max_attempts`; drafts do not.
- **`If-Match` on the attempt `version`** is optional for learner saves
  and submits (412 when sent and stale), required for grader writes —
  the same split as assessment submissions.
- **Grade visibility follows status**, not the assessment-style release
  mode: the owner sees `final_score`/`feedback`/`rubric_scores` once the
  attempt is `published` or `returned`; `graded` is the teacher's private
  draft. `grade_release_mode` is stored for parity but not yet consulted
  (batch release lands with the gradebook follow-ups if the frontend
  needs it).
- **Late handling** mirrors assessments: past due with `allow_late` off
  is a 409; otherwise `late_penalty_pct` comes from the shared
  `LatePolicy` math and is stored on the attempt for the grader.
- **Dropped:** the bulk zip download (`/download-all`) — no frontend
  caller, and a streaming zip belongs in a job if it returns. `scan_status`
  is stored (`pending`) but no scanner runs yet.
- Routes: `/file-submissions[/{id}[/publish|/draft|/submit|/me|/submissions[/export]]]`,
  `/activities/{id}/file-submission`, `/file-submission-attempts/{id}[/grade]`,
  `/file-submission-files/{id}/url` (JSON `{url, expires_at_unix}` rather
  than a redirect, since the client renders a link list).

## Judge0 tuning is an operator command (2026-09-05, P5.3)

The legacy API patched Judge0's `languages` table from a daemon thread on
every boot (`app/judge0_patch.py`), polling for two minutes until Judge0
had created the table. v2 does not connect the API server to Judge0's
database at all: `ashyq admin judge0-tune` runs the same seven UPDATEs
(verbatim command strings) against `AB__JUDGE0__DATABASE_URL`, refuses when
the core rows are not seeded yet, and is idempotent so it can be re-run
after a Judge0 image upgrade re-seeds the table. It is a cutover runbook
step (MIGRATION §6, T-0 5a), not a runtime behaviour.

5.2 ("code arena") is folded into 4.4: the frontend arena drives
assessment-item runs and author reference checks; there is no separate
arena surface in the legacy API to port.

## Progress projections and the trail (2026-09-05, P6.1)

Ported from `services/progress/submissions.py`, `services/trail/trail.py`
and `services/learner_course_state.py`:

- **One projector, called after the fact.** Every submission and
  file-attempt write path calls `ProgressProjector::after_*` once the row
  is committed; the projector rebuilds the learner's activity row from
  current state and then the course aggregate. Failures are logged, never
  surfaced (the legacy did the same inside the request transaction). The
  same code runs as `ashyq admin progress-backfill`, so a missed hook is a
  repair, not a data loss.
- **Every published activity is required** unless its `settings.required`
  is `false` — exactly the legacy rule. The v2 `assessments.required`
  column (defaults `false`) is NOT consulted by progress, as the legacy flag
  was not either; see FINDINGS #18 for the follow-up.
- **`graded` never completes a course.** Completion for `graded`/`passed`
  rules requires `published`, so a saved-but-unreleased grade cannot unlock
  a certificate — carried over verbatim.
- **Trail steps are UX, not progress.** Adding a step records an explicit
  completion only for lesson-type activities (dynamic/video/document/
  custom); assessment and file-submission activities are owned by their
  pipelines. `course_total_steps` counts published activities (the legacy
  counted every row, drafts included).
- **No `/trail/start`, no 404 on empty.** The trail is created lazily on
  the first write; `GET /trail` answers an empty trail for anonymous
  callers and learners who never added anything. Course/activity ids
  replace the legacy uuid strings in paths.
- **Certificate block is stubbed** (`configured: false`) until P6.3 lands
  certifications; gamification hooks (XP on step) arrive with P6.4.
- Cohort members without any interaction are not seeded by the backfill
  (they have nothing to project); analytics that need "not started" counts
  per cohort compute them from membership (P7).

## Discussions (2026-09-05, P6.2)

Ported from `services/courses/discussions.py` onto the tables P2 already
laid down (`course_discussions`, `discussion_reactions`):

- **Counters are trigger-maintained.** The legacy incremented
  `likes_count` / `dislikes_count` / `replies_count` in application code
  (and clamped at zero on the way down), so they drifted. Two `AFTER` row
  triggers recount from the reactions table and the active children; the
  columns stay, so exports and analytics read them as before.
- **One reaction per user per post.** The legacy had separate like and
  dislike tables with no uniqueness; the two `PUT .../like` and
  `.../dislike` toggles were already exclusive, and the non-toggle
  `POST/DELETE .../like` pair (unused by the frontend) is dropped.
- **Keyset paging** (`cursor` = last id, newest first for posts, oldest
  first for replies) replaces `limit/offset`; `include_replies` still embeds
  every active reply under each post on the page.
- **Author summary carries no email** (id, username, display name, avatar
  key) — the legacy returned the full `UserRead`, see FINDINGS #16 for the
  same class of leak in search. A post outlives its author (`author: null`).
- **Content rule kept:** HTML is stored as sent; it must contain visible
  text after tag-stripping and is capped at 20k characters. No sanitizer
  server-side — the client renders discussions through its existing
  sanitizing renderer (P9 confirms).
- Moderation grants: `discussion:moderate:platform` (moderator, maintainer)
  edits/removes anything; `discussion:moderate:own` (instructor) does so on
  courses the actor created; owners edit/delete their own via `:own`.
  Hidden posts disappear from lists and take no reactions; only a moderator
  can un-hide (the owner's PATCH on a hidden post 404s like everyone else's).

## Certifications (2026-09-06, P6.3)

Ported from `services/courses/certifications.py` onto the P2 tables:

- **Issuance is a projection side effect.** The legacy issued from the
  trail step handler and again, defensively, when the learner opened their
  certificates. v2 issues inside `ProgressProjector::recalculate_course`
  the moment `certificate_eligible` turns true — so every write path that
  completes a course (lesson step, auto-graded submit, a teacher publishing
  the last grade, a deadline extension) issues without knowing about
  certificates. The on-demand re-check on `GET /courses/{id}/certificates/me`
  stays for parity; both are idempotent through the `(certification, user)`
  unique key, replacing the legacy try/rollback/retry dance.
- **Verify codes** are `XXXX-XXXX-XXXX-XXXX` over a 32-letter alphabet
  without 0/O/1/I (80 random bits) instead of the legacy
  `{hash}-{date}-{user-suffix}-{timestamp}` string; the code is the public
  identifier the client already links as `/certificates/{code}/verify`.
- **Public verification returns the holder's display name and username**,
  never the email (the legacy verify endpoint returned no user at all; the
  frontend rendered the name from the session — useless for a third-party
  verifier, so the name is included).
- **Template reads are for authors.** `GET /certifications/{id}` and the
  course list need course-scoped `certificate:read` (platform, or `own` as
  creator); learners get the template through their own certificate
  payloads, as the legacy frontend already did.
- The legacy `last_known_update_date` optimistic check on the parent
  course is dropped (as for other P2 course sub-resources); template edits
  are last-write-wins.
- Course-completion XP (legacy `on_course_completed`) is P6.4 and will hang
  off the same eligibility flip.


## Work queue (2026-09-06, P6.5)

Ported from `services/work_queue.py` as `GET /work` (tag `work-queue`),
assembled from the canonical `activity_progress` projection rather than
from submissions, so the inbox and the learner course state agree:

- **Ids, not uuids.** `course_id` / `activity_id` are v2 ids and always
  present (the legacy fields were nullable strings); item ids keep the
  legacy shape (`learner-progress-<progress_id>`, `teacher-grade-…`,
  `teacher-release-…`) and hrefs keep the legacy client routes with ids
  substituted. Timestamps are `due_at_unix` / `created_at_unix`.
- **Cursor** is base64url (no padding) of the JSON array `[rank, at, id]`
  with `at` in epoch seconds or `null` (legacy: an ISO datetime string).
  The sort key is unchanged (priority rank, due_at or created_at with
  missing last, id) and `total` still counts the whole queue before
  paging. A cursor that does not decode is a 422 `validation-failed` on
  field `cursor` (legacy: a bespoke `INVALID_WORK_CURSOR` detail); an
  out-of-range `limit` is the same envelope on `limit` instead of the
  FastAPI query error.
- **Teacher scope via `resource_authors`.** Course creator, or an `active`
  row in `resource_authors (course_id, user_id)` — the legacy polymorphic
  `resource_uuid` match folded onto the P2 FK. No grant is checked, as
  before: the learner queue is the progress of the caller alone and the
  teacher queue is empty for anyone without courses.
- **Review target resolved in SQL.** The latest submission, else the
  newest `submitted` (grading) / `graded` (release) file attempt — joined
  through `file_submissions`, since v2 attempts carry no `activity_id`.
  Release rows without a `graded` target are dropped, as in the legacy.
- **Learner name** is `users.display_name` (trimmed), else `username`
  (legacy: first + last name, else username).
- Inherited, not changed here: `awaiting_release` only exists for rows in
  state `graded`, which the projector (P6.1, legacy-faithful) assigns only
  when a saved grade has no score — in practice file attempts. A scored
  quiz grade that is saved but not yet released projects to `passed` /
  `failed`, so the learner sees a `feedback_released` item before the
  release. A projector follow-up, not a work-queue one.

## Gamification (2026-09-06, P6.4)

Ported from `services/gamification` + `worker/tasks/xp_award.py`:

- **XP is only ever a side effect.** The legacy `POST /gamification/xp`
  let any signed-in user award themselves any non-admin source at the
  default amount (FINDINGS #19). v2 keeps the route for platform managers
  only (`admin_award` to a target user); learners earn through hooks:
  trail step (activity), course eligibility flip in the progress projector
  (course), a passing *published* submission seen by the projector (quiz /
  exam / code challenge, keyed `submission_{id}`), and the first login of a
  day (login streak + `login_bonus`, keyed by day). The legacy taskiq award
  task is gone: the projector already runs after every publish path.
- **Hooks never fail the caller.** Every hook logs and swallows — a daily
  cap, a policy misconfiguration or a DB hiccup must not break a lesson
  step or a login. The ledger's two unique keys make replays no-ops.
- **Level in SQL.** `record_award` locks the profile row, inserts the
  ledger row (`ON CONFLICT DO NOTHING` across both unique keys), moves the
  profile and computes the level with the legacy curve
  (`XP = 50(l-1)^2 + 50(l-1)`, cap 100) in the same transaction, then stamps
  `triggered_level_up` — no read-modify-write race.
- **Daily cap** counts UTC days from `last_xp_award_at`; admin awards
  bypass it (legacy). The cap itself and per-source rewards are the
  singleton `gamification_config` row (`PUT /gamification/config`); zero /
  negative values mean "default", as before.
- **Streak touches stay client-callable** (`POST /gamification/streaks/
  {kind}`) for the learning streak the client marks on study sessions; the
  login streak is now also stamped server-side at login, so the client
  call is redundant there.
- Leaderboard keeps `limit/offset` (a top-N list, not a feed) and carries
  username / display name / avatar key — no names split into first/last,
  no email.
- **Leaderboard opt-out is honoured** (2026-09-12, gauntlet). The client
  has always written `preferences.privacy.showOnLeaderboard`; the legacy
  stored it and listed the user anyway. v2 excludes a profile whose value
  is the JSON `false` from the leaderboard and `total_participants`;
  `rank` (and the dashboard's `user_rank`) counts only listed profiles, so
  it is the position the caller holds or would hold on the public board —
  an opted-out user still sees their own rank.

## Analytics (2026-09-06, P7)

Ported from `services/analytics/*`, `routers/analytics.py`, `db/analytics.py`:

- **Schema deltas.** uuidv7 ids and real FKs (legacy rows were bare int
  columns with composite PKs), `Numeric(x,2)` → `double precision` (values
  are rounded in the domain), `reason_codes` as `text[]`, the platform-wide
  teacher aggregate is `teacher_user_id IS NULL` (legacy used the magic id
  0; `UNIQUE NULLS NOT DISTINCT` keeps the upsert key), and every daily
  table is keyed `(metric_date, key)` so a rollup is a re-runnable replace.
- **The event log is real.** The legacy declared `analytics_event` and
  never inserted a row (FINDINGS #20), so its "events" were reconstructed
  from submissions and progress. v2 keeps that reconstruction (the numbers
  stay comparable) and additionally records `submission.submitted` /
  `.graded` / `.published` / `.returned`, `activity.completed` (explicit
  or projected, only on the flip to completed), `discussion.posted` and
  `login` from the write paths — best-effort like the gamification hooks:
  an insert failure is logged, never returned. Discussion posts and
  completions from the log feed the activity series; submissions come
  from the `submissions` table so a replayed event cannot double count.
- **One rollup job, every six hours.** Legacy `refresh_teacher_analytics_
  rollups` existed but no scheduler task called it (FINDINGS #21), so the
  period-over-period cards always compared against nothing. v2 seeds
  `analytics:rollup` on the interval scheduler every 6h; each run replaces
  the current UTC day inside one transaction, so the last run of the day
  is the nightly snapshot (risk trend, previous-period baselines) and an
  intraday run only refreshes it. `ashyq admin analytics-rollup --from
  --to` rebuilds a range. A rollup is computed **as of now** and labelled
  with the date (as the legacy function did): a backfilled range seeds
  baselines, it does not reconstruct history.
- **Rounding is CPython's.** `context::round_to` rounds the exact binary
  value with ties to even (format-then-parse), so `round(2.675, 2)` is
  2.67 and `round(0.35, 1)` is 0.3 exactly as the legacy produced. The
  first draft used scaled half-even arithmetic and disagreed in the third
  decimal; its own unit test caught it.
- **Scope and status codes.** `analytics:read:assigned` (instructor seed)
  = courses created or actively co-authored via `resource_authors`;
  `analytics:read:platform` (maintainer seed) / `:all` = every course,
  with `teacher_user_id` to inspect one teacher and the platform aggregate
  row as the comparison baseline. Explicit `course_ids` outside the scope
  are 403 (the caller asked for something it may not see); path ids
  outside it are 404 (no existence leak). `/admin/overview` is 403 without
  platform scope. Exports need `analytics:export:*` separately (legacy).
- **Filters are validated in the domain**, not by axum: `window`,
  `compare`, `bucket`, `bucket_start`, `course_ids`, `cohort_ids`,
  `teacher_user_id`, `timezone`, `sort_order` all report together as a 422
  with field errors; `page` / `page_size` clamp (legacy). The query DTOs
  deliberately do not `deny_unknown_fields`: the client forwards its whole
  filter state and FastAPI ignored extras. Week buckets start on Monday in
  the requested IANA zone (jiff), DST days are 23/25 hours.
- **Labels are codes.** Every user-facing string the legacy returned in
  Russian (alert titles, recommended actions, why-now, insight bodies, CSV
  headers) is a stable snake_case code or English text; the client
  localises. CSV exports are RFC 4180 with CRLF like the grading export.
- **Risk rows vs. risk counts.** A learner is listed as at risk whenever
  at least one reason code fires (legacy), even at `low`; the course and
  teacher `at_risk_learners` counters count medium + high only (legacy
  `_merge_*`). `newly_at_risk` is only said from medium up.
- **Routes.** `/teacher/courses/by-uuid/{uuid}` is folded into
  `/teacher/courses/{id}` (every id is a uuid now — P9 adapts the client).
  Interventions and saved views return 201 on create (legacy 200);
  saving a view with an existing (type, name) updates it and still
  answers 201 with the same id. `certificates_issued_28d` honours its
  name (legacy counted every certificate ever issued).
- **Admin overview** compares teachers over one loaded context (the
  legacy reloaded a context per teacher); numbers are identical, only the
  query count changed.

## AI subsystem (2026-09-06, P8)

Ported from `services/ai/*`, `routers/ai/*`, `worker/tasks/ai.py`:

- **No rig-core.** ARCHITECTURE §12 named rig-core as the provider layer.
  Both configured providers (OpenAI, OpenRouter) speak the same
  OpenAI-compatible `chat/completions` contract, and the legacy used
  exactly two features of it — JSON-schema structured output and SSE
  streaming. `ab_clients::llm` is a ~700-line reqwest client for that
  contract instead: fewer transitive crates to `cargo deny`, a wire format
  we own in the wiremock fixtures, and the module firewall the
  architecture asked for holds by construction (the wire structs are
  private; `ab-domain` sees `CompletionRequest` / `Completion` /
  `StreamChunk` / `LlmError`). Swapping in rig later is a one-module diff.
- **Fallback is at request open.** A provider that fails before answering
  (transport, timeout, 5xx, 429, and other 4xx such as a bad key) hands
  over to the next one. A stream that breaks mid-way is an error, not a
  retry — a half-answered question must not restart on another model.
- **Structured output = schema + lenient parse + one repair round.** The
  reply is parsed after stripping code fences / surrounding prose; on
  failure the invalid reply and the parse error go back to the model once
  (the pydantic-ai behaviour). `InvalidOutput` after that fails the run.
- **Draft mode is a provider outcome, not a config branch.** When no
  provider is configured (or the chain is exhausted at open) and
  `ai_draft_mode_enabled` is on, agents answer with the legacy
  deterministic drafts (verbatim strings, `model_name = draft-mode`) and
  the run still succeeds — the client sees the same shapes. With draft
  mode off the run fails with `ai-disabled` / `ai-provider-unavailable`.
- **Run journal in Postgres, mirror in Redis.** Every event is an
  `ai_events` row (sequence allocated under a run-row lock, so the executor
  and a cancel request cannot collide) and then, best-effort, an `XADD` to
  `sse:ai:{run}`. The tail (`POST /ai/runs/{id}/stream`) reads Redis for
  live runs and the journal for finished ones, so a run that finished
  before the client connected (or whose stream expired) still replays in
  full. Legacy polled the table every second.
- **Cancellation is a status flip.** `POST /ai/runs/{id}/cancel` moves
  `queued|running → aborted` (guarded update) and journals `cancelled`; the
  executor polls the status once a second into a `CancellationToken` that
  every model call selects on. `finish_run` re-checks the status before
  the guarded `running → succeeded` update, so a cancel that lands during
  the last step still wins.
- **Budget = ledger, not a scan.** `ai_token_ledger (month, user)` is
  upserted when a run finishes; the platform month sum is one query. The
  legacy summed every `ai_run` row of the month per request, and its
  `/ai/usage` compared *all-time* tokens with the *monthly* budget
  (FINDINGS #22). Hourly caps are Redis fixed windows (`ai_hourly:{user}`,
  analysis vs remediation lane), not a count over `ai_run` rows.
- **Budget failures are 503 `ai-budget-exhausted`, not 429.** The
  legacy raised 429 for both the request-size cap and the month cap; a
  client cannot fix either by waiting a minute. The hourly cap stays 429
  (`ai-rate-limited`). Disabled features answer 503 `ai-disabled` (legacy
  403) — nothing about the caller is wrong.
- **Access answers 404, not 403, for other people's things.** Runs,
  threads, submissions, remediation sessions: the P4.7 rule. Course write
  gates (analysis, critique) still 403 — the course itself is visible.
  Capabilities never 404: an unknown or invisible course is
  `available=false, reason=course_not_found` (legacy exposed private
  course names here, FINDINGS #24).
- **Course Q&A streams the JSON string, not a text mode.** The model is
  asked for the `CourseQaAnswer` object; `answer_markdown` is its first
  key, so `partial.rs` decodes the growing string value (escapes,
  surrogate pairs, held-back partial escapes) and the client sees text
  deltas while citations are still arriving — the pydantic-ai partial
  validation trick without the dependency. A client that disconnects
  mid-answer aborts the run and keeps the partial text as an `incomplete`
  assistant message (the legacy `CancelledError` path).
- **`client_turn_id` is an idempotency key**, unique per (course, user):
  a retry replays the stored answer as a synthetic AG-UI stream without a
  model call; the same id with a different question is 409; a retry while
  the first attempt is still running is 409.
- **Six agents, one pipeline.** `run_structured` (execution events →
  structured completion → validation event → redaction → `finish_run`) is
  shared; each agent owns its gates, context, prompt, draft and record.
  Prompts are the legacy files verbatim (en/ru/kk, same locale
  resolution). `lecture_writer` / `lecture_improver` prompts had no caller
  and are not carried. Approvals (`ai_approvals`) and semantic memory
  (`ai_student_memory`) tables exist for parity; nothing writes to them
  yet, as in the legacy.
- **Admin runs are keyset-paged with SQL filters.** The legacy loaded the
  newest 200 rows and filtered in Python, so a `feature=` or `provider=`
  filter could return an empty page while older matches existed
  (FINDINGS #23). Run metadata in admin views goes through the same
  allow-list as before; event payloads are ours (state, counts, error
  codes) and are returned whole.
- **`ashyq admin ai-eval`** records one provider smoke probe per call in
  `ai_eval_results`; the fixture corpus the architecture describes is a
  follow-up (no eval datasets exist in the legacy either).
- Ids replace the legacy `*_uuid` strings everywhere under `/api/v2/ai`;
  AG-UI request bodies stay camelCase (`threadId`, `runId`,
  `forwardedProps`) because they are the protocol the client library
  speaks.

## Coverage floor scope (2026-09-11, gauntlet)

The 80% line floor (`just cov`) now ignores `crates/etl/**` and
`crates/server/src/main.rs`. Whole-workspace coverage had fallen to 78.2%
after P8 and P10 landed: the ETL crate is ~4,000 lines at ~39%, and the
entrypoint is 500 lines at 0% by nature. The ETL is a one-shot cutover tool
whose correctness is established by the P10 rehearsals (two fresh loads, 89
verification checks, MIGRATION.md §5) and it dies with the legacy database at
T+30d; holding it to a unit-test floor would spend effort on code with a
30-day life. Product crates measure 84.5% under the same floor.

What it replaces: the workspace-wide floor. Revisit if the ETL outlives cutover.

## `course:read:all` does not reveal private courses (2026-09-12)

The v2 read path treated `course:read:all` as "see every course", but the
seed grants it to every role — including `user` — because in the legacy it
only meant "browse the public catalogue": `_accessible_courses_filter`
applied public / creator / author / cohort to every authenticated caller
regardless of grants. That made every draft visible to every learner in v2
(catalogue, search, collections), while `learner-state` and enrolment then
answered 403/500 behind the card. Visibility now follows the legacy filter;
the platform-wide bypass is reserved for holders of `course:update:platform`
or `course:manage:platform` (maintainers, admins), and the same rule applies
to collections. Zitadel's `AlreadyExists` on TOTP enrolment maps to the
contract's 409 alongside `AlreadyReady`.

## Course thumbnails ride the upload pipeline (2026-09-12)

The legacy `PUT /courses/{id}/thumbnail` multipart route was never ported;
the `course-thumbnail` upload purpose and `courses.thumbnail_image_key`
existed with nothing to claim them. `Course` now exposes `thumbnail_key`
and `PATCH /courses/{id}` accepts `thumbnail_upload_id`, claiming a
finalized upload the caller owns and releasing the replaced key to the
reaper — the same shape platform branding and avatars use. Video
thumbnails are gone (no v2 field; nothing rendered them).

## Leaving a course resets its lesson completions (2026-09-12)

`DELETE /trail/courses/{id}` dropped the trail run but kept the progress
projection, so a learner who "left" a course was still enrolled at 25 % and
`can_enroll` was false. The legacy `remove_course_from_trail` deleted the
`TrailStep`s too — the explicit lesson completions. v2 now resets those rows
(`unmark_complete` for every non-pipeline activity) and recalculates the
course; assessment and file-submission rows are pipeline-owned and stay,
because the submissions still exist. Enrolment is derived from a run or any
row past `not_started`, not from the mere existence of projection rows.

Operational note: projector rule changes (this one and the unreleased-grade
hiding above) need `ashyq admin progress-backfill` after deploy — persisted
rows are only rewritten on the next write.

## Owner answers to the gauntlet questions (2026-09-12)

All open `QUESTIONS.md` items were answered; the answers are binding and the
"Not in v2" list in `apps/web/AGENTS.md` is amended accordingly.

- **Self-registration returns** (Q-2026-09-10-1): `POST /auth/register`
  creates the Zitadel human (verification code returned headless, sent via
  Resend per 2026-08-16) and the `users` row with the default `user` role;
  `POST /auth/verify-email` confirms. Admins also get `POST /users` and a
  "create user" action on `/dash/admin/users`. Password change comes back
  with it (`POST /auth/password`), reset stays out until email flows are
  proven live.
- **Teacher course listing is server-side** (Q-2): `GET /courses?mine=true`
  plus `q`, `sort`, `preset` and a `summary` block; the client-side walk is
  retired.
- **Course collaboration exists** (Q-3): contributors with the legacy roles
  (`creator`, `maintainer`, `contributor`, `reporter`) and statuses
  (`pending`, `active`, `inactive`); `GET|POST /courses/{id}/contributors`,
  `PATCH|DELETE /courses/{id}/contributors/{user_id}`, `POST
  /courses/{id}/contributors/apply` when `open_to_contributors`. Active
  maintainers/contributors author on the course like the creator.
- **Legacy-only gaps are replaced by first-class routes, not shims** (Q-4):
  `GET /users/{username}/courses` (authored + active contributions, public
  ones only for strangers), `GET /utils/link-preview` (server-side OG fetch,
  http(s) only, 5 s, no private ranges), readiness on the server (below);
  exam config / policy presets stay client defaults.
- **RBAC admin surface stays on the rebuilt pages** (Q-6) with dedicated
  error codes (`role-slug-taken`, `last-admin`, `self-disable`) and custom
  roles carrying `display_name`/`description` text distinct from the seeded
  roles' catalog keys.
- **TOTP state is on the wire** (Q-7): `mfa_enabled` on `SessionInfo` and
  `UserProfile`.
- **Readiness is server-side** (Q-2026-09-11-1 b): `GET /courses/{id}/readiness`
  with the curriculum rule plus each assessment's and file submission's own
  readiness; publishing a file-submission activity requires a published config.
- **The auto-grader emits codes** (Q-2026-09-11-2): `feedback_code` + params
  next to `feedback`; the client localizes codes, teacher prose stays prose.
- **Matching items get a learner shape** (Q-2026-09-12-1):
  `MatchingLearnerBody { left[], right[] }` (shuffled right column), the
  attempt UI builds columns from it; authors keep `pairs[]`.
- **`request_id` reaches the problem+json body** (Q-2026-09-10-5).
- **Gamification is zeroed at cutover** (Q-2026-09-06-1 c): the ETL migrates
  no XP, levels, streaks or ledgers.
- **Analytics retention** (Q-2026-09-06-2 b): `analytics:rollup` prunes
  `analytics_events` older than 400 days and daily rollups older than 2 years.
- **AI models** (Q-2026-09-06-3): `gpt-6-luna` / `deepseek/deepseek-v4-flash`
  stay the defaults; the 1 000 000 tokens/month budget stands; keys are set by
  the owner in the server env at cutover.
- **Pass-6 contract gaps are closed on the server** (Q-2026-09-12-2): gradebook
  carries file-submission cells; `GET /courses/{id}/grading/events` streams
  grade changes course-wide; `GET /courses/{id}/gradebook/export` returns CSV;
  analytics alerts/forecasts/anomalies/insights carry codes + params, no prose;
  `GET /certificates/{code}/pdf`; per-user courses (above); AI analysis and
  remediation accept file-submission attempts; `Usergroup.can_write`;
  file-submission publish readiness; `AB__SERVER__WEB_URL` anchors browser
  redirects; the web polyfills `Intl` locale data for kk when the browser lacks
  it.

## Analytics contract closures (2026-09-12, gauntlet pass 8)

- **Codes, not prose.** `AlertItem`, `ForecastItem`, `AnomalyItem`,
  `InsightFeedItem` and `DataQualityIssue` carry `code: AnalyticsCode` (a
  utoipa enum, 23 values) + `params` (object) and no `title` / `body` /
  `prediction` / `detail`; `kind` stays where it existed. The web renders
  `TeacherAnalytics.messages.<code>.{title,body}` with the params (ICU
  plurals/selects; list params are joined through `codes.*`). `grading_slo_*`
  params keep the course name, breach/queue counts and the oldest age the prose
  used to lose. `AssessmentAuditEventRow.summary` → `final_score`;
  `AssessmentItemAnalyticsRow.note` is now the workflow code or `null` next to
  `accuracy_pct`. A vitest walks the generated enum and requires ru/kk/en copy.
- **Retention** as answered: `analytics:rollup` prunes events > 400 d and daily
  rows / risk snapshots > 2 y (ARCHITECTURE §9).
- **Gamification zeroed** as answered: the ETL ledger recompute is deleted;
  profiles are written with zeroed counters and only `preferences` kept
  (MIGRATION §2).
- **AI** as answered: defaults confirmed; `AB__AI__*` keys are owner-supplied
  in the cutover compose; `ashyq admin config-check` prints `ai.status`
  (`disabled: no provider key` without keys).

## Grading contract closures (2026-09-12, gauntlet pass 8)

Implements the grading items of the owner answers above. Routes:

- `GET /courses/{id}/gradebook` — cells are keyed by `activity_id` and carry
  either `assessment_id` + `submission_id` or `file_submission_id` +
  `attempt_id` (a file attempt `submitted` reads as `pending`); the page
  lists `file_submissions` columns next to `assessments`. The page is
  `limit` whole learner rows (1..=500, default 100), keyset on the learner
  id, which is the cursor (BUG-265, 2026-09-24 — replaces the
  `<user_id>:<activity_id>` key cursor, whose page count grew with
  learners × activities and outran the web walker). The web reads cells
  from the wire only and walks every page.
- `GET /courses/{id}/gradebook/export` — CSV, UTF-8 with BOM, header and
  status words in the `Accept-Language` language (`ru` default, `kk`,
  `en`); graders only.
- `GET /courses/{id}/grading/events` — SSE for graders on one Redis stream
  per course (`sse:grading:course:{id}`): `submission.submitted`,
  `grade.saved`, `grade.published`, `submission.returned` for assessment
  submissions and file attempts; `payload` carries `activity_id`,
  `user_id`, `status`, `final_score` and the attempt id. The web subscribes
  with `EventSource` (credentials) and keeps 15 s polling only while the
  stream is down.
- `grading.items[].feedback_code` + `feedback_params` — the auto-grader's
  verdict as a code (`no-answer`, `no-correct-answer`, `correct`,
  `incorrect`, `partially-correct-no-credit`, `partially-correct`,
  `pairs-matched`, `tests-passed`; ratio codes carry `{correct, total}`);
  `feedback` keeps the English text; a teacher's prose clears the code.
- `MatchingLearnerBody` — the learner read of a `matching` item is
  `{kind: "matching", prompt, left[{id,text}], right[{id,text}]}` with the
  right column shuffled per (viewer, item) — the assessment read has no
  submission, so the seed is the viewer, which is what keeps reloads
  stable. Option ids are the pair texts (unique per column by the
  readiness rules), so the answer wire and the grader are unchanged.

## Certificates, AI on file attempts, link preview (2026-09-12, gauntlet pass 8)

Implements three more items of the owner answers above. Routes:

- `GET /certificates/{code}/pdf` — public by code, like verification. A4
  landscape rendered on the server with `pdf-writer` + `subsetter` (typst's
  writer/subsetter) and `skrifa` for glyph metrics — no headless browser;
  two Noto Sans subsets (Latin + Cyrillic incl. Kazakh, SIL OFL) live in
  `crates/domain/assets/fonts` and are embedded as CID fonts. The page
  carries the holder, course, certificate name/type, issue date (UTC+5),
  teacher (`certificate_instructor` from the template, else the course
  creator), the verification code and the verify link
  (`AB__SERVER__WEB_URL` + `/certificates/{code}/verify`, also a link
  annotation). Language: `Accept-Language` (`ru`/`kk`/`en`), else the
  holder's locale. `Content-Disposition: attachment`. The web downloads it
  with the session cookie into a Blob («Скачать PDF» on the trail card and
  the verify page); the client-side pdfme designer on the course-end view
  stays for the template preview.
- **AI analysis and remediation take a file-submission attempt** through
  the *same* routes: `/ai/submission-analysis/{id}/…` and
  `/ai/remediation/{id}/…` take an `AiSubjectId` — an assessment submission
  id *or* a file-submission attempt id (both UUIDv7; the server looks the
  id up in both tables, 404 otherwise). `SubmissionAnalysis` and
  `RemediationSession` carry `submission_id` and
  `file_submission_attempt_id`, exactly one set
  (`ai_submission_analyses` / `ai_remediation_sessions` gained the nullable
  column + `*_one_subject` CHECK; migration `20260912000020`). The attempt
  context is the activity, the teacher's instructions and rubric, the
  attempt's status/score/feedback/rubric scores and its files by name,
  type and size; text files (`text/*`, JSON/XML/YAML) are read back from
  storage (16 KiB each, 48 KiB total) — PDFs and office documents are
  described, not extracted. There is no learner comment on v2 attempts.
  Run metadata names the subject (`submission_id` or
  `file_submission_attempt_id`, both in the admin-safe context keys). The
  web mounts `SubmissionAIEntry` on the file-submission review page with
  the attempt id.
- `GET /utils/link-preview?url=` → `{url, title, description, image_url,
  site_name}` from OpenGraph / `<title>` (any signed-in session — no new
  permission resource; the legacy route was open). SSRF guard: `http(s)`
  only, no credentials, the hostname is resolved first and every address
  must be public (loopback/private/link-local/CGNAT/ULA/v4-mapped rejected;
  the connection is pinned to the checked addresses), redirects (≤3) are
  re-checked, 5 s deadline, 1 MiB read cap, HTML only. **Loopback is
  accepted only when `AB__ENVIRONMENT` is not `production`** — that is how
  the integration test previews a wiremock page and how the local editor
  previews `localhost:3000`. Cached 24 h in Redis (`link-preview:<sha256>`).
  Errors: a rejected URL is 422 with field `url`/`unsafe`; an unreadable
  page is 502 `link-preview-failed` (new code, catalogs ×3). The editor's
  link block maps `image_url → og_image` onto its stored `og_*`
  attributes (plus a new `site_name`), and a failed preview keeps the link
  as a fallback card (hostname + «Предпросмотр недоступен») with the
  problem code toasted.

## Contract-phase notes (2026-09-13)

- **Contributors live in `resource_authors`.** The roster reuses the table the
  ETL already fills (analytics and the work queue read it); the creator is
  implicit (`courses.creator_id`, synthesised as `creator/active`, immutable).
  Active `maintainer`/`contributor` rows ARE the `:own` scope for every
  authoring check (`CourseRow::is_author`); no role grant is needed on top.
  `reporter` reads the draft and the roster, never writes, and is absent from
  `Course.contributor_ids`.
- **Enrolment is the trail run**, as the legacy `TrailRun` was. Projection rows
  survive a leave (submissions stay), so they cannot mean "enrolled"; the
  projector creates the run on the first submission or file attempt so
  starting work still enrols. Leave copy tells learners that lesson
  completions reset while submitted work and grades stay.
- **Registration limits**: 10 created accounts per hour per IP, 60 attempts
  (register + verify) per hour per IP; the TOTP `otpauth` label/issuer carry
  the platform name.
- **Public profile**: `GET /users/{username}` (card) and
  `GET /users/{username}/courses` answer anonymous callers with public data.
  `GET /users/by-id/{user_id}` (2026-09-26) returns the same card by id —
  editor user blocks store `user_id` and every reader of the page resolves it.
- **Emails are case-insensitive identities** (BUG-093). Registration, the
  admin path and the Google link store `lower(email)`; login, uniqueness and
  the verification lookup compare `lower()` on both sides; migration
  `20260913000001` adds unique indexes on `lower(email)` and
  `lower(username)`. The ETL lowercases legacy emails (it already de-duplicated
  them case-insensitively). Usernames were already compared
  case-insensitively on register — now on login as well.
- **Zitadel user mistakes are 422/400, never 503** (BUG-092/094/096). The
  client maps: create-user code 3 with a plain password → 422 `password` /
  `password-policy`; change-password code 3 plain → 422 `new_password` /
  `password-policy`, code 13 `COMMAND-CahN2` (new == current) → 422
  `new_password` / `password-unchanged`; session check code 9 with a TOTP
  code ("Multifactor OTP isn't ready" — no authenticator enrolled) → 400
  `invalid-totp-code`. `Retry-After` on identity 429s comes from the live
  Redis window (`details.retry_after_seconds`), other limiters keep the
  60 s default (UX-020). Session listing is a pure peek (BUG-095).
- **A pending applicant may withdraw their own application** (UX-023):
  `DELETE /courses/{id}/contributors/{self}` while the row is `pending` →
  204 without roster-management rights; an active row stays manager-only
  (403), and re-applying afterwards is allowed. The landing shows
  «Отозвать заявку» under the pending badge.
- **Publishing gates live in the server** (BUG-102/103/104, pass 11). An
  activity whose assessment is still `draft` cannot be published (409
  `activity-not-ready`, the same code the file-submission gate uses); the gate
  is evaluated on the merged body (type change + publish in one PATCH). Course
  `lifecycle publish` re-runs readiness and answers 422 `course-not-ready` with
  the blocker list while any blocker remains — the review page's claim that the
  server repeats the checks is now true.
- **Uploads enforce the declared content type** (BUG-105). The presigned PUT
  signs `Content-Type`; finalize verifies the stored object's type equals the
  declared one and that it is on the purpose allowlist (exact types, no
  `image/*` prefix; SVG rejected with 415 as legacy did).
- **Analytics filters are validated, not silently ignored** (BUG-121, pass 11).
  Legacy `resolve_teacher_scope` passed `cohort_ids` through unchecked and
  dropped `teacher_user_id` for callers without platform scope. Now
  `cohort_ids` requires `usergroup:read:platform` (403 — cohort composition is
  usergroup data) and every id must exist (422 `cohort_ids`/`unknown`);
  `teacher_user_id` naming someone else without `analytics:read:platform` is a
  403 instead of a filter that quietly does nothing (own id still passes).

- **Pending attempts are teacher work in every grading mode** (UX-046, pass
  11). Legacy flagged `teacher_action_required` only for `grading_mode:
  manual`, so an auto-graded quiz whose essay items left the attempt `pending`
  showed «2 работы требуют проверки» on the review page but nothing in the
  teacher's work queue. `pending` is only ever set when a teacher must score
  something (manual mode, or `needs_manual_review` items in auto mode), so the
  projector now maps it to `needs_grading` + `teacher_action_required`
  unconditionally. Work-queue grading items are also limited to roster members
  who may grade (creator, maintainer, contributor — the `Course::is_author`
  rule the review route enforces); reporters no longer see items whose href
  answers 403 (BUG-127).
- **File attempts follow the assessment transition table for published
  grades** (BUG-128). A `published` file attempt can be re-published but not
  returned or saved back to `graded` (422 `action`/`transition-not-allowed`,
  same as `submissions/{id}/grade`); legacy allowed it and wiped the learner's
  released score.
- **Download URLs carry the original filename** (UX-047 server half). The
  presigned GET is now hand-signed (same SigV4 code path as the PUT) with
  `response-content-disposition=attachment; filename*=UTF-8''…`, so the browser
  saves «проект.pdf» instead of the storage key. `object_store::Signer` cannot
  sign `response-*` query parameters, hence the shared presigner.
- **Activity completion is sticky across a new attempt** (BUG-129, pass 11).
  Legacy `_recalculate_file_submission_progress` /
  `_apply_progress_from_submissions` derived `completed_at` from the latest
  attempt only, so a learner with a completed course (attempt 1 published
  91 %, certificate issued) who submitted a second attempt dropped to
  «3 из 4 · Продолжить обучение» while it waited for a grade. The projector
  now keeps `completed_at` from the most recent **published** attempt until
  a newer one is published (file attempts: any published attempt completes;
  assessments: the published one must still satisfy the completion rule, so
  a re-attempt released below passing under `passed` does un-complete).
  `state` still follows the latest attempt (`needs_grading`, `in_progress`,
  …) — only the completion count, `progress_pct`, `certificate_eligible`
  and the outline `complete` flag (now `completed_at || passed/completed`,
  the same predicate as the course aggregate) are sticky.

## Login brute-force limits (2026-09-13, gauntlet pass 12)

- **The per-IP login window counts failures only** (BUG-130). Behind Next every
  browser shares `X-Forwarded-For: ::1`, so a classroom NAT hit the 20-per-5-min
  cap with correct passwords. Every attempt is still counted before the Zitadel
  round-trip (an attacker cannot race the counter); the hit is released once
  Zitadel accepts the password (success, MFA-required, disabled account). Numbers
  stay `20 / 5 min` per IP, `10 / 15 min` per account (cleared on success).
- **The per-account key is the resolved user id** (BUG-134): `rl:login:name:<user
  id>` when the login resolves, `rl:login:name:<trimmed lower-case identifier>`
  for unknown names — a username lock cannot be bypassed via the email.
- **`POST /auth/password` limits wrong current passwords**: `5 / 15 min` per user
  (`rl:password:user:<id>`), 429 with `Retry-After`; a policy or outage failure
  hands the attempt back, a success clears the window (BUG-131).
- **The registration `created` cap counts accounts Zitadel actually created**
  (BUG-133): read before, counted after the 201 — a policy-rejected password no
  longer eats the 10-per-hour budget.
- **The client address trusts the proxy, never the caller** (BUG-147, pass 13):
  `ClientIp` (`crates/api/src/extract.rs`) reads `X-Real-IP` (our nginx sets it
  from the socket peer), else the LAST `X-Forwarded-For` hop (the one nginx
  appended via `$proxy_add_x_forwarded_for`; Next only fills the header when it
  is absent), else the TCP peer (`into_make_service_with_connect_info`). The
  first hop is client-supplied and was letting a rotating spoofed XFF dodge
  every IP limiter and forge the session list. A constant, not config: there is
  exactly one proxy topology (`extra/nginx.v2.conf.template`).
- **Profile names are trimmed and required on our side** (BUG-148): whitespace
  `first_name`/`last_name` → 422 `required` before Zitadel; a Zitadel code 3 on
  user creation maps to `password-policy` only when its message is about the
  password, otherwise to a 422 `invalid` on the named field — never a 503.


## Teacher grading (2026-09-13, gauntlet pass 12)

- **A deadline extension that makes a hand-in on time clears its late penalty**
  (BUG-139, deviation from legacy). `run_deadline_extension` recomputes
  `is_late` as before and, when it flips to false, zeroes `late_penalty_pct`;
  a graded row gets a new ledger entry (same raw score and breakdown, penalty
  0, final = attempt cap only, published iff the previous entry was) and its
  `final_score`/`version` follow. The legacy flipped `is_late` and kept
  deducting on every later save. On-time → late is not penalised
  retroactively (an extension never moves the date earlier in practice).
- **`PATCH /submissions/{id}/grade` has a publish-only shape** (BUG-138):
  with neither `final_score` nor `item_grades` the raw score of the latest
  grading entry is kept (re-deriving it from items dropped manual overrides;
  re-sending the penalised final applied the late penalty twice). `feedback`
  is now optional — omitted keeps the stored feedback — and `audit_note`
  (≤1000 chars) lands in the `grade-saved` audit payload only, never in what
  the learner reads.
- **A gate-mode remediation blocks new file-submission attempts too**
  (BUG-140): `open_new_attempt` consults `active_remediation_gate` like
  `assessments/access.rs` (403 `cannot start: REMEDIATION_REQUIRED`).
- **`gate_mode` requires course write access** (BUG-141): a learner may still
  generate remediation for their own work, but not assign themselves a gate
  they can lift with a self-reported score. A lecture suggestion may only be
  dismissed by an id the review carries (422 `suggestion_id/unknown`).

## No hard user delete (2026-09-13, gauntlet pass 12)

- **v2 has no `DELETE /users/{id}`** (UX-071). Accounts are disabled through
  `PATCH /users/{id}/status {disabled}` and can be re-enabled the same way;
  submissions, grades, audit rows and certificates keep their author. Both
  admin surfaces (`/dash/admin/users`, `/dash/users/settings/users`) say
  «Отключить пользователя» / «Включить» and list disabled users with a badge —
  no «удалить» wording, no hidden rows. A GDPR-style erasure, if ever needed,
  is a separate anonymisation job, not a row delete.

## Usergroup course links need course write access (2026-09-14, gauntlet pass 13)

- **`POST /usergroups/{id}/courses` requires write access on every course**
  (BUG-156). Linking grants every member (and the linker) cohort read access
  through `courses::require_read` → `user_in_course_group`, so the linker must
  be the course author (creator / active co-author) or a platform course
  updater — `CoursesService::require_write`. An invisible course is a 404, a
  visible one the caller does not author a 403, an unknown id stays the
  BUG-109 422 `course_ids/unknown`. Deviation from the legacy
  `add_resources_to_usergroup`, which checked existence only and let any
  instructor expose any private course by id.
- **Interventions belong to the acting user** (BUG-157): `teacher_user_id` on
  a stored row is the actor, never the inspected teacher — the query param
  only scopes reads (legacy wrote rows as the inspected teacher). The learner
  must be enrolled in `course_id` (trail run or course-progress row; 422
  `user_id/not-in-course`), and the scope gate runs before the
  `Idempotency-Key` replay. An unknown `sort_by` on the at-risk / courses /
  assessments listings is a 422 `sort_by/invalid` (it used to fall back to
  the default order silently).

## Analytics scope, saved views and blank strings (2026-09-18, gauntlet pass 14)

- **`teacher_user_id` impersonation is read-only** (UX-106): saved views are
  written and deleted as the acting user (like interventions, BUG-157) — an
  admin inspecting a teacher cannot delete that teacher's view (404).
- **Reporters are out of the assigned analytics scope** (UX-106):
  `db::analytics::teacher_course_ids` excludes `reporter` roster rows, the
  same rule the work queue, search and `contributor_ids` apply — a read-only
  role never lists a course as "mine" in the teacher dashboard.
- **`GET analytics/teacher/interventions` honours `page`/`page_size`** (the
  shared `AnalyticsQuery`; response carries `page`/`page_size`) instead of a
  fixed 100 newest.
- **Blank strings are one rule**: `ab_core::required_str` trims and answers
  422 `<field>`/`required`; DTOs routed through it (role display name,
  usergroup name, saved-view name/type, platform name) carry no garde
  `min = 1`, so `""` and `"   "` answer the same code.
- **The remediation gate holds at submit** (UX-105): an unpassed gate-mode
  session blocks the hand-in of a draft opened before the gate (403
  `REMEDIATION_REQUIRED`, `attempt-state.can_continue = false`) for quizzes
  and file submissions alike — the gate was start-only before.

## Quiz total is one normalisation (2026-09-19, gauntlet pass 15)

- **`grade_quiz` scores `round2(earned / possible × 100)` once** (BUG-169):
  the breakdown keeps per-item rounded points, but the total no longer sums
  them — legacy `quiz_grader.py` summed `round2` item points, so 6 equal
  items gave 100.02 and 3 gave 99.99, and `passing_score: 100` failed a
  perfect attempt. Same formula as the teacher re-grade path
  (`teacher.rs`), so auto and manual agree. Deliberate deviation from the
  legacy rounding.
- **The submit limiter counts accepted submits only** (UX-111): like
  `save_draft`, the 3/10 s budget is spent after ownership, status, version
  and answer validation — a 409/422 never locks the learner out.
- **One grade of record** (BUG-173): the gradebook cell and the gradebook
  CSV report the attempt `progress::projector` scores — the best-scored
  non-draft submission (`COALESCE(final_score, auto_score)`, the latest on
  ties; `activity_progress.best_submission_id`), and for file submissions
  the latest scored attempt — instead of the latest non-draft attempt. A
  learner whose attempt 3 was zeroed after a published 76 % is «Пройдено ·
  76 %» on the card and in the gradebook alike; `attempts` still counts
  every hand-in and the review queue lists a newer pending attempt.
  `gradebook_cells` ranks per (learner, activity) with the same ordering.
  Refined (BUG-180): a released grade outranks any pending attempt —
  `gradebook_cells` ranks `(final_score IS NOT NULL) DESC, COALESCE(final,
  auto) DESC, attempt_number DESC` (as the file branch already did), and
  `project_submissions` scores only released (`published`, scored)
  attempts through the mirrored `grade_of_record_order`; a pending retake
  with a higher partial auto score stays `pending_attempt`. Since the
  projection no longer carries unreleased scores, `learner_state` dropped
  its awaiting-grade mask: the card keeps «85 % · Пройдено» while attempt
  2 waits, and a returned attempt carries its provisional score as before.
- **The stored raw survives** (BUG-174): `save_grade` keeps the latest
  entry's raw score unless the request names a new one — a manual override
  (raw ≠ the item-derived value) and an integrity-annulled attempt's 0 are
  never replaced by an item recomputation, however many `item_grades` the
  client re-sends; only a differing item on a non-overridden grade
  recomputes. Dropping an override is explicit: `final_score: null` (the
  field is three-state — absent keeps, `null` drops, a value overrides),
  and an annulled attempt moves only on an explicit `final_score`. The
  grader's view carries `score_override` so the form reopens with the
  switch on; the form sends only the items the teacher edited. The
  gradebook cell also carries `pending_attempt` (BUG-175): the newest
  attempt awaiting grading behind the grade of record.
- **Wrong verbs answer problem+json** (UX-110): `method-not-allowed` (405)
  joins the registry via axum's `method_not_allowed_fallback`; API `login`
  trims the identifier (the name-limit key already did).

## File grades carry the late penalty (2026-09-19, gauntlet pass 16)

- **A file grade applies `late_penalty_pct` like a quiz** (UX-121): the
  legacy stored the penalty on the attempt and never applied it to the
  teacher's score, so «80 % · Штраф −10 %» meant 80. `FileSubmissionsService::grade`
  now stores the grader's number as `raw_score` and `final_score =
  apply_late(raw, late_penalty_pct)` (80 → 72 at 10 %) — the same order as
  the assessment teacher path. `raw_score` is on the attempt DTO (same
  visibility as `final_score`) so the review form reopens with the raw
  value and a re-save never penalises twice; existing rows were backfilled
  `raw_score = final_score` (they were never penalised). Deliberate
  deviation from the legacy.
- **One active remediation gate per learner and activity** (BUG-179):
  `generate`/`queue` with `gate_mode` answer 409 `conflict` with
  `details.session_id` while `active_remediation_gate` finds an unpassed
  one; `GET ai/remediation/{subject}/latest` returns the blocking session
  first, then the newest.
- **AI on a learner's own work waits for the release** (BUG-182): the
  owner may analyse / read the analysis or remediation of their submission
  or file attempt only once its grade is theirs to see (submission
  `release_state` visible / returned, attempt `published` / `returned`);
  before that the routes answer 403 `grade-not-released` (new registry
  code). A run the owner triggers gets the learner's context — item bodies
  through `redact_for_learner`, the grading through `redact_grading` by the
  assessment's `review_visibility`, no `Final/Auto score` before release —
  exactly the owner's submission read; a grader's run keeps the full
  grading. The queued executor decides by `triggered_by == owner`. The
  legacy let the owner analyse a pending attempt with the answer key in
  the prompt.
- **Gradebook cells name the pending attempt** (UX-123):
  `GradebookCell.pending_attempt_id` (the submission or file attempt id
  behind `pending_attempt`) so the «На проверке» queue and the cell deep
  link open the work awaiting grading, not the older grade of record; the
  at-risk CSV `reason_codes` / `recommended_action` cells carry the
  watchlist labels per `CsvLanguage` (unknown codes pass through).

## What `content_version` counts (2026-09-24, gauntlet pass 23)

- **`content_version` moves only when what a learner answers or is scored
  on changes** (BUG-257): adding or deleting an item, or an `update_item`
  whose body differs from the stored one (prompt wording, options, correct
  answers, tests, kind) or whose `max_score` differs. Prompt wording counts:
  it changes the question the learner answered. An item title (an author
  label), item metadata (section, difficulty, tags, outcomes, minutes) and
  a reorder do not — a draft opened before them stays current (no 409 on
  submit, auto-scored by the timer sweep). `update_item` compares values
  rather than testing field presence because the editor re-sends the whole
  item on every save; the same comparison decides the graded-submissions
  content lock. Replaces "every item write bumps the version" (BUG-224).

## Google account linking requires verified emails on both sides (2026-09-24, gauntlet pass 23)

- **A Google sign-in whose `sub` is unknown links to an existing account
  with the same email only when Google's `email_verified` claim is true
  and the local account's email is verified in Zitadel** (BUG-254).
  Otherwise the callback redirects to `/auth/login?error=account-exists`
  (new registry code, 409): sign in with the password instead. Why: a
  self-registered account never has to verify its address and can sign in
  with its password, so anyone could pre-register a victim's email and
  keep password access to the account the victim's later Google sign-in
  would land in. A Google account created from an unverified Google email
  is created unverified in Zitadel for the same reason. Once linked, the
  account is found by `sub` and the email Google reports is not used again
  (BUG-253). Replaces the legacy "same email → link" find-or-create.

## Assessment allowlists name course members (2026-09-24, gauntlet pass 23)

- **A restricted assessment's `user_ids` must be course members — users
  with a trail run on the course, the BUG-247 rule overrides and deadline
  extensions already use** (UX-180). Anyone else (the course's own
  teacher, a co-author, a platform admin, a cohort member who has not
  joined yet) is refused with 422 `validation`, one
  `user_ids.<id>` / `not-in-course` field error per offender. Why: an
  allowlist names learners who may take the assessment; staff preview
  without it, and counting them inflated `effective_user_count`. The
  studio picker already offers only the gradebook's learners. Replaces
  "any user with course access" (anyone at all on a public course).

## Editor block uploads follow the saved content (2026-09-24, gauntlet pass 23)

- **A media block in a `dynamic` activity holds its upload reference only
  while the saved content shows it** (BUG-263). The editor's Remove drops
  the node and sends nothing; the content PATCH re-derives
  `blocks.claimed` from the `block_uuid`s in the saved tiptap JSON: a block
  that left releases its upload (24 h grace), one that came back — an undo
  saved after the removal — re-claims it while the upload still exists.
  Cascades (activity/chapter/course delete, `DELETE /blocks/{id}`) release
  only claimed blocks. Document/video activities keep their block outside
  `content` and are not synced. Why: removal released the upload at once,
  so Ctrl+Z restored a node whose file the reaper deleted a day later.
  Replaces UX-147/UX-160 "Remove calls `DELETE /blocks/{id}`" (the route
  stays for API clients). A backspaced node now releases too.

## Staff attempts are previews (2026-09-24, gauntlet pass 23)

- **An attempt made by the course's staff — anyone `is_teacher_preview`
  holds for (creator, co-author/maintainer, platform author/admin) — is a
  preview** (UX-182). `submissions.preview` / `file_submission_attempts.
  preview` are set when the attempt opens; the learner-side projector
  entries (`after_submission`, `after_file_attempt`) neither enrol nor
  project a preview; the review queues, `submissions/stats`
  (`needs_grading`), publish-all / release, item analytics, both CSV
  exports, the gradebook, course analytics and the progress backfill skip
  preview rows. Why: pressing «Начать» on one's own quiz enrolled the
  author (a trail run) and listed them as a learner in the gradebook,
  review queue and counts, and made BUG-247's self-extension refusal moot.
  Replaces "authors pass as previewers, and their work counts like a
  learner's" (legacy BUG-145 enrolled them).
- **Staff never enrol** (BUG-287): `POST /trail/courses/{id}` and a mark
  (`POST /trail/activities/{id}`) are 409 for the `is_teacher_preview` set;
  the learner-side enrol entry (`lock_member(enrol)`) skips them; learner-
  state answers `can_enroll: false, denial_reason: "staff_preview"` and the
  landing offers «Открыть курс» (no enrol) instead of «Начать курс». The SQL
  `is_course_staff(course, user)` is the same rule; every member set
  (analytics `trail_runs`, the gradebook) excludes it, so a learner who
  later joins the staff drops out too. Migration 20260924000006 deleted
  the existing staff runs, their progress rows and access/override rows.
- **One preview rule across role changes** (2026-09-25, pass 25, BUG-294..296):
  an *existing* attempt is judged by its own `preview` column everywhere —
  quiz attempt-state (`is_teacher_preview`, effective policy,
  `attempt_gates`), save, submit, the timer sweep; file `disabled_reasons`,
  draft save and submit. Only a *new* attempt takes the caller's current
  staff status. A learner who joined the staff finishes a counted draft
  under the learner rules (past a hard due date it is PAST_DUE on every
  door). **A learner never resumes a preview**: attempt-state, the quiz
  `current` draft and the file `GET draft` ignore a preview draft of a
  non-staff caller, save/submit on it are 404, and the next `start` (quiz)
  or draft/submit write (file) deletes it — file uploads released, like an
  activity delete — and opens a counted attempt. Replaces: attempt-state
  and file gates read the caller's role while save/submit read the row
  (BUG-285), so the doors disagreed after a role change.

## A leave drops the leaver's allowlist and override rows (2026-09-24, gauntlet pass 24)

- **Leaving a course (`DELETE /trail/courses/{id}`) deletes the leaver's
  `assessment_access_users` and `assessment_overrides` rows for every
  assessment of the course, in the leave's transaction** (BUG-281). The
  allowlist check in `set_access` holds the member's trail run `FOR
  SHARE`, so a save racing a leave lands wholly before (the leave then
  drops the row) or after it (422 `not-in-course`). A restricted
  assessment's `effective_user_count` counts course members only — the
  same trail-run member set as the course-wide mode (a cohort member who
  has not joined is not reached yet). Why: the rows outlived the member,
  the count included a non-member and re-saving the unchanged list was a
  422. Rejoining starts clean: the teacher re-adds the learner. Replaces
  "allowlist and override rows survive a leave" (UX-180 / BUG-247 only
  checked membership on write).

## A grader never grades their own attempt (2026-09-24, gauntlet pass 24)

- **Grading one's own counted attempt is 403** (BUG-286): the quiz grader
  paths behind `gradable_submission` (`GET submissions/{id}/review`,
  grading history, `PATCH submissions/{id}/grade`) and the file-attempt
  `PATCH …/grade` refuse a submission whose owner is the caller unless it
  is the caller's own staff preview (UX-182 — a preview is never a grade of
  record). Why: a learner approved as a contributor published 100 on their
  own attempt. The owner still reads their work through the learner
  routes. Replaces the legacy (no owner check on the grading routes).

## A revoked waiver re-applies the late penalty (2026-09-25, gauntlet pass 25)

- **Every override writer — create, update, delete, and the bulk
  extension — settles the learner's lateness both ways** (BUG-297): each
  submitted attempt's `is_late` and `late_penalty_pct` become what a
  hand-in at its `submitted_at` pays under the policy the write left
  behind, so a waiver or extension revoked (`PUT`) or deleted puts the
  policy's penalty back; a row with a score of record is re-scored from
  its latest ledger entry (a new entry, published only if that entry was)
  under the row lock with a version bump (BUG-216). An annulled attempt
  never takes a late penalty. Why: a revoked waiver left 100 with
  `is_late true` and penalty 0, and a deleted one left 100 on time.
  Replaces "a deadline change only ever clears the penalty" (BUG-139).
- **An override applies to a hand-in when it was in force at the hand-in's
  `submitted_at`** (2026-09-25, BUG-307): `expires_at` unset or later than
  `submitted_at`. Settling judges each hand-in by the override as of its
  `submitted_at`, and submit / attempt-state / the timer sweep judge a new
  hand-in as of now — its `submitted_at` — so live grading and re-settling
  agree (one rule, `AssessmentsService::policy_at`). An expiry after the
  hand-in changes nothing, so a note-only `PUT` or any unrelated write never
  moves a score; an explicit revoke (`waive_late_penalty: false`, an
  `expires_at` before the hand-in) or a delete still re-applies the
  penalty. Why: after a waiver expired the learner kept 100 until any
  override write re-settled it to 70 late.
- **Every path that removes override rows settles** (2026-09-25, BUG-306):
  the leave (`drop_member_access`) and the staff-join sweep
  (`drop_non_member_access`, BUG-303) settle each assessment whose override
  they dropped, after commit, as a delete does. Why: a waiver dropped by a
  leave or a staff join left 100 on time while an identical attempt scored
  70 late.

## A deadline extension outlives the override's expiry (2026-09-25, gauntlet pass 25)

- **`expires_at` bounds the grants, an extension's due date stands on its
  own** (BUG-300): the bulk extension writes the new due date and sets
  `assessment_overrides.due_extended`; on a live override it keeps the
  row's `expires_at`, so the extra attempts and the waiver lapse on time
  while the new due date (and `override_applied`) outlive them. On an
  already-expired override the grants and the expiry are cleared (BUG-283).
  A teacher's `POST overrides/{user}` writes a plain override; a `PUT`
  writes the whole row and keeps the flag unless it changes the due date
  (2026-09-25, BUG-308: a same-values `PUT` ended the extension and
  re-scored an on-time hand-in late) — a changed date is the teacher's own
  and its `expires_at` bounds it. Why:
  clearing `expires_at` on every extension made a 20-second grant of 9
  attempts and a waiver permanent. Replaces "an extension clears
  `expires_at`" (BUG-283, 0716bc9).

## A late-policy change re-prices every hand-in (2026-09-25, gauntlet pass 27)

- **One lateness rule for every learner: a hand-in pays what the
  assessment's current policy and its override in force at `submitted_at`
  charge** (BUG-312): `PUT assessments/{id}/policy` (due date, `allow_late`,
  rate, cutoff) settles every learner's hand-ins after commit through the
  durable post-commit path (`ProgressProjector::after_lateness_change`, a
  `progress:lateness` job when it does not finish inline) with the same row
  lock / version / ledger rules as an override write (BUG-216/297). A pass
  that sees a newer `policy_version` when it ends runs again. So a learner
  with an override and one without always agree, and a later note-only
  override `PUT` is a no-op. Why: the policy change left every hand-in at
  the old price until an unrelated override write re-priced one learner
  (70 → 0 while the other stayed 70). Rejected: freezing the policy per
  hand-in — it needs a policy history (hand-ins only carry
  `policy_version`), and a teacher moving the due date expects existing
  work to follow it, as an extension does.
- **The settle re-prices the whole deduction, and file hand-ins follow
  their late rules too** (BUG-316): a settled row is re-scored from its
  ledger whenever the attempt cap or the late penalty moves it, so a policy
  `PUT` that only changes `attempt_penalty_percent` re-scores capped
  hand-ins. A file-submission settings `PATCH` that changes the due date,
  `allow_late` or the late policy re-judges every file hand-in (same
  `progress:lateness` kind, payload `{ file_submission_id }`); each attempt
  reads the config under the lock the `PATCH` takes, so an older pass never
  prices a row by replaced rules. File attempts have no ledger: the final is
  the stored raw score less the new penalty, and the version bumps (412 for
  a grade save that priced the old one).
- **Turning `allow_late` off waives the late penalty of existing late
  hand-ins; turning it back on restores it** (BUG-322, decided pass 27):
  `allow_late` is part of the late rules the settle re-applies, and
  `penalties::late_penalty_pct` charges nothing while late work is not
  allowed (the readiness warning already says a penalty "has no effect"
  then). Kept over "keep the old penalties" because the same one rule
  prices submit, settle and the timer sweep — keeping them needs a
  per-hand-in snapshot of the rules (rejected above) — and the switch is
  reversible (raw 80: 56 → 80 with late work off → 56 again). The file
  studio (whose only late rule is the due date) warns under it,
  once the task is published, that a change re-prices work already handed
  in. Every writer whose settle runs after the commit is `detached()` in
  its route (`PATCH file-submissions/{id}`, `PUT assessments/{id}/access`,
  usergroup delete / member add / remove), so a client hang-up between the
  commit and the durable post-commit step cannot drop the re-price.

## A timed attempt is handed in when its clock runs out (2026-09-25, gauntlet pass 27)

- **The timer sweep hands an expired draft in at `started_at +
  time_limit_seconds`** (never later than the sweep itself; BUG-315): that
  moment is its `submitted_at`, and lateness, the late penalty and the
  override in force (BUG-307) are judged at it — not when the
  once-a-minute sweep got to the draft. `auto_submitted_at` still records
  the sweep. Settling re-judges the same `submitted_at`, so live grading and
  re-settling agree. Why: a draft whose time ran out 8 s before the due date
  was swept 12 s after it and took a 25 % late penalty; a run swept 2 s
  earlier scored 100 on time.

## A learner's required set is what they may take (2026-09-25, gauntlet pass 27)

- **An assessment restricted to an allowlist is required only of the
  learners on it** (BUG-318): the course aggregate
  (`ProgressProjector::recalculate_course_on`) and the learner state drop
  from the required set every assessment whose `access_mode` is
  `restricted` and whose allowlist (users + linked groups — the
  `access_allows` predicate the attempt-state/submit gate uses) does not
  name the learner (`ab_db::progress::restricted_activity_ids`). Such an
  activity stays in the outline (`required: false`, `blocked_reason:
  "restricted"`, still `available` so the learner's own earlier results
  stay reachable) and is never the next action. The stored
  `activity_progress.required` keeps the authored flag; the access filter is
  applied when counting. `PUT assessments/{id}/access` re-aggregates every
  member after commit through `after_course_change` (durable
  `progress:course-change` job), and so does adding or removing usergroup members
  or deleting a group (every course the group is linked to **or allowlisted
  in** — the access check ignores the link; the delete collects them before
  the allowlist rows cascade away). The web counts nothing itself: course
  N/M and % are the server's `progress` aggregate and the CTA follows
  `next_action` (never a `blocked_reason` activity). Why: a learner left off a restricted quiz stayed
  at 2/3 forever — no completion, no certificate — and «Продолжить
  обучение» sent them to a quiz that answers 403.

## The grace period extends the timer (2026-09-26, gauntlet pass 28)

- **`grace_period_minutes` moves a timed attempt's deadline to
  `started_at + time_limit + grace`** (BUG-326): the attempt-state /
  draft-save / submit gates (`EffectivePolicy::timer_deadline`), the timer
  sweep (`list_expired_drafts`), the sweep's hand-in time (BUG-315) and the
  web auto-submit (`timerExpiresAt`) all use it. The fixed 30 s network
  slack (`SUBMIT_GRACE_SECONDS`) still applies on top for a submit.
  Lateness is unchanged (due date only). Legacy (`apps/api`) stored the field
  in `settings` and read it nowhere, so there is no legacy meaning to keep;
  this follows the studio tooltip («extra minutes after the time limit before
  auto-submission fires»). Why: the studio offered a setting that did
  nothing — a 45 s submit on a 20 s quiz with a 5-min grace answered 409.

## The AI request cap measures the prompt that is sent (2026-09-26, gauntlet pass 28)

- **Course Q&A fits the course context to `max_tokens_per_request`**
  (BUG-325): the context keeps whole sources in course order while it stays
  within `CONTEXT_CLIP_LIMIT` characters and the system prompt + history +
  question + context fit the cap (`ContextBundle::fitted`); only sources the
  model saw are citable. A turn is refused with `ai-budget-exhausted` only
  when its own text cannot fit. The other agents estimate the clipped
  context they actually send. Legacy (`apps/api`) estimated the whole
  unclipped bundle while sending 12 000 characters of it, so every question
  on a large course answered 503.
- **AG-UI 1.0 input members are modelled** (BUG-323/324): `protocolVersion`
  and `resume` on `QaChatRequest` / `RunStreamRequest`, and the base message
  members (`name`, `encryptedValue`, `metadata`, `subagentRunId`) on
  `QaWireMessage`; the DTOs keep `deny_unknown_fields`. A vitest pins the
  members `@ag-ui/client` sends, so a client upgrade that adds one fails
  before it reaches the browser.

## The legacy stored score is the grade of record (2026-09-26, gauntlet pass 28)

- **A migrated attempt keeps its stored legacy score** (BUG-329). Legacy
  (`apps/api` `quiz_grader`) rounded each item's score to the cent and summed
  the rounded scores (`round(total, 2)`), so 149 of 150 items at 0.67 over
  0.6667 points stored 99.83, not 99.333; the ETL caps each item at its max,
  so the migrated items derive less than the grade the learner was shown,
  exported and certified with. The ETL (`with_score_of_record`) writes that
  raw (latest ledger raw, else `auto_score`; scored rows only) as the
  breakdown's explicit `score_override` when it differs from the item-derived
  percent by 0.01 or more — the review shows a stated adjustment, not a
  mismatch. Item scores are not rewritten: an item above its max fails every
  grading form.
- **A gap under a hundredth is storage drift, never an override**
  (`GradingBreakdown::differs_from_items`): the teacher view's
  ledger-vs-items inference (rows written before BUG-205's flag) compares the
  stored raw with the unrounded item percent, so 33.34 over 33.333 no longer
  switches the override toggle on. It replaces the `< 0.005` comparison
  against the item percent rounded to the cent.
- **Legacy attempts by course staff migrate as previews** (BUG-328): the ETL
  applies `is_course_staff` (the `is_teacher_preview` set) to migrated
  submissions, as migration 20260924000004 did once for rows present then —
  the restore loads after that migration ran.

## Analytics funnel and at-risk definitions (2026-09-27, gauntlet pass 28)

- **The course-completion funnel's `completed` share is of `enrolled`**
  (BUG-338). Legacy (`services/analytics/courses.py`) divided by
  `active_learners_7d or enrolled`, but a learner who finished weeks ago is
  completed without being active in the last 7 days, so the share reached
  300 % on real data. `enrolled` is the only earlier step that contains
  `completed`; the field keeps its name and stays <= 100 %.
- **Low risk is not at risk** (UX-240). Legacy counted medium + high as
  «at risk» in every summary and course counter but listed every learner
  with a reason code (low included) in the at-risk list, its total, the
  overview preview, the course-detail list and the at-risk CSV, so one
  screen showed two numbers. The summary is the definition: those lists and
  `at_risk_total` now hold medium + high only, and `RiskDistributionCounts`
  drops `low` (contract change). Low rows stay internal — rollup snapshots
  keep them so `risk_trend` still sees a learner who was low yesterday; a
  `recovered` learner (now low) leaves the list, as the intervention
  summary's `recovered_learners` already reports.

## Submission and upload integrity (2026-09-27, gauntlet pass 28)

- **A submit grades the draft as it is when it lands** (BUG-344). The
  final write matches the `draft_version` and violation count it graded;
  a save or violation report committed meanwhile makes the submit re-read
  and re-grade (up to three times, then 409) rather than publish a stale
  verdict. A client that pinned the version (`If-Match`) gets the
  stale-draft 409 instead of its newer answers being submitted for it.
- **Presigned upload URLs are create-only** (BUG-350). The PUT signs
  `If-None-Match: *` beside `Content-Type`, so a key is written once and the
  ledger row's key always names the bytes finalize verified — no copy to a
  second key, no checksum column. A retried PUT whose first attempt did land
  gets a 412; the client starts a new upload rather than overwrite.
- **An AI run's success is one commit** (BUG-348). `running → succeeded`,
  the artifact, evidence, token ledger row, `finished` event and the agent's
  feature record (analysis, review, remediation session, Q&A answer) commit
  together; Redis stream events are published after the commit. A success
  is therefore final: `fail_run` moves only `queued`/`running` runs, and a
  refused feature row rolls the whole success back instead of flipping a
  committed `succeeded` run to `failed`.

## Job claims and SSE slots are leases (2026-09-27, gauntlet pass 28)

- **A job is resolved only under its own claim** (BUG-342). `attempts` is
  the claim generation; `succeed`/`fail`/`mark_dead` match `(id, attempts)`
  and report a lost lease instead of touching a newer claim. The worker
  heartbeats only jobs whose task is still alive (BUG-341), so a job whose
  task panicked or whose resolution failed is reaped and retried — handlers
  stay idempotent.
- **SSE connection slots are per-connection leases** (BUG-343): a Redis
  sorted set per user (`sse_leases:{user}`, score = expiry), acquired by one
  Lua script (prune expired → cap 5 → add), released by `ZREM` of the own
  lease. A lost release frees its slot after one hour whatever the client
  does; a rejected attempt changes nothing. Leases are not renewed, so a
  stream open longer than an hour stops counting toward the cap.

## The grading review queue sorts on the server (2026-09-27, gauntlet pass 28)

- **`GET /assessments/{id}/submissions` takes `sort`** (`submitted_at` —
  default, `final_score`, `attempt_number`) **and `order`** (`desc` —
  default, `asc`) (BUG-351). Keyset on (sort key, id): the cursor stays a
  submission id and the server reads the cursor row's key back, so a
  cursor is valid only within the sort/order that produced it. Ungraded
  work sorts as score -1 (last descending, first ascending); ties are
  newest first in both directions. A cursor whose row is gone falls back to
  `id < cursor`, so the walk continues instead of ending on an empty page. The default order is now the
  submission time, not the id (draft-creation time).
- **The page walk reports what exists.** The review UI still pages by
  number over cursors; a queue that shrank below the selected page answers
  with the last page reached (the UI follows it), and `total` counts only
  rows through that page — shown as «N+» while more pages remain.

## Session grants are fenced on the user row (2026-09-27, gauntlet pass 28)

- **The request path reads the user row once per authenticated request**
  (BUG-345), replacing "request paths never re-check Postgres" (slice 1.8,
  ARCHITECTURE §7 now as written: `rbac_version` on the user row
  invalidates sessions). A grant change commits in Postgres before its
  Redis session rewrite, which can fail or be lost with the process;
  `SessionStore::fenced` compares the record's `rbac_version` with the
  row's (one PK lookup) and, for a record left behind, reloads the grants
  (persisted to the record best-effort) or ends the session when the
  account is no longer active. A record whose user row does not exist
  passes as is.
- **Every grant change bumps `rbac_version` in its own transaction**:
  assign/unassign and status as before; custom-role delete and grant-set
  replace now bump every holder with the change, under a lock on the role
  row (a concurrent assignment's FK check waits for it).
- **The post-commit rewrite is best-effort.** Role assign/unassign/delete,
  grant replace and account disable answer 204 and write their audit row
  even when the session rewrite/revoke fails (logged): the change already
  holds, and a retry would only 404 on it.
- **AI budget admission reserves; accounting records the provider**
  (BUG-349). An admitted request holds its prompt estimate plus the full
  `max_output_tokens` bound against the monthly budget until its run
  settles (`ai_token_reservations`, 15-minute lease for crashed holders),
  so near the month's end a request is refused while its worst case does
  not fit, even if its real answer would. The ledger records the
  provider-reported input and output tokens; estimates fill only a missing
  count. The per-request cap applies to the whole message set sent (system
  prompt, history, user turn); the context is fitted to it. Remediation is
  admitted after its analysis, so an inline refusal leaves a `failed` run.

## User profile builder and per-user theme are back (2026-09-28, gauntlet pass 29)

- **`users.profile` / `users.theme` restore two legacy per-user fields the
  rewrite dropped** (BUG-361/362; MIGRATION §5 listed `user.profile` as a loss
  and apps/web/AGENTS.md listed the server-side theme as "not in v2"). The
  restore audit found real data behind both: 5 users' experience / education /
  gallery / courses sections and 79 chosen themes.
- **The profile is a typed document, not free JSON.** `ab_domain::identity::profile`
  is the tagged serde model of exactly the legacy builder's section kinds
  (`image-gallery`, `text`, `links`, `skills`, `experience`, `education`,
  `affiliation`, `courses`, `gamification`); unknown kinds or fields are 422
  (API) or a hard ETL error naming the row (`Retype`). `normalize` trims and
  strips controls, caps counts (20 sections × 50 items, 64 KiB), and admits
  only `http(s)` URLs for images, links and logos. `PATCH /users/me { profile }`
  replaces the whole document (the builder saves as one unit, as legacy did);
  `GET /users/{username}` and `/users/by-id/{id}` expose it anonymously, the
  theme only through `GET /users/me`.
- **The theme is a slug the server does not resolve** (`[A-Za-z0-9-]{1,48}`,
  `null` clears): the web keeps the registry and falls back to its default for
  a slug it no longer ships. Legacy `default` is migrated as `NULL`.
- **Routes:** `PATCH /users/me` gains `profile` and `theme` (`null` clears the
  theme); `UserProfile` gains `profile` + `theme`; `PublicProfile` gains
  `profile`. No new endpoints.
- **Web:** the legacy `UserProfileBuilder` returns at
  `/dash/user-account/settings/profile` (contract types, react-query mutation,
  valibot pre-check for `http(s)` links); the public profile page renders the
  server document. The server theme is applied and persisted by
  `<UserThemeSync/>` under the platform/editor `SessionProvider` — the root
  `ThemeProvider` sits above it and only ever sees the anonymous session (the
  legacy provider's inline `useSession()` there was the same dead read).
  Anonymous visitors keep the localStorage fast path; a signed-in user's local
  change is written after a 1 s debounce; an unset server theme equals the app
  default, so users who never chose one are never written.
- **`user.details` stays dropped**: the only rows are the empty «Новая деталь»
  placeholder the legacy builder wrote on first open; the ETL logs that reason
  and would log a filled card with its content.

## Production edits to system-role grants survive the ETL (2026-09-30, gauntlet pass 30)

- **System roles stay seed-immutable; the ETL carries production's extra
  grants on a custom role** (BUG-378). Legacy let admins edit system roles
  and production did: instructors held `usergroup:manage:platform`. For each
  legacy system role the ETL diffs its grants against the v2 seed: an extra
  grant that parses as a v2 permission and is not already covered (same or
  broader scope, legacy hierarchy all > platform > assigned > own) goes on a
  custom role `<slug>-legacy-grants` («<legacy name> (legacy grants)»,
  priority one below the system role), assigned to every holder of the
  system role with the holder's assignment date. The admin can edit, strip
  or delete that role like any custom role. Every other extra grant is a
  per-row `etl_drop_log` entry (`role_permissions`, key `<slug>:<grant>`):
  `assignment:*` (no resource in v2 or legacy code; the role already holds
  the `assessment` twin), covered grants (instructor `user:read:assigned`),
  grants on a role nobody holds (guest `user:create:all` — v2 visitors carry
  no role and sign-up is not RBAC-gated). A seeded grant legacy had revoked
  cannot be subtracted from an immutable role: it is logged as
  `role_permission_revoked` for review (production has none). Replaces the
  table-level «seeded by migration 0003» drop of all 118 rows.
- **Out-of-range legacy percentages are logged per row** (UX-302):
  submission `auto_score`/`final_score`/`late_penalty_pct` and grading-entry
  `raw_score`/`penalty_pct`/`final_score` outside 0..=100 are clamped as
  before, and each clamp is a `submission_field`/`grading_entry_field` drop
  naming the legacy value.

## Course archive is orthogonal to `public`; enrolled learners keep read access (2026-10-02)

Spec: `docs/COURSE_ARCHIVING.md`. A third way out of a course besides delete
(cascades history) and unpublish (hides the course from its own learners,
BUG-183): `courses.archived_at/archived_by`.

- **Discovery vs reads.** Archived courses leave the catalogue, search, user
  profile, collection contents, work queues and analytics rollups;
  `course_visible` gains an arm that keeps an archived course readable for
  every learner with a `trail_runs` row, even when private. `public` is not
  touched, so restore returns the previous visibility without a readiness
  check ([Р5]); a public archived course stays reachable by direct link ([Р4]).
- **Frozen for everyone.** Every mutation answers 409 `course-archived`
  (`CourseRow::ensure_not_archived`, called in write-only gates such as
  `require_writable`, `load_for_edit`, `require_course_open`,
  `require_gradable`), never in shared read helpers, so author reads,
  gradebook and exports keep working. Grading freezes too ([Р2]); roster and
  usergroup links freeze ([Р3]). The auto-submit sweep still finalizes timed
  drafts. Archive/restore use the roster-manager gate ([Р1]).
- **Scheduled assessments drop to draft on archive** (with an audit event),
  so `publish-due` never fires inside a frozen course or right after restore.
- **Analytics scope splits** into `course_ids` (active, default lists,
  rollup, `managed_course_count`) and `reachable` (incl. archived) so an
  archived course's dashboard and exports still open.
- **Web:** the course workspace wraps editing tabs in a native
  `<fieldset disabled>` (gradebook and review stay live). `canArchiveCourse`
  is `course:manage` or authorship because list payloads carry no roster
  roles; a plain contributor sees the action and gets the server 403.

## Stage 1 modernization: owner answers and deviations from the spec (2026-10-02)

Spec: `docs/MODERNIZATION-STAGE-1.md`. As built: `docs/INFRA.md`; operations:
`docs/RUNBOOK.md`. Prod cutover is not executed yet (RUNBOOK 1).

Owner answers (spec section 10), which replace the defaults there:

- **No offsite backups.** `./backups` on the host, 7 days. No S3 target, so
  no archive encryption either (Q2). Accepted risk: FINDINGS #3.
- **A TLS-terminating university proxy sits in front of the host** (Q3). Port
  80 serves the routes for it; `TRUSTED_PROXY_CIDR` names it for real-ip.
- **GHCR packages are public** (Q4): the host pulls without credentials.
- **The legacy `openu` database and the `app_content` volume stay** (Q5).
  Not used, not in the new backups, never dropped by a script.
- **No external monitoring services** (Q6): no uptime check, no dead-man
  ping. preflight covers PAT/cert expiry and disk at deploy time.
- **Brand: "Ashyq Bilim"** (Q8, closes QUESTIONS Q-2026-09-13-1).

Deviations decided during implementation:

- **One `ci.yaml` instead of `server.yaml`/`web.yaml`/`infra.yaml`.** A
  release needs both images under the same `<sha>`; three workflows cannot
  express "publish only when all three passed for this commit" without
  cross-workflow polling.
- **Images are pushed as `ci-<sha>` and retagged `<sha>` (and `latest`) only
  after stack-smoke**, with `imagetools create` (no rebuild). deploy.sh accepts
  `<sha>` tags only, so "image exists" equals "release is green".
- **nginx network alias for the public hostname replaces
  `extra_hosts: host-gateway`.** Inside the stack the domain resolves to nginx
  on edge-net: same effect (signed S3 URLs keep the public host, no NAT
  loopback) without depending on the host's routing.
- **TLS files stay configurable (`TLS_DIR`, default `./certs` with
  `cert.pem`/`key.pem`) instead of mounting `/etc/letsencrypt`.** The host
  layout is unverified (the inventory had not run), and the legacy `./certs`
  layout keeps working unchanged. `renew-certificate.sh` copies in place and
  reloads, or recreates nginx when the path is a symlink.
- **db-init installs pgvector into `template1`.** `vector` is not a trusted
  extension, so the non-superuser `ashyq` cannot create it; every database
  created later (including `#[sqlx::test]` ones) inherits it and the
  migration's `CREATE EXTENSION IF NOT EXISTS` is a no-op.
- **`ZITADEL_TLS_ENABLED=false` next to `--tlsMode disabled`.** The `zitadel
  ready` healthcheck reads only the config, not the start flags.
- **Only `proxy_no_cache`, no `proxy_cache_bypass`.** The bypass decision is
  taken before the upstream answers, so it cannot read
  `$upstream_http_cache_control`; `proxy_no_cache` alone keeps non-immutable
  responses out of the cache.
- **Presigned PUT/GET are not in smoke.** They need a verified, logged-in
  account, and the `Secure` session cookie would not survive the plain-http
  smoke stack.
- **Backups are unencrypted.** They never leave the host (owner answer above);
  encryption would only add a passphrase to lose.
- **Judge0 runs behind the compose profile `judge0`.** It needs `privileged`
  and host cgroups; CI runners and rootless dev machines may not start it.
  Prod sets `COMPOSE_PROFILES=judge0`; smoke runs without it.
- **Root `vite.config.ts` deleted.** `apps/web/vite.config.ts` now excludes
  `src/lib/api/generated/` from lint; web `lint` is non-mutating and the old
  `--fix-dangerously` command is `lint:fix`.
- **No `continue-on-error` web gates.** The two lint errors of the baseline
  were fixed instead of waived, so every web gate is green and required.

## UI rights: `capabilities` on the session, `allowed_actions` on resources (2026-10-03, stage 2 S-02/S-03)

Stage 2 (docs/MODERNIZATION-STAGE-2.md 7.5, 10.1) makes the web draw navigation
and actions from server-computed rights instead of parsing `resource:action:scope`
strings. All additive on the wire (old fields, paths and statuses unchanged;
the `can_*` flags and `permissions` go in phase 9).

**`GET /auth/session` (and the `POST /auth/login` body)** gain `user` (the
`UserProfile` subset the shell needs) and `capabilities: Capability[]`, a closed
OpenAPI enum. The mapping lives in one place,
`crates/domain/src/identity/capabilities.rs`; each capability calls the gate the
matching endpoints enforce:

| capability | rule |
| --- | --- |
| `course.create` | `CoursesService::require_create` (`course:create:platform`) |
| `collection.create` | `CollectionsService::require_create` (`collection:create:platform`) |
| `groups.manage` | `usergroup:read:platform` + `UsergroupsService::require_writer` |
| `analytics.view` / `analytics.export` | `analytics::scope::ensure_access(read / export)` (`analytics:*:{assigned,platform,all}`) |
| `teach` | authors any course, `require_some_authoring` grant, `course:{update,manage}:platform`, `assessment:grade:platform`, or any of `course.create`, `analytics.view`, `groups.manage` |
| `admin.users` | `RbacAdminService::require_read_users` (`platform:read:platform`) |
| `admin.roles` | `RbacAdminService::require_read_roles` (`role:read:platform`) |
| `admin.platform` | `PlatformService::require_update` (`platform:update:platform`) |
| `admin.ai` | `ai::policy::require_admin` (`platform:read:platform`) |
| `admin.gamification` | `GamificationService::require_manage` (`platform:manage:platform`) |
| `admin.analytics` | `analytics::scope::has_platform_scope(read)` |
| `admin` | any `admin.*` |

A session whose `users` row is missing now answers 401 (it can only happen to a
test-minted session; production sessions die with the account).

**`allowed_actions: <Resource>Action[]`** (closed enum per resource) on the
detail and list items of: `Course` (everywhere it is embedded - collections,
search, trail, certificates), `Chapter`, `Activity`, `Collection`,
`Discussion` (posts and replies), `Usergroup`, `Assessment`, `TeacherSubmission`
+ grading `ReviewItem` (`GradeAction`), file-submission `Attempt` +
`FileReviewItem` (`FileGradeAction`), `Certification`, `AdminUser`, `Role`.
Each list is computed by a domain function sharing the predicate with the
mutation (`CoursesService::allowed_actions`, `CurriculumService::editable`,
`grade_actions`, ...). Rule: an action is listed iff the mutation would pass
its access gate *and* the object's state allows it (an archived course lists
only `restore` / `delete`; a published course `unpublish`, a draft `publish`;
a published file grade only `publish`). Input validation (422, e.g. readiness
blockers) is not predicted. `api/tests/access_flow.rs` proves listed ⇔ not 403
for course, collection and discussion across owner / other teacher / staff
role / student / admin.

Refinement for this: `CourseRow` carries `maintainer_ids` (active
maintainers), so the roster-manager gate is a pure predicate instead of a
per-check DB read.

Not covered: the `FileSubmission` config (its activity's `allowed_actions`
cover editing), learner-side attempt actions (already `ActivityState` /
work-queue `allowed_actions`).

**`ashyq admin seed-e2e`** (S-03, `just seed-e2e`): idempotent fixtures for the
web e2e suites - verified accounts `e2e-admin` (admin), `e2e-teacher`
(instructor), `e2e-student1`, `e2e-student2` (`<key>@e2e.test`, password from
`E2E_PASSWORD`, created through Zitadel like `POST /users`, so `POST
/auth/login` works on the dev stack) and the teacher's published course with
one activity of each type (dynamic, video, document, file submission, quiz,
exam, code challenge), student 1 enrolled. Refuses `AB__ENVIRONMENT=production`
(`Config::environment`, the same switch that hardens cookies and CORS). Existing
accounts keep their password; the document activity has no file attached.

## Web (stage 2) (2026-10-03, phase 0 skeleton)

Spec: `docs/MODERNIZATION-STAGE-2.md`; code: `apps/web-2`. One entry per Ф0 assumption (spec 12),
then deviations from the spec.

- **srvx + Start handler: confirmed.** `serve.ts` runs srvx 1.0.5 on Node 26 (types stripped by
  Node): `/assets/*` get `public, max-age=31536000, immutable`, the document streams (chunked),
  `gracefulShutdown` drains on SIGTERM. One catch: srvx hands a lightweight Node request that undici
  cannot clone, so `src/server.ts` builds a fresh `Request` for Start. Nitro is not needed.
- **hey-api from the unpatched contract: confirmed with three workarounds in our code, none in the
  config.** SDK, Valibot and `queryOptions` generate from `openapi.v2.json` as is. (1) Query keys
  embed the client `baseUrl`, so SSR and browser share a placeholder origin (`https://api.invalid`)
  that `shared/api/client.ts` swaps for the real one; otherwise hydration refetches and the internal
  API address leaks into the page. (2) Generated infinite options type `queryFn` as skippable, which
  `useSuspenseInfiniteQuery` rejects: lists compose key + SDK call by hand in `queries.ts`. (3)
  Generated mutation error types are the problem body; at runtime they are `ApiError`. Binary
  responses not verified: the contract still describes PDF/CSV as strings (C-02, server S-01).
- **Paraglide with several files per locale: confirmed.** `@inlang/plugin-message-format` 4.4.4
  takes a `pathPattern` array; every `messages/{locale}/<feature>.json` is listed in
  `project.inlang/settings.json`. The plugin silently skips a missing or unlisted file, so G-03
  fails on both. No merge step.
- **Router puts the nonce on every SSR script: confirmed.** `router.ssr.nonce` is read per request
  from a header `src/server.ts` sets; scripts, preloads and meta all carry it, CSP is
  `'nonce-…' 'strict-dynamic'`. CSP is sent in production builds only: Vite's dev client is not
  nonce-aware.
- **oxlint covers table 7.3: mostly confirmed.** Built-ins with custom messages (restricted
  imports with regex layer patterns, globals incl. `window.*`, properties, forbid-elements,
  filename case, size limits, cycles, floating promises) plus four jsPlugin rules in
  `gates/lint-plugin.ts` (JSX text, `?? []` over query data, literal query keys, `m[...]`). In
  `gates.ts` instead: G-03, G-07..G-13. Not machine-checked: "useEffect + request" and "component
  name = file name"; `react/no-multi-comp` allows one component per file, stricter than the spec.
- **React Compiler with Vite 8 + Start: confirmed.** `@rolldown/plugin-babel` + `reactCompilerPreset`;
  the client bundle carries the compiler's memo cache, SSR and hydration behave.
- **@tanstack/charts, Pacer, Hotkeys under SSR: not checked.** Nothing in the skeleton uses them;
  each is checked with its first consumer (spec 7.10: a primitive arrives with its consumer).
- **Intl `kk`: fell back to a month table.** Node 26 formats kk; Playwright's Chromium has no kk
  ICU data ("2026 M02 1"). `formatDate` builds kk dates from numeric parts + a month table on both
  sides; `format.browser.test.ts` pins it. kk numbers are still to be checked with `formatNumber`.
- **Deviations.** `typescript` is pinned to 6.0.3: hey-api needs the TS JS API, which TS 7 lacks;
  type checking itself is tsgolint (TS 7). tsconfig repeats `#/*` in `paths` because TS does not
  probe extensions for package `imports`. vitest and `@vitest/browser-playwright` stay on 5.0.1, the
  version vite-plus 1.0.0 pins. Scripts live in package.json (7.13); `vp run` rejects a name defined
  in both places; `"workspaces": []` makes apps/web-2 its own `vp run` root (the repo root lists only
  apps/web). G-07 is report-only until phase 7 (`gates/allowlist.json`). The login form is disabled
  until hydration: text typed earlier never reached TanStack Form state. The Dockerfile does not
  copy `openapi.v2.json`: the generated client is committed and the build never reads the contract.
- **Kit on real shadcn (K-3, 2026-10-03).** Was: `shared/ui` was hand-written Base UI + cva that only looked
  like shadcn (no `components.json`, no `cn`, no `className`, own names). Now: `shared/ui` = stock base-nova
  output of `bunx shadcn@4.21.1 add` (27 files; stock imports `cn` from the `cn` package and carry `.tsx` import
  suffixes because the CLI resolves `#/` through package `imports`); `shared/components` = our composites on
  them (templates, form fields on `Field`, DataTable, MultiCombobox, IconButton = Button + Tooltip, StatusBadge,
  ErrorAlert, SheetPanel, AccountMenu). Tokens no longer clear Tailwind namespaces; `dark:` follows
  `data-mode`. Exemptions, `src/shared/ui/**` only: lint (forbid-elements, no-multi-comp, React namespace
  import, 4 jsx-a11y rules, no-unsafe-type-assertion, no-underscore-dangle), G-11, knip unused exports, fmt.
  Stock edits: catalog texts in dialog/sheet/spinner/toast, chip `removeLabel` (aria-label), skeleton without
  pulse, button `hover:bg-primary/90` and no dark /20 destructive tint (G-15, e2e axe). Themes: retro-arcade
  dark ink 0.70 -> 0.76, t3-chat dark destructive 0.66 -> 0.70. Choice menus are `dropdown-menu` radio
  groups (icon triggers, menuitemradio roles), not `select`. sonner -> stock base `toast`; initial JS budget
  190 -> 200 KB (`cn` in the entry, gates/budgets.json).

## Generator-friendly contract (2026-10-03, stage 2 S-01)

`openapi.v2.json` is now described so a client generator needs no hand edits
(web gate G-08, `apps/web-2/gates/contract.ts`). Nothing changed on the wire:
same URLs, status codes, bodies and accepted requests.

- **Export-time pass** `ab-api/src/openapi.rs::finalize` runs on the utoipa
  document for both `GET /api/v2/openapi.json` and `ashyq openapi`
  (`openapi_doc()` now returns `serde_json::Value`, keys sorted). Rules it owns:
  - every `*_unix` property or parameter is `$ref: UnixTime` (integer seconds);
    `format: int64` is dropped everywhere. **Invariant:** every integer on the
    wire is within ±(2^53 - 1) (timestamps ≤ `EPOCH_MAX`, counters and byte
    sizes far below), so `number` is exact in JS;
  - CSV and PDF responses are `{type: string, format: binary}`;
  - a nullable property of a schema reachable from any response is `required`
    (serde always writes the `null`). Fields serde omits
    (`skip_serializing_if`) are declared `#[schema(nullable = false)]`: absent
    by design, never `null`. Shared request/response shapes follow the response
    rule (a request may still omit them);
  - in request-only schemas `null` equals absent, so optional fields are
    non-nullable, except the three-state patch fields deserialized with
    `double_option` (`NULL_CLEARS`, emitted with `x-null-clears: true`,
    pinned by a unit test). G-08 allows optional+nullable only there.
- **operationIds** (C-01): `get_ai_run`, `get_code_run`,
  `assessment_review_queue`, `file_submission_review_queue`,
  `export_assessment_submissions_csv`, `export_file_submission_csv`,
  `save_submission_draft`, `save_file_submission_draft`.
- **Path parameters** are named after their resource (`{course_id}`,
  `{assessment_id}`, `{run_id}`, ...). Two positions stay mixed because the
  URLs are: `/users/{username}` vs `/users/{user_id}/...`, and
  `/ai/course-analysis/{course_id}/...` vs `/ai/course-analysis/{analysis_id}/...`.
- **Enums** (C-04) are schema-only (`ab-api/src/dto/enums.rs`, plus
  `InterventionType/Status`, `ReadinessSeverity/Area` in the domain): the
  handlers keep string fields and validators; unit tests pin the sets to the
  server's lists. `sort` / `preset` on `GET /courses` and the analytics
  `window/compare/bucket/sort_order` are enums too; unknown `sort` / `preset`
  values keep their lenient fallback (no new 422).
- **Free-form JSON** (C-03) is typed by schema-only types in
  `ab-domain/src/wire.rs` (fields stay `serde_json::Value`): `EditorDocument`
  (the one open object), `ActivityContent` (editor document or media
  reference), `ActivityDetails` (video player settings), `MessageParams`,
  `SavedQuery`, `CorrectAnswer`, `AiEvidence`, `RemediationTest`,
  `FileRubric`, `RubricScores`, `ViolationEvent`, AG-UI `Tool/Context/MessagePart`;
  AI artifacts reference the structured-output types (`SubmissionAnalysisReport`,
  `CourseQualityReport`, `LectureReviewReport`, `RemediationBundle`,
  `StudyCompanionAnswer`); `Problem.details` is `ProblemDetails` (keys by
  code). `JsonValue` (any JSON) is reserved for values opaque by protocol (AG-UI
  `state`, `forwardedProps`, `resume`, tool parameter schemas, message
  metadata; LLM flashcards). Caveat: these describe what the current server and
  web write; rows ETL'd from legacy keep whatever shape they had.

## Generator-friendly contract, part 2 (2026-10-03, stage 2 S-01)

Finishes S-01; G-08 is at 0. Additive only: no field removed or renamed, no
status code changed (one new 422: a malformed `GET /search` `cursor`).

- **Stored JSON** is typed by schema-only types in `ab-domain/src/wire.rs`,
  checked against real rows of the restored production DB: AI run
  metadata / admin context / event payload, artifacts as a union tagged by
  `kind` (`RunArtifactBody`), Q&A message metadata and citations (`{}` or
  `{citations}` - part 1 had them as an array), eval details, the effective
  AI config (keys pinned to `AiConfig::redacted`), certification config,
  activity settings (`required` + legacy keys kept), file-submission
  settings (reserved map), intervention payload, bulk-action params, audit
  payload, block content, drill-through rows. Schemas whose real rows hold a
  key both absent and `null` are listed in `openapi.rs::STORED_JSON`, marked
  `x-stored-json: true`, and G-08 allows optional+nullable there.
- **Closed `allOf`**: an `allOf` with a `deny_unknown_fields` member
  accepted nothing (the profile section's `type` tag, the flattened
  file-submission config). The export pass merges it into the one closed
  object serde accepts.
- **Enums**: analytics kinds/categories/signals/flags/codes are real Rust
  enums (`code_enum!` in `analytics/types.rs`), `ReadinessCode` likewise;
  risk reason codes, contributor role/status and `ActivityState.activity_type`
  are schema-only enums pinned by tests.
- **Constraints**: the garde rules of request-only DTOs are declared as
  schema `minLength/maxLength/pattern/minimum/maximum/minItems/maxItems`
  (byte-counted limits are declared as character limits: never tighter).
  `email` is not declared as `format: email` (generators' regexes differ
  from garde's).
- **SSE**: the grading streams' 200 bodies are `SubmissionStreamEvent` /
  `CourseGradingStreamEvent`, unions tagged by `event` (the SSE event name)
  with a payload schema per event; a test pins them to the published names.
- **New fields/ops**: `Collection.cover_key`, `cover_upload_id` on create /
  update (`null` removes, released like course thumbnails; migration
  `collection_cover`, upload purpose `collection-cover`); `GET /collections`
  `q` + `sort` (`newest|name|updated`); `UserProfile.version`; `GET /courses`
  and `GET /users/{username}/courses` items carry `authors` and the caller's
  `progress`; `GET /search` `cursor` / `next_cursor` (an offset shared by the
  three sections).

## Concurrency, pagination and the stage 2 server gaps (2026-10-03, stage 2 S-04/S-05, L-3)

Additive only until cutover: nothing removed or renamed, no status code of a
request valid today changed. The dual paths are listed for phase 9.

- **`version` by trigger** (migration `20261003000002`): `bump_version()`
  increments `version` on any real change (a no-op UPDATE does not count; a
  statement that sets `version` itself is left alone) on courses, chapters,
  course updates, roster rows, certifications, usergroups, roles, platforms,
  assessments. Replaces "bump in each UPDATE" (collections, activities keep
  theirs): no write path can forget it. A chapter move renumbers siblings,
  so their versions move too.
- **`If-Match` is checked before the write, not inside it** (`require_if_match`,
  after the permission gate so a 412 reveals nothing a 403/404 hides). A save
  landing in the milliseconds between check and UPDATE is not caught -
  accepted for human two-tab edits (`ponytail:` note in `extract.rs`).
- **Assessments**: `If-Match` → 412 on the assessment `version`; without it
  the old 409s stay. The submission draft save keeps its 409 for a stale
  `draft_version` (the old web always sends `If-Match` there, so no request
  shape tells the clients apart) - flip it in phase 9.
- **`Prefer: return=representation`** instead of 204 → 200: the old web's
  generated client rejects a non-empty body on void operations
  (`voidParser`), so the new behaviour is opt-in. Trail writes keep answering
  `Trail`; the representation is its new `learner_state` field.
- **Pagination**: bare-array lists get `/page` siblings (`{items,
  next_cursor}`) instead of a response shape that depends on the query;
  `ab_core::page_after` pages them in memory. `GET /trail` and the
  leaderboard page in place (`next_cursor` field).
- **Guests**: `GET /courses/{id}/learner-state` and the discussion list answer
  anonymous callers (anonymous state; an empty page) instead of 401 - the old
  web never calls them without a session.
- **`?lang=`**: a middleware turns it into `Accept-Language` and strips it from
  the query (strict query DTOs never see it).
- **Not changed**: an unknown `cohort_ids` stays 422 (BUG-121, a valid request
  is unaffected either way; the web drops ids not in `cohort_options`).
- **Auth throttles** are config (`AB__AUTH__LIMITS__*`, AGENTS.md); production
  refuses values above the defaults.
- **`code_enum!`** takes its wire string as `tt`: a `literal` fragment reached
  utoipa's `serde(rename)` parser wrapped in an invisible group and the schema
  listed the Rust names. A test pins every `code_enum!` schema to serde.


## Password reset, the per-user event stream, notifications, agenda (2026-10-03, stage 2 S-06..S-09, S-13, L-4)

Additive only: the two grading streams, their event names and every existing
response stay as they are (removed in phase 9).

- **Password reset (S-08)** uses Zitadel's own codes:
  `POST /v2/users/{id}/password_reset` and `/email/resend` with `returnCode`,
  mailed by us like the verification code (logged when Resend is unset - the
  web e2e reads the API log); `POST /v2/users/{id}/password` with
  `verificationCode` sets the password. `POST /auth/password-reset` and
  `/auth/verify-email/resend` always answer 202 and do the lookup, the Zitadel
  call and the mail on a spawned task, so known and unknown logins take the
  same time. Throttles are config: `PASSWORD_RESET_IP` (requests +
  confirmations per IP per hour, 429) and `EMAIL_PER_ACCOUNT` (code mails per
  account per hour, silent). A wrong/expired code is the new
  `reset-code-invalid` (422, same answer for an unknown login); success
  revokes every session of the account.
- **One process-wide publisher** for the user streams
  (`events::user::install(redis::Client)` at API and worker boot) instead of a
  handle threaded through services: XP is granted from static hooks and the
  progress projector, which are built from a pool in ~30 places. Each publish
  batch opens its own connection (a connection manager is bound to the
  runtime that made it); `ponytail:` note on the upgrade path.
- **Fan-out decides access**: `grading.updated` goes to the course's creator
  and active writing co-authors (the `:own` graders). Platform-wide graders
  (admins) are not fanned out to - they keep the course stream. The owner's
  `submission.updated` carries `final_score` only once `published`.
- **Notifications are written after the fact commits**, best effort (logged),
  not in its transaction and not through the job queue: the producers sit in
  services without the queue in reach and a lost notification is not lost
  data. One `INSERT … SELECT unnest` per fan-out applies the opt-outs and the
  `dedup_key`.
- **Preferences** are one row per user with the disabled types (`text[]` with
  a CHECK); the API shows one boolean per type. In-app only.
- **Agenda (S-09)** reuses the trail for "continue learning" (its
  `next_activity_id`) and one deadline query shared with the reminder job
  (effective due date with the override applied as `EffectivePolicy` does,
  assessment reach as `effective_access_count`). File submissions have no
  per-learner override, so their due date is the activity's.

## Web links switch, S-10 names, data migrations and the L-5 gaps (2026-10-03, stage 2 S-10/S-11, D-01..D-03, L-5)

- **S-11 link scheme is one setting**: `AB__SERVER__WEB_LINKS` = `legacy`
  (default: the old web's URLs, locale prefix where it had one, `/auth/...`,
  `/course/...`, `/dash/...`) or `v2` (spec 5.3: `/login`, `/verify-email`,
  `/reset-password`, `/courses/{id}`, `/learn/{course}/{activity}`,
  `/teach/courses/{c}/activities/{a}/submissions[/{id}]`,
  `/certificates/{code}/verify` with no locale). Every built web URL goes
  through `ab_core::links::WebLink` (emails, the Google sign-in error page,
  the certificate PDF's QR, `next_action.href`, the work queue). The value is
  process-wide (`links::init` at boot, a `OnceLock`) instead of threaded
  through the services that build hrefs from a pool; tests set it through
  `TestApp::spawn_with` (nextest runs one test per process). The analytics
  insight hrefs (`/dash/analytics...`) are not mapped: the new web builds its
  drill-downs from search params. The Google callback redirect is the path
  the web passed in, so it needs no mapping. Phase 9 deletes `legacy`.
- **S-10 expand without moving handlers**: the new paths (`/enrollments`,
  `/enrollments/{course_id}`, `/progress/activities/{activity_id}`,
  `/groups...`, `/courses/{id}/groups`) are thin twins of the old handlers
  with their own `operationId`; the export marks the old operations
  `deprecated: true` + `x-replaced-by: <new operationId>` from
  `openapi::RENAMED` (no Rust `#[deprecated]`, which would need `allow`s at
  every call). Gamification preferences keep their stored camelCase document
  (the leaderboard SQL and the old web read it): the PATCH takes snake_case
  twins (folded into the camelCase keys) and `Profile.settings` answers the
  snake_case view; the stored document flips in phase 9. Permission resources
  `quiz` / `exam` stay as stored; they were never checked, so the contract
  now says so and documents `assessment`.
- **D-03 locales**: migration `20261003000020` lets `users.locale` hold
  `ru|kk|en` beside the legacy tags (default `ru`); writes normalize to the
  short tag whatever form comes in. Responses keep `locale` in the legacy
  form whatever is stored and add `language` (`ru|kk|en`), so no field
  changes meaning before cutover; phase 9 drops `locale` and the legacy tags.
- **Data migrations are `ashyq admin` subcommands**, idempotent, `--dry-run`
  prints counts, safe while the old web runs: `migrate-editor-docs` (D-01:
  `blockEmbed` → `embedBlock` with the new web's `normalizeDocument` rules -
  provider list included - and plain-`<p>` HTML discussion posts → JSON
  documents, which the old web also parses; refuses without
  `--after-cutover` when an embed would become type `url`, which the old web
  cannot render), `migrate-themes` (D-02), `migrate-locales` (D-03). The
  content rewrite does not bump `activities.version`: the shape changes, not
  the teacher's text, and an open old-web editor saving the old shape over it
  is converted again by the next run.
- **Assessment edit locks are data**: `Assessment.edit_lock`
  (`archived|scheduled|has_submissions`, the `ensure_editable` rules, now one
  function) plus the `edit` action and `allowed_transitions`. Item writes take
  an optional `If-Match` on the assessment `version` and answer
  `assessment_version` (+ `ETag`); reorder is presentation and keeps the
  version.
- **Typed attempt refusals** keep 403: `attempt-time-expired`,
  `attempt-past-due`, `remediation-required` (the first typed gate wins,
  `details.reasons` lists all, `detail` keeps the legacy text the old web
  matches). `AuditEventKind` is a closed Rust enum the audit writers take;
  `ReadinessIssue.code` is a schema enum pinned by a source scan; the
  grader's `FeedbackCode` is an enum.
- **Discussion images**: upload purpose `discussion-image` (public, 5 MB,
  images, any `file:create:own`); a post claims them through `upload_ids` on
  create/update, so unclaimed ones are reaped like any upload.
- **Course copy** (`POST /courses/{id}/duplicate`, `Idempotency-Key`):
  `course:create:platform` + write access to the source; one transaction
  copies the course (private draft, the caller owns it), chapters, plain
  activities (unpublished; blocks get new ids and the content's
  `block_uuid` references are rewritten), file-submission configs (draft)
  and assessments through the assessment copy (`copy_assessment`, now
  callable for another course; position restored). Media is shared by key:
  the copy adds one reference per use on counted uploads (course thumbnail,
  claimed blocks), so the object lives while either course uses it. Not
  copied: learners, progress, submissions, grades, discussions,
  announcements, contributors, group links, certification, access lists,
  overrides. It lives on `AssessmentsService` (it needs both services;
  `CoursesService` does not hold the assessments one).

## Grading parity, same-origin downloads, stream position, code/AI/analytics typing (2026-10-04, stage 2 L-6)

All additive to the old web's contract; removals are listed in
`apps/server/docs/phase9-removals.md` (new, machine-readable, every later
lane appends to it).

- **Grader feedback**: no new route. `TeacherSubmission.feedback` already
  carries every item feedback row (released or not); the learner-only
  `GET /submissions/{id}/feedback` stays the learner's.
- **Group filter** (`group_id`, usergroup membership) on both review queues,
  the file queue stats and the gradebook; gradebook `q` (username, display
  name, email) and `status=needs_grading` (a `pending`/`graded` submission
  or a `submitted`/`graded` file attempt). An unknown group filters to empty.
- **File queue parity**: `late_only`, `sort`/`order` (the assessment
  `ReviewSort`), `enrolled`/`staff` per row, `GET .../submissions/stats`.
  The cursor stays a plain attempt id under every order (the row's sort key
  is re-read), so the old client's cursor type is unchanged; without `sort`
  the order is the old id order.
- **Bulk grade operations loop the single-row save** at each row's current
  version (`publish-grades` for files, `return-grades` for both kinds):
  events, notifications, the ledger and the projection follow the one path;
  a refused row (released, stale, own, foreign) is a skip in
  `BulkGradeSummary {done_count, skipped_count}`, an infrastructure error
  fails the call. Synchronous - a page of rows, not a background job.
- **File grading history**: `file_grading_entries`, written by the grade
  UPDATE's own CTE (no grade without its entry). Grades before 2026-10-04
  have none.
- **File deadline extensions**: `file_submission_overrides` (one due date per
  learner); it replaces the activity due date for the closed gate, lateness,
  the lateness settle and the learner's `due_at_unix`. Synchronous, members
  only (the assessment rule), `Idempotency-Key`. No notification: the
  `DeadlineExtended` payload requires `assessment_id`, and making it optional
  changes a required field - the learner gets the `deadline.extended` stream
  event; the notification follows when the payload can change (phase 9).
  The deadline-reminder job still reads only the activity due date.
- **Same-origin downloads**: presigned GETs are signed against
  `AB__STORAGE__ENDPOINT`, which is the public origin in production (nginx
  passes `/ab-private` with `Host` through, `X-Frame-Options: SAMEORIGIN`).
  `SignedDownload.path` is the same URL origin-relative; the web loads
  `path` from its own origin (dev: proxy `/ab-private` to
  `http://localhost:9002` with `changeOrigin`, so the signed `Host`
  matches). `?disposition=inline` signs `Content-Disposition: inline` for
  a preview frame.
- **User stream position**: a fresh `/me/events` connect starts at the
  stream's newest id (was `$`), and `connected` carries it as SSE `id:` and
  `event_id` (`0-0` = empty; null only if Redis could not answer), so a
  quiet tab resumes without a gap. New event `deadline.extended`
  `{course_id, activity_id, assessment_id|file_submission_id, due_at_unix}`
  from the per-learner override, the bulk extension and file extensions.
  Platform admins still get no `grading.updated` fan-out (they have the
  course stream until phase 9; a per-course "opened by" registry was not
  worth it).
- **Code arena**: no hints (the stored items have none, checked on
  `ashyq_restore`). `GET /assessment-items/{id}/runs` lists the caller's own
  runs (masked as `GET /code-runs/{id}`; `submission_id` + `purpose=final`
  = the run a submission was graded on). `POST
  /assessment-items/{id}/reference-check` per item with `Idempotency-Key`
  (the request has no body; the key scope is the item). `status` is the
  `ReferenceCheckStatus` enum (wire unchanged). `GET /code/runner` answers
  `{runner_configured, languages}` - no 503 when Judge0 is unset;
  `/code/languages` and the assessment-level check are `deprecated`
  (`RENAMED`). `feedback_params` is `FeedbackParams {correct, total,
  tests?}` (`tests` = legacy imported code grades).
- **AI**: the Q&A chat and the run stream are described by `QaChatEvent` /
  `RunStreamEvent` (AG-UI, tagged by `type`; `RUN_FINISHED.result`,
  `CUSTOM.value` and the citations tool content typed). The quality
  report's per-recommendation verdicts were already stored under
  `report.finding_reviews["finding-{i}"]`; the schema now declares them
  (`FindingReview`).
- **Analytics**: `recommended_action`, `why_now`, `outlier_reason_codes`
  and `last_intervention_type` are enums (schema; pinned by tests). Already
  typed before L-6: intervention type/status, reason codes, drill-through
  rows, saved query, alert params. `outcome` and `view_type` stay free text
  (teacher prose / an opaque client key).
- **Login right after registration**: Zitadel's session API answers
  NotFound for a user it created < ~1.2 s earlier (projection lag; 15 such
  401s in the dev audit log, all within 0.2-1.2 s of the user row). The BFF
  retries the password check on NotFound with 250/500/1000 ms backoff
  before calling it identity drift.
- **Not done**: AI feature switches stay environment-only - a runtime switch
  needs the 16 synchronous `require_feature`/`feature_available` checks to
  read shared state (DB + short cache, env as the ceiling) in the API and
  the worker; left for a separate step.

## User content is inert on the web origin (2026-10-04, REVIEW-1 C1/H1/H4)

Uploads are served from the app's own origin (`/content/<key>`, presigned
`/ab-public` / `/ab-private`), and `file-submission` accepts any type, so an
uploaded HTML/SVG document opened (or framed) from there ran as the app.
Defence in three layers, wire-compatible with the live old web:

- **Served type is the server's choice, not the uploader's.** Every presigned
  GET (`StorageClient::presign_get`; `uploads/{id}/download`,
  `file-submission-files/{id}/url` incl. `path` and `?disposition=inline`)
  signs `response-content-type` + `response-content-disposition`. Only
  `ab_clients::storage::inline_type` types are served as themselves and may
  be `inline`: raster images, PDF, audio, video, `text/plain` (as
  `text/plain; charset=utf-8`). Everything else (HTML, XHTML, SVG, XML, JS,
  unknown) is `application/octet-stream` + `attachment`, whatever the query
  says - existing objects included, since the override is applied at
  download time. Uploads are unchanged: the PUT stays pinned to the declared
  type (the old web sends it) and finalize still checks the stored type;
  public purposes only accept inline-safe types (unit-tested invariant).
  `uploads/{id}/download` keeps opening safe types inline as before.
- **Edge** (`infra/nginx`, both storage locations): `nosniff` (already
  there), `Cross-Origin-Resource-Policy: same-origin` (nothing loads user
  content cross-origin; no email links it), and by response type
  `Content-Security-Policy: default-src 'none'; img-src 'self' data:;
  media-src 'self'; style-src 'unsafe-inline'` + `sandbox` (opaque origin,
  no script). Measured in Chromium against the real config and RustFS:
  `sandbox` stops the browser's own media page from loading a top-level
  video/audio, so audio/video get the CSP without `sandbox`; PDFs get no CSP
  (`sandbox` disables Firefox's pdf.js and a PDF's script runs in the viewer,
  not the origin). Images and HTML get both: an HTML upload opened directly
  renders as static text. Media embedded by app pages are subresources the
  header does not touch. RustFS also honours `response-*` overrides on
  anonymous GETs (S3 refuses them): `/content/` now drops the query and
  `/ab-*` refuses any query on a request with neither a query signature nor
  an `Authorization` header (403).
- **Stored documents** (`ab_domain::rich_text`, on discussion post/reply
  create + edit and activity content PATCH): embeds must be an `https:` URL
  on another host than `AB__SERVER__WEB_URL` / the storage endpoint / the
  CORS origins, or a bare provider id; legacy `blockEmbed.embedCode` must be
  iframe HTML whose every `src` passes the same rule; links `https:`,
  `http:`, `mailto:` or `#anchor`; images a plain key, `/content/<key>` or `https:`; file
  block keys plain (`[A-Za-z0-9._-]` segments, no `..`). 422 with one field
  error per node (`content.content.3.attrs.url`, code `unsafe-url`). HTML
  posts (old web) and non-document content pass untouched. `http:` links are
  allowed because a production lesson has one; on the restored copy (590
  activities, 147 documents, 1 JSON post) nothing fails - re-run with the
  ignored `rich_text_corpus` test. The contract (`EditorDocument`) does not
  define a node set per editor, so discussion posts are not limited to the
  discussion editor's nodes (its schema includes `embedBlock` anyway).

## Server gaps after the audit (2026-10-04, stage 2 S-GAPS, S-GAPS-2, S-GAPS-3)

All additive to the live old web's contract; removals are listed in
`apps/server/docs/phase9-removals.md`.

- **The server scores remediation.** A gate-mode session blocks attempts
  until it is passed, so a client-posted `score` let a learner lift the gate
  with one request. `POST .../complete` scores `answers` against the stored
  practice questions (trimmed, case- and space-insensitive equality;
  round(100 x right / all), 70 passes; no questions = 100). `score` is
  `deprecated`. The old web posts only a self-assessed `score` after revealing
  the answers, so while it is live (`WEB_LINKS=legacy`) a `score` with no
  `answers` still counts - otherwise its learners stay locked behind the gate.
  The gate is forgeable while the old web is live, as it was before. Under
  `v2`, a learner's reads (session, latest, own list) blank `answer` and
  `explanation` in `test.questions` and `lecture.practice_questions` until the
  first hand-in. The completion response, and later reads, carry them. The
  old web keeps them because it shows them by design. Graders always see
  them. The switch is the web-links setting because that setting says which
  web is live, and a rollback flips both.
- **LIVE events fan out to the people whose open screens change**, not to
  every reader: `collection.updated` goes to the collection's creator,
  `discussion.updated` to the thread's participants plus the course's graders,
  `progress.updated` to the learner when a staff change (publish, unpublish,
  access) moves their projection (their own work answers through
  `submission.updated`), and `admin.updated {users|roles}` to platform-wide
  readers of that list. `{groups}` goes only to `usergroup:manage` holders,
  because teachers read groups and every group write anywhere refetched
  their lists. The writer is included: their other tabs follow, and web-2
  does not count an event-driven re-read as a duplicate. `grading.updated`
  also reaches platform-wide graders.
- **If-Match on deletes** (course, chapter, certification, course update,
  role, usergroup, discussion) and on the file-submission PATCH, the
  gamification config PUT and the override PUT: optional during expand (the
  old web sends none), stale = 412. A delete runs the resource's
  visibility and permission check before the version check, so a stranger
  still gets 404, not a 412 that confirms the id. Four tables gained
  `version` (migration `20261004000020`).
- **Admin create capabilities** (`admin.users.create` = `platform:manage`,
  `admin.roles.create` = `role:manage`, `groups.create` =
  `usergroup:create`) are separate from the read capabilities: a read-only
  admin sees the lists without create buttons that would answer 403.
- **`deadline_extended.assessment_id` is nullable.** A file-submission
  extension now notifies too, with `file_submission_id` set and no
  assessment. This is the one non-additive change: neither web reads the field
  (the old web renders the stored title/body), and a second notification
  kind for the same event was not worth it.
- **AI feature switches** are a table (`ai_feature_switches`, read on every
  check, no cache) under the environment flag as the ceiling; deadline
  reminders read the file override's due date; stats take `group_id`.
- **Enums**: `NextAction.reason`, `WorkItem.kind` and `WorkItem.status` are
  schema enums now (S-GAPS-3), like the other nine sets pinned in
  `dto/enums.rs`. The wire strings are unchanged. Enums used only as
  query parameters (`CollectionListSort`, `AdminUserSort`, `WorkKind`,
  `WorkSort`) are registered in `app.rs`, because utoipa does not collect
  them and the client typed them `unknown`. The web contract gate (G-08) now
  fails on any `$ref` that points to a missing schema.

## Pending uploads stay finalizable for 12 h (2026-10-09, QA cluster B)

ARCHITECTURE §11 reaps abandoned `pending` uploads after 1 h. The presigned
PUT only has to *start* within its 15 min (storage checks the expiry when the
request arrives), but a 500 MB `block-video` over a 1 Mbit/s university link
takes over an hour, and a reap sweep (every 6 h) that ran after the hour
deleted the row and the object under the running upload: finalize then
answered 404 and the teacher lost the upload. `CLAIM_WINDOW` is 12 h now; an
abandoned pending object is kept that much longer, which is harmless.

## A strict due date hands open drafts in (2026-10-09, QA cluster D)

With late work off (`allow_late = false`), a quiz/exam/code draft the learner
opened before the due date was refused at save and submit once the date
passed, and nothing ever handed it in: the answers were saved but never
graded, and the attempt never counted. The owner chose the LMS-standard
behaviour (Moodle's "open attempts are submitted automatically"): the
existing `submissions:auto-submit` sweep (every minute) now also picks up
drafts past their effective due date - the learner's override applied, the
same rule as `AssessmentsService::policy_at` - and grades the stored answers
with `submitted_at` = the due date and the new `auto_submit_reason =
deadline_passed` (migration `20261009000001`, schema enum value). The
earlier of timer and due date wins. Teacher previews are never handed in by
the due date. A job rather than a lazy hand-in on read: the sweep already
owns the timer case, its retries and the code-runner path, and a draft
nobody looks at still lands in the gradebook. Drafts whose due date passed
before the sweep went live are not handed in (2026-10-10, cluster G below -
this replaces "on the first deploy the sweep hands in every such draft left
open in the past"). File-submission drafts are out of scope and
unchanged. The learner's page says, while the draft waits for the sweep,
that the saved answers will be handed in within a minute, and the result
names the reason.

## G-13 freeze lifted (2026-10-10)

The web-2 gate G-13 refused any `apps/web` commit without a `Legacy-Hotfix:`
trailer. It assumed production ran web-2, but production was rolled back to
`apps/web` on 2026-10-04 and stays there until the owner re-migrates; the
owner then asked for a full QA + fix sweep of `apps/web` (2026-10-09, ~100
fixes). `freeze()` in `apps/web-2/gates/repo.ts` now returns no findings.
Restore the check from git history when web-2 goes live for good (phase 9
deletes `apps/web` anyway).

## Assessment policy: enrolment gate, late cutoff hand-in, go-live line (2026-10-10, QA cluster G)

The owner decided three open items of the 2026-10-09 QA sweep.

**Assessments need an enrolment** (course setting). Any signed-in user could
start a quiz, exam, code challenge or file task of a public course; the
start enrolled them by the way and they showed up in the gradebook. New
course column `assessments_require_enrollment` (migration `20261010000001`,
default `true` for new and existing courses; `Course` field, `PATCH
/courses/{id}` by course writers; the web shows it in the course's Access
tab while the course is public). On, a learner takes the course's
assessments only with a trail run (enrolled) or as a member of a linked
usergroup (the teacher enrolled the group - so private courses behave as
before). Anyone else gets `NOT_ENROLLED` in `attempt-state.disabled_reasons`
/ the file task's `disabled_reasons` and 403 `enrollment-required` on
start, draft save, submit and code runs; the web shows the reason with an
«Enroll in the course» button (`POST /enrollments/{course}`). A refused
start enrols nobody. Off is the old open rule. Drafts of a user who is not
enrolled when the setting is on (they left, or it was switched on later -
the old open start enrolled them, so most such users are enrolled): they
still read their attempts and results, cannot save, submit or start until
they enrol again; the timer / deadline sweep hands them in as usual. Staff
previews are never gated. Test fixtures (`TestApp::publish_course`) switch
the setting off - they model the open public course the suites were
written for; the gate's own tests switch it on.

**The late cutoff closes open drafts.** With late work allowed and a cutoff
(`late_policy.kind = cutoff`), a draft open at the cutoff stayed open (the
learner could still hand it in, for zero). The deadline sweep now also
hands it in at the learner's effective cutoff - the later of the cutoff and
their own due date (an extension past the cutoff wins) - graded by the late
policy as of that moment (late, no cutoff penalty yet), reason
`deadline_passed` (the learner text "the deadline passed, handed in with
your saved answers" fits; no new enum value). A learner whose late penalty
is waived has no cutoff and keeps the draft open. One rule:
`EffectivePolicy::hand_in_at`, mirrored by `list_expired_drafts` in SQL. A
late *penalty* (no cutoff) never closes a draft.

**Go-live line.** Migration `20261010000002` records, per database, when
the date hand-in went live (`feature_activations.deadline_auto_submit`,
the migration's `now()`). The sweep hands in only drafts whose effective
due date / cutoff passed after that instant; drafts whose date passed
earlier stay as they are (learners cannot hand them in anyway, so old
gradebooks do not change on deploy). The older time-limit sweep is not
affected. Deleting the row turns date hand-ins off.


## "Not found" pages stay HTTP 200 + noindex in apps/web (2026-10-10)

A course, profile, collection or assessment page whose id does not exist (or is
private to an anonymous visitor) answers HTTP 200: the locale-wide and
course-level `loading.tsx` stream the shell before the page knows the answer.
Checked on the dev stack with a browser and a Googlebot user agent: every such
page carries `<meta name="robots" content="noindex">`, valid public pages carry
`index, follow`, and unknown URLs answer a real 404. A 404 status would need
the loading skeletons removed (every navigation then waits for its data on the
university network) and would replace the "sign in to see this course" state a
signed-out visitor gets for a private course with a bare 404. Kept as is; the
search-engine outcome is the same.

## Teachers enrol learners: roster, paste and CSV (2026-10-10, QA cluster H)

The new assessment gate made enrolment matter, but a teacher could only list
and remove learners. Added `POST /courses/{id}/learners` `{identifiers, dry_run}`
(1..=1000 emails or usernames, case-insensitive, email match first) answering
one outcome per identifier in request order: `enrolled`, `already_enrolled`,
`duplicate` (same user earlier in the list), `not_found`, `course_staff`
(staff never enrol, BUG-287), `account_disabled`. Same gate as removal: roster
managers (creator, active maintainer, `course:manage:platform`; the web reads
`Course.allowed_actions` `manage_contributors`) on an open course (archived →
409). No account is ever created - there is no invite-by-email flow - so
unknown identifiers are reported. `dry_run` is the CSV preview and writes
nothing; re-sending is idempotent. Each enrolment is the self-enrol path
(member lock, run, re-projection) on the learner's behalf; no notification
(no fitting kind). `GET /courses/{id}/learners` gained `q` (username, display
name, email) and `email` (graders already see learner emails), and no longer
lists staff with a leftover run (BUG-288).

Private (unpublished) courses: `course_visible` is unchanged - unpublished
courses hide from their learners (BUG-183) - so a learner enrolled in one sees
it once it is published; the roster says so. Linked usergroups keep their own
access and appear in the roster once a member opens the course.

apps/web: a «Слушатели» tab in the course workspace (course writers read it;
reporters/contributors see it read-only), paste box, CSV import (UTF-8 with or
without BOM, else Windows-1251; `;` or `,`; optional header; the cell with an
`@`, else the first) with a per-row preview, search, «Показать ещё» paging,
remove with confirmation, Excel CSV export (BOM, `;`, formula-safe cells). web-2
only regenerated its client; `enrollCourseLearners` is parked in its
`gates/server-removals.json` with a "not for deletion - build the UI" reason.

## Automatic bilingual certificates (2026-10-10)

Certificate previews and downloads now use the owner's Toraighyrov University / Ashyq Bilim example.
The original JPEG supplies the logos and decoration; its sample fields are covered and replaced by
embedded-font text. The shared server renderer fills the learner, course, lecturer, issue date and
verification number. The certificate body is always Kazakh/Russian; the interface locale still selects
the certificate type label and verification footer. Existing issuance and verification codes stay intact.

The course studio adds optional `course_start`, `course_end` (YYYY-MM-DD) and `training_hours` (whole
hours 1–100000, stored as text) in certification config. Blank values are omitted from the PDF. Both
the form and domain service validate dates, date order and hours. No schema migration or new route.

## CSV exports follow the export language's Excel convention (2026-10-10, QA P2)

Every CSV export (gradebook, test grades, file-task attempts, the four analytics exports, the roster
and the client-built table / audit exports) was comma-separated with a decimal point, except the
roster (`;`). Teachers here open CSVs in Excel with Russian/Kazakh Windows regional settings, whose list
separator is `;`: a comma file opened as one column, and a score such as `8.7` turned into the date
8 July. The export language (server: `Accept-Language`, web: the UI locale) now decides: ru / kk write
`;` and a decimal comma (`93,33`), en keeps `,` and `93.33`. The rule lives in the one cell writer on
each side (`ab_domain::csv::csv_row`, web `csvBlob`): a cell that is a plain decimal number
(`-?\d+\.\d+`) gets the comma; ids, timestamps and versions (`3.8.1`) are untouched. BOM, CRLF and the
formula defusing are unchanged. Replaces the comma-only exports of UX-114 / BUG-196.
