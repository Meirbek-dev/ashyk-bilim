# Ashyq Bilim — Rust Backend Architecture

**Status:** authoritative for the server in `apps/server`. A change of design updates the relevant section here in
place, with the rationale in the commit message (`docs/DECISIONS.md` is frozen history since 2026-10-31).

Companion documents:
- [`docs/DECISIONS.md`](DECISIONS.md) — frozen history of design deltas
- [`docs/INFRA.md`](INFRA.md) - compose stacks, networks, secrets, CI/release, web contract
- [`docs/RUNBOOK.md`](RUNBOOK.md) - production operations
- [`docs/REWRITE.md`](REWRITE.md) - the v3 rewrite in progress (sections cited as "REWRITE n.n")
- [`apps/server/AGENTS.md`](../apps/server/AGENTS.md) — day-to-day agent playbook
- [`docs/FINDINGS.md`](FINDINGS.md) — open production/infra issues

---

## 1. Goals and non-goals

**Goals**
- One idiomatic Rust service (**Tokio + Axum + SQLx + utoipa + tracing**) behind `/api/v2`.
- **Agent-first development**: the codebase is written and maintained by coding agents with near-zero human
  review. Every invariant that can be enforced by the compiler, a lint, a test, or CI **must** be.
- Errors surface at the earliest possible moment: compile time > startup time > request time > background.
  Nothing fails silently.
- Authentication is delegated to an internal **Zitadel**; RBAC is ours.
- A boring core; volatile pieces (LLM providers, the queue) behind our own seams so they can be swapped in one
  module.

**Non-goals**
- MCP tool surface (deferred; the thin-handler discipline keeps it cheap later).
- Kubernetes, service mesh, microservices. One binary, one box, docker compose.

## 2. System overview

```
                    ┌────────────────────────── VPS (docker compose) ─────────────────────────┐
 Browser ── https ─►│ nginx ──► web (Next.js 16, apps/web) │ web2 (apps/web-2, profile dual-web)│
                    │   │                                                                     │
                    │   ├─ /api/v2/*            ──► server  (ashyq serve, Axum)               │
                    │   ├─ /content/*           ──► rustfs  (ab-public, cached)               │
                    │   ├─ /ab-public|ab-private ─► rustfs  (presigned S3 URLs)               │
                    │   └─ /*                   ──► web or web2                               │
                    │                                                                         │
                    │ server ◄─ data-net ─► postgres 18 (app db: FTS, job queue; pgvector ext)│
                    │ server ◄───────────► redis 8      (sessions, SSE streams, rate limits)  │
                    │ server ◄───────────► zitadel      (authN; own db in same PG cluster)    │
                    │ server ◄───────────► rustfs       (S3 API: uploads, media, artifacts)   │
                    │ server ◄─ exec-net ► judge0       (code execution, profile judge0)      │
                    │ worker  (ashyq worker: job queue consumers + schedule ticks)            │
                    │ server ── otlp ────► optional (AB__TELEMETRY__OTLP_ENDPOINT)            │
                    └─────────────────────────────────────────────────────────────────────────┘
                    External: Anthropic / OpenAI / OpenRouter (LLM), Resend (email), Google OAuth
```

One Docker image. `ashyq serve` and `ashyq worker` are the same binary with different subcommands. Services,
networks and trust zones: `docs/INFRA.md`.

## 3. Stack

Rule: **`Cargo.lock` is the pin.** Manifests carry semver requirements; upgrades are deliberate and land with a
green CI, never drive-by. Stable Rust, edition 2024; `rust-toolchain.toml` pins the exact toolchain (the Dockerfile's
base image matches it); `apps/server/tools.env` pins the cargo tools.

### Core

| Concern | Crate | Notes |
|---|---|---|
| Runtime | `tokio` (full) | |
| HTTP | `axum` 0.8, `axum-extra` (typed-header, cookie) | |
| Middleware | `tower`, `tower-http` (trace, cors, compression, timeout, limit, request-id, catch-panic, sensitive-headers) | |
| Rate limiting | ours, Redis fixed windows (`ab_domain::identity::rate_limit`) | edge nginx `limit_req` is the outer per-IP layer |
| DB | `sqlx` 0.9 (runtime-tokio, tls-rustls-ring, postgres, uuid, json, migrate, macros) | see §8 gotchas |
| Redis | `redis` 1.x (tokio-comp, connection-manager) | |
| Serialization | `serde`, `serde_json` | |
| Validation | `garde` (derive, email, url) | serde parses, garde enforces business rules |
| Config | `figment` (env) + `secrecy` | `AB__*` namespace, §16 |
| Errors | `thiserror` (libs) / `anyhow` (bin edges only) | one `Error` enum, §5 |
| Time | `jiff` | `ab_core::time`; columns are `timestamptz`, rows carry epoch seconds |
| IDs | `uuid` v7 | Postgres 18 native `uuidv7()` as column default |
| OpenAPI | `utoipa` 6, `utoipa-axum`, `utoipa-scalar` | routes and schemas registered together — no drift |
| Observability | `tracing`, `tracing-subscriber`, `tracing-opentelemetry`, `opentelemetry-otlp` (traces, HTTP) | §13 |
| HTTP client | `reqwest` (rustls, json, form, stream) | retries and circuit breakers per client |
| Object storage | `object_store` (aws) | S3 API against RustFS; provider swap = config |
| Passwords | *none* | Zitadel owns credentials |
| CLI | `clap` (derive, env) | |
| Shutdown | `tokio-util` `CancellationToken` | drains in-flight requests, SSE, jobs |
| Allocator | `mimalloc` | binary only |

### Volatile layer (isolated behind our own modules)

| Concern | Implementation | Isolation seam |
|---|---|---|
| LLM | hand-rolled over `reqwest`: Anthropic Messages API + OpenAI-compatible chat completions | provider wire types appear **only** in `ab_clients::llm`; domain code sees `LlmClient`, `CompletionRequest`, `Completion`, `StreamChunk`, `LlmError` |
| Tokenizing | `tiktoken-rs` | inside `ab_clients::llm` |
| Job queue | **hand-rolled Postgres queue** (`ab_db::queue`, `ab-jobs`) | §9 |
| SSE replay | Redis Streams | `ab_domain::events` + `crates/api/src/routes/sse.rs` |

**Job queue rationale:** apalis-postgres pinned sqlx 0.8 (two incompatible `PgPool`s, no transactional enqueue).
A `FOR UPDATE SKIP LOCKED` + `LISTEN/NOTIFY` queue on our own sqlx 0.9 pool gives transactional enqueue (job
inserts commit atomically with the domain write that caused them), zero dependency churn and semantics we test.
No outbox: follow-up work enqueues inside the transaction that records the triggering fact.

### Toolchain

| Tool | Purpose |
|---|---|
| `cargo-nextest` | test runner (CI + local; `.config/nextest.toml`) |
| `sqlx-cli` | migrations + `cargo sqlx prepare` (offline query cache) |
| `cargo-llvm-cov` | coverage (floor enforced in CI) |
| `cargo-deny` | advisories, license allowlist, duplicate-version bans |
| `cargo-machete` | unused dependency detection |
| `cargo-chef` | Docker layer caching (`apps/server/Dockerfile`) |
| `bacon` | local watch loop (`just server dev`) |
| `just` | task runner — **the only entry point agents use** (see AGENTS.md) |
| `insta` | snapshot tests (OpenAPI doc, error registry) with redactions |
| `wiremock` | HTTP-level fakes for Zitadel/Judge0/Resend/LLM |
| `proptest` | property tests |

## 4. Workspace layout

```
apps/server/
├── Cargo.toml                # [workspace], workspace.dependencies, workspace.lints
├── rust-toolchain.toml, tools.env, deny.toml, .config/nextest.toml
├── justfile
├── Dockerfile
├── .sqlx/                    # committed offline query cache (CI-verified)
├── migrations/               # sqlx migrate — hand-written SQL, timestamped
├── openapi.v2.json           # the contract artifact (§6)
├── AGENTS.md                 # agent playbook (authoritative for process)
├── docs/                     # DEVELOPMENT.md, phase9-removals.md
└── crates/
    ├── core/          (ab-core)          errors, config, ids, time, permission model, links, telemetry
    ├── db/            (ab-db)            pool, embedded migrations, queries/rows, queue, schedules
    ├── clients/       (ab-clients)       zitadel, google, judge0, resend, llm, storage, link_preview
    ├── domain/        (ab-domain)        all business logic, module per bounded context
    ├── api/           (ab-api)           axum app: state, extractors, middleware, routes, DTOs, OpenAPI
    ├── jobs/          (ab-jobs)          worker runtime + job handlers
    ├── server/        (ashyq-server)     the `ashyq` binary: serve | worker | migrate | openapi | admin
    ├── testkit/       (ab-testkit)       app harness, wiremock stubs (dev-dep only)
    ├── testdb/        (ab-testdb)        per-test database cloned from a migrated template (dev-dep only)
    └── testdb-macros/ (ab-testdb-macros) `#[ab_testdb::test]`
```

Dependency edges (enforced by `Cargo.toml`; cycles are impossible):

```
core ◄─ db ◄────┬─ domain ◄─┬─ api ◄──┬─ server (bin)
core ◄─ clients ┘           └─ jobs ◄─┘
testkit ─► {api, domain, clients, core}    testdb ─► {db, testdb-macros}   (dev-dependencies)
```

Bounded contexts inside `ab-domain` (`crates/domain/src`):

`identity` (users, sessions, auth, rbac admin, usergroups, capabilities) · `catalog` (courses, `CourseCtx`
access, curriculum, contributors, collections, readiness, search, platform) · `progress` (trail, projector,
learner state, agenda, work queue) · `assessments` (authoring, items, access) · `grading` (submissions,
grader, teacher, bulk actions, penalties) · `files` (uploads, file submissions) · `code` (Judge0 runs) ·
`community` (discussions) · `certifications` · `gamification` · `analytics` · `ai` (runs, agents, budget) ·
`notifications` · `events` (SSE fan-out) · `maintenance`, `rich_text`, `wire`, `link_preview`

**Why layer crates, not context crates:** agents work in parallel on different contexts; module-level separation
inside `ab-domain` gives them disjoint files while keeping one `cargo check` unit for cross-context type errors.
Revisit if clean-build minutes become the bottleneck.

## 5. Error model — the single most important convention

One error enum in `ab-core` (`crates/core/src/error/mod.rs`), used by **every** fallible function in
db/clients/domain:

```rust
#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("{code}: {message}")]
    App { code: ErrorCode, message: String, details: Option<serde_json::Value> },
    #[error("validation failed")]
    Validation { field_errors: Vec<FieldError> },
    #[error("configuration error: {message}")]
    Config { message: String },
    #[error(transparent)]
    Db(sqlx::Error),                  // 500 unless a constraint we recognize
    #[error("{context}")]
    Internal { context: String, #[source] source: anyhow::Error },
}
```

- `ErrorCode` is a **closed enum** (`#[non_exhaustive]` is forbidden here) with a stable kebab-case wire code,
  a canonical HTTP status and an English title: `not-found`, `forbidden`, `conflict`, `precondition-failed`,
  `rate-limited`, `course-archived`, `attempt-past-due`, `ai-budget-exhausted`, … New codes are one row in
  `crates/core/src/error/code.rs`; a unit test snapshots the full registry, and the OpenAPI document publishes it
  as an enum schema.
- Wire format: **RFC 9457 `application/problem+json`**, extended (`ab_api::error::Problem`):

```json
{
  "type": "https://docs.ashyq-bilim.dev/errors/attempt-past-due",
  "status": 403,
  "code": "attempt-past-due",
  "title": "The due date or late cutoff has passed",
  "detail": "…english, developer-facing…",
  "field_errors": [{ "field": "items[3].answer", "code": "required", "message": "…" }],
  "details": { "…": "machine-readable context for some codes" },
  "request_id": "0198c0ae-…"
}
```

- **All messages are English.** The frontends translate from `code` / `field_errors[].code`: `apps/web` checks
  its catalogs with `bun run check:error-codes` (`apps/web/scripts/sync-error-codes.mjs`); `apps/web-2` maps
  every `ErrorCode` exhaustively in `src/shared/i18n/errors.ts`, so a new code fails its type check.
- `IntoResponse` is implemented **once**, in `ab_api::error`. Handlers return `Result<T, ab_core::Error>` — they
  never construct responses from errors.
- Internal variants render as an opaque 500 with `request_id`; full detail goes to tracing. Constraint violations
  we recognize (unique, FK) map to `conflict` / `not-found` with the offending field where derivable.
- Panics are a bug by definition: `unwrap`/`expect`/`panic!`/`todo!`/`unimplemented!`/`dbg!`/`print*!` are
  **denied by workspace lints** (tests opt out explicitly). `CatchPanicLayer` is the airbag, not the seatbelt.

## 6. API design (`/api/v2`)

- Base path `/api/v2`, OpenAPI 3.1 generated by `utoipa` from the same registrations that mount routes
  (`utoipa-axum` `OpenApiRouter` + `routes!`). **A route cannot exist without a documented operation and typed
  response.**
- `just server openapi` writes `apps/server/openapi.v2.json`, the contract artifact; `just contract` regenerates
  both web clients from it (§15). CI checks the committed file (`openapi-check`) and an `insta` snapshot
  (`crates/api/tests/openapi.rs`) makes every contract change visible in the diff. The document passes through
  one export-time pass (`crates/api/src/openapi.rs`, DECISIONS 2026-10-03 "Generator-friendly contract" and its
  part 2) before it is served or exported. Request DTOs declare their garde limits as schema constraints; stored
  JSON is typed in `crates/domain/src/wire.rs`; SSE responses reference an event union.
- Resources: plural kebab-case paths, UUIDv7 ids, flat where possible (`/courses/{course_id}`,
  `/assessments/{assessment_id}/items`, `/submissions/{submission_id}`): a path parameter is named after its
  resource.
- **Inputs**: `#[serde(deny_unknown_fields)]` DTOs + `garde` rules, enforced by the `ValidJson<T>` extractor that
  emits `Validation` errors with per-field codes.
- **Outputs**: dedicated response DTOs (`ToSchema`) in `ab_api::dto`, never DB rows directly; `ab-db` row structs
  do not derive `Serialize`.
- **Pagination**: two envelopes. Keyset `{ "items": [...], "next_cursor": "…" }` with an opaque string cursor
  (older lists use the last row's id, which stays a valid cursor; composite keys are encoded, e.g. the
  leaderboard's `"<xp>.<profile id>"`), `limit` capped server-side; numbered pages (`page`/`page_size`/`total`)
  for analytics tables only. Lists that answered a bare array keep it and gain a `/page` sibling
  (`ab_core::page_after`, paged in memory); the leaderboard keeps `limit`/`offset` beside `cursor` until phase 9.
- **Idempotency**: every creating/submitting POST the web calls accepts `Idempotency-Key` (`extract::idempotent`);
  keys + response digests are stored in Postgres with a 24h TTL sweep (`submissions:sweep-idempotency`); a 204
  replays without a body.
- **Optimistic concurrency**: every resource the web edits answers `version` and, on its single read,
  `ETag: "<version>"`; mutations take an optional `If-Match` and answer 412 `precondition-failed`
  (`details {expected, actual}`) when it is stale (`extract::require_if_match`, after the permission gate).
  Courses, chapters, announcements, certifications, roster rows, usergroups, roles, the platform and assessments
  bump `version` through the `bump_version` trigger; collections, activities, drafts and grades keep their
  explicit counters.
- **`Prefer: return=representation`**: writes that answer 204 (admin role / status / membership writes) or a
  different resource (trail writes → the course's `learner_state`) return the updated resource on request; the
  default stays as it was.
- **Renames (expand)**: a renamed path is a twin handler with its own `operationId`; the export marks the old
  operation `deprecated: true` + `x-replaced-by` (`openapi::RENAMED`) until phase 9 removes it.
- **Web links**: every URL into the web app is built by `ab_core::links::WebLink` in the scheme
  `AB__SERVER__WEB_LINKS` selects (`legacy` | `v2`), anchored at `AB__SERVER__WEB_URL` where a full URL is needed
  (emails, redirects, the certificate QR).
- **SSE**: `axum::response::Sse`. Event log per stream in **Redis Streams** (`XADD` with `MAXLEN ~`),
  `Last-Event-ID` resumes via `XRANGE`. 25s keepalive comments; per-user cap of 10 open streams (Redis lease set).
  Streams: grading feedback per submission and per course, AI run events per run, and one per user -
  `GET /me/events` carries every event addressed to the user (`grading.updated`, `submission.updated`,
  `notification.created`, `notification.read`, `xp.awarded`; a closed enum with a typed payload each). Fan-out and
  authorization happen at publish time (`ab_domain::events::user`): the producer names the recipients, the reader
  only ever reads its own stream. The per-submission and per-course streams stay until phase 9.
- **Uploads**: direct-to-RustFS via presigned URLs (§11). The API never proxies upload bytes.
- Middleware stack, outermost first (`crates/api/src/app.rs`): request-id (sanitize, set, propagate) → trace →
  timeout (30s, 408) → compression → catch-panic → CORS (strict allowlist with credentials) → request-id scope →
  problem+json 413 → `?lang=` → CSRF guard (reject cross-site `Sec-Fetch-Site` on mutations) → routes. The
  session is an extractor, not a layer.

"Phase 9" is the post-cutover cleanup of `docs/STAGE-2-CUTOVER.md` section 4; the server items are listed in
`apps/server/docs/phase9-removals.md`.

## 7. Authentication & authorization

### Zitadel (compose service — **internal-only**, see DECISIONS.md 2026-08-16)

- Zitadel, own database `zitadel` in the shared Postgres cluster (own role, no grants on the app DB). **No public
  route** — the Rust BFF is its only client; passkeys are dropped (origin-bound) and Google OAuth is first-party
  (`ab_clients::google`).
- **Zitadel owns**: credentials, password policy & hashing, TOTP, email verification codes (returned to the BFF,
  sent via Resend), lockout counters. **We own**: sessions (BFF), RBAC, user profile, the Google OAuth dance, and
  the Google `sub` linkage.
- Provisioning is declarative: the `ZITADEL_FIRSTINSTANCE_*` compose env creates the org and the
  `ashyq-provisioner` machine user with its PAT; bootstrap hands the PAT to the server env (`docs/INFRA.md`,
  "Bootstrap"). `ashyq admin zitadel-check` verifies reachability and PAT validity. No manual console steps.

### Login flow — custom UI, headless Zitadel (Session API v2)

The browser only ever talks to our API; our API drives Zitadel (`crates/api/src/routes/auth.rs`):

```
POST /api/v2/auth/login {login, password, totp_code?}
  └► zitadel: create session + password check
      ├─ ok (and TOTP verified when enabled) ─► ab_session cookie + session body
      ├─ TOTP enabled, no code              ─► 401 code=mfa-required (client resends with totp_code)
      └─ bad credentials                    ─► 401 code=invalid-credentials
GET  /api/v2/auth/google  ─► 302 to Google (authorization code + PKCE, state in Redis)
     …Google… ─► GET /api/v2/auth/google/callback?code=…&state=…
  └► exchange code, read id_token ─► find-or-create user ─► cookie ─► redirect to app
POST /api/v2/auth/logout  ─► kill our session + zitadel session
```

Registration, email verification, password reset/change, email change, TOTP enrolment and session
list/revoke live under `/auth/*` too. `POST /api/v2/auth/dev-login` (`just login-as`) signs in as an existing
account without a password: routed only in a debug build outside production, loopback peers only, not in the
contract (`ab_api::app::dev_login_enabled`).

### Sessions — BFF cookie

- Single httponly cookie `ab_session` (`SameSite=Lax`, `Secure` in production, host-only), opaque random id.
  Server-side record in Redis (`ab_domain::identity::sessions`): user and Zitadel ids, roles, permissions,
  `rbac_version`, created/last-seen, ip/ua.
- Sliding idle timeout **14 days**, absolute cap **90 days**, `MAX_SESSIONS_PER_USER = 10` (oldest evicted),
  instant revocation (delete key), session list + revoke endpoints.
- Every login issues a fresh id; a disable, password change, TOTP activation or grant change ends the user's
  sessions (epoch, §10). CSRF: `SameSite=Lax` + `Sec-Fetch-Site` check on mutations.
- The session answer (`GET /auth/session`, also the body of `POST /auth/login`): `user_id`, `roles`, raw
  `permissions` (legacy contract), `mfa_enabled`, plus `user` (id, username, email, display name, avatar key,
  locale, theme - what the app shell draws, no second request) and `capabilities`: a closed enum of UI-level
  rights (`teach`, `course.create`, `admin`, `admin.users`, ...) computed by the server's own gates
  (`ab_domain::identity::capabilities`, DECISIONS 2026-10-03). Clients never parse permission strings;
  per-object rights travel as `allowed_actions` on the resources. A session whose account row is gone answers
  401.

### RBAC — ours, in Postgres

- The `resource:action:scope` permission model: typed `Permission { resource, action, scope }` in
  `ab_core::permission`, parsed and validated from the DB, wildcard `*` supported.
- Role → permission assignments and the six roles (admin, maintainer, instructor, moderator, user, guest) are
  seeded by migration.
- Enforcement lives in **`ab-domain`**, not handlers: every domain service method takes an `Actor`
  (`ab_domain::identity::Actor`: user id, permission set, `rbac_version`, …) and calls `actor.require(perm)?` /
  ownership checks before touching data. Course-scoped catalog writes go through one `CourseCtx`
  (`crates/domain/src/catalog/access.rs`): the caller's `Caps` in the course, with the archive rule applied in
  that one place (`docs/COURSE_ARCHIVING.md` section 7); the other modules move to it per REWRITE 6.3.
- `crates/api/tests/rbac_sweep.rs` classifies every mutating operation of the OpenAPI document and asserts that
  permission-gated ones reject a session with zero grants — a new endpoint fails it until classified.
- `rbac_version` on the user row and the per-user epoch in Redis (§10) end sessions on role change.

## 8. Data layer

### Schema

One migration set for the database `ashyq`. Rules:

1. **Every table**: `id uuid PRIMARY KEY DEFAULT uuidv7()` (Postgres 18 native),
   `created_at timestamptz NOT NULL DEFAULT now()`, `updated_at` maintained by the shared `set_updated_at`
   trigger.
2. Naming: `snake_case`, plural table names, `*_id` FKs, no abbreviations.
3. **Enums**: `text` + `CHECK` constraint (mirrored by a Rust enum); native PG enums are avoided.
4. **JSONB policy**: only for genuinely polymorphic payloads — assessment item bodies, submission
   answers/snapshots, activity block content, AI event payloads. Each JSONB column maps to a typed serde shape
   (`crates/domain/src/wire.rs`) with round-trip tests. Settings scalars and flags are columns.
5. FKs always explicit with deliberate `ON DELETE` (mostly `RESTRICT`; `CASCADE` only for owned children like
   items/blocks). No soft-delete convention; archival is a domain status where the domain needs it (courses,
   assessments).
6. Search: `search_matches` / `search_fold` (`migrations/20260926000001_search_matches.sql`), one word-match rule
   for `/search`, `courses?q=` and collections; no index serves it (pg_trgm plan in REWRITE §5). The `tsvector`
   generated columns on courses/collections only rank (`ts_rank_cd`), so they carry no GIN index (dropped 2026-11).
   Course material search uses pgvector on `content_chunks` (§12 "AI-first foundation").
7. Optimistic concurrency: one integer `version` per edited resource (§6; 412 on a stale `If-Match`), plus the
   per-column-family counters where genuinely concurrent (grading vs. draft; the draft save keeps its 409 until
   phase 9).

### Schema guarantees (2026-11 schema review)

The database enforces these itself; `crates/db/tests/schema_review.rs` holds one test per rule.

- **No cascade from `users` onto learning records.** Submissions, file attempts, code runs, issued
  certificates, progress, trails/enrolments, XP and uploads reference `users` with `ON DELETE RESTRICT`
  (accounts are disabled or anonymised, never deleted by the app; manual erasure: RUNBOOK 2.3).
  Settings-like rows (roles, preferences, notifications, reactions, analytics) still cascade.
  `crates/db/tests/cascade_audit.rs` lists every remaining cascade with its reason.
- **Attempt numbers** are unique per learner and task among counted attempts
  (`submissions_attempt_number_key`, `file_submission_attempts_attempt_number_key`, both `WHERE NOT preview`).
- **Notifications** carry generated `course_id` / `activity_id` columns (from the typed payload) with
  `ON DELETE CASCADE`: deleting a course or activity removes the notifications that link into it.
- **A copied `course_id` cannot drift.** Chapters, activities, assessments, file tasks and posts carry
  `UNIQUE (id, course_id)`; their children reference `(parent_id, course_id)` (activities → chapters,
  assessments/file tasks/progress/trail steps → activities, submissions → assessments, file attempts → file
  tasks, replies → posts) with `ON UPDATE CASCADE`, keeping the old constraint names.
- **Sibling positions are unique** per course (chapters), chapter (activities), assessment (items) and
  collection (courses), `DEFERRABLE INITIALLY DEFERRED` so a reorder inside one transaction may pass through
  duplicates; `>= 1`. Two concurrent appends that both took `MAX(position) + 1` get 409 `conflict` (retry).
- **Coherence, bounds, shapes** (`20261101220200_integrity_checks.sql`): a handed-in attempt has `submitted_at`,
  a published/archived assessment its stamp, a reply its post (and a post none); scores and penalties are
  percentages in 0..100; text columns are capped at the API's garde limits (course description 5 000, about
  20 000, chapter/collection description 5 000, post 20 000, course update 500/50 000, file-task instructions
  50 000); JSONB written by typed server code is an object (`submissions.violations` an array) and an item's
  body is tagged with its `kind`. A check whose existing rows violate it is skipped with a WARNING and a
  `schema_skipped_checks` row instead of failing the deploy (RUNBOOK 2.4).
- **Grade journals are append-only** (`20261102000000_ledger_guards.sql`): a `grading_entries` row changes only
  its `published_at`, a `file_grading_entries` row never changes; neither is deleted except by the cascade
  from its submission / attempt. The guards compare the whole row, so a new column is frozen too.
- **Every foreign key has an index led by its columns** (`crates/db/tests/fk_index_audit.rs`); the exceptions are
  actor/audit columns onto `users` (never deleted by the app), each listed with its reason.
- **Retention** (`maintenance:retention`, daily, windows `AB__RETENTION__*`): succeeded jobs 14 days, failed/dead
  jobs 90, `auth_audit_log` 365, stdout/stderr/compile output of practice code runs 180 (verdict rows and graded
  `final` runs stay), event logs of finished AI runs 180. Time-ordered append tables carry BRIN indexes on their
  timestamp for these sweeps and the analytics prune.
- **Growing value lists are lookup tables**: `notifications.kind` → `notification_kinds`, `uploads.purpose` →
  `upload_purposes` (a new kind or purpose is one `INSERT` in a migration); `notification_preferences.disabled`
  is checked against `notification_kinds` by a trigger. Short fixed lists stay CHECKs.
- **Permission parts are columns**: `role_permissions.resource/action/scope` are generated from the grant
  string (shape-checked like `Grant::parse`); `is_course_staff` reads them through a partial index, so its
  role branch is two index probes per call.
- **HOT room**: `jobs` (fillfactor 70), submissions, activity/course progress, gamification profiles (85) and
  posts (90) leave space for in-place updates; no index covers `jobs.heartbeat_at` (the reaper finds running
  jobs through `jobs_status_kind_idx`), so a heartbeat is a HOT update.
- **Derived aggregates are reconciled** weekly (`maintenance:reconcile`): every member's progress projection
  is re-projected (the `progress-backfill` pass; changed members are logged) and gamification totals/level
  are re-derived from `xp_transactions` / `gamification_completions` (`daily_xp_earned` excepted).
- **No import artefacts**: the `etl_*` tables and every `legacy_uuid` except `blocks.legacy_uuid` (lesson
  content still links blocks by it) were dropped at T+32d.
- **`users.locale` is the short tag** (`ru|kk|en`, D-03); the API still renders and accepts the region form.

### SQLx usage

- `query!` / `query_as!` (compile-time checked) for all static SQL. The offline cache `apps/server/.sqlx/` is
  committed; CI runs `just sqlx-check` (`cargo sqlx prepare --check`) — a query that doesn't match the schema
  **fails the build**.
- Dynamic SQL (filter builders for analytics/search) uses `QueryBuilder`; raw runtime strings require
  `AssertSqlSafe`, each use with a `// SAFETY:` comment.
- sqlx 0.9 gotchas: `Transaction` no longer implements `Executor` — pass `&mut *tx`; `impl SqlSafeStr` on query
  fns.
- Transactions: domain services own transaction boundaries (`self.pool.begin()` … `tx.commit()`); handlers never
  see transactions.
- Migrations: `sqlx migrate` embedded via `migrate!()`; `ashyq migrate` runs them explicitly (compose one-shot
  `server-migrate`, run by bootstrap and deploy; never on boot). A migration on `origin/main` is never edited
  (pre-commit hook); add a new one (`just new migration <name>`).

## 9. Background jobs (`ab_db::queue` + `ab-jobs`)

```sql
CREATE TABLE jobs (                        -- migrations/20260816000001_jobs.sql
  id           uuid PRIMARY KEY DEFAULT uuidv7(),
  kind         text NOT NULL,
  payload      jsonb NOT NULL DEFAULT '{}',
  status       text NOT NULL DEFAULT 'queued', -- queued|running|succeeded|failed|dead
  priority     smallint NOT NULL DEFAULT 0,
  run_at       timestamptz NOT NULL DEFAULT now(),
  attempts     integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 5,
  dedupe_key   text,                           -- unique among queued/running jobs
  locked_by    text, locked_at timestamptz, heartbeat_at timestamptz,
  last_error   text,
  created_at, updated_at timestamptz
);
```

- **Enqueue is an INSERT in the caller's transaction** — a grade publish and the jobs it causes commit or roll
  back together.
- **Progress follow-ups** (`ProgressProjector::owe_*` → `Followup`, REWRITE 4.3): every writer that changes what
  progress counts (curriculum deletes/moves/publish, roster and group membership, overrides and late rules,
  hand-ins and grades) records the re-projection as a job delayed by one minute in its own transaction, then hands
  the `Followup` to `settle` after the commit: the work runs inline (at most 5 s on the request), the job is
  deleted when it succeeded and made due at once when it did not. A process that dies between commit and settle
  leaves the job, which the worker runs after the grace. Role grant changes still owe theirs in a second
  transaction (the role tables go with REWRITE 6.3).
- Claim: `FOR UPDATE SKIP LOCKED` batch; wakeup via `LISTEN jobs_new` with a 1s poll fallback; heartbeat every
  15s; a reaper requeues `running` jobs with stale heartbeats; exponential backoff (5s · 2^n, capped at 15 min);
  after `max_attempts` → `dead` with `last_error`. A kind without a handler is dead-lettered. Failed and dead jobs
  show in `just prod-report`.
- Handlers implement `ab_jobs::JobHandler` (`kind()` + `handle(payload)`), one module per domain in
  `crates/jobs/src/handlers`, registered in the worker in `crates/server/src/main.rs`.
- Schedules: `job_schedules` with `interval_seconds` (not cron, DECISIONS 2026-08-16), seeded idempotently at
  worker boot. No elected leader: every worker ticks; a transaction-scoped advisory lock makes ticks exclusive
  and per-occurrence dedupe keys make enqueueing idempotent (`ab_db::schedule`). Current schedules:
  `assessments:publish-due` and `submissions:auto-submit` (1 min), `notifications:deadline-reminders` (15 min),
  `submissions:sweep-idempotency` (1 h), `uploads:reap` and `analytics:rollup` (6 h), `notifications:prune` and
  `maintenance:retention` (24 h), `maintenance:reconcile` (7 days), `retrieval:sweep` (1 min). On-demand kinds:
  `ai:execute_run`, `ai:grade-draft`, `grading:bulk-action`, `mastery:ingest`, `mastery:rebuild`, `progress:*`
  follow-ups.
- Graceful shutdown: `CancellationToken` → stop claiming, finish in-flight, heartbeat until done (compose
  `stop_grace_period: 60s`).
- Notifications: `notifications:deadline-reminders` sends one `deadline_approaching` per (learner, activity, due
  date) for unsubmitted work due within 24 h (dedupe key, so ticks and restarts never repeat it; an extension
  reminds again); `notifications:prune` deletes notifications older than **90 days**.
- Analytics retention: `analytics:rollup` ends by pruning `analytics_events` older than **400 days** and the
  `daily_*` rollup tables plus `learner_risk_snapshots` older than **2 years**, in 5 000-row batches through the
  primary key (`ab_db::analytics::prune_retention`), summarised in one tracing line. Dashboards only ever read the
  last 180 days.
- Log retention: `maintenance:retention` (daily, `ab_db::retention`) deletes finished jobs, old sign-in audit rows
  and AI event logs and clears old practice code-run output; windows in §8 "Schema guarantees".
- Reconciliation: `maintenance:reconcile` (weekly) re-derives gamification totals from their journals and re-projects
  every member's progress, logging what it changed (§8 "Schema guarantees"); a steady non-zero count is a projector
  bug.

## 10. Redis usage map

| Use | Structure | Notes |
|---|---|---|
| Sessions | `session:{id}` JSON + `session_seen:{id}` last-seen stamp + `user_sessions:{uid}` zset + `user_epoch:{uid}` counter | the touch only `EXPIRE`s the record and writes the stamp (BUG-191); every session-ending mutation `INCR`s the epoch first and `create` is a Lua CAS on it, so a login in flight cannot outlive a disable / password change / TOTP activation / grant change (BUG-203) |
| SSE event logs | Redis Streams `sse:grading:{submission}` / `sse:grading:course:{course}` / `sse:ai:{run}` | `MAXLEN ~1024`, replay via `XRANGE` |
| Per-user event stream | Redis Stream `sse:user:{user}` | `MAXLEN ~500`, 7-day TTL refreshed on publish; written by a process-wide publisher (`events::user::install` at boot) |
| SSE connection caps | `sse_leases:{user}` zset of expiring leases | 10 per user, lease TTL 1 h, Lua acquire |
| Rate limits | fixed-window counters (`rl:*` auth, `ai_hourly:*`, `code_run_rl:*`, `submit_rl:*`, `draft_throttle:*`) | nginx `limit_req` is the per-IP outer layer |
| Short-lived state | `oauth:google:{state}`, `totp_pending:*`, `lock:*` (serializes Zitadel-side account changes), link-preview cache (24 h) | TTL on every key |

Redis is single-instance with a password (`--requirepass`), reachable only on `data-net`. Coordination of
Postgres work uses Postgres advisory locks and row locks.

## 11. Object storage — RustFS

- `rustfs` compose service (S3-compatible) with volume `rustfs_data`; accessed exclusively through
  `object_store` (`ab_clients::storage`) → moving to R2/S3/MinIO is config, not code.
- Buckets: `ab-public` (course thumbnails, avatars, block media — served read-only via nginx `/content/*` with
  cache headers) and `ab-private` (file submissions, exports, AI artifacts — presigned GET only, 5 min TTL).
  Presigned URLs are signed for the public origin and pass nginx verbatim (`docs/INFRA.md`, "Edge").
- Upload flow (`ab_domain::files::uploads`):
  1. `POST /api/v2/uploads` (purpose, mime, size, `multipart`) → server validates policy (size caps, mime
     allowlist per purpose; multipart only for videos) → creates an `uploads` row (`pending`) → returns a
     presigned PUT URL (15 min) or presigned 32 MB part URLs.
  2. Client PUTs directly to RustFS through nginx; the body never touches Axum. A multipart upload is assembled
     by `POST /api/v2/uploads/{id}/multipart` (aborted by `DELETE`).
  3. `POST /api/v2/uploads/{id}/finalize` → server HEADs the object, refuses (and deletes) one whose content type
     or size differs from the intent, marks it `finalized`.
  4. Reference counting (`referenced_count`); `uploads:reap` deletes unreferenced finalized uploads after 24 h
     and pending ones after the 12 h claim window.

## 12. AI subsystem

- `ab_clients::llm`: `LlmClient` over the Anthropic Messages API (primary when its key is set) and
  OpenAI-compatible chat completions (OpenAI, OpenRouter) as the fallback chain; provider, model and chain are
  pure config (`AB__AI__*`, `ab_core::config::AiConfig`). Structured output requests a JSON schema and retries
  once with the parse error fed back; every call has a hard per-provider timeout; a provider that fails before
  producing output hands over to the next. `ab-domain` has no provider dependency.
- `ab_domain::ai`: durable run model — tables `ai_threads`, `ai_runs`, `ai_events`, `ai_artifacts`,
  `ai_evidence`, `ai_approvals`, `ai_eval_results` (+ analysis/QA/memory tables). Run lifecycle is an explicit
  state machine (`queued → running → {succeeded, failed, aborted}`) with every transition a guarded UPDATE
  (`WHERE status = $expected`).
- Execution: `ai:execute_run` job in the worker; events are appended to Postgres (durable) and mirrored to the
  run's Redis Stream (live SSE tail). Cancellation: status flip checked between steps; LLM calls are recorded as
  run events.
- Agents (`crates/domain/src/ai/agents`): course_analyst, course_qa, lecture_author,
  remediation_generator, study_companion, submission_analyst, concept_mapper, grade_assistant. Streaming QA/companion stream chunks over SSE.
  Without a reachable provider, agents answer with deterministic drafts (`ai_draft_mode_enabled`).
- Budget (`ab_domain::ai::budget`): tiktoken-rs estimates, request-size cap, platform monthly token budget from
  `ai_token_ledger` plus in-flight reservations, per-user hourly limits in Redis; `ai-budget-exhausted` /
  `ai-rate-limited` error codes.
- Evals: `ashyq admin ai-eval` records outcomes in `ai_eval_results` (manual, never CI); today it records a
  provider smoke check only.
- AI-first foundation (docs/AI-FIRST.md, the source of truth for its rules):
  - `ab-domain::retrieval`: course material cut into `content_chunks` (heading-path anchors,
    `vector(1024)` + a `simple` lexeme column), kept in step by the `retrieval:sweep` job (every
    minute, version comparison, no write-path hooks); hybrid search = HNSW cosine + full text fused
    by RRF. Embeddings come from `ab-clients::embed` (`AB__AI__EMBEDDING_*`; without a provider a
    deterministic hashed n-gram embedder). `course_qa` and `study_companion` put the passages that
    answer the question in front of the course outline.
  - Concept graph (`course_concepts`, `concept_prerequisites`, `concept_tags`) curated by teachers
    over the `concept_mapping` agent's suggestions; `ab-domain::mastery` turns visible results
    (test items, file grades, visible-test code runs, practice sessions, AI questions) into
    `mastery_evidence` and replays BKT with partial credit into `concept_mastery`
    (`mastery:ingest` owed in the writer's transaction, `mastery:rebuild` after graph changes).
  - AI pre-grading: the `grade_draft` agent proposes per-criterion scores with quotes the server
    verifies; `ai_grade_drafts` holds one live draft per work; approval goes through
    `GradingService::save_grade` / `FileSubmissionsService::grade`, whose transactions settle the
    draft (`applied`, agreement) and write `ai_grade_corrections`, the calibration input.
    `ai:grade-draft` queues auto drafts on hand-in when the course switched them on.

## 13. Observability

- `tracing` everywhere; JSON logs (required in production) or pretty in dev. With `AB__TELEMETRY__OTLP_ENDPOINT`
  set (the full traces URL; headers from `OTEL_EXPORTER_OTLP_HEADERS`), spans are exported over OTLP/HTTP with
  `service.name=ashyq-server` (`crates/core/src/telemetry.rs`); an exporter that fails to build is logged loudly
  and export stays off. No metrics are exported. Production has no external monitoring or alerting
  (`docs/FINDINGS.md` #9).
- HTTP spans come from `TraceLayer` and carry `request_id`, the same id as the `x-request-id` response header and
  the problem+json `request_id`, so `grep <id>` finds the request.
- `/api/v2/health` (liveness: process up) and `/api/v2/health/ready` (readiness: Postgres ping). The image
  healthcheck uses liveness; readiness is checked through nginx by `infra/scripts/smoke.sh`.

## 14. Testing & quality gates

Layered, all runnable via `just` (single source of truth; CI calls the same recipes):

| Layer | Tool | What it proves |
|---|---|---|
| Type/lint | `just clippy` (`-D warnings`; pedantic+nursery warn-promoted; unwrap/expect/panic/todo/dbg/print denied) | agent slop cannot land |
| Format | `just fmt-check` | |
| Query validity | `just sqlx-check` | SQL matches schema at build time |
| Unit | nextest (`just test-unit` needs no services) | pure domain logic |
| DB | `#[ab_testdb::test]` (per-test clone of one migrated template, `crates/testdb`) | queries, constraints, queue semantics |
| HTTP | `ab_testkit::TestApp` (real router + test DB + test Redis + wiremock Zitadel; fakes for Judge0/LLM) | handlers, auth, RBAC, error envelopes |
| Contract | `just openapi-check` + `insta` snapshot of the OpenAPI doc | every contract change visible in diff |
| RBAC sweep | `crates/api/tests/rbac_sweep.rs` over the route list | no unclassified mutating endpoint |
| Supply chain | `just deny`, `just machete` | advisories, licenses, dead deps |
| Coverage | `just cov` (`cargo llvm-cov nextest`; CI: nightly `coverage.yaml`) | floor: 80% lines, workspace (`main.rs` excluded); ratchet up, never down |
| E2E | Playwright suites of both webs (`just e2e`, CI `web2-e2e`, `web-release-e2e`) | real browser against a full stack |

`TestApp::spawn(pool)` boots the full router (whole middleware stack) against the test database and returns
request helpers plus `mint_session` / `create_user` for any role. Wiremock stubs pin the wire shapes of Zitadel,
Judge0, Resend and the LLM providers (`crates/clients/tests`, `crates/testkit/src`).

### CI (`.github/workflows/ci.yaml`, jobs `server-lint` and `server-test`)

Run on pushes to `main`, `ci/**` and `release/**` and on pull requests, when `apps/server/**` or infra files
change (release branches run every gate). `server-lint`: `fmt-check -> clippy -> deny -> machete ->
openapi-check` (offline `.sqlx`, no services). `server-test`: `just dev-up` (Postgres 18 + pgvector, Redis,
Zitadel, RustFS), then `migrate -> sqlx-check -> test`, the suite split into two jobs (`--partition hash:N/2`, no
instrumentation). The coverage floor runs nightly (`.github/workflows/coverage.yaml`, `just cov`), off the deploy path.
`just ci-server` runs all of it locally, `cov` included. The server image is built by the `images` job in parallel and
published as `<sha>` only after every gate and the full-stack smoke passed (`docs/INFRA.md`). A red pipeline on
`main` is a stop-the-line event.

## 15. Frontend integration

Both frontends consume `/api/v2` from `apps/server/openapi.v2.json`; `just contract` regenerates both clients.
Read their app-specific `AGENTS.md` for client conventions and `docs/INFRA.md` for the web/edge contract.
`apps/web` (Next.js) is in production; `apps/web-2` replaces it per `docs/STAGE-2-CUTOVER.md`.

## 16. Configuration & secrets

- figment: embedded defaults → env `AB__SECTION__KEY` (nested `__`; lists in TOML array syntax), no config files
  (`crates/core/src/config.rs`). Locally `dotenvy` also reads a `.env` from the working directory (template
  `apps/server/.env.example`). Prod: secrets in the host's `server.env` (`env_file` of server/worker), topology
  keys set by `compose.prod.yaml` from `.env` (`docs/INFRA.md`, "Secrets and config").
- All secrets are `secrecy::SecretString` — they cannot Debug/Display into a log.
- **Startup is fail-fast and loud**: config parses into typed structs, then `Config::validate` checks posture
  (`AB__DATABASE__URL` set; in production a non-empty, non-wildcard CORS allowlist, JSON logs, auth limits not
  relaxed past their defaults). `serve` refuses to start without Redis, Zitadel or storage settings.
- `ashyq admin config-check` prints the effective config with secrets redacted.
- Data migrations that rewrite stored shapes (`ashyq admin migrate-editor-docs`, `migrate-themes`,
  `migrate-locales`) are idempotent commands with `--dry-run`, not SQL migrations: they run against live data on
  the operator's schedule (`docs/STAGE-2-CUTOVER.md`).

## 17. Known gotchas & risk register

| Risk | Mitigation |
|---|---|
| sqlx 0.9 API breaks (`&mut *tx`, `SqlSafeStr`) | documented in `apps/server/AGENTS.md`; compile errors catch misuse |
| `query!` needs DB or `.sqlx` cache | `.sqlx` committed; `just server prepare` after any SQL change; CI `sqlx-check` |
| LLM provider APIs change fast | wire types confined to `ab_clients::llm`; wiremock fixtures in `crates/clients/tests/llm.rs` |
| RustFS is young | accessed only via `object_store` S3 API; MinIO/R2 is a compose+env change; backups cover the volume |
| Zitadel session API coupling | confined to `ab_clients::zitadel`; wiremock fixtures (`crates/clients/tests/zitadel.rs`) pin the wire contract; image pinned by digest, upgraded deliberately |
| Hand-rolled queue correctness | `crates/db/tests/queue.rs` (transactional enqueue, dedupe, backoff, dead-letter, reaper, stale claims) and `crates/jobs/tests/worker.rs` |
| Windows dev machine without local Docker | `just test-unit` runs without services; full suite in CI; `.sqlx` keeps builds green without a DB |
| Agent drift across sessions | AGENTS.md and the docs of current behavior are the durable memory; every session ends with them current |
