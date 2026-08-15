# Ashyq Bilim — Rust Backend Architecture

**Status:** authoritative. Decisions here were ratified by the owner on 2026-08-16
(30-question review). Agents implementing the rewrite follow this document; deviations
require a written note in `docs/rewrite/DECISIONS.md` with rationale.

Companion documents:
- [`docs/rewrite/MIGRATION.md`](MIGRATION.md) — data migration & cutover runbook
- [`docs/rewrite/EXECUTION-PLAN.md`](EXECUTION-PLAN.md) — phased plan, slice status, gates
- [`apps/server/AGENTS.md`](../../apps/server/AGENTS.md) — day-to-day agent playbook
- [`docs/FINDINGS.md`](../FINDINGS.md) — pre-existing issues outside rewrite scope

---

## 1. Goals and non-goals

**Goals**
- Full replacement of `apps/api` (Python/FastAPI, ~68k LOC, 282 endpoints) with an
  idiomatic Rust service: **Tokio + Axum + SQLx + utoipa + tracing/OpenTelemetry**.
- **Agent-first development**: the codebase is written and maintained by coding agents
  (Fable 5 orchestrating Opus 5 subagents) with near-zero human review. Every invariant
  that can be enforced by the compiler, a lint, a test, or CI **must** be. Human taste
  is replaced by machine gates.
- Errors surface at the earliest possible moment: compile time > startup time >
  request time > background. Nothing fails silently.
- Auth is delegated to **Zitadel** (self-hosted). We keep our own RBAC.
- All production data is preserved (10k users). Big-bang cutover, ≤ 2 days window.
- A base that stays fresh for years: boring, consensus core; volatile pieces
  (LLM, queue) isolated behind our own seams so they can be swapped in one file.

**Non-goals**
- Wire compatibility with the v1 API. The frontend is in scope for agent changes;
  the API is redesigned where the old design was weak.
- MCP tool surface (deferred; the thin-handler discipline keeps it cheap later).
- Kubernetes, service mesh, microservices. One binary, one box, docker compose.

## 2. System overview

```
                    ┌────────────────────────── VPS (docker compose) ─────────────────────────┐
 Browser ── https ─►│ nginx ──► web (Next.js 16, BFF for pages)                               │
                    │   │                                                                     │
                    │   ├─ /api/v2/*      ──► server  (ashyq serve, Axum)                     │
                    │   ├─ /content/*     ──► rustfs  (public bucket, immutable cache)        │
                    │   └─ /*             ──► web                                             │
                    │                                                                         │
                    │ server ◄─ data-net ─► postgres 18 (app db ─ pgvector, FTS, job queue)   │
                    │ server ◄───────────► redis 8      (sessions, SSE streams, rate limits)  │
                    │ server ◄───────────► zitadel      (authN; own db in same PG cluster)    │
                    │ server ◄───────────► rustfs       (S3 API: uploads, media, artifacts)   │
                    │ server ◄─ exec-net ► judge0       (code execution, unchanged)           │
                    │ worker  (ashyq worker: job queue consumers + cron leader)               │
                    │ server ── otlp ────► Logfire (SaaS)                                     │
                    └─────────────────────────────────────────────────────────────────────────┘
                    External: OpenAI / OpenRouter (LLM), Resend (email), Google (via Zitadel)
```

One Docker image. `ashyq serve` and `ashyq worker` are the same binary with different
subcommands. The Python API, Taskiq workers, and its local `content/` volume are deleted
at cutover.

## 3. Stack

Rule: **`Cargo.lock` is the pin.** Manifests carry semver-minor requirements; upgrades
are deliberate (`just upgrade` + green CI), never drive-by. Stable Rust only,
edition 2024. MSRV = whatever current stable is at scaffold time (≥ 1.94 for sqlx 0.9);
`rust-toolchain.toml` tracks `stable`.

### Core (the boring half — expected to survive to 2030)

| Concern | Crate | Notes |
|---|---|---|
| Runtime | `tokio` (full) | |
| HTTP | `axum` 0.8, `axum-extra` (typed-header, cookie, query) | |
| Middleware | `tower`, `tower-http` (trace, cors, compression, timeout, limit, request-id, normalize-path, catch-panic) | |
| Rate limiting | `tower_governor` | edge nginx `limit_req` stays as the outer layer |
| DB | `sqlx` 0.9 (runtime-tokio, tls-rustls-ring, postgres, uuid, json, migrate, macros) | see §8 gotchas |
| Vectors | `pgvector` (sqlx feature) | |
| Redis | `redis` 1.x (tokio-rustls-comp, connection-manager) | reached 1.0; chosen over `fred` for API stability |
| Serialization | `serde`, `serde_json` | |
| Validation | `garde` (derive, email, url) | serde parses, garde enforces business rules |
| Config | `figment` (env) + `secrecy` | env-only in prod, `AB__*` namespace |
| Errors | `thiserror` (libs) / `anyhow` (bin edges only) | one `Error` enum, §5 |
| Time | `jiff` + `jiff-sqlx` | deliberate bet over chrono; better API, TZ-correct |
| IDs | `uuid` v7 | Postgres 18 has native `uuidv7()` — used as column default |
| OpenAPI | `utoipa` 5, `utoipa-axum`, `utoipa-scalar` | routes and schemas registered together — no drift |
| Observability | `tracing`, `tracing-subscriber`, `tracing-opentelemetry`, `opentelemetry-otlp` | OTLP → Logfire |
| HTTP client | `reqwest` (rustls, json, stream) + `reqwest-middleware` + `reqwest-retry` | |
| Object storage | `object_store` (aws) | S3 API against RustFS; provider swap = config |
| Cache | `moka` (future) | in-process L1; Redis is L2 where shared state matters |
| Email | `resend-rs` | |
| Passwords | *none* | Zitadel owns credentials; no argon2 in our binary |
| Multipart | `axum` multipart (only for small direct uploads) | large files go straight to RustFS via presigned URLs |
| CLI | `clap` (derive, env) | |
| Shutdown | `tokio-util` `CancellationToken` | drains in-flight requests, SSE, jobs |
| Allocator | `mimalloc` | binary only |

### Volatile layer (isolated behind our own modules — swappable by design)

| Concern | Crate | Isolation seam |
|---|---|---|
| LLM | `rig-core` | `rig` types appear **only** in `ab-clients::llm`; domain code sees our `LlmClient` facade over rig's `CompletionModel` |
| Tokenizing | `tiktoken-rs` | inside `ab-clients::llm::budget` |
| Job queue | **hand-rolled Postgres queue** (`ab-db::queue`, ~500 LOC) | decision record below |
| SSE replay | Redis Streams | `ab-api::sse` + `ab-domain::events` only |

**Decision — job queue (Q18, delegated to architect):** apalis-postgres pins sqlx 0.8
(splitting the binary into two incompatible `PgPool`s and killing transactional
enqueue — the entire point of a Postgres queue); apalis 1.0 is still `rc`. A
`FOR UPDATE SKIP LOCKED` + `LISTEN/NOTIFY` queue on our own sqlx 0.9 pool is a
well-trodden ~500-line pattern that gives us: transactional enqueue (job inserts
commit atomically with the domain write that caused them), zero dependency churn,
exact semantics we can test. If the ecosystem consolidates by 2028, the `Queue`
trait seam makes adoption a one-crate change. This kills the outbox problem for
audit events, XP awards, and emails: they enqueue inside the same transaction
that records the triggering fact.

### Toolchain

| Tool | Purpose |
|---|---|
| `cargo-nextest` | test runner (CI + local) |
| `sqlx-cli` | migrations + `cargo sqlx prepare` (offline query cache) |
| `cargo-llvm-cov` | coverage (floor enforced in CI) |
| `cargo-deny` | advisories, license allowlist, duplicate-version bans |
| `cargo-machete` | unused dependency detection |
| `cargo-chef` | Docker layer caching |
| `bacon` | local watch loop |
| `just` | task runner — **the only entry point agents use** (see AGENTS.md) |
| `insta` | snapshot tests (OpenAPI doc, error envelopes) with redactions |
| `wiremock` | HTTP-level fakes for Zitadel/Judge0/Resend/LLM |
| `fake` + `rstest` | factories & parametrized tests |

## 4. Workspace layout

```
apps/server/
├── Cargo.toml                # [workspace], workspace.dependencies, workspace.lints
├── rust-toolchain.toml
├── justfile
├── deny.toml
├── .sqlx/                    # committed offline query cache (CI-verified)
├── migrations/               # sqlx migrate — hand-written SQL, numbered
├── AGENTS.md                 # agent playbook (authoritative for process)
├── crates/
│   ├── core/      (ab-core)      errors, config, ids, time, permission model, telemetry
│   ├── db/        (ab-db)        pool, migrations embed, tx helpers, queue, pagination
│   ├── clients/   (ab-clients)   zitadel, judge0, resend, llm(rig), storage(object_store), redis
│   ├── domain/    (ab-domain)    all business logic, module per bounded context
│   ├── api/       (ab-api)       axum app: state, extractors, middleware, routers, SSE, OpenAPI
│   ├── jobs/      (ab-jobs)      job types, handlers, worker runtime, cron
│   ├── testkit/   (ab-testkit)   app harness, factories, wiremock stubs (dev-dep only)
│   └── server/    (ashyq bin)    clap subcommands: serve | worker | migrate | openapi | admin
└── Dockerfile
```

Dependency edges (enforced by `Cargo.toml`; cycles are impossible):

```
core ◄─ db ◄─┬─ domain ◄─┬─ api ◄─┐
core ◄─ clients ─┘        ├─ jobs ◄┤─ server(bin)
                          └────────┘
testkit ─► {api, domain, db, clients}   (dev-dependency of all test suites)
```

Bounded contexts inside `ab-domain` (module per context, mirroring the legacy domains):

`identity` (users, sessions, rbac) · `org` (platform, usergroups) · `catalog`
(courses, chapters, activities, blocks, collections) · `progress` (trail,
activity/course progress) · `assessment` (authoring, items, policies, access) ·
`grading` (submissions, pipeline, gradebook, bulk actions, feedback) · `files`
(uploads, file-submissions) · `code` (judge0 runs) · `community` (discussions) ·
`certs` · `gamification` · `analytics` · `ai` (runs, agents, budget) · `search` ·
`work` (unified work queue) · `events` (domain event fan-out to jobs/SSE)

**Why layer crates, not context crates:** agents work in parallel on different
contexts; module-level separation inside `ab-domain` gives them disjoint files
(minimal merge conflicts) while keeping one `cargo check` unit for cross-context
type errors — which is where agents need the compiler most. Compile-time cost is
acceptable at this codebase size; revisit if clean-build minutes become the
bottleneck.

## 5. Error model — the single most important convention

One error enum in `ab-core`, used by **every** fallible function in db/clients/domain:

```rust
#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("{code}: {message}")]
    App { code: ErrorCode, message: String, details: Option<serde_json::Value> },
    #[error("validation failed")]
    Validation { field_errors: Vec<FieldError> },
    #[error(transparent)]
    Db(#[from] sqlx::Error),          // mapped to 500 unless a constraint we recognize
    #[error(transparent)]
    Redis(#[from] redis::RedisError),
    // … one transparent variant per infrastructure family
}
```

- `ErrorCode` is a **closed enum** (`#[non_exhaustive]` is forbidden here) with a
  stable kebab-case wire code and a canonical HTTP status:
  `not-found`, `forbidden`, `conflict`, `rate-limited`, `assessment-closed`,
  `attempt-limit-reached`, `upload-expired`, `ai-budget-exhausted`, …
  New codes are added in one file (`ab-core/src/error/code.rs`); a unit test
  snapshots the full registry so additions are visible in diffs, and the OpenAPI
  document publishes the registry as an enum schema.
- Wire format: **RFC 9457 `application/problem+json`**, extended:

```json
{
  "type": "https://docs.ashyq.example/errors/attempt-limit-reached",
  "status": 409,
  "code": "attempt-limit-reached",
  "title": "Attempt limit reached",
  "detail": "…english, developer-facing…",
  "field_errors": [{ "field": "items[3].answer", "code": "required", "message": "…" }],
  "request_id": "0198c0ae-…",
  "trace_id": "4bf92f35…"
}
```

- **All messages are English.** The frontend translates from `code` /
  `field_errors[].code` (this retires the hardcoded-Russian problem). The error-code
  registry doubles as the i18n key list; a repo script syncs it into the web app's
  message catalogs, and a web-side test fails if a code lacks translations.
- `IntoResponse` is implemented **once**, in `ab-api::error`. Handlers return
  `Result<T, ab_core::Error>` — they never construct responses from errors.
- Internal variants (`Db`, `Redis`, …) render as an opaque 500 with `request_id`;
  full detail goes to tracing. Constraint violations we recognize (unique, FK)
  map to `conflict` with the offending field where derivable.
- Panics are a bug by definition: `unwrap`/`expect`/`panic!`/`todo!` are
  **denied by workspace lints** outside `#[cfg(test)]`. `tower-http` `CatchPanicLayer`
  is the airbag, not the seatbelt.

## 6. API design (`/api/v2`)

- Base path `/api/v2`, OpenAPI 3.1 generated by `utoipa` from the same registrations
  that mount routes (`utoipa-axum` `OpenApiRouter` + `routes!`). **A route cannot
  exist without a documented operation and typed response** — this is the Rust
  equivalent of the legacy `StrictAPIRoute` guarantee, but compile-time.
- `ashyq openapi > openapi.v2.json` is the contract artifact. The web app's Orval
  pipeline points at it (client regen is a build step, §15). CI snapshots the doc
  with `insta` — every contract change is visible in the diff — and runs `oasdiff`
  to label breaking changes.
- Resources: plural kebab-case paths, UUIDv7 ids, flat where possible
  (`/courses/{id}`, `/assessments/{id}/items`, `/submissions/{id}`).
- **Inputs**: `#[serde(deny_unknown_fields)]` DTOs + `garde` rules, enforced by a
  `Valid<Json<T>>` extractor that emits `Validation` errors with per-field codes.
- **Outputs**: dedicated response DTOs (`ToSchema`), never DB rows directly.
  Serialization of DB row types in `ab-api` is prevented by convention + review
  gate: response DTOs live in `ab-api::dto` and derive `ToSchema`; `ab-db` row
  structs do not derive `Serialize`.
- **Pagination**: keyset only, opaque `cursor` (URL-safe base64 of the key tuple),
  `limit` capped server-side; response shape `{ "items": [...], "next_cursor": "…" }`.
  No offset pagination anywhere (the legacy gradebook cursor pattern generalizes).
- **Idempotency**: mutating POSTs that clients may retry (submission submit, upload
  finalize, enrollment) accept `Idempotency-Key`; keys + response digests are stored
  in Postgres with 24h TTL sweep.
- **SSE**: `axum::response::Sse` + `async-stream`. Event log per stream in
  **Redis Streams** (`XADD` with `MAXLEN ~ 1024`), `Last-Event-ID` resumes via
  `XRANGE` — replay is native, no custom event-log code like the legacy version.
  25s keepalive comments; per-user concurrent-connection cap (Redis counter,
  limit 5) as today. Streams: grading feedback per submission, AI run events per run.
- **Uploads**: direct-to-RustFS via presigned multipart URLs (§11). The API never
  proxies file bytes except avatars/thumbnails (< 1 MB direct multipart).
- Middleware stack (order matters): request-id → trace → timeout(30s) →
  compression → body-limit → CORS → governor (auth-sensitive routes) → CSRF guard
  (reject cross-site `Sec-Fetch-Site` on mutations, mirror of legacy behavior) →
  session extractor.

## 7. Authentication & authorization

### Zitadel (self-hosted, compose service)

- Zitadel v3, own database `zitadel` in the shared Postgres cluster (own role, no
  grants on the app DB). Masterkey and service PAT live in `.env`.
- **Zitadel owns**: credentials, password policy & hashing, TOTP, passkeys/WebAuthn,
  Google IdP, email verification, lockout/brute-force protection, and (future)
  university SAML/OIDC federation. **We own**: sessions (BFF), RBAC, user profile.
- Provisioning is code, not clicks: `ashyq admin zitadel-setup` (idempotent) creates
  the org, project, machine user for the API, Google IdP config, custom texts
  (ru/kk/en), and writes the resulting ids into the app DB `platform` row. Runs in
  dev, CI, and prod identically. **No manual Zitadel console steps are ever required
  or documented** — if it isn't in `zitadel-setup`, it doesn't exist.

### Login flow — custom UI, headless Zitadel (Session API v2)

The Next.js login page stays ours (restyled as needed). The browser only ever talks
to our API; our API drives Zitadel:

```
POST /api/v2/auth/login {login, password}
  └► zitadel: create session + password check
      ├─ ok, no MFA        ─► issue ab_session cookie
      ├─ MFA required      ─► 401 code=mfa-required {challenge…}
      │    POST /api/v2/auth/mfa {totp|webauthn assertion} ─► verify via session API ─► cookie
      └─ bad credentials   ─► 401 code=invalid-credentials (uniform timing)
GET  /api/v2/auth/google  ─► 302 to Zitadel IdP intent (Google)
     …Google… ─► Zitadel ─► GET /api/v2/auth/google/callback?intent=…&token=…
  └► retrieve intent, find-or-create user + idp link ─► cookie ─► redirect to app
POST /api/v2/auth/logout  ─► kill our session + zitadel session
```

No OIDC token dance in the first-party hot path — the Session API is the documented
pattern for "build your own login UI", and we don't need tokens no third party will
ever see. OIDC stays available on the same Zitadel for future federation.

### Sessions — BFF cookie (unchanged posture, simplified mechanics)

- Single httponly cookie `ab_session` (`Secure`, `SameSite=Lax`, host-only), opaque
  128-bit random id. Server-side record in Redis: user id, zitadel user/session ids,
  rbac version, created/last-seen, ip/ua summary.
- Sliding idle timeout **14 days**, absolute cap **90 days**, `MAX_SESSIONS_PER_USER=10`
  (oldest evicted), instant revocation (delete key), session list + revoke endpoints.
  The legacy access/refresh two-cookie rotation machinery is retired — it existed
  because JWTs were stateless; a server-side session needs none of it.
- Session fixation: id rotates on login and privilege change. CSRF: SameSite=Lax +
  `Sec-Fetch-Site`/`Origin` checks on mutations (as today).
- Frontend impact: the `/api/auth/refresh` Next route-handler bridge and 401
  single-flight refresh logic are **deleted**, not ported.

### RBAC — ours, in Postgres

- The `resource:action:scope` permission model ports as-is (it's good): typed
  `Permission { resource: Resource, action: Action, scope: Scope }` in `ab-core`,
  parsed/validated at boot from the DB, wildcard `*` supported.
- Role → permission assignments and the six roles (admin, maintainer, instructor,
  moderator, user, guest) are seeded by migration. Display names become i18n keys
  (fixes hardcoded Russian).
- Enforcement lives in **`ab-domain`**, not handlers: every domain service method
  takes an `Actor` (id + permission set + rbac version) and calls
  `actor.require(perm)?` / ownership checks before touching data. Handlers cannot
  "forget" a check that the service demands. A testkit helper asserts every
  mutating endpoint returns 403 for a permissionless actor (table-driven test over
  the OpenAPI route list — new endpoints fail this test until covered).
- Permission set cached in the session record; `rbac_version` on the user row
  invalidates sessions on role change.

## 8. Data layer

### Schema — redesigned (Q13: "clean up"), UUIDv7 everywhere (Q14)

Fresh migration set for a new database `ashyq`. The legacy schema is the *reference*,
not the template. Redesign rules:

1. **Every table**: `id uuid PRIMARY KEY DEFAULT uuidv7()` (Postgres 18 native),
   `created_at timestamptz NOT NULL DEFAULT now()`, `updated_at` maintained by a
   single shared trigger. The legacy int-PK + parallel ULID/UUID columns collapse
   into one key; ETL maintains the mapping (MIGRATION.md).
2. Naming: `snake_case`, plural table names, `*_id` FKs, no abbreviations.
3. **Enums**: `text` + `CHECK` constraint (mirrored by a Rust enum with
   `#[derive(sqlx::Type)]`); native PG enums are avoided (painful migrations).
4. **JSONB policy**: JSONB is allowed only for genuinely polymorphic payloads —
   assessment item bodies, submission answers/snapshots, activity block content,
   AI event payloads. Each JSONB column maps to a versioned, internally-tagged
   serde enum (`#[serde(tag = "type")]`) with a `schema_version` field, and gets a
   round-trip test (legacy sample fixtures → parse → serialize). Everything the
   legacy schema stuffed into JSON for convenience (settings scalars, flags) is
   normalized into columns. The 52 legacy JSON columns are triaged per-table in
   the ETL spec.
5. FKs always explicit with deliberate `ON DELETE` (mostly `RESTRICT`; `CASCADE`
   only for owned children like items/blocks). No soft-delete convention; archival
   is a domain status where the domain needs it (courses, assessments).
6. Full-text search: `tsvector` **generated stored columns** + GIN (legacy built
   vectors in queries); `document_chunks` keeps pgvector `vector` + HNSW.
7. Optimistic concurrency where the legacy had it (submission version counters):
   single `version bigint` bumped via `UPDATE … WHERE version = $n` (409 on miss),
   replacing the legacy's six parallel counters with per-column-family versions
   only where genuinely concurrent (grading vs. draft).

### SQLx usage

- `query!` / `query_as!` (compile-time checked) for all static SQL. Offline cache
  `.sqlx/` is committed; CI runs `cargo sqlx prepare --check` — a query that
  doesn't match the schema **fails the build**, which is exactly the
  error-as-early-as-possible property we want for agents.
- Dynamic SQL (filter builders for analytics/search) uses `QueryBuilder`; raw
  runtime strings require `AssertSqlSafe` (sqlx 0.9) which is grep-gated in review —
  each use carries a `// SAFETY:` comment.
- sqlx 0.9 gotchas (from the suggestions doc, verified): `Transaction` no longer
  implements `Executor` — pass `&mut *tx`; `impl SqlSafeStr` on query fns.
- Transactions: domain services own transaction boundaries via a `Tx` helper
  (`ab-db::tx(pool, |tx| async { … })`); handlers never see transactions.
- Migrations: `sqlx migrate` embedded via `migrate!()`; `ashyq migrate` runs them
  explicitly (compose `migrate` service pattern is kept — never auto-run on boot).
  Migration files are append-only after they land on `rewrite`.

## 9. Background jobs (`ab-db::queue` + `ab-jobs`)

```sql
CREATE TABLE jobs (
  id           uuid PRIMARY KEY DEFAULT uuidv7(),
  kind         text NOT NULL,
  payload      jsonb NOT NULL,
  status       text NOT NULL DEFAULT 'queued',    -- queued|running|succeeded|failed|dead
  priority     smallint NOT NULL DEFAULT 0,
  run_at       timestamptz NOT NULL DEFAULT now(),
  attempts     int NOT NULL DEFAULT 0,
  max_attempts int NOT NULL DEFAULT 5,
  dedupe_key   text UNIQUE,
  locked_by    text, locked_at timestamptz, heartbeat_at timestamptz,
  last_error   text,
  created_at   timestamptz NOT NULL DEFAULT now()
);
```

- **Enqueue is an INSERT in the caller's transaction** — a grade publish and its
  audit/XP/email jobs commit or roll back together (no outbox needed).
- Claim: `FOR UPDATE SKIP LOCKED` batch; wakeup via `LISTEN/NOTIFY` with 1s poll
  fallback; heartbeat every 15s; a reaper requeues `running` jobs with stale
  heartbeats; exponential backoff with jitter; after `max_attempts` → `dead` with
  `last_error`, surfaced via admin endpoints + a queue-depth gauge (alerting).
- Handlers are registered in `ab-jobs` with a typed payload
  (`impl Job for XpAwardJob { const KIND: &str = "xp:award"; type Payload = …; }`);
  an integration test asserts every `Job::KIND` has a registered handler and
  every enqueue site uses a declared kind (no stringly-typed drift).
- Cron: `job_schedules` table (kind, cron expr, next_run_at); the worker holding a
  Postgres advisory lock is the leader and enqueues due jobs. Replaces
  taskiq-scheduler; ports the four legacy schedules (assessment auto-publish */2,
  assessment timer sweep, orphan-upload reaper, plagiarism sweep → stubbed
  disabled per Q4).
- Graceful shutdown: `CancellationToken` → stop claiming, finish in-flight,
  heartbeat until done (compose `stop_grace_period` sized accordingly).

## 10. Redis usage map

| Use | Structure | Notes |
|---|---|---|
| Sessions | `session:{id}` JSON + `user_sessions:{uid}` zset | as legacy, simplified record |
| SSE event logs | Redis Streams `sse:grading:{submission}` / `sse:ai:{run}` | `MAXLEN ~1024`, replay via `XRANGE` |
| SSE connection caps | `INCR`/`DECR` counters with TTL | limit 5/user |
| Rate limits | sliding-window counters | tower_governor covers IP; Redis covers per-user/per-feature (AI hourly caps) |
| Hot caches (L2) | plain keys, short TTL | only where multi-process coherence matters; else moka |

Redis stays single-instance, no auth change needed inside `data-net` (but see
FINDINGS #2 for the host-port exposure). Locks use Postgres advisory locks, not
Redis — one source of truth for coordination.

## 11. Object storage — RustFS (Q15)

- `rustfs` compose service (S3-compatible, Apache-2.0, Rust) with volume
  `rustfs_data`; accessed exclusively through the `object_store` crate → moving to
  R2/S3/MinIO later is config, not code.
- Buckets: `public` (course thumbnails, avatars, block media — served read-only via
  nginx `/content/*` proxy with immutable cache headers, replacing the FastAPI
  StaticFiles mount) and `private` (file submissions, exports, AI artifacts —
  presigned GET only, short TTL).
- Upload flow (replaces both legacy chunked-upload systems):
  1. `POST /api/v2/uploads` (intent: size, mime, sha256, purpose) → server validates
     policy (size caps, mime allowlist per purpose — port of `file_validation.py`)
     → creates `uploads` row (`pending`) → returns presigned multipart part URLs.
  2. Client PUTs parts directly to RustFS (nginx-routed, body never touches Axum).
  3. `POST /api/v2/uploads/{id}/finalize` → server completes multipart, verifies
     size + sha256 via object HEAD, marks `finalized`.
  4. Reference counting as legacy (`referenced_count`), orphan reaper cron deletes
     unreferenced finalized uploads after 24h, abandoned pending after 1h.
- ETL copies `content/` (~181 MB) into buckets with a key map (MIGRATION.md).

## 12. AI subsystem (Q21: full port, rig-core)

- `ab-clients::llm`: rig-core providers (OpenAI primary `gpt-5.6-luna`, OpenRouter
  fallback) behind our `LlmClient` facade; provider/model/fallback chain is pure
  config. rig types do not leak past this module (the one-file-diff firewall from
  the suggestions doc, made a compile-visible rule: `ab-domain` has no `rig` dep).
- `ab-domain::ai`: ports the durable run model as-is conceptually — tables
  `ai_threads`, `ai_runs`, `ai_events`, `ai_artifacts`, `ai_evidence`,
  `ai_approvals`, `ai_eval_results` (+ analysis/QA/memory tables). Run lifecycle is
  an explicit state machine (`queued → running → {succeeded, failed, aborted}`)
  with every transition a guarded UPDATE (`WHERE status = $expected`) — no
  ambient state.
- Execution: `ai:execute_run` job in the worker; events are appended to Postgres
  (durable) and mirrored to the run's Redis Stream (live SSE tail). Cancellation:
  status flip + `CancellationToken` checked between steps; LLM calls have hard
  timeouts and are recorded as run events (journaled steps — the durability rule
  from the suggestions doc).
- The six agents port 1:1 (course_analyst, course_qa, lecture_author,
  remediation_generator, study_companion, submission_analyst): system prompts and
  tool schemas are extracted from the Python source verbatim first, then idiomized.
  Streaming QA/companion use rig streaming → SSE chunks.
- Budget: tiktoken-rs counting, monthly ledger table, per-user hourly rate limits
  in Redis (ports `AIConfig` semantics); `ai-budget-exhausted` error code.
- Evals: `ai_eval_results` retained; `ashyq admin ai-eval` runs the fixture suite
  against live providers (manual/cron, not CI).

## 13. Observability

- `tracing` everywhere; JSON logs in prod, pretty in dev. `tracing-opentelemetry` +
  OTLP exporter → **Logfire** (Q30). Resource attrs: service.name=`ashyq-server`,
  deployment env, git sha (baked at build via `vergen`).
- Spans: HTTP (tower-http TraceLayer with request-id + traceparent propagation —
  same header contract the web app already sends), every domain service method
  (`#[tracing::instrument]`), every job execution (linked to enqueueing trace),
  every LLM call (model, token counts as attrs — GenAI semconv via rig's OTel
  support), slow SQL (> 300ms warn, porting the legacy listener via sqlx's
  statement logging).
- Metrics (OTLP): request histograms, job queue depth/lag, SSE connections, LLM
  token spend, upload bytes. Logfire dashboards + alerts are provisioned as part
  of the cutover checklist (FINDINGS #9: verify delivery, currently empty project).
- `/api/v2/health` (liveness: process up) and `/api/v2/health/ready` (readiness:
  PG + Redis + RustFS + Zitadel ping) — compose healthchecks point at these.

## 14. Testing & quality gates

Layered, all runnable via `just` (single source of truth; CI calls the same recipes):

| Layer | Tool | What it proves |
|---|---|---|
| Type/lint | `cargo clippy --all-targets -- -D warnings` (pedantic+nursery warn-promoted; unwrap/expect/panic/todo/dbg/print denied) | agent slop cannot land |
| Format | `cargo fmt --check` | |
| Query validity | `cargo sqlx prepare --check` | SQL matches schema at build time |
| Unit | nextest | pure domain logic |
| DB | `#[sqlx::test]` (per-test DB, auto-migrated) | queries, constraints, queue semantics |
| HTTP | testkit harness: real Axum app + test DB + wiremock for Zitadel/Judge0/Resend/LLM | handlers, auth, RBAC, error envelopes — asserted via `insta` snapshots with id/time redactions |
| Contract | `insta` snapshot of full OpenAPI doc + `oasdiff` label | every contract change visible in diff |
| RBAC sweep | table-driven test over route list | no unprotected mutating endpoint |
| Supply chain | `cargo-deny`, `cargo-machete` | advisories, licenses, dead deps |
| Coverage | `cargo-llvm-cov` | floor: 80% lines in `ab-domain`, 70% workspace (ratchet up, never down) |
| E2E | existing Playwright suite in `apps/web` (adapted in P9) | real browser against full compose stack |

**Testkit is a first-class deliverable** (`ab-testkit`): `TestApp::spawn()` boots the
full router against a fresh migrated DB with all external HTTP faked, returns a
typed client + hooks to mint sessions for any role, plus `fake`-based entity
factories (`factory::course()`, `factory::submission()`, …). Agents writing a
slice get a one-liner harness; expensive setup is amortized once.

Wiremock stubs live in testkit as **recorded-shape fixtures**: Zitadel Session API,
Judge0, Resend, OpenAI-compatible chat completions (incl. SSE streaming) — each
stub asserts request shape, not just returns canned data.

### CI (`.github/workflows/server-ci.yaml`)

Triggers on `rewrite` and `main`, paths `apps/server/**`. Ubuntu runner with
Postgres 18 (pgvector) + Redis services. Jobs: `fmt → clippy → sqlx-prepare-check →
nextest (unit+db+http) → deny+machete → coverage floor → openapi snapshot →
docker build`. Merge gate = green CI; agents commit directly to `rewrite` (Q25)
and treat a red pipeline as a stop-the-line event: **the branch must be green at
the end of every working session.**

## 15. Frontend impact (in scope, Q28)

- Orval source switches to `openapi.v2.json`; base path `/api/v2`; regenerated
  client replaces `src/lib/api/generated/**` wholesale. TanStack Query patterns,
  zod response validation, and the ofetch mutator survive with path/shape updates.
- Auth pages: login/signup/forgot/reset rework against the new BFF endpoints
  (`mfa-required` challenge flow, Google redirect via Zitadel intent). The
  `/api/auth/refresh` route handler, refresh single-flight, and cookie-bridge
  complexity are deleted.
- Error handling: map `problem+json.code` → i18n message catalogs (script-synced
  from the Rust error registry).
- nginx: `/api/v2 → server`, `/content/* → rustfs public bucket`, auth-path
  special-casing removed. (Template change ships with the cutover, not before.)

## 16. Configuration & secrets

- figment: embedded defaults → optional `config/dev.toml` (local only) → env
  `AB__SECTION__KEY` (nested `__`). Prod is env-only via compose `.env`, same
  operational model as today (`PLATFORM_*` becomes `AB__*`).
- All secrets are `secrecy::SecretString` — they cannot Debug/Display into a log.
- **Startup is fail-fast and loud**: config parses into typed structs with garde
  validation + posture checks (secure cookies required outside dev, CORS origin
  allowlist non-wildcard, Zitadel/RustFS reachable, migrations current). A
  misconfigured server refuses to start with a precise error, never limps.
- `ashyq admin config-check` prints the effective config with secrets redacted.

## 17. Known gotchas & risk register

| Risk | Mitigation |
|---|---|
| sqlx 0.9 API breaks (`&mut *tx`, `SqlSafeStr`) | documented in AGENTS.md; clippy + compile errors catch misuse |
| `query!` needs DB or `.sqlx` cache | `.sqlx` committed; `just prepare` after any SQL change; CI `--check` |
| jiff-sqlx maturity | jiff types only at the db/api edges via a `ab_core::time` module; if jiff-sqlx stalls, swap the edge impls |
| rig-core moves fast (0.x) | confined to `ab-clients::llm`; upgrade = one-file diff by construction |
| RustFS is young (2025-era project) | accessed only via `object_store` S3 API; fallback to MinIO/R2 is a compose+env change; backups cover the volume |
| Zitadel session API coupling | confined to `ab-clients::zitadel`; wiremock fixtures pin the wire contract; Zitadel pinned to a specific minor, upgraded deliberately |
| Hand-rolled queue correctness | property-style tests (concurrent claim, crash-requeue, backoff), soak test in P0 exit gate |
| Windows dev machine w/o local Docker in some sessions | all DB-dependent tests skippable locally (`just test-unit`), full suite in CI; `.sqlx` cache keeps builds green without a DB |
| Agent drift across sessions | AGENTS.md + EXECUTION-PLAN.md status table are the durable memory; every session ends with both updated |
