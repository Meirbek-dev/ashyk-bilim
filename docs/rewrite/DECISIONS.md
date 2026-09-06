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
