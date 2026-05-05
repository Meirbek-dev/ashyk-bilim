# Fortification plan

## 🔒 Contract & Type Safety (Frontend ↔ Backend)

2. **`@hey-api/openapi-ts`** — Alternative to `openapi-typescript` that also generates typed SDK clients and React Query hooks in one shot
3. **Discriminated union responses** — Use `{ status: "ok", data: T } | { status: "error", error: E }` shapes everywhere; stops `undefined` from propagating silently
4. **`TypeBox`** — JSON Schema ↔ TypeScript type dual that lets you validate at runtime with the same definition you use for static types
6. **SQLModel `__table_args__` constraints** — Define `CheckConstraint`, `UniqueConstraint` at the DB level, not just in Python, so migrations carry them

---

## 🧪 Testing — Frontend

1. **MSW (Mock Service Worker) v2** — Intercept API calls in tests at the network level; your Vitest + Playwright tests share the same handlers
2. **Playwright component tests** — Test TipTap editor interactions, drag-and-drop , and modals in isolation
3. **`@tanstack/query` test utils** — `createQueryClient()` wrapper so React Query cache doesn't bleed between tests
4. **`next/vitest`** — Use the official Next.js Vitest plugin so RSC and App Router internals are mocked correctly
5. **Testing hooks in isolation** — Use `renderHook` from `@testing-library/react` for every custom hook; they're often where subtle bugs live

---

## 🧪 Testing — Backend

1. **`httpx.AsyncClient` + `ASGITransport`** — In-process FastAPI testing without a real server; much faster than spinning up uvicorn
2. **`factory_boy` + `Faker`** — Replace ad-hoc test fixtures with factories that generate valid SQLModel instances
3. **`pytest-postgresql` / `pytest-asyncpg`** — Ephemeral real Postgres per test session; never mock the DB layer
4. **`respx`** — Mock `httpx` calls (to OpenAI, Resend, etc.) at the transport level in tests
5. **`coverage.py` + `pytest-cov` branch coverage** — Enforce 80%+ branch coverage in CI, not just line coverage
6. **Property-based testing with `hypothesis`** — Generate random valid/invalid Pydantic inputs to find edge cases your unit tests miss
7. **`pytest-xdist`** — Parallel test execution; your test suite will slow down fast as the LMS grows
8. **`dirty-equals`** — Flexible equality helpers for asserting on partial response shapes without fragile exact matching
9. **Mutation testing with `mutmut`** — Verifies your tests actually catch bugs, not just exercise code paths

---

## 🔄 CI/CD & Automation

1. **`alembic check`** — Add to CI: fails if there are model changes without a corresponding migration file
2. **Docker layer caching in CI** — Cache pip/npm layers separately from app code; cuts build time by 60%+

---

## 📐 Static Analysis & Code Quality

1. **`pyright` (basic mode)** — Run alongside mypy; they catch different things, especially around SQLModel's dynamic typing
2. **`oxlint` + TypeScript strict** — You have both; make sure `tsconfig.json` has `"strict": true`, `"noUncheckedIndexedAccess": true`
4. **`depcheck`** — Complements knip; finds packages in `package.json` that are never actually imported

---

## 🗄️ Database Reliability

1. **`alembic-utils`** — Manage Postgres functions, triggers, and views in Alembic migrations; stops you from applying them manually
2. **Zero-downtime migration patterns** — Never rename a column directly; always add new → backfill → remove old across separate deploys
3. **`pgTAP`** — SQL-level unit tests for DB constraints, triggers, and RLS policies
4. **Row-level security (RLS)** — Enable Postgres RLS for tenant isolation in your LMS; enforce it at the DB level, not just in FastAPI
5. **`pg_stat_statements`** — Enable this extension and review slow queries weekly; the LMS query patterns (enrollments, progress) will surface N+1s fast
6. **`sqlalchemy-continuum`** — Audit trail / versioning for critical LMS tables (course content, grades)
9. **DB migration smoke test** — In CI, apply all migrations to a blank DB and then apply them to a snapshot of production schema; catches conflicts

---

## 🔍 Observability

1. **Structured logging with `structlog`** — Replace any `print()`/`logging.info()` calls with structlog; every log line gets request_id, user_id
2. **`sentry-sdk` (FastAPI + Next.js)** — Error tracking with full stack traces; pairs with Logfire for tracing vs. errors
3. **Prometheus + Grafana** — Expose a `/metrics` endpoint via `prometheus-fastapi-instrumentator`; track p95 latency per route
4. **Real User Monitoring** — Vercel Analytics or `@sentry/nextjs` browser tracing; LMS performance often degrades for students in low-bandwidth regions (relevant for Kazakhstan)
5. **Alerting rules** — Set alerts on: 5xx rate > 1%, p95 latency > 2s, DB connection pool > 80%, Redis memory > 70%
6. **`logfire` sampling** — Set trace sampling to 10% in production for high-volume routes but 100% for AI/payment routes
7. **`ddtrace` or `elastic-apm`** — If you move off Logfire, these are the most mature APM solutions for FastAPI

---

## 🛡️ Security & Auth

1. **ZITADEL token introspection caching** — Cache the JWKS keys with a TTL instead of fetching on every request; you have `cachetools`, use it
2. **`python-jose` → `joserfc`** — You already planned this; make sure JWT validation checks `aud`, `iss`, and `exp` explicitly
3. **Rate limiting per user, not per IP** — `slowapi` defaults to IP; for authenticated LMS routes, key on `user_id` to prevent account abuse
4. **`Content-Security-Policy` headers** — Critical for TipTap's rich content rendering; prevents XSS from student-submitted HTML
5. **`dompurify` server-side** — You have it on the frontend; also sanitize HTML on the backend before storing to DB
6. **`pip-audit` + `npm audit` in CI** — Fail the build on high-severity CVEs; run weekly even when code doesn't change
7. **Secrets scanning** — `gitleaks` or GitHub secret scanning; prevents API keys from being committed
8. **mTLS for internal services** — Between FastAPI and any internal microservices, use mutual TLS; not needed for Postgres but good for AI sidecars

---

## ⚡ Performance

1. **`@tanstack/react-query` `staleTime` discipline** — Set appropriate `staleTime` per query type; LMS course lists can be 5min stale, but quiz submissions should be `staleTime: 0`
2. **Next.js `unstable_cache`** — Cache expensive RSC data fetches (course catalog, enrollments) at the component level
3. **Redis cache warming** — Pre-populate course metadata cache on deploy so the first request after deployment doesn't hit the DB cold
4. **`arq` job deduplication** — For LMS background jobs (certificate generation, progress recalculation), use job IDs to prevent double-processing
5. **ISR (Incremental Static Regeneration)** — For course landing pages that are read-heavy and write-infrequently, use `revalidate` to serve cached HTML

---

## 🏗️ Architecture & Maintainability

1. **Feature flags with `growthbook` or `flagsmith`** — Deploy code dark, enable per-user; essential for LMS where you can't roll back a migration easily
3. **Domain-driven folder structure** — Organize by domain (`enrollment/`, `courses/`, `assessments/`) not by layer (`models/`, `routers/`, `services/`); scales much better
4. **`Result` type pattern** — In FastAPI service layer, return `Ok(value) | Err(error)` instead of raising exceptions; makes error paths explicit and testable
5. **Event sourcing for quiz/assessment state** — Store every answer attempt as an immutable event, not just the latest state; enables replay, audit, and analytics
6. **`celery` → `arq` migration** — You have `arq`; make sure it's actually used for all async work (email, AI pipeline, PDF generation) and nothing is blocking the event loop
7. **Changelog automation** — `conventional-commits` + `semantic-release`; auto-generates CHANGELOG.md and bumps version on merge; makes it clear what changed between deploys
8. **Load testing with `locust`** — Simulate 500 concurrent students taking a quiz simultaneously before any major exam-period feature ships; LMS traffic is extremely spiky

---

## Priority Order if You're Starting From Zero

The single highest ROI sequence for stopping the "buggy mess" today: **mypy strict (50) → MSW + contract tests (12, 5) → `alembic check` in CI (39) → structured logging (62) → feature flags (91)**. That sequence alone will surface and contain 80% of the classes of bugs that plague LMS projects.
