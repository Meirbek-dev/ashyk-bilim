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
