# Error Handling And Error Finding Improvement Plan

Date: 2026-06-21

## Scope

This plan covers the full current application:

- `apps/api`: FastAPI backend, SQLModel/SQLAlchemy persistence, Taskiq workers, Redis, Logfire hooks, generated OpenAPI, tests.
- `apps/web`: Next.js App Router frontend, server actions/routes, `apiFetch`, TanStack Query, error boundaries, telemetry route, form and mutation UX.
- Cross-cutting workflows: auth/session refresh, course authoring, assessments, grading, file uploads/submissions, code execution, AI streaming, analytics, and platform admin.

The goal is not to add more `try/catch` blocks. The goal is to make failures explicit, typed, diagnosable, recoverable where possible, and visible to both users and developers.

## Audit Summary

The app already has useful starting points:

- Backend has a standard `ApiErrorEnvelope` with `code`, `message`, `details`, `field_errors`, and `request_id` in `apps/api/src/app/errors.py`.
- Backend middleware emits `X-Request-ID` in `apps/api/src/app/middleware.py`.
- Backend OpenAPI is patched so documented non-2xx responses reference `ApiErrorEnvelope`.
- Frontend has a central `apiFetch` with timeout and 401 refresh behavior in `apps/web/src/lib/api-client.ts`.
- Frontend has `APIError`, `parseApiErrorEnvelope`, and `getApiErrorMessage` in `apps/web/src/lib/api/assertSuccess.ts`.
- Some route boundaries report client errors through `apps/web/src/services/telemetry/client.ts`.
- Backend tests cover the basic error envelope in `apps/api/src/tests/test_error_envelope.py`.
- Frontend tests cover `apiFetch` timeout/401 refresh and a small field-error component path.

The current weakness is that these primitives are not enforced as the only path. Error behavior is still fragmented across hundreds of call sites.

Static scan signals from this audit:

- `raise HTTPException`: 398 matches under `apps/api/src`.
- Broad backend catches (`except Exception`, `contextlib.suppress(Exception)`, bare `except:`): 158 matches under `apps/api/src`.
- Frontend error-related ad hoc sites (`console.error`, `console.warn`, `toast.error`, `throw new Error`, `.catch(`): 455 matches under `apps/web/src`.
- `reportClientError`: 28 matches under `apps/web/src`.

These counts are not exact bug counts. They are indicators that error handling is spread across the app and cannot be reasoned about from one contract.

## Main Diagnosis

### 1. Backend errors have a common envelope but not a common cause model

`ApiErrorEnvelope` exists, but most backend code still raises `HTTPException` directly with a string `detail`. The global handler normalizes that into `code="HTTP_ERROR"`, which removes the most useful production signal: what kind of failure happened and what the caller can do.

Examples:

- `apps/api/src/services/file_submissions.py` raises many user-facing string details for validation, state, and permission-like failures.
- `apps/api/src/services/courses/courses.py`, `apps/api/src/services/assessments/*`, `apps/api/src/services/grading/*`, and upload services raise mixed string and dict details.
- `apps/api/src/app/errors.py` can preserve structured dict details, but only if call sites follow the expected `{"code","message","details"}` convention.

Result:

- UX gets generic request failures instead of specific recovery paths.
- DX gets weak searchability because many different causes collapse into `HTTP_ERROR`.
- Error telemetry grouping will over-group unrelated issues and under-explain root causes.

### 2. The frontend parses errors multiple ways

The intended frontend path is `apiFetch` -> `errorHandling`/`getResponseMetadata` -> `APIError`. In practice, many services and hooks parse responses by hand.

Representative examples:

- `apps/web/src/features/assessments/hooks/useAssessmentSubmission.ts` defines a local `readJsonOrThrow` that manually reads `payload.detail`, builds `new Error`, and only attaches `status` and `payload`.
- `apps/web/src/services/courses/courses.ts` manually creates `ApiErrorLike` with only `status` for some failed requests.
- `apps/web/src/services/courses/code-challenges.ts`, `apps/web/src/services/grading/grading.ts`, `apps/web/src/services/gamification/server.ts`, and export paths throw plain `Error` values that often lose request IDs and backend codes.
- Some paths use raw `fetch`, such as certificate export and diagnostic checks, bypassing shared auth, timeout, and envelope parsing.

Result:

- Query/mutation handlers cannot reliably inspect `code`, `status`, `fieldErrors`, or `requestId`.
- Users see inconsistent copy for the same backend condition.
- Developers cannot correlate a UI error with one backend request unless the call site happened to preserve the request ID.

### 3. Error reporting exists but is local-only and lossy

`reportClientError` posts to `/api/log-error`, and that route logs to `console.error`. It is useful for development, but it is not a durable production error pipeline.

Current limits:

- No external frontend error backend is configured.
- No stable event ID is returned to the user.
- No automatic capture for unhandled promise rejections outside error boundaries.
- No consistent inclusion of backend `request_id`, TanStack query key, mutation name, route segment, entity IDs, user role, or release/build ID.
- In-process IP rate limiting in `apps/web/src/app/api/log-error/route.ts` resets per process and is not a production-grade abuse control.

Result:

- Production errors are hard to find after the fact.
- Support cannot ask for one reference ID and locate both frontend and backend traces.
- Developers still depend on screenshots, user descriptions, or local reproduction.

### 4. UX recovery states are inconsistent

There are route error boundaries and many `toast.error` calls, but the app has no single user-facing error-state system.

Common patterns today:

- Full route boundaries show generic "try again".
- Mutation failures often show a toast only.
- Query failures can disappear into empty states or generic load failures.
- Form validation uses some field errors, but backend `field_errors` are not systematically mapped into form libraries.
- Offline, timeout, conflict, unauthorized, permission denied, rate limited, file too large, and external service degraded cases do not have consistent UI treatment.

Result:

- Users do not know whether to retry, wait, fix input, reload, sign in again, contact support, or stop.
- Critical workflows such as assessments and submissions can degrade into generic errors at the exact moments where recovery matters most.

### 5. DX is weakened by broad catches and permissive lint ignores

The backend Ruff config currently ignores several exception-related rules:

- `BLE001`: broad `Exception`.
- `TRY003`: long messages in exception raises.
- `EM101`: raw string exception messages.
- `B904`: missing `raise ... from ...` in `except`.
- `S110`: silent `try/except/pass`.

Some of those ignores may be practical for legacy code, but together they allow error handling to remain unstructured indefinitely.

Result:

- New code can keep adding raw exceptions.
- Root causes get hidden behind broad catches.
- Context is sometimes logged but not attached to the error contract.
- There is no simple static gate that says "this endpoint throws typed app errors only".

## Target State

Every operationally important failure should answer these questions:

1. What failed?
2. Is it a user-actionable problem, permission problem, transient infrastructure problem, dependency problem, conflict, or product bug?
3. What stable error code should logs, UI, tests, and docs use?
4. What can the user do next?
5. What request ID or event ID can support search?
6. What producer created the bad state?
7. Which test would catch this before release?

## Error Taxonomy

Create one shared taxonomy and use it everywhere.

| Category                 | HTTP status | Retry                 | User action           | Example codes                                                        |
| ------------------------ | ----------: | --------------------- | --------------------- | -------------------------------------------------------------------- |
| Validation               |     400/422 | No                    | Fix input             | `VALIDATION_ERROR`, `FILE_TOO_LARGE`, `INVALID_ACTIVITY_STATE`       |
| Auth required            |         401 | After refresh         | Sign in               | `AUTH_REQUIRED`, `SESSION_EXPIRED`                                   |
| Permission denied        |         403 | No                    | Request access        | `PERMISSION_DENIED`, `COURSE_ACCESS_DENIED`                          |
| Not found                |         404 | No                    | Check URL/context     | `COURSE_NOT_FOUND`, `SUBMISSION_NOT_FOUND`                           |
| Conflict                 |     409/412 | Conditional           | Review latest version | `VERSION_CONFLICT`, `ALREADY_SUBMITTED`                              |
| Rate limited             |         429 | Yes, after delay      | Wait                  | `RATE_LIMITED`, `LOGIN_LOCKED`                                       |
| External dependency      | 502/503/504 | Yes                   | Retry later           | `JUDGE0_UNAVAILABLE`, `AI_PROVIDER_UNAVAILABLE`, `REDIS_UNAVAILABLE` |
| Degraded background work | 202/207/503 | Sometimes             | Continue or retry     | `EVENT_DELIVERY_FAILED`, `EMAIL_QUEUE_FAILED`                        |
| Internal invariant       |         500 | No immediate user fix | Report support ID     | `INTERNAL_SERVER_ERROR`, `DATA_INVARIANT_VIOLATION`                  |

Each code needs:

- Stable string code.
- Owning domain.
- HTTP status.
- Public message key.
- Developer message.
- Whether details are safe to expose.
- Suggested UI treatment.
- Retry behavior.
- Test coverage owner.

## Backend Plan

### Phase 1: Define typed application errors

Add `apps/api/src/app/exceptions.py` with:

- `AppError`: base class with `code`, `message`, `status_code`, `details`, `field_errors`, `retry_after`, `log_level`, `safe_details`, and optional `cause`.
- Domain subclasses or constructors:
  - `ValidationAppError`
  - `AuthAppError`
  - `PermissionAppError`
  - `NotFoundAppError`
  - `ConflictAppError`
  - `RateLimitAppError`
  - `DependencyAppError`
  - `InvariantAppError`
- Helper constructors such as `course_not_found(course_uuid)`, `activity_not_found(activity_uuid)`, `version_conflict(...)`, and `dependency_unavailable(service, operation)`.

Update `apps/api/src/app/errors.py`:

- Register an `AppError` handler before the `HTTPException` handler.
- Preserve `request_id`.
- Include `Retry-After` when applicable.
- Log internal/dependency errors with structured context.
- Never expose unsafe exception messages for 500s.

Keep `HTTPException` support during migration, but treat it as legacy. The handler should still normalize old details, but new code should not use raw `HTTPException` except where a third-party library requires it.

Done when:

- New endpoint/service code can throw `AppError` without importing `fastapi.HTTPException`.
- Existing `test_error_envelope.py` covers `AppError`, `Retry-After`, structured details, and safe 500 behavior.

### Phase 2: Replace raw `HTTPException` by domain priority

Do not mechanically replace all 398 call sites at once. Prioritize flows where poor error handling causes user harm or support pain:

1. Auth/session refresh and Google OAuth.
2. Assessment start, draft save, submit, grading, and conflict paths.
3. File submission draft/upload/submit/review.
4. Course authoring and publish readiness.
5. Chunked uploads and media blocks.
6. Code execution and Judge0 dependency failures.
7. AI chat/streaming/dependency failures.
8. Analytics exports and long-running report paths.

Migration rule:

- If the producer of bad state is known, fix the producer and throw a typed domain error there.
- If the producer is unknown, enrich the error at the boundary with operation, entity IDs, expected type/state, actual type/state, and truncated safe value.
- Do not hide invalid data at the consumer just to stop the crash.

Done when:

- No high-risk workflow returns `code="HTTP_ERROR"` for expected business failures.
- `HTTP_ERROR` only remains for legacy low-risk paths and is tracked in an audit file.

### Phase 3: Strengthen request correlation

Extend `apps/api/src/app/middleware.py`:

- Accept inbound `X-Request-ID` when valid; otherwise create one.
- Generate `X-Correlation-ID` or reuse W3C `traceparent` when present.
- Attach `request_id`, `correlation_id`, `method`, `path`, `route_name`, and user/session identifiers where available to structured logs.
- Return `X-Request-ID` on every response, including middleware-generated errors.

Add a small helper:

- `get_error_context(request)` for handlers and services that need request metadata.
- `safe_log_context(...)` to truncate and redact values.

Done when:

- A frontend error event can be linked to the backend request log by ID.
- 500 logs include route and operation context without leaking PII.

### Phase 4: Make broad catches intentional

Classify every broad backend catch into one of four buckets:

- `recoverable_dependency`: log warning, return typed dependency/degraded error.
- `best_effort_side_effect`: log warning with operation context, continue only if the product action can safely succeed without it.
- `background_retry`: log exception, re-raise so Taskiq retries or dead-letters.
- `bug`: remove broad catch or convert to `InvariantAppError`.

Add comments only where the reason is not obvious, for example:

```python
# Best-effort cache invalidation: course mutation already committed.
```

Tighten Ruff gradually:

- Create a per-file allowlist for broad catches.
- Stop adding new `BLE001`, `B904`, and `S110` violations outside the allowlist.
- Add a script that prints new broad catches in changed files.

Done when:

- Every broad catch in high-risk paths has an explicit classification.
- New broad catches fail review unless documented and covered by a test.

### Phase 5: Background jobs and event bus visibility

For Taskiq workers and event subscribers:

- Add `task_id`, `event_id`, `attempt`, `entity_uuid`, and `correlation_id` to logs.
- Add dead-letter storage or an inspectable failure table for important events.
- Separate "user action succeeded but side effect failed" from "action failed".
- Surface important degraded side effects to admin diagnostics.

High-value areas:

- Auth audit writes.
- XP award.
- Email notification.
- Plagiarism checks.
- Grading event SSE replay.
- Upload cleanup.

Done when:

- A failed background side effect can be found from the initiating request ID.
- Retried and dead-lettered jobs have stable diagnostic records.

## Frontend Plan

### Phase 1: Make one error object mandatory

Promote `APIError` in `apps/web/src/lib/api/assertSuccess.ts` into the only frontend API error shape.

Add:

- `parseApiError(response: Response): Promise<APIError>`
- `apiJson<T>(path, init): Promise<T>`
- `apiResult<T>(path, init): Promise<{ data: T; headers; requestId }>`
- `isApiError(error): error is APIError`
- `isRetryableApiError(error)`
- `getSupportReference(error)`

Update `apps/web/src/lib/api-client.ts`:

- Always parse non-2xx responses into `APIError`.
- Attach `status`, `code`, `message`, `details`, `fieldErrors`, `requestId`, response headers, and original path.
- Treat timeout and network failures as typed client-side errors, for example `CLIENT_TIMEOUT` and `NETWORK_UNAVAILABLE`.
- Generate and send a frontend request ID when useful, while preserving backend `X-Request-ID`.

Done when:

- Call sites do not need to know the raw backend envelope shape.
- All query and mutation errors can be inspected with `isApiError`.

### Phase 2: Remove local parsers and plain API errors

Replace these patterns:

- Local `readJsonOrThrow`.
- `throw new Error(getApiErrorMessage(...))`.
- `throw new Error(response.statusText || "Request failed")`.
- Manual `ApiErrorLike` construction with only `status`.
- Raw `fetch` for backend API calls.

Initial migration targets:

- `apps/web/src/features/assessments/hooks/useAssessmentSubmission.ts`
- `apps/web/src/services/courses/courses.ts`
- `apps/web/src/services/courses/code-challenges.ts`
- `apps/web/src/services/grading/grading.ts`
- `apps/web/src/services/gamification/server.ts`
- `apps/web/src/services/utils/chunked-upload.ts`
- `apps/web/src/services/analytics/teacher.ts`
- `apps/web/src/services/courses/certifications.ts`
- `apps/web/src/features/assessments/shell/InlineAssessmentWorkspace.tsx`
- `apps/web/src/features/assessments/studio/tabs/ResultsReviewTab.tsx`

Done when:

- A static scan shows no high-risk feature code defining local response parsers.
- Request IDs and error codes survive from backend to UI.

### Phase 3: Standardize TanStack Query error behavior

Update `apps/web/src/lib/react-query/queryClient.ts`:

- Keep 401 refresh single-flight behavior, but avoid independent hard navigations that compete with `apiFetch`.
- Add global logging hooks that report only unexpected API/client errors, not expected validation failures.
- Use query/mutation `meta` fields:
  - `feature`
  - `operation`
  - `entityType`
  - `entityId`
  - `userFacing`
  - `expectedCodes`
- Avoid toasting globally. Components decide UX, global layer reports telemetry.

Add helpers:

- `queryErrorMeta(...)`
- `mutationErrorMeta(...)`
- `shouldReportError(error, meta)`

Done when:

- Expected 400/401/403/404/409/422 errors are not spammed as app crashes.
- Unexpected 500/network/timeout/dependency errors are reported with operation context.

### Phase 4: Centralize UI error states

Create a small error UX system:

- `ErrorState`: page/section-level recoverable failure.
- `InlineError`: compact panel for cards/forms.
- `FormFieldErrors`: maps backend `field_errors` to form fields.
- `ErrorToast`: for transient mutation feedback only.
- `SupportReference`: displays request/event ID when useful.

Each error view should choose from the taxonomy:

- Validation: show field-level errors and keep input.
- Auth required: refresh or sign-in prompt.
- Permission denied: explain access issue and link to request/help where appropriate.
- Not found: show context-specific missing resource state.
- Conflict: show server version and local changes recovery.
- Rate limited: show wait time.
- Dependency unavailable: retry later and preserve work.
- Internal: generic message plus support reference.

Done when:

- Route boundaries, major dashboards, assessment flow, grading flow, uploads, and course authoring use shared components.
- Users see a next action, not only "something went wrong".

### Phase 5: Capture unhandled browser failures

Add a frontend error reporter module:

- `window.onerror`
- `unhandledrejection`
- React error boundary reports
- Optional manual breadcrumbs for important user actions

Payload should include:

- Error name/message/stack when safe.
- URL and route pattern.
- Build/release ID.
- Locale.
- Query/mutation metadata.
- Backend request ID if present.
- Frontend event ID.
- Truncated breadcrumbs.

Do not include:

- Full request/response bodies.
- Auth tokens.
- Raw user content.
- Full user agent in production unless policy allows it.

Done when:

- A production crash outside a route boundary still creates a searchable event.
- The user can provide a support reference.

## UX Plan

### Error copy rules

Create `docs/error-copy.md` and locale keys for common error codes.

Rules:

- Use plain language.
- Say what happened and what to do next.
- Do not expose backend internals.
- Use the same code/copy across toast, inline state, and route boundary.
- Show support reference only when it helps support find logs.

Examples:

- `COURSE_NOT_FOUND`: "This course is no longer available or you do not have access."
- `VERSION_CONFLICT`: "This was changed elsewhere. Review the latest version before saving."
- `JUDGE0_UNAVAILABLE`: "Code runner is temporarily unavailable. Your answer is saved; try tests again later."
- `CLIENT_TIMEOUT`: "The request took too long. Check your connection and retry."

### Workflow-specific recovery

Assessments:

- Never lose local answers because a save fails.
- Distinguish autosave dirty, saving, saved, conflict, offline, and failed states.
- Preserve draft state across retry.
- Show code-specific failures from `field_errors` and structured details.

File uploads:

- Show file validation errors before upload when possible.
- For chunked upload failures, show failed chunk/retry state internally, but user-facing copy should stay simple.
- Preserve selected files when retrying.

Course authoring:

- Conflict errors should show changed fields and let the author merge or reload.
- Publish/readiness errors should be field/checklist driven, not generic toasts.

Code execution:

- Separate user code test failures from infrastructure failures.
- Do not treat failed tests as app errors.
- Treat Judge0 unavailable/timeouts as dependency errors with retry affordance.

AI:

- Separate moderation/policy blocks, provider unavailability, streaming interruption, and malformed tool output.
- Keep partial generated content only when safe and clearly marked.

Analytics/export:

- Show empty data, no permission, long-running export, and export failure as separate states.

## DX Plan

### Error catalog

Create `docs/error-catalog.md` generated or checked from backend definitions.

For each code:

- Code.
- Domain.
- Status.
- Public message key.
- Retryable.
- Safe details schema.
- Owning tests.
- Example UI treatment.

Done when:

- Adding a new `AppError` code without a catalog entry fails CI.

### Static checks

Add scripts:

- Backend: `scripts/audit_errors.py`
  - Count raw `HTTPException`.
  - Count broad catches.
  - Count `detail="..."` string errors.
  - Verify new/changed service files use `AppError`.
- Frontend: `scripts/audit-error-handling.mjs`
  - Count direct `fetch` outside allowed files.
  - Count local `readJsonOrThrow` style parsers.
  - Count `throw new Error` in service/API files.
  - Count `console.error` outside reporter/boundary allowlist.

Start as reporting-only. After the migration begins, fail only on new violations.

### Local diagnostics

Improve `apps/web/src/app/api/diagnostics/route.ts` and backend health diagnostics:

- Include current app version/build ID.
- Include backend reachability and request ID.
- Include auth/session cookie presence without exposing values.
- Include Redis/database status from backend health endpoints.
- Include last frontend error event ID when available.

This is for developers/support, not regular users.

### Test strategy

Backend tests:

- `AppError` handler returns envelope.
- `HTTPException` legacy handler still works during migration.
- Validation errors map to `field_errors`.
- 500s hide unsafe messages and log request ID.
- Dependency errors include retry metadata.
- Request ID flows through middleware and error responses.
- High-risk endpoints return specific codes for expected failures.

Frontend unit tests:

- `apiFetch` turns backend envelopes into `APIError`.
- Timeout/network/abort produce typed client errors.
- `field_errors` map to form fields.
- Query/mutation metadata is passed to reporter.
- Expected errors are not reported as crashes.
- Unexpected errors include request/event IDs.

E2E tests:

- Expired session refresh does not lose form state.
- Assessment draft save conflict shows conflict UI and preserves local answers.
- File upload too large shows validation error before/during upload.
- Permission denied page shows request/access state.
- Backend 500 shows support reference and logs event.
- Code runner unavailable is distinct from failed code tests.

Chaos/manual drills:

- Kill API during a learner assessment.
- Kill Redis during auth refresh and grading SSE.
- Make Judge0 unavailable.
- Return malformed backend JSON for one endpoint in development.
- Simulate slow network and request timeout.
- Simulate two teachers editing the same assessment/course item.

## Prioritized Backlog

### P0. Define `AppError` and migrate high-risk expected failures

Effort: M

Impact: Very high

Files:

- `apps/api/src/app/errors.py`
- `apps/api/src/app/exceptions.py` (new)
- `apps/api/src/services/assessments/*`
- `apps/api/src/services/file_submissions.py`
- `apps/api/src/services/courses/*`
- `apps/api/src/services/code_execution/service.py`

Done when:

- Expected high-risk workflow failures do not return `HTTP_ERROR`.
- Backend tests assert specific codes.

### P0. Make frontend API errors typed everywhere

Effort: M

Impact: Very high

Files:

- `apps/web/src/lib/api-client.ts`
- `apps/web/src/lib/api/assertSuccess.ts`
- `apps/web/src/features/assessments/hooks/useAssessmentSubmission.ts`
- `apps/web/src/services/**`

Done when:

- Service code throws `APIError` or typed client errors.
- Request IDs are available to UI and reporter.

### P0. Add durable error reporting and support references

Effort: M

Impact: Very high

Files:

- `apps/web/src/services/telemetry/client.ts`
- `apps/web/src/app/api/log-error/route.ts`
- `apps/web/src/app/error.tsx`
- `apps/web/src/app/global-error.tsx`
- `apps/web/src/app/[locale]/error.tsx`
- `apps/api/src/app/observability.py`

Done when:

- Frontend and backend errors can be searched by one support reference.
- Unhandled browser errors and promise rejections are captured.

### P1. Standardize error UI components

Effort: M

Impact: High

Files:

- `apps/web/src/components/ui/*`
- Route `error.tsx` files under `apps/web/src/app`
- Assessment, grading, uploads, course authoring features

Done when:

- Major flows use shared error states and no longer invent one-off copy/actions.

### P1. Add static audits and CI ratchets

Effort: S/M

Impact: High

Files:

- `apps/api/scripts/*`
- `apps/web/scripts/*`
- root `package.json`
- `apps/api/pyproject.toml`
- CI workflow files

Done when:

- New raw backend `HTTPException(detail="...")` and frontend local parsers are visible in CI.
- Ratchets start report-only, then become fail-on-new-violations.

### P1. Make background failures inspectable

Effort: M

Impact: High

Files:

- `apps/api/src/worker/tasks/*`
- `apps/api/src/tasks/*`
- `apps/api/src/services/events/*`
- `apps/api/src/routers/internal.py`

Done when:

- Important background failures are not only log lines.
- Admin/support can inspect failed events/jobs.

### P2. Build an error operations dashboard

Effort: L

Impact: Medium/high

Scope:

- Aggregate recent errors by code, route, feature, user role, release, and request ID.
- Show top new errors after deploy.
- Show dependency health and retry/dead-letter counts.

Done when:

- A developer can answer "what broke after the last deploy?" without reading raw logs.

## Suggested Implementation Order

### Week 1

1. Add `AppError` base types and handler tests.
2. Add frontend `APIError` parsing tests for backend envelopes, timeouts, and network errors.
3. Add static audit scripts in report-only mode.
4. Add frontend event IDs and include request IDs in `reportClientError`.
5. Migrate assessment draft/save/submit errors to preserve typed codes and request IDs.

### Week 2

1. Migrate file submission and upload errors.
2. Migrate course authoring and publish readiness errors.
3. Replace local `readJsonOrThrow` helpers in high-risk frontend code.
4. Introduce shared `ErrorState`, `InlineError`, and `SupportReference`.
5. Add E2E checks for assessment conflict, upload failure, permission denied, and server 500.

### Week 3

1. Migrate code execution and AI dependency errors.
2. Add background job/event IDs and dead-letter diagnostics.
3. Add query/mutation metadata and reporting filters.
4. Tighten lint/audit ratchets to fail on new violations.
5. Create initial `docs/error-catalog.md`.

### Week 4

1. Review remaining `HTTP_ERROR` responses and broad catches.
2. Add production dashboard/log queries.
3. Run chaos drills.
4. Make the error catalog part of release review.
5. Document support workflow: user support reference -> frontend event -> backend request -> logs/traces.

## Acceptance Criteria

The improvement project is complete when:

- Every non-2xx backend JSON error has `code`, `message`, `field_errors`, and `request_id`.
- High-risk workflows no longer return generic `HTTP_ERROR` for expected business failures.
- Frontend services use one typed API error path.
- Users see a clear next action for validation, auth, permission, not found, conflict, rate limit, dependency, timeout, and internal errors.
- Support can locate a failure with one reference ID.
- Frontend and backend tests cover the shared error contract.
- CI reports and eventually blocks new raw exception/error parsing patterns.
- Broad backend catches are classified, documented where needed, and tested.

## Non-Goals

- Do not rewrite the app.
- Do not add catch-all guards that hide producer bugs.
- Do not expose internal exception messages to users.
- Do not report expected validation/user errors as crashes.
- Do not make every warning a blocking error at once; use ratchets.

## Key Principle

Fix errors at the producer whenever the producer is known. When it is not known, enrich the boundary error with safe diagnostic context and keep it visible. Silent fallback is only acceptable for explicitly best-effort side effects where the product action remains correct.
