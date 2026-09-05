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
