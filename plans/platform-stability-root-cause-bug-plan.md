# Platform Stability Root-Cause Bug Plan

Date: 2026-06-21

## Scope

This plan covers the whole current monorepo: the Next.js web app in `apps/web`, the FastAPI backend in `apps/api`, the contract generation workflow, Vite+/Turbo/Bun tooling, auth/session behavior, assessment workflows, storage/caching, and release validation.

The goal is not to patch individual symptoms one by one. The goal is to remove the root causes that make the platform buggy, error prone, and unstable.

## Audit Method

I used the project instructions in `AGENTS.md` and `C:\Users\bmk\.codex\RTK.md`, installed dependencies with Vite+, ran the main validation commands, inspected critical frontend/backend runtime paths, and searched for instability patterns such as duplicate auth refresh logic, direct fetch bypasses, broad exception handling, type suppressions, TODO-backed UI, local storage persistence, and unsafe HTML insertion surfaces.

This document lists all currently observable bug classes from the audit. It should become a living stability backlog: every new production error should either map to one of these root causes or add a new one with evidence.

## Validation Baseline

| Command                                          | Result                                                                              | Stability meaning                                                                                                    |
| ------------------------------------------------ | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `vp install`                                     | Passed, no dependency changes                                                       | Dependencies are installed, but the lockfile still contains conflicting tool versions.                               |
| `vp check`                                       | Failed on formatting in 7 files                                                     | Main quality gate stops at formatting and does not reach lint/type/test.                                             |
| `vp test`                                        | Failed before test execution                                                        | Web unit tests cannot run because `vitest` resolves to `@voidzero-dev/vite-plus-test@0.1.24` without a `vitest` bin. |
| `bun run --cwd apps/web test`                    | Same failure as `vp test`                                                           | Web test suite is effectively disabled.                                                                              |
| `bun run checktypes`                             | Passed                                                                              | Next route type generation and `tsgo --noEmit` currently pass.                                                       |
| `bun run --cwd apps/web build`                   | Passed                                                                              | The web app itself compiles and prerenders.                                                                          |
| `vp build`                                       | Failed: root Vite build cannot find `index.html`                                    | Vite+ build command is miswired for this monorepo.                                                                   |
| `bun run build`                                  | Next build succeeded, then exited 9 after a Rust process tried to allocate ~13.9 GB | Root production build orchestration is not reliable.                                                                 |
| `uv run ruff check src`                          | Passed                                                                              | Backend lint is clean under current Ruff rules.                                                                      |
| `uv run pytest -q`                               | 185 passed, 3 warnings                                                              | Backend tests pass, but warnings reveal deprecated Starlette status constants and SQLite/Postgres behavior drift.    |
| `uv run mypy src`                                | Failed: 32 errors in 5 files                                                        | Strict backend type safety is not enforced by the passing default gate.                                              |
| `uv run basedpyright .`                          | Failed: 11 errors                                                                   | AI event contract typing is invalid under pyright.                                                                   |
| `uv run pyrefly check`                           | Failed: 8 errors                                                                    | Additional strict type drift exists in assessment/grading code and tests.                                            |
| `uv run python scripts/lint_response_models.py`  | Passed                                                                              | JSON routes mostly declare response models.                                                                          |
| `uv run python scripts/check_migration_graph.py` | Passed: 1 head, no missing down revisions                                           | Migration graph is currently coherent.                                                                               |
| `bun run --cwd apps/web check:contracts`         | Passed                                                                              | Existing generated TS schema is up to date against committed API schema.                                             |
| `bun run check:contracts`                        | Failed during `openapi-typescript`                                                  | Full contract regeneration is broken under current Node/TypeScript dependency resolution.                            |

## Root-Cause Map

1. Validation gates are fragmented and misleading.
   The project has many strong checks, but the default commands do not run them coherently. Some gates fail before reaching meaningful checks; other important checks are not part of the normal pass/fail path.

2. Toolchain versions are internally inconsistent. (Don't change anything there. It's supposed to be like that for now)
   `vite-plus` is installed at `0.2.1`, but the root `vitest` catalog resolves to `@voidzero-dev/vite-plus-test@0.1.24`. The web app depends on TypeScript `7.0.1-rc`, while `openapi-typescript` pulls TypeScript `6.0.3` and crashes with package export resolution under Node 26.

3. Auth/session refresh is still split across multiple clients.
   `apiFetch` has single-flight refresh logic, but React Query still performs an independent hard navigation to `/api/auth/refresh`. Global session loading also calls `getSession()` from every localized layout render.

4. Type contracts are not a real release gate.
   Backend mypy, pyright, and pyrefly all fail. Contract generation can fail even when existing generated artifacts appear fresh. This permits drift in the highest-risk code: AI streams, assessments, grading, JSON payloads, and generated frontend API types.

5. Assessment state has local resilience bugs.
   Assessment draft/submission code handles concurrency and offline recovery, but still contains browser compatibility bugs and silent persistence loss paths.

6. Network behavior is not fully centralized.
   Most services use `apiFetch`, but some critical paths use raw `fetch`, including AI streaming and certificate export paths. That bypasses shared timeout, auth refresh, request metadata, and error handling behavior.

7. Backend services hide too many failures behind broad exception handlers.
   Some broad `except Exception` handlers are appropriate for background jobs or best-effort audit writes, but many service paths catch broad exceptions without typed recovery semantics. This makes production failures harder to diagnose and can convert real bugs into generic responses.

8. Security-sensitive surfaces exist without a central audit harness.
   There are multiple `dangerouslySetInnerHTML` sites, direct cookie writes, iframe/embed rendering, upload paths, and local/session storage persistence paths. Some are intentionally sanitized, but they need one shared policy and regression tests.

## Confirmed Bugs And Failure Points

### P0: Web Unit Tests Cannot Run

Evidence:

- `vp test` and `bun run --cwd apps/web test` both fail before assertions run.
- `package.json` maps `vitest` through the Vite+ catalog.
- `bun.lock` resolves `vitest` to `@voidzero-dev/vite-plus-test@0.1.24`, which has no `vitest` bin entry.

Impact:

- Frontend regressions are not being caught.
- Existing `src/tests/**/*.test.{ts,tsx}` coverage is not a release signal.

Root fix:

- Make `vp test run` resolve the same Vite+/Vitest stack as local `vite-plus@0.2.1`.
- Remove the stale `vitest` catalog override or pin it to a package that exposes the expected binary.
- Add a minimal CI smoke check that fails if test discovery is zero or the test runner exits before executing tests.

### P0: Full Contract Generation Is Broken

Evidence:

- `bun run check:contracts` writes `apps/api/openapi.json`, then fails in `openapi-typescript` with `ERR_PACKAGE_PATH_NOT_EXPORTED`.
- The failure comes from `openapi-typescript` importing TypeScript through a package export shape incompatible with the current install.

Impact:

- API and frontend types can drift.
- Reviewing committed generated artifacts is not enough because the regeneration workflow itself is broken.

Root fix:

- Pin a known-compatible TypeScript and Node combination for contract generation.
- Run contract generation in a hermetic script that uses one TypeScript version.
- Make `check:contracts` fail only after verifying generated files are unchanged, not after partially rewriting one artifact.

### P0: Root Production Build Is Unreliable

Evidence:

- `bun run --cwd apps/web build` succeeds.
- `bun run build` runs Turbo, reports the web build successful, then exits 9 after a Rust memory allocation of about 13.9 GB fails.
- `vp build` is also wrong for the repo because it tries to build a root Vite `index.html`.

Impact:

- Release builds can fail even when the app builds.
- Developers cannot trust root commands.

Root fix:

- Decide the official production build command: likely `bun run build` via Turbo.
- Fix Turbo/Vite+ command routing so `vp build` delegates to the workspace build task or is explicitly documented as unsupported.
- Investigate the post-build Rust allocation path with `RUST_BACKTRACE=1` and Turbo/Vite+ cache settings.
- Add `apps/web` direct build and root build as separate CI checks until the root build is reliable.

### P0: Backend Strict Type Gates Fail

Evidence:

- `mypy` reports 32 errors in AI and assessment code.
- `basedpyright` reports 11 errors in `apps/api/src/services/ai/contracts/events.py`.
- `pyrefly` reports 8 errors in assessment/grading code and tests.

Important files:

- `apps/api/src/services/ai/contracts/events.py`
- `apps/api/src/services/ai/evals.py`
- `apps/api/src/services/ai/artifact_agents.py`
- `apps/api/src/services/assessments/_shared.py`
- `apps/api/src/services/assessments/settings.py`

Impact:

- AI stream contracts and assessment policy serialization can drift without failing the default gate.
- Some errors point at real JSON shape and enum correctness issues, not just type checker noise.

Root fix:

- Make one backend type checker authoritative for merge blocking, then use the others as advisory until clean.
- Fix the AI event contract by using discriminated union models that do not override mutable `type: str` with narrower mutable literals.
- Fix JSON helper signatures to accept `Mapping[str, JsonValue]` or structured DTOs instead of invariant `dict[str, object]`.
- Remove stale pyright/mypy suppressions once structural SQLModel false positives are isolated behind typed repository helpers.

### P0: Auth Refresh Still Has Competing Paths

Evidence:

- `apps/web/src/lib/api-client.ts` implements single-flight browser refresh.
- `apps/web/src/lib/react-query/queryClient.ts` independently redirects to `/api/auth/refresh` on query/mutation 401.
- `apps/web/src/app/api/auth/refresh/route.ts` supports JSON refresh and navigation refresh.
- Backend refresh rotation grace exists in `apps/api/src/services/auth/sessions.py`, but frontend duplicate refresh navigation can still disrupt user state.

Impact:

- Parallel 401s can still cause hard navigations, lost form state, or refresh loops.
- Auth behavior differs depending on whether the error was thrown by `apiFetch` or surfaced through React Query.

Root fix:

- Remove refresh navigation from React Query global error handlers.
- Expose one shared `refreshSessionOnce()` client helper from the API client/auth layer.
- Let query/mutation failures trigger retry through the API client, not by changing `window.location`.
- Add tests for two concurrent 401 responses from queries and mutations.

### P1: Global Session Fetch Makes Every Localized Page Fragile

Evidence:

- `apps/web/src/app/[locale]/layout.tsx` calls `getSession()` for every localized route.
- `getSession()` reads cookies, may redirect to refresh, and calls backend `auth/me`.

Impact:

- Public pages inherit auth/backend fragility.
- Anonymous traffic can pay an unnecessary backend session check.
- A backend auth outage can degrade unrelated public content.

Root fix:

- Split public and protected route providers.
- Keep i18n/theme in `[locale]/layout.tsx`.
- Move required session loading into protected layouts such as `/dash`, `/editor`, `/assessments`, admin, analytics, and account settings.
- Public pages that need optional personalization should request session locally and tolerate `null`.

### P1: Assessment Clone Fallback Is Broken

Evidence:

- In `apps/web/src/features/assessments/hooks/useAssessmentSubmission.ts`, `cloneAnswers()` checks for `structuredClone`, but the fallback branch calls `structuredClone()` again.

Impact:

- Older browsers or runtimes without `structuredClone` still crash.
- This can break assessment save/submit conflict handling exactly when recovery is needed.

Root fix:

- Introduce a shared `safeCloneJson<T>()` helper for JSON-compatible data.
- Use `structuredClone` when available; fall back to `JSON.parse(JSON.stringify(value))` for validated JSON-only values.
- Add browser compatibility tests for the fallback path.

### P1: Local Persistence Can Silently Drop Critical Assessment Drafts

Evidence:

- `apps/web/src/features/assessments/shell/hooks/useAssessmentAttempt.ts` stores answers in `localStorage`.
- On quota failure after purge, it silently drops the draft.

Impact:

- Students can lose answers without a visible recovery signal.
- Operators will not see telemetry for local persistence failures.

Root fix:

- Treat browser persistence as a secondary cache, not the source of truth.
- Prefer server-side draft autosave for authenticated attempts.
- Surface a non-blocking but visible warning when local persistence fails.
- Emit client telemetry for quota/unavailable storage.

### P1: Raw Fetch Bypasses Shared Network Policy

Evidence:

- `apps/web/src/services/ai/activity-chat-adapter.ts` calls `fetch()` directly for AI streaming.
- `apps/web/src/services/courses/certifications.ts` also has a raw fetch path.
- `apps/web/src/lib/cache/revalidate.ts` performs raw fallback fetches.

Impact:

- Timeout behavior, auth refresh, request IDs, locale headers, error envelopes, and login redirects are inconsistent.
- Streaming endpoints may be justified, but they need an explicit shared streaming client.

Root fix:

- Create `apiStreamFetch()` for SSE/streaming endpoints.
- Create `apiBlobFetch()` for downloads/exports.
- Block new direct frontend `fetch()` calls outside approved wrappers.
- Add lint or static check exceptions for approved files only.

### P1: Forwarded Headers Are Labeled Trusted Without Validation

Evidence:

- `apps/web/src/lib/auth/server-auth-fetch.ts` has `buildTrustedForwardedHeaders()`.
- It forwards `x-forwarded-for`, `x-forwarded-host`, and `x-forwarded-proto` from the incoming request or host header.

Impact:

- The function name implies trust, but the code mostly copies headers.
- If hosting does not strip spoofed forwarded headers, audit metadata and downstream auth context can be polluted.

Root fix:

- Rename the helper to `buildForwardedMetadataHeaders()` unless actual validation is added.
- Only trust forwarded headers from a configured reverse proxy boundary.
- Prefer same-origin relative redirects in frontend auth code.
- Add tests with hostile `x-forwarded-host` and `x-forwarded-proto`.

### P1: Broad Backend Exception Handling Reduces Diagnosability

Evidence:

- Static scans found broad `except Exception` in auth, Redis, AI, assessment, course, grading, upload, worker, and utility modules.
- Some handlers log warnings without structured error codes; others convert unknown failures into generic behavior.

Impact:

- Production telemetry cannot reliably distinguish expected external failures from code bugs.
- Retrying or swallowing unknown exceptions can corrupt workflows.

Root fix:

- Classify broad catches into allowed categories: boundary cleanup, background best effort, external service fallback, and true bug.
- Add typed domain exceptions for expected failures.
- For unexpected exceptions, include request ID, user/session context when safe, operation name, and stable error code.
- Add tests asserting rollback and no partial writes on caught failures.

### P2: Formatting Gate Includes Non-Product Skill Docs

Evidence:

- `vp check` failed on `.agents/skills/...` docs plus three app files.

Impact:

- Product validation can be blocked by local agent skill docs.
- Developers may bypass `vp check` entirely.

Root fix:

- Exclude `.agents/skills` from product formatting checks, or move skill docs outside the app repo validation scope.
- Keep app formatting enforced.

### P2: TODO-Backed UI Is Shipping Incomplete Workflows

Evidence:

- Inline quiz editor/attempt components contain TODOs for actual API calls and rendering.
- Gamification profile UI has TODO-gated backend fields.
- Locale messages include user-facing TODO text for backend implementation.

Impact:

- Users can reach UI that implies functionality exists while core behavior is missing.

Root fix:

- Convert TODO-backed features into explicit feature flags.
- Hide incomplete controls in production until backend and E2E coverage exist.
- Add a static check that blocks user-facing `TODO:` strings in locale files.

### P2: HTML Injection Surfaces Need One Policy

Evidence:

- `dangerouslySetInnerHTML` appears in markdown code rendering, rich discussion rendering, theme/bootstrap scripts, charts, math, embed objects, and loaders.

Impact:

- Some usage is safe by construction; other usage depends on sanitizer correctness.
- Regressions can be severe and hard to discover manually.

Root fix:

- Centralize sanitizer policy and allowed HTML/embed schemas.
- Add security tests for script tags, event handlers, malicious iframe attributes, CSS URL injection, and markdown edge cases.
- Document which `dangerouslySetInnerHTML` sites are trusted constants vs sanitized user content.

## Elegant Fix Strategy

### Phase 0: Freeze The Stability Baseline

Deliverables:

- Add a `reports/stability-baseline-2026-06-21.md` generated from the commands above.
- Add CI jobs that run commands independently so one early formatting failure cannot hide type/test failures.
- Mark these commands as authoritative:
  - `vp install`
  - `vp check`
  - `bun run --cwd apps/web test`
  - `bun run --cwd apps/web build`
  - `bun run check:contracts`
  - `uv run ruff check src`
  - `uv run mypy src`
  - `uv run basedpyright .`
  - `uv run pyrefly check`
  - `uv run pytest -q`
  - `uv run python scripts/check_migration_graph.py --require-single-head`

Exit criteria:

- Every gate either passes or has a tracked failing issue with owner and target date.
- No gate can rewrite tracked files before failing unless it restores or reports the diff clearly.

### Phase 1: Repair Toolchain Determinism

Tasks:

- Align `vite-plus`, `vp`, `vitest`, `@vitest/*`, and Vite+ catalog versions. (Don't change anything)
- Replace the `vitest` catalog mapping to `@voidzero-dev/vite-plus-test@latest` with a deterministic package that exposes the expected binary.
- Pin TypeScript generation tooling to a stable TypeScript version compatible with `openapi-typescript`. (Don't change anything)
- Decide whether the project truly wants TypeScript `7.0.1-rc` and Node 26 in production tooling. If yes, isolate older tools behind `vp exec` or a dedicated generator package. If no, pin to stable TypeScript/Node. (Don't change anything)
- Make `vp build` delegate to Turbo or document and remove it from the required checklist.
- Investigate Turbo post-build memory allocation separately from Next build.

Exit criteria:

- `vp test run` executes tests.
- `bun run check:contracts` regenerates both artifacts and exits cleanly.
- `bun run build` exits 0 after the same successful Next build currently observed.

### Phase 2: Make Contracts And Types A Real Gate

Tasks:

- Fix `apps/api/src/services/ai/contracts/events.py` with a proper discriminated event union.
- Replace broad JSON dictionaries in assessment settings with typed DTOs or `Mapping[str, JsonValue]`.
- Fix AI eval/artifact agent typing so mypy agrees with runtime behavior.
- Convert recurring `cast()`/ignore-heavy SQLModel patterns into typed repository helpers.
- Keep `scripts/lint_response_models.py` in CI and extend it to cover route handlers added later.
- Generate frontend API types only from committed `apps/api/openapi.json`; never hand-edit generated output.

Exit criteria:

- `mypy`, `basedpyright`, and `pyrefly` either all pass or only one is merge-blocking and the others have zero P0/P1 issues.
- `check:contracts` fails when backend DTO changes are not reflected in generated frontend types.

### Phase 3: Unify Auth, Session, And Network Behavior

Tasks:

- Remove React Query's direct `window.location.assign('/api/auth/refresh...')`.
- Export one browser refresh coordinator from the auth/API client layer.
- Add typed errors from `apiFetch` so React Query can distinguish unauthenticated, forbidden, validation, rate limit, timeout, and network failures.
- Move session loading out of the global locale layout and into protected route groups.
- Add a protected-layout checklist for `/dash`, `/editor`, `/assessments`, admin, analytics, user settings, grading, and course authoring.
- Keep backend refresh rotation grace, but add tests proving duplicate frontend refresh does not revoke or hard-navigate.

Exit criteria:

- One expired access token plus multiple parallel queries results in one refresh request and retried original requests.
- Public localized pages render when backend auth is unavailable.
- Login/logout/refresh redirects preserve safe relative `returnTo` values only.

### Phase 4: Stabilize Assessment And Authoring Workflows

Tasks:

- Replace broken clone fallback with `safeCloneJson`.
- Convert assessment draft local storage into an explicit recovery layer with telemetry.
- Move high-value assessment answers to server draft autosave whenever authenticated.
- Add conflict resolution tests for stale `If-Match`, parallel saves, submit while save pending, 429 retry, offline then online, and tab reload.
- Feature-flag inline quiz UI until it uses real assessment APIs and has E2E coverage.
- Audit `structuredClone` usage in curriculum editor, assessment studio, editor wrapper, and gamification preferences.

Exit criteria:

- Students cannot lose answers silently.
- Assessment submit and draft save behavior is deterministic under offline, refresh, quota, and concurrency conditions.

### Phase 5: Harden Backend Services

Tasks:

- Triage every broad `except Exception` into allowed or disallowed categories.
- Add domain exceptions for auth, assessment policy, grading, upload, AI provider, code execution, and cache errors.
- Ensure DB mutation workflows use transaction boundaries and rollback on all expected failures.
- Add idempotency keys for operations that can be retried from the frontend: saves, submissions, uploads, grading bulk actions, XP awards.
- Fix pytest warnings:
  - replace deprecated `HTTP_422_UNPROCESSABLE_ENTITY`;
  - avoid SQLite behavior that hides PostgreSQL-only `DISTINCT ON` semantics in tests.

Exit criteria:

- Unexpected backend errors produce stable error envelopes with request IDs.
- Retried requests are safe.
- Tests cover rollback/no-partial-write behavior for critical mutations.

### Phase 6: Centralize Security-Sensitive Rendering And Storage

Tasks:

- Create one sanitizer policy module for markdown, discussions, embeds, math, and code highlighting.
- Inventory every `dangerouslySetInnerHTML` call as either trusted constant, framework bootstrap, sanitized user content, or unsafe.
- Block unsafe iframe attributes and script/event-handler injection.
- Centralize direct cookie writes for locale, theme, sidebar, and AI adapter behavior.
- Review local/session storage keys for user/session isolation.

Exit criteria:

- Security tests cover every user-content HTML path.
- A static check prevents new unreviewed `dangerouslySetInnerHTML` sites.

### Phase 7: Restore End-To-End Confidence

Tasks:

- Once unit tests run, add Playwright suites for:
  - unauthenticated protected route redirect;
  - expired access token refresh;
  - two parallel protected navigations;
  - assessment draft save/submit conflict;
  - course creation/editing happy path;
  - upload chunk resume/failure;
  - AI streaming failure and reconnect;
  - role/permission denial;
  - public page render without auth backend.
- Run E2E against real Docker services, not mocks only.
- Keep API unit tests fast; use E2E for cross-service contracts.

Exit criteria:

- The release gate includes one realistic learner path, one teacher path, one admin path, and one failure-recovery path.

### Phase 8: Add Operational Feedback Loops

Tasks:

- Standardize client error reporting in `apps/web/src/services/telemetry`.
- Include request ID and backend error envelope data in frontend error reports.
- Add dashboard queries for auth refresh failures, assessment save failures, upload failures, AI stream failures, and 5xx rates by endpoint.
- Add background worker dead-letter visibility and alerts.

Exit criteria:

- New production bugs are traceable to endpoint, request ID, user/session class, and feature area.
- Stability work is driven by measured top errors, not anecdotal symptoms.

## Recommended Work Order

1. Fix test and contract tooling first. Without working gates, every other fix is less trustworthy.
2. Make backend type checks pass or explicitly choose one authoritative checker.
3. Remove duplicate auth refresh paths and split public/protected session loading.
4. Fix assessment clone/persistence and add draft/submit regression tests.
5. Repair root build orchestration.
6. Centralize raw fetch, sanitizer, cookie, and storage policies.
7. Add E2E coverage for the four highest-value user journeys.

## Priority Backlog

### Release Blockers

- Web unit tests do not run.
- Full contract generation does not run.
- Root build exits non-zero after successful web build.
- Backend strict type checks fail.
- React Query still bypasses the single-flight refresh mechanism.

### High Priority

- Global session loading makes public pages depend on auth backend.
- Assessment `structuredClone` fallback is broken.
- Assessment local draft persistence can fail silently.
- Raw frontend fetch paths bypass shared network/auth behavior.
- Forwarded header helper is not actually trust-validating.

### Medium Priority

- Formatting gate includes `.agents/skills` files.
- User-facing TODO strings and TODO-backed UI exist.
- HTML injection surfaces need a central sanitizer audit.
- Broad backend exception handlers need triage.
- Deprecation warnings in backend tests should be removed.

## Success Criteria

The platform should be considered meaningfully stabilized when:

- `vp check`, `vp test`, `bun run build`, `bun run check:contracts`, backend lint, backend type checks, backend tests, and migration checks all pass from a clean checkout.
- Public pages render without requiring a backend auth call.
- Refreshing an expired access token is single-flight and does not hard-navigate during query retries.
- API contracts are backend-generated and frontend-consumed without handwritten drift.
- Assessment draft/save/submit behavior survives reloads, offline periods, quota failures, concurrent tabs, and stale versions.
- Unexpected backend failures produce useful telemetry instead of disappearing into broad exception handlers.
- New high-risk UI/HTML/storage/network code cannot be added without a focused test or an explicit reviewed exception.
