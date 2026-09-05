# Execution Plan & Status

This file is the **durable memory of the rewrite across agent sessions**. Every
working session: pick the next `todo` slice respecting dependencies, set it
`in-progress`, land it with green gates, set it `done` with the commit sha, and add
any discovered follow-up work as new rows. Never leave the table stale; never
leave `rewrite` red.

Branch: `rewrite`. Direct commits (no PRs). Gate = `just ci` green (mirrors
`server-ci.yaml`). Definition of done for every slice: code + migrations + tests +
OpenAPI snapshot updated + `.sqlx` fresh + this table updated.

## Phase overview

| Phase | Content | Depends on |
|---|---|---|
| P0 | Foundation: workspace, core, db+queue, config, telemetry, testkit, CI, compose overlay, Zitadel/RustFS provisioning | — |
| P1 | Identity: Zitadel clients, sessions/BFF, users, RBAC, auth endpoints, MFA relay, Google intent flow | P0 |
| P2 | Catalog: platform, courses, chapters, activities, blocks, collections + uploads/storage pipeline | P1 |
| P3 | Assessments: authoring, items, policies, access lists, readiness, scheduling | P2 |
| P4 | Submissions & grading: pipeline, graders (quiz/code), gradebook, bulk actions, item feedback, grading SSE | P3 |
| P5 | Files & code: file-submission subsystem, code arena (Judge0 client, runs) | P2 (files), P4 (code grader shared) |
| P6 | Learning surface: trail/progress, discussions, certifications, gamification, work queue, search | P2 (+P4 for work queue signals) |
| P7 | Analytics: events, daily rollups (cron), risk snapshots, interventions, saved views, CSV exports | P4 |
| P8 | AI: run state machine, events/SSE, six agents via rig, budget/rate limits, admin surface | P4 |
| P9 | Frontend adaptation: Orval regen on v2, auth pages, error-code i18n, path changes, delete refresh bridge | P1–P8 contract-stable |
| P10 | ETL + Zitadel import + file migration + rehearsals | P1–P8 |
| P11 | Cutover (runbook in MIGRATION.md) + decommission legacy | P9, P10 |

Parallelism guidance: P5/P6/P7 are mutually independent once P4 lands. Within any
phase, slices marked ∥ can run as parallel subagents (disjoint modules/files).

## Slice status

Legend: `todo` · `in-progress` · `done <sha>` · `blocked(<reason>)`

### P0 — Foundation
| # | Slice | Status |
|---|---|---|
| 0.1 | Workspace scaffold: crates, workspace deps/lints, justfile, rust-toolchain, deny.toml, Dockerfile | done deedc51 |
| 0.2 | `ab-core`: Error/ErrorCode registry, config (figment+secrecy), ids (uuidv7 newtypes), time module, permission model, telemetry init (OTLP split to 0.12) | done deedc51 |
| 0.3 | `ab-db`: pool, migrate embed; migration 0001 (extensions, trigger fn). Tx helper + keyset pagination land with the first real queries (P1/P2) | done deedc51 |
| 0.4 | `ab-api` skeleton: state, middleware stack, problem+json mapping, health endpoints, OpenAPI assembly + scalar docs, `ashyq openapi`. `request_id` in problem body populated when the session middleware lands (1.3) | done deedc51 |
| 0.5 | `ashyq` bin: clap (serve/worker/migrate/openapi/admin), graceful shutdown, mimalloc | done deedc51 |
| 0.6 | CI `server-ci.yaml` (PG18+pgvector & Redis services) + coverage floor + openapi diff | done deedc51 (validates on first push) |
| 0.7 | Compose overlay: zitadel + rustfs + server + worker services; `.env.example` AB__* section | done (zitadel booted via podman, session/mgmt/user-v2 APIs smoke-tested, image pinned by digest; rustfs pinned to 1.0.0-rc.1, S3 validation with slice 2.2) |
| 0.8 | `ab-db::queue` + worker runtime + interval scheduler (see DECISIONS.md re: cron) | done f0279dc (16 DB tests; soak deferred to first prod-shaped load test in P10) |
| 0.9 | `ab-testkit`: TestApp harness, session minting, factories, wiremock stub library (Zitadel/Judge0/Resend/LLM incl. SSE) | in-progress (9952bcd: TestApp + HTTP suite + problem+json 404 fallback; session minting → 1.3, wiremock stubs → client slices, factories → first entities) |
| 0.10 | Zitadel provisioning | done, scope collapsed (DECISIONS.md: internal-only Zitadel means FIRSTINSTANCE env vars provision everything; `ashyq admin zitadel-check` verifies reachability+PAT+org — validated live) |
| 0.11 | RBAC sweep test harness (route-table-driven 403 assertion) | done (forced classification: every mutating OpenAPI op must be PUBLIC/AUTH_ONLY/PERMISSION_GATED; zero-grant probes) |
| 0.12 | OTLP exporter wiring (opentelemetry crate set) + verify delivery into Logfire (project currently empty — FINDINGS #9) | in-progress (exporter wired behind AB__TELEMETRY__OTLP_ENDPOINT, headers via OTEL_EXPORTER_OTLP_HEADERS; delivery verification blocked on QUESTIONS.md #2 — Logfire token) |

### P1 — Identity
| # | Slice | Status |
|---|---|---|
| 1.1 | Migrations: users, roles, permissions, role_permissions, user_roles, sessions audit tables; seed roles/permissions | done (identity migration + verbatim SYSTEM_ROLES port; tests incl. seeds↔typed-parser consistency) |
| 1.2 | `ab-clients::zitadel`: session API, user mgmt, IdP intents, import — with wiremock contract fixtures | in-progress (client core: password sessions w/ typed outcomes, human-user create incl. hash-import path, idempotent session delete; 5 wiremock fixtures from live-captured shapes. Remaining: IdP intents (1.5), session get/refresh (1.3), import batching (10.3)) |
| 1.3 | Session store (Redis) + `Actor` extractor + cookie handling + CSRF guard | done (sliding/absolute TTLs, 10-session cap w/ ms-scored eviction, mutation-time permission rewrite, CurrentActor extractor, Sec-Fetch-Site guard, GET /auth/session; testkit mints sessions — closes 0.9's remaining core) |
| 1.4 | Auth endpoints: login, logout, mfa challenge/verify, session list/revoke | done except MFA (login w/ layered rate limits + uniform errors + audit trail, logout w/ best-effort Zitadel delete, session list/revoke via SHA-256 handles, ValidJson garde extractor, first .sqlx cache committed; MFA challenge/verify → 1.6) |
| 1.5 | Google login, first-party OAuth (port google_oauth.py; google_accounts table; Zitadel user w/o password) | done (PKCE S256, opaque server-side state w/ GETDEL, open-redirect guard, id_token claim checks + userinfo fallback, sub-match → email-link → create with default role; 5 e2e tests) |
| 1.6 | MFA enrollment relay (TOTP only — passkeys dropped, DECISIONS.md) ∥ | done (BFF-enforced: login demands code when TOTP enrolled — one-shot password+totp session check, pre-MFA zitadel session discarded; invalid-totp distinguished from bad password via live-captured detail shapes; enroll/verify/remove endpoints with audit) |
| 1.7 | Users domain: profiles, preferences/locale, avatars (small direct upload), admin user management ∥ | done (GET/PATCH /users/me with locale validation + permission gate; avatars via upload pipeline (claim + release-replaced); admin: GET /users keyset listing with role aggregation + q filter gated on platform:read:platform (broad user:read:platform does NOT qualify), PATCH /users/{id}/status disable/enable — disable revokes all live sessions, self-disable refused, login paths already block status!=active) |
| 1.8 | RBAC engine + role admin endpoints + usergroups (org context) ∥ | in-progress (role listing + assign/unassign with rbac_version bump and live-session grant propagation, tested end-to-end. Custom-role CRUD done: POST/PATCH/DELETE /rbac/roles + PUT /rbac/roles/{slug}/permissions (grants validated against the registry → 422; system roles refuse edits — seed-managed; delete/permission changes bump rbac_version and rewrite live sessions for every holder, tested). Admin user management done (see 1.7); last-admin guard on unassign. rbac.py matching-semantics verification done: legacy has_perm candidate table ported as a pinned test in permission.rs; one delta (`r:a:*` grant shape matches in v2, never matched in legacy — shape absent from all real data); scope hierarchy all>platform>own split between matcher (all covers everything) and domain call sites (platform OR own+ownership), assigned-scope awaits contributor semantics. Usergroups done: migration 0009 (usergroups + usergroup_members + usergroup_courses, real FKs replacing legacy loose uuids), CRUD + keyset listing + batch member add/remove + course link/unlink + per-course view; read=usergroup:read:platform, create=usergroup:create:platform, write=creator-with-create OR usergroup:manage:platform. P1 fully done) |

### P2 — Catalog & storage
| # | Slice | Status |
|---|---|---|
| 2.1 | Migrations: platform, courses, chapters, activities, blocks, collections, authors | done (full legacy inventory extracted; redesign fixes: jsonb/text[] instead of JSON-in-varchar, DB-enforced type↔subtype pairs, blocks→activity NOT NULL, dedup'd collection membership, single reactions table, unique certificate issuance, exactly-one-target authorship, 'simple' FTS for ru/kk; 7 integrity tests) |
| 2.2 | `ab-clients::storage` + uploads pipeline | done (storage client + upload ledger + purpose policy from file_validation.py + create/finalize/download endpoints + uploads:reap handler with 6h schedule seeded at worker boot; e2e tests do real presigned PUTs through RustFS; single presigned PUT instead of multipart — revisit only if media sizes demand it) |
| 2.3 | Courses/chapters/activities CRUD + ordering + publish states ∥ | done (courses: CRUD + publish lifecycle + ported access semantics (private=404 no-leak, creator-own vs platform write) + keyset pagination (uuidv7 id as cursor). chapters/activities: CRUD + curriculum view (GET /courses/{id}/curriculum, chapters with nested activities) + legacy ordering (1-based contiguous per parent, append=MAX+1, clamp-and-renumber moves, delete closes gaps) + cross-chapter activity moves (same course only, 422 otherwise) + type↔subtype closed-set validation (domain + DB CHECK). Typed ChapterId/ActivityId added. Curriculum write access = course write access (shared gate). testkit gained patch_as) |
| 2.4 | Blocks (typed content enums: image/pdf/video) + activity content model ∥ | done (activity content model: content/details/settings jsonb via PATCH /activities/{id} (objects only, garde-enforced) + GET /activities/{id} detail view; type pair changes atomic (both-or-neither, 422 on bad pair, DB CHECK backs it). Blocks: POST /activities/{id}/blocks claims a finalized upload (owner + purpose must match block type: image→block-image, pdf→block-pdf, video→block-video; add_reference clears reaper clock), content frozen as {upload_id, file_key, file_name, file_size, file_type}; GET list/single follow course visibility; DELETE releases the reference (release_reference restarts grace → reaper collects object). Legacy multipart upload replaced by presigned pipeline; 'custom' blocks are ETL-only) |
| 2.5 | Collections + platform settings + course updates (changelog) ∥ | done (collections: CRUD + keyset listing, visibility mirrors courses (public/own/read:all→404 no-leak), membership replaced wholesale on update, attached courses must be readable (404 otherwise), member courses filtered per-viewer. platform: singleton seeded by migration 0008, GET public (frontend bootstrap), PATCH gated on platform:update:platform (admin wildcard), branding via upload pipeline with new platform-logo/platform-thumbnail purposes — claim on set, release replaced key for reaping (release_reference_by_key). course updates: announcements feed under /courses/{id}/updates + /course-updates/{id}, write=course write, read=course visibility) |
| 2.6 | Public catalog read endpoints (browse/search-lite) + nginx /content contract | done (GET /search: FTS via generated tsvector columns ('simple', websearch_to_tsquery, ts_rank_cd) over courses+collections with visibility filters; people section (username/display_name ILIKE, prefix-ranked) only for authenticated callers, email matching dropped — FINDINGS #16. Anonymous browse: MaybeActor extractor (missing/expired/garbage cookie → Actor::anonymous() with nil user id + zero grants, so existing service logic yields public-only) on all catalog GETs (courses list/get/curriculum/updates/activity/blocks, collections list/get). nginx v2: extra/nginx.v2.conf.template — /api/v2 upstream, /content/* → anonymous ab-public read with immutable cache (needs public-read bucket policy at cutover), /ab-public|ab-private/* passed VERBATIM for presigned SigV4 (same-origin storage endpoint, no new domains), API body cap 10M (bytes bypass API), auth special-casing removed; swapped at cutover) |

### P3 — Assessments
| # | Slice | Status |
|---|---|---|
| 3.1 | Migrations: assessments, items (tagged bodies), policies, overrides, access lists | done (migration 0010: `assessments` folds the legacy assessment+policy pair into one row with every settings/anti-cheat/late-policy scalar as a CHECKed column; `assessment_items` (1-based contiguous positions, `{schema_version,kind,…}` jsonb body, metadata scalars as columns); access allowlists keyed by assessment; `assessment_overrides`; `assessment_audit_events`. Quiz gets a real activity type (`quiz/quiz_standard`). Text-backed `sqlx::Type` enums in `ab_core::assessments`. DECISIONS 2026-09-05) |
| 3.2 | Authoring CRUD + item type enums (choice/open-text/form/code/matching) + readiness checks | done (AssessmentsService: create with backing activity (code challenges get the default code item eagerly, not lazily on GET), detail/by-activity/course listing, PATCH details (title propagates to activity), PUT policy wholesale with range validation + policy_version bump, lifecycle transitions per the legacy table with readiness gating (422 issues as field errors), scheduled-in-future check, activity.published sync, audit events; items: add (kind allowed per assessment kind, 200 cap), update (content lock hook), delete + renumber, reorder (listed-first, rest keep order). Typed `ItemBody` internally tagged enum + per-kind readiness rules ported verbatim (legacy dotted issue codes). Lock rules depend on `submission_activity`, a stub until 4.1. 13 routes, sweep-classified, 2 e2e tests) |
| 3.3 | Effective-policy resolution + scheduling (auto-publish cron) + duplication ∥ | done (auto-publish: `assessments:publish-due` job on the interval scheduler every minute (legacy cron: every 2), single UPDATE…RETURNING sweep, brings the activity live too — the legacy cron forgot that flag — and writes an audit event; job test against real PG. Duplication: POST /assessments/{id}/duplicate copies the WHOLE policy (legacy silently dropped due date/lateness/anti-cheat/settings) + items with fresh ids in order into the same or a given same-course chapter as a fresh draft; access lists/overrides not copied (legacy). Effective-policy resolution (override-aware) lands with 3.4's attempt-state) |
| 3.4 | Access control (user/group allowlists) + student-facing views ∥ | done (GET/PUT /assessments/{id}/access: mode + user/group allowlists replaced wholesale, restricted lists validated (users need course access, groups must be linked to the course — legacy's "no linked groups → every group eligible" fallback dropped), all-course-learners wipes lists; effective_user_count. Overrides: list/create/update/delete at /assessments/{id}/overrides/{user_id}, 1..=10 attempt ceiling, expiry honoured, audit events (legacy's were dead code). GET /assessments/{id}/attempt-state: submit-access gate (teacher preview → course access → allowlist → assessment:submit:assigned), effective policy (override wins for attempts/due date, never the time limit; teacher preview lifts the cap), disabled reasons NOT_PUBLISHED / SCHEDULED_NOT_OPEN / ARCHIVED / PAST_DUE — attempt-count and timer reasons arrive with submissions in P4. **Cohort visibility**: usergroup-linked courses are now visible to their members (CoursesService::get + list_courses SQL) — needed for private cohort courses to be reachable at all. P3 fully done) |

### P4 — Submissions & grading
| # | Slice | Status |
|---|---|---|
| 4.1 | Migrations: submissions (snapshots, versions), grading entries, item feedback, bulk actions, audit events | done (migration 0011: `submissions` keyed by assessment (+ denormalized course_id), NOT NULL user/assessment, one-open-draft partial unique index, metadata_json scalars as columns (violations stay jsonb; timer backoff counters are real columns — legacy wrote them into a schema that rejected them), write-once snapshots, dual optimistic locks (`version` teacher / `draft_version` learner). `grading_entries` append-only via DB trigger (only published_at mutable; parent cascade allowed), graded_by NULL = auto-grader. `item_feedback`, `bulk_actions`, `code_runs`/`code_run_cases` with real FKs and an idempotency UNIQUE, `idempotency_keys (user_id, key)` for the Idempotency-Key contract. `assessments.attempt_penalty_percent` (legacy cap lived in activity.settings). Compile-checked db layer for all of it incl. review-queue keyset listing, stats, timer sweep, releasable set; assessment lock rules now query real submissions. 3 schema-guarantee tests. Audit events reuse `assessment_audit_events`. Progress tables → P6. DECISIONS 2026-09-05 "Submissions schema") |
| 4.2 | Submission lifecycle: start/draft/submit, attempt & time limits, timer sweep cron, idempotency | done (`SubmissionsService` in `domain/grading`. POST /assessments/{id}/submissions opens or returns the single draft (201/200, `ETag` = draft_version); GET …/submissions/draft, …/submissions/me, GET /submissions/{id} owner-only (404 otherwise). PATCH /submissions/{id}/draft needs `If-Match: "<draft_version>"` — stale → 409 with `details {expected, actual}` (Problem now carries `details`), one save per 5s per draft → 429 but only well-formed in-time saves spend the budget; answers canonicalized (unknown item / wrong kind → 422 together, blanks auto-filled, trimmed, open text capped). POST /submissions/{id}/violations records anti-cheat events server-side and reports `{violation_count, threshold, exceeded}`. POST /submissions/{id}/submit: 3 per 10s per learner, optional `If-Match`, `Idempotency-Key` replays the stored response for 24h (same key + different body → 422), client `violation_count` can only raise the stored count. Attempt state now carries `can_continue`, `draft_id`, `attempts_used/remaining`, MAX_ATTEMPTS_REACHED and TIME_LIMIT_EXPIRED. Jobs: `submissions:auto-submit` every minute (expired timed drafts, per-row backoff 120s·2ⁿ ≤ 1h, 5 tries) and `submissions:sweep-idempotency` hourly. 4 e2e tests) |
| 4.3 | Grading pipeline (validate→enforce→grade→penalize→persist→emit) + quiz grader | done (`grading::{answers, grader, penalties, breakdown}` are pure + unit-tested against legacy numbers: item points as max_score share of 100, choice partial credit with the ½-weight wrong-pick penalty and negative marking, matching fraction, open text/form → manual review, code from the latest final run (none → manual until 4.4). Penalty order: integrity violation zeroes (needs a detector on + threshold hit) → manual review → attempt cap `100 − pct·(n−1)` → late % (ceil-days × per-day ≤ max, or 100 past cutoff; waivable per override). Late % is stored even for manual review so the teacher path applies it (legacy lost it). Status: manual → pending; code challenge or immediate release → published; batch → graded (`awaiting_release`, scores hidden until a published grading entry exists). Persist = single `persist_submit` CAS on status='draft' + write-once item/policy snapshots + auto grading entry (graded_by NULL) + `submission-submitted` audit event. Student view redacts scores/grading/late % until released. "Emit" (SSE) → 4.7) |
| 4.4 | Code grader via Judge0 client (circuit breaker, language caps) | done (`ab-clients::judge0`: batch create + poll in the CE 1.13 wire shape (base64, `tokens=`), 5-failure/30s circuit breaker, payload rejections don't trip it; wiremock contract tests. `domain::code`: `CodeRunner` (shared executor: idempotent replay of accepted/wrong-answer runs, conflict on payload mismatch, retry of failed ones; sandbox policy per language — JVM/Go memory floors, stack/proc caps, compiler flags; match modes exact/trimmed/ignore-whitespace/numeric-tolerance; output truncation; hidden-test data stored in full, masked on read) + `CodeRunsService` (POST /assessment-items/{id}/runs visible/custom with `Idempotency-Key`, 20/min/user, GET /code-runs/{id} owner-masked or author, POST /assessments/{id}/reference-check author-only, GET /code/languages cached 10 min, platform allowlist ∩ item languages). Submit pipeline runs the `final` run: compile error → 422 `compile-error` with output (learner) / grade earned (timer); runner down → 503 `code-runner-degraded` + Retry-After (learner) / manual review (timer); blank source → 0 without a Judge0 call. Config `AB__JUDGE0__*` (optional; unset = degraded + manual review). New error codes `code-runner-degraded`, `compile-error`, `language-not-allowed`. Startup language-table patch → 5.3. 3 e2e + 5 client + 6 unit tests) |
| 4.5 | Teacher surface: gradebook (keyset), publish/release modes, returns, item feedback, CSV export ∥ | done (`GradingService` (`domain/grading/teacher.rs`), gate = `assessment:grade` platform/own via the course. GET /assessments/{id}/submissions keyset review queue (status incl. virtual `needs_grading`, late_only, search on username/display name), …/submissions/stats (counts, avg, pass rate vs passing_score, 10-bucket distribution), …/item-analytics (response count, avg %, correct %, 27% discrimination index), …/submissions/export CSV (RFC 4180, one column per item). GET /submissions/{id}/review unredacted view + feedback rows; PATCH /submissions/{id}/grade with mandatory `If-Match` = `version` (412 `precondition-failed` + `{expected, actual}`), action save/publish/return under the legacy transition table (published is final; drafts ungradable), item grades on the item's own scale converted to breakdown points, raw score given or computed (earned/possible), late % from submit applied on top; every save appends a grading entry + item_feedback rows + audit. GET …/grading-history. POST /assessments/{id}/publish-grades bulk release (published entry per held grade). Learner: GET /submissions/{id}/feedback (published entries only); a returned attempt lifts the attempt cap (`revision_requested`). GET /courses/{id}/gradebook: latest submitted attempt per (learner, assessment), keyset on that pair — derived from submissions until P6's progress projections. 2 e2e tests) |
| 4.6 | Bulk actions + deadline extensions (jobs) ∥ | done (POST /assessments/{id}/deadline-extensions → `bulk_actions` row + `grading:bulk-action` job in ONE transaction, 202 with the action; GET /bulk-actions/{id}. Worker handler `BulkActionRunner` → `GradingService::execute_bulk_action`: per learner upsert the override's due date (other override fields kept; note = reason), recompute `is_late` on submitted attempts, audit; failures land on the row (status failed + error_log), not in retries. Validation: 1..=500 known learners, future date. Batch grading (`PATCH /grading/submissions/batch`) not ported — no frontend caller; DECISIONS) |
| 4.7 | Grading SSE (Redis Streams, Last-Event-ID, connection caps) | done (`ab-domain::events::GradingEvents`: `XADD sse:grading:{submission} MAXLEN ~1024` on publish (best-effort, never fails the caller), `XRANGE (id +` replay, `XREAD BLOCK` on a dedicated per-subscriber connection, per-user slot counter (5, TTL 1h, released on drop). `GET /submissions/{id}/events` (owner or grader; 404 otherwise): `Last-Event-ID` replay → `connected` → live events; axum keep-alive comments every 25s; 429 + Retry-After 60 past the cap. Events: `grade.published` (save/publish + bulk release), `submission.returned`, `deadline.extended` (worker, when Redis is configured). Stream id = SSE `id` = replay cursor. 2 domain tests on real Redis + 2 e2e over a real socket. P4 fully done) |

### P5 — Files & code arena
| # | Slice | Status |
|---|---|---|
| 5.1 | File-submission subsystem (attempts, files, signed downloads, bulk export) ∥ | done (`file_submissions` / `_attempts` / `_files` tables (one open attempt per learner via partial unique index; uploads referenced with RESTRICT). `domain::files::FileSubmissionsService`: authoring create/get/by-activity/patch/publish (title + instructions required to publish; archived read-only), learner draft open/save/submit with optional `If-Match` (412), uploads must be the caller's own finalized `file-submission` uploads — count, duplicate, mime allowlist (case-folded), size cap → 422/413; reference counts move old→new set; at least one file to submit; late = 409 when `allow_late` off, else late policy penalty %; attempt cap 409 with details. Grading: keyset review queue (status/search), attempt view (owner sees grade only once published/returned), save/publish/return under required `If-Match`, CSV export, presigned 1h download for owner/grader (404 otherwise). Routes under `/file-submissions`, `/file-submission-attempts`, `/file-submission-files`, tag `file-submissions`; rbac sweep entries. Bulk zip download dropped — no frontend caller (DECISIONS). 2 e2e tests through real RustFS uploads) |
| 5.2 | Code arena standalone runs (code_runs/cases, SSE-less polling as legacy) ∥ | done-by-4.4 (the frontend code arena drives assessment-item runs + author reference checks, both landed in 4.4 with `Idempotency-Key` replay instead of polling tokens; no separate arena surface exists to port) |
| 5.3 | Judge0 startup patch port (`ashyq admin judge0-tune`, run-once semantics) | done (`ashyq admin judge0-tune` connects to `AB__JUDGE0__DATABASE_URL`, refuses until Judge0 has seeded `languages` ids 22/60/62, then runs the seven legacy UPDATEs verbatim (Go 22/60, Java 26/27/28/62, Kotlin 78); idempotent, reports rows updated. Runbook step T-0 5a in MIGRATION. The legacy boot-time daemon thread is not carried) |

### P6 — Learning surface
| # | Slice | Status |
|---|---|---|
| 6.1 | Trail + activity/course progress ∥ | done (`activity_progress` / `course_progress` projections + `trails` / `trail_runs` / `trail_steps`. `domain::progress::ProgressProjector`: idempotent rebuild from submissions (state table verbatim from `services/progress`, completion rule, best/latest, weighted course average, certificate eligibility), from file-submission attempts, and explicit lesson completions; hooked best-effort after every submission write (start/save/submit/auto-submit, grade save/publish-all, deadline extensions) and file-attempt write; `ashyq admin progress-backfill [--course]`. `TrailService`: GET /trail (anonymous → empty), POST/DELETE /trail/courses/{id}, POST/DELETE /trail/activities/{id} (step + completion), gated by trail:submit/update/create grants. `LearnerStateService`: GET /courses/{id}/learner-state — outline with product work states, progress, next-action priority list; certificate block stubbed until 6.3. 2 e2e tests) |
| 6.2 | Discussions (+likes) ∥ | todo |
| 6.3 | Certifications + public verify endpoint ∥ | todo |
| 6.4 | Gamification (XP ledger w/ idempotency, levels, streaks, leaderboard) ∥ | todo |
| 6.5 | Work queue (unified inbox) ∥ | todo |
| 6.6 | Search (FTS generated columns + endpoint) ∥ | todo |

### P7 — Analytics
| # | Slice | Status |
|---|---|---|
| 7.1 | Event capture + daily rollup crons (teacher/course/engagement/assessment/user-progress) | todo |
| 7.2 | Risk snapshots + interventions + watchlist ∥ | todo |
| 7.3 | Dashboards read APIs + saved views + CSV exports ∥ | todo |

### P8 — AI
| # | Slice | Status |
|---|---|---|
| 8.1 | `ab-clients::llm` (rig facade, providers, fallback, streaming, budget/tokens) | todo |
| 8.2 | Run state machine + events + artifacts/evidence/approvals + SSE tail | todo |
| 8.3 | Agents: course_qa + study_companion (streaming) ∥ | todo |
| 8.4 | Agents: submission_analyst + course_analyst ∥ | todo |
| 8.5 | Agents: lecture_author + remediation_generator ∥ | todo |
| 8.6 | AI admin surface (runs, token usage, evals, feature flags, per-user limits) | todo |

### P9 — Frontend adaptation
| # | Slice | Status |
|---|---|---|
| 9.1 | Orval → openapi.v2.json, regen, mutator/path updates, delete refresh bridge | todo |
| 9.2 | Auth pages vs new BFF (login/mfa/google/logout/sessions) | todo |
| 9.3 | Error-code i18n sync script + catalogs (ru/kk/en) | todo |
| 9.4 | Feature-by-feature drift fixes until typecheck+tests+Playwright green | todo |

### P10 — Migration
| # | Slice | Status |
|---|---|---|
| 10.1 | ETL framework + id map + verification engine | todo |
| 10.2 | Per-domain transform specs (incl. all 52 JSONB fates) | todo |
| 10.3 | Zitadel user import + IdP links + login verification | todo |
| 10.4 | File migration to RustFS + reference rewrite | todo |
| 10.5 | Rehearsal loop until twice-green (gate for P11) | todo |

### P11 — Cutover
| # | Slice | Status |
|---|---|---|
| 11.1 | nginx v2 template + web image switch + compose final | todo |
| 11.2 | Execute runbook (owner present), 24h monitoring | todo |
| 11.3 | Decommission legacy (T+30d) + FINDINGS follow-ups that became unblocked | todo |

## Session log

| Date | Session summary |
|---|---|
| 2026-08-16 | Architecture ratified (30Q). Docs authored (ARCHITECTURE/MIGRATION/EXECUTION-PLAN/AGENTS/FINDINGS). P0 scaffold landed green (deedc51): fmt + clippy -D warnings + 19 tests + OpenAPI snapshot/export. Resolved versions: axum 0.8.9, sqlx 0.9.0, utoipa 5.5, tower-http 0.7, jiff 0.2.35, tokio 1.53. Machine fix: installed MSVC VC.Tools workload via winget (was missing; GNU link.exe shadowed). apps/api-v2 stub removed. |
| 2026-08-16 (cont. 2) | Owner ratified: internal-only Zitadel, no passkeys, first-party Google, agent-prepares/owner-pastes ops model. Slices landed green (CI #15–#17): 1.4 password auth (rate limits, uniform errors, audit, session handles), 0.11 RBAC sweep, 1.7 core (profiles), 1.8 core (role admin w/ live-session grant propagation), 1.5 Google OAuth (PKCE, opaque state, open-redirect guard, email linking). 79 tests. Machine: builds moved to C:\cargo-target (X: filled), root .env made dotenvy-safe, TEST_REDIS_URL wired in CI. Next: 1.6 TOTP relay, 0.10 zitadel-setup, 1.8 remainder, P2 catalog. |
| 2026-08-16 (cont.) | CI green from run #4 on. Slices 0.7 (Zitadel booted via podman, session/mgmt/user-v2 APIs smoke-tested, images pinned), 0.8 (queue+worker+scheduler, 16 DB tests; ON CONFLICT dedupe fix — raised unique violations poisoned caller tx), 0.9 core (TestApp + HTTP suite + problem+json 404), 0.12 (OTLP exporter, delivery pending Logfire token), 1.1 (identity schema + verbatim SYSTEM_ROLES seed) all landed. QUESTIONS.md created for owner-only items. Podman (not docker) is the local container runtime — commands in apps/server/AGENTS.md. Next: 1.2 zitadel client (live instance validated: user-v2 create w/ password import shape, session password checks), 1.3 sessions/Actor, 0.10 zitadel-setup. |
| 2026-09-05 | P3 (assessments) closed; P4 landed green (4.1 submissions schema, 4.2–4.3 lifecycle + auto-grading, 4.4 Judge0 code runs, 4.5–4.6 teacher grading + bulk actions, 4.7 SSE on Redis Streams; CI #42–#44). P5: 5.1 file submissions (real-upload e2e), 5.2 folded into 4.4, 5.3 `admin judge0-tune`. P6.1 progress projections + trail + learner-state. 175 tests. Dev-stack gotchas (podman/MSYS path conversion, RustFS volume) recorded in AGENTS.md. |
