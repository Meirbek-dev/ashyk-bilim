# Application Audit Bug Report

Audit date: 2026-09-26

## Scope

Audited the checked-out frontend, Rust rewrite backend. The legacy Python backend (apps/api) was used only as a read-only semantic reference and was not audited. The worktree already contained user changes before this audit; implementation files were not modified. Findings describe the checked-out state and are not attributed to those changes unless verified.

Method: static review of the Rust crates (`core`, `db`, `domain`, `api`, `server`, `jobs`, `etl`, `clients`) and the web app (app router, server actions, features, generated client usage), plus the automated gates: `just check` / `just test` in apps/server and `vp check` / `vp test` in apps/web. Authenticated Playwright journeys were not run because their global setup changes roles in the seeded stack and clears saved browser-auth state. Existing deployment and security findings remain tracked separately in [FINDINGS.md](FINDINGS.md) and were not revalidated here.

## Confirmed Findings

### BUG-002: Rust OpenAPI snapshot is stale

**Description:** The checked-in OpenAPI snapshot does not match the document generated from the current API routes and DTOs, causing the Rust test gate to fail.

**Reproduction:** In `apps/server`, run `just test` against a test database. The `openapi_document_snapshot` test fails. Running the suite without fail-fast completed with 593 passed and 1 failed out of 594.

**Expected behavior:** The snapshot matches `ab_api::openapi_doc()` and the workspace test suite passes.

**Actual behavior:** Insta reports a large OpenAPI diff and writes `openapi__openapi_v2.snap.new`; this audit removed that generated temporary file without accepting the snapshot.

**Suspected cause:** API contract changes have not been reviewed into the checked-in Insta snapshot. The tree was already dirty, so the change that introduced this drift is unknown.

**Severity:** P2, blocks the Rust test gate.

### BUG-003: Rust Clippy gate fails on a long first doc paragraph

**Description:** `just check` fails because Clippy denies `too-long-first-doc-paragraph` in `apps/server/crates/db/src/search.rs` at `word_patterns`.

**Reproduction:** In `apps/server`, run `just check` with `SQLX_OFFLINE=true`. Re-confirmed this audit: `cargo fmt --all --check` passes; `cargo clippy --workspace --all-targets -- -D warnings` exits 101.

**Expected behavior:** Formatting and Clippy checks complete successfully.

**Actual behavior:** Formatting passes; Clippy exits non-zero on the doc comment beginning at line 53 of `crates/db/src/search.rs`.

**Suspected cause:** The doc comment's first paragraph exceeds the current Clippy limit.

**Severity:** P2, blocks the Rust check/CI gate.

### BUG-220: `vp check` fails on 271 unformatted web files

**Description:** The web quality gate aborts at the formatting step: Oxfmt reports issues in 271 files (including AGENTS.md, e2e specs, app routes, features, and tests), so lint and type-check never run.

**Reproduction:** In `apps/web`, run `vp check`. Output ends with `Found formatting issues in 271 files ... Run vp check --fix to fix them.`

**Expected behavior:** `vp check` formats/lints/type-checks cleanly, or the tree is already formatted.

**Actual behavior:** The gate exits non-zero at the formatting step; ESLint, Oxlint, and `tsc` findings (if any) are masked because the run stops early.

**Suspected cause:** The checked-out tree was not run through `vp check --fix` (Oxfmt). The tree was already dirty before this audit, so the introducing change is unknown.

**Severity:** P2, blocks the web check/CI gate.

### BUG-221: Profile course list ignores `updated_at` ordering

**Description:** `getCoursesByUser` returns courses in raw API page order; the client never sorts by `updated_at_unix`, so profile course cards do not show the most recently updated course first.

**Reproduction:** In `apps/web`, run `vp test`. The test `src/tests/users/user-courses-order.test.ts` ("lists the last updated course first", UX-234) fails: it feeds items with `updated_at_unix` 100/300/200 and expects `['old-fresh', 'mid', 'new-stale']`, but receives `['new-stale', 'old-fresh', 'mid']`.

**Expected behavior:** The profile course list is ordered by `updated_at_unix` descending (the API pages by id, so the client must sort).

**Actual behavior:** [client.ts](apps/web/src/lib/users/client.ts#L76-L81) maps the paged response directly (`courses.map(toAppCourse)`) with no sort.

**Suspected cause:** The UX-234 ordering test landed without (or ahead of) the client-side sort implementation.

**Severity:** P2, wrong user-visible ordering plus a failing unit test.

### BUG-222: Web unit tests require public env vars not provided by the test setup

**Description:** Eight tests across three files fail with `APIError: Public configuration is invalid` because `NEXT_PUBLIC_SITE_URL` / `NEXT_PUBLIC_API_URL` are undefined under Vitest; components under test call `getPublicConfig()` / `getSiteUrl()` / `getPublicAPIUrl()` during render.

**Reproduction:** In `apps/web`, run `vp test`. Failing files: `src/tests/courses/course-workspace-service.test.ts` (3 tests), `src/tests/student-activity/course-end-view.test.tsx` (5 tests), `src/tests/certificates/certificate-verify-phone.test.tsx` (1 test, crashes render so `data-testid="verification-status"` is never found, plus one uncaught exception).

**Expected behavior:** Unit tests run hermetically; public config is stubbed by the test setup (`vitest.config.ts` env/defaults or per-test mocks).

**Actual behavior:** `getPublicConfig` in [env.ts](apps/web/src/services/config/env.ts#L244) throws `CLIENT_INVARIANT_VIOLATION` (issues list `NEXT_PUBLIC_SITE_URL` and `NEXT_PUBLIC_API_URL` as "Expected string but received undefined") from `CourseEndView` ([CourseEndView.tsx](apps/web/src/components/Pages/Activity/CourseEndView.tsx#L66)), `CertificateVerificationPage` ([CertificateVerificationPage.tsx](apps/web/src/components/Pages/Certificate/CertificateVerificationPage.tsx#L153)), and `serverGet` in [courses.ts](apps/web/src/services/courses/courses.ts#L18).

**Suspected cause:** These modules moved from lazy request-time config to render-time `getAbsoluteUrl`/config reads without updating the test environment to provide the public env schema.

**Severity:** P2, the web unit gate fails (10 failed tests total with BUG-221; 1001 pass).

### BUG-223: File-submission save uses a stale optimistic-lock version (412 under auto-save)

**Description:** The save mutation captures `activeAttempt?.version` at component render time, then performs multi-second file uploads before sending it. Any concurrent draft save (auto-save, another tab, window-focus refetch) bumps the server version, so the final save/submit is rejected with 412 Precondition Failed.

**Reproduction:** Open a file submission, drop files, wait long enough for an auto-save or a refetch to occur (or save in a second tab), then click Save/Submit after the uploads finish.

**Expected behavior:** The version is read from the freshest query data at send time, or the mutation retries once after refetching the attempt.

**Actual behavior:** In [FileSubmissionWorkspace.tsx](apps/web/src/features/file-submissions/student/FileSubmissionWorkspace.tsx#L280), `const version = activeAttempt?.version ?? null` reads the closure value captured before the upload loop at [FileSubmissionWorkspace.tsx](apps/web/src/features/file-submissions/student/FileSubmissionWorkspace.tsx#L238-L278), then passes it to `saveFileSubmissionDraft` / `submitFileSubmission`.

**Suspected cause:** Version captured in component scope instead of from the query cache (`queryClient.getQueryData`) inside `mutationFn` after uploads complete.

**Severity:** P1, data-path defect: user loses a save/submit and must retry after a confusing 412.

### BUG-224: Learner course progress snapshot crashes when `outline` is null

**Description:** `buildCourseProgressSnapshot` uses `state?.outline.flatMap(...)`; optional chaining guards `state` but not `outline`, so a response with `outline: null` throws `TypeError: Cannot read properties of null (reading 'flatMap')` during render.

**Reproduction:** Any code path that produces a `LearnerCourseState` object with `outline: null` (API contract change, error fallback constructing a partial state) renders the course page modules.

**Expected behavior:** `(state?.outline ?? []).flatMap(...)` or `state?.outline?.flatMap(...)` so a missing outline yields an empty snapshot.

**Actual behavior:** [course-page-modules.tsx](apps/web/src/features/learner-course/course-page-modules.tsx#L311) crashes the render pass.

**Suspected cause:** The contract assumes `outline` is always an array, but the type permits undefined at the state level and nothing normalizes the payload.

**Severity:** P2, render crash on a plausible malformed/partial payload.

### BUG-225: Copy-outline course creation hides source-fetch failures

**Description:** When creating a course with "Copy outline", a failure to fetch the source course metadata is swallowed and reported as a partial success with zero imported chapters, giving the user no indication anything went wrong.

**Reproduction:** Create a course with structure mode "copy outline" pointing at a source course that errors or is deleted, then observe the result toast.

**Expected behavior:** The user is told the outline import failed (and why), or the flow retries.

**Actual behavior:** In [useCreateCourseMutation.ts](apps/web/src/features/courses/create/useCreateCourseMutation.ts#L55-L67), the `try/catch` around `getCourseMetadata` falls through with `sourceChapters = []` and a comment `// source fetch failed — treat as partial success with 0 chapters`; the result reports "0 imported, 0 failed".

**Suspected cause:** Deliberate graceful degradation, but without a user-visible warning it reads as a silent failure.

**Severity:** P3, UX/messaging defect; the created course is valid but unexpectedly empty.

### BUG-226: Extensionless rejected files show a misleading type label

**Description:** The file-drop rejection message for a file with no extension shows the full filename as the "type" (or `?` when the MIME type is also empty), e.g. "File type not allowed: Makefile".

**Reproduction:** Drop an extensionless file (e.g. `Makefile`) that is not in the allowed list into a file-submission picker that rejects it.

**Expected behavior:** A clear label such as the extension when present, otherwise "unknown extension" / the filename labelled as filename.

**Actual behavior:** [FileSubmissionWorkspace.tsx](apps/web/src/features/file-submissions/student/FileSubmissionWorkspace.tsx#L110) builds `type: file.type || file.name.split('.').pop() || '?'`; for extensionless names `split('.').pop()` returns the whole filename.

**Suspected cause:** `String.prototype.split` always returns at least one element, so the no-extension case is indistinguishable from "extension equals filename".

**Severity:** P3, confusing error copy only; rejection itself is correct.

### BUG-227: SSE slot release is fire-and-forget; a failed decrement leaks a slot for up to an hour

**Description:** When an SSE client disconnects, `ConnectionSlot::drop` spawns a detached task to decrement the per-user connection counter in Redis. If that task fails (Redis error, panic), the counter stays incremented; after five such leaks within the counter TTL the user gets spurious 429s on new streams.

**Reproduction:** Terminate SSE clients ungracefully while Redis decrement fails (restart, network partition), then reconnect repeatedly.

**Expected behavior:** Bounded leaks with eventual recovery (which the 3600 s TTL provides), acknowledged as a deliberate trade-off.

**Actual behavior:** [mod.rs](apps/server/crates/domain/src/events/mod.rs#L95-L106) spawns the release without awaiting it; `acquire_slot_with` at [mod.rs](apps/server/crates/domain/src/events/mod.rs#L140-L160) rejects with `None` once the leaked count exceeds `MAX_CONNECTIONS_PER_USER` until the TTL expires.

**Suspected cause:** `Drop` cannot await; the code documents this as an accepted, TTL-bounded trade-off.

**Severity:** P3, self-healing resource-leak edge case, not a security issue.

## Investigated and cleared

Items examined during this audit and determined **not** to be bugs:

- **Negative marking in choice grading** — [grader.rs](apps/server/crates/domain/src/grading/grader.rs#L156) computes `round2(-deduction.min(points))`, which is exactly the legacy Python `max(-points, -deduction)`; intentional parity, and capped at `-points`.
- **AI run `succeeded` → `failed` flip** — `fail_run` in [ai.rs](apps/server/crates/db/src/ai.rs#L292-L304) deliberately includes `succeeded` in its transition set; the doc comment cites BUG-189 (a run whose feature row was refused must not read as success). Divergence from the legacy Python service is intentional and documented.
- **Session provider unmount update** — the session probe in [session-provider.tsx](apps/web/src/components/providers/session-provider.tsx#L119-L142) uses a `cancelled` flag and cleanup, so no setState-after-unmount occurs.
- **Exam submit toast stale closure** — `countedActivity` is included in the `handleSubmit` `useCallback` dependency list at [ExamAttemptContent.tsx](apps/web/src/features/assessments/registry/exam/ExamAttemptContent.tsx#L500); the callback is recreated when the prop changes.
- **GradeForm stale-grade error flow** — the `StaleGradeError` branch at [GradeForm.tsx](apps/web/src/features/grading/review/components/GradeForm.tsx#L320-L334) is a clean `if/else` separation; the generic error toast cannot run for stale-grade errors.
- **useCreateCourseMutation callback churn** — `tStarterChapters` in the `useCallback` deps ([useCreateCourseMutation.ts](apps/web/src/features/courses/create/useCreateCourseMutation.ts#L16)) is harmless because the callback is invoked directly, not handed to memoized children.
- **Rust HTTP layer sweep** — SSE stream access re-validated per batch, analytics routes resolve scopes, AI run access enforces thread owner or platform reader, keyset pagination is stable, CSRF middleware ordering is correct, and no request-derived `unwrap`/`expect` panic paths were found in the routes layer.
