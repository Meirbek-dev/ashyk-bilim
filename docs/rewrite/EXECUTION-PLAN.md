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
| 1.7 | Users domain: profiles, preferences/locale, avatars (small direct upload), admin user management ∥ | in-progress (GET/PATCH /users/me with locale validation + permission gate; avatars → 2.2 storage, admin management → with 1.8) |
| 1.8 | RBAC engine + role admin endpoints + usergroups (org context) ∥ | in-progress (role listing + assign/unassign with rbac_version bump and live-session grant propagation, tested end-to-end; remaining: custom role CRUD, role-permission editing, usergroups, legacy matching-semantics verification vs rbac.py) |

### P2 — Catalog & storage
| # | Slice | Status |
|---|---|---|
| 2.1 | Migrations: platform, courses, chapters, activities, blocks, collections, authors | done (full legacy inventory extracted; redesign fixes: jsonb/text[] instead of JSON-in-varchar, DB-enforced type↔subtype pairs, blocks→activity NOT NULL, dedup'd collection membership, single reactions table, unique certificate issuance, exactly-one-target authorship, 'simple' FTS for ru/kk; 7 integrity tests) |
| 2.2 | `ab-clients::storage` + uploads pipeline | in-progress (storage client done: presigned PUT/GET, head/put/delete, health — 3 tests against LIVE RustFS 1.0.0-rc.1, CI gains a rustfs service; simplification: single presigned PUT instead of multipart — media sizes don't need it, revisit if they do. Remaining: uploads table + domain service + endpoints + reaper cron) |
| 2.3 | Courses/chapters/activities CRUD + ordering + publish states ∥ | todo |
| 2.4 | Blocks (typed content enums: image/pdf/video) + activity content model ∥ | todo |
| 2.5 | Collections + platform settings + course updates (changelog) ∥ | todo |
| 2.6 | Public catalog read endpoints (browse/search-lite) + nginx /content contract | todo |

### P3 — Assessments
| # | Slice | Status |
|---|---|---|
| 3.1 | Migrations: assessments, items (tagged bodies), policies, overrides, access lists | todo |
| 3.2 | Authoring CRUD + item type enums (choice/open-text/form/code/matching) + readiness checks | todo |
| 3.3 | Effective-policy resolution + scheduling (auto-publish cron) + duplication ∥ | todo |
| 3.4 | Access control (user/group allowlists) + student-facing views ∥ | todo |

### P4 — Submissions & grading
| # | Slice | Status |
|---|---|---|
| 4.1 | Migrations: submissions (snapshots, versions), grading entries, item feedback, bulk actions, audit events | todo |
| 4.2 | Submission lifecycle: start/draft/submit, attempt & time limits, timer sweep cron, idempotency | todo |
| 4.3 | Grading pipeline (validate→enforce→grade→penalize→persist→emit) + quiz grader | todo |
| 4.4 | Code grader via Judge0 client (circuit breaker, language caps) | todo |
| 4.5 | Teacher surface: gradebook (keyset), publish/release modes, returns, item feedback, CSV export ∥ | todo |
| 4.6 | Bulk actions + deadline extensions (jobs) ∥ | todo |
| 4.7 | Grading SSE (Redis Streams, Last-Event-ID, connection caps) | todo |

### P5 — Files & code arena
| # | Slice | Status |
|---|---|---|
| 5.1 | File-submission subsystem (attempts, files, signed downloads, bulk export) ∥ | todo |
| 5.2 | Code arena standalone runs (code_runs/cases, SSE-less polling as legacy) ∥ | todo |
| 5.3 | Judge0 startup patch port (`ashyq admin judge0-tune`, run-once semantics) | todo |

### P6 — Learning surface
| # | Slice | Status |
|---|---|---|
| 6.1 | Trail + activity/course progress ∥ | todo |
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
