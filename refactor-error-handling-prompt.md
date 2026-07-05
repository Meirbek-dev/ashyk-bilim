# Agent Prompt: Production Error Handling and Orval Type-Safety Refactor

You are working in the `ashyq-bilim` monorepo. Your goal is to refactor the whole app toward production-grade error handling, clear user recovery paths, and stricter frontend/backend type-safety through the generated OpenAPI/Orval contract.

Do this as a real engineering refactor, not a cosmetic pass. Users should never confuse a failed request with an empty result, a missing permission with a broken page, or a validation error with a generic crash.

## Operating Rules

- Read `AGENTS.md` first and follow the Vite+ workflow. Run `vp install` before starting after remote changes, then use `vp check` and `vp test` for final validation when practical.
- Work by feature area, not as one unreviewable repo-wide diff. Prioritize auth, course viewing, submissions/grading, authoring, AI, analytics, uploads, and code execution.
- Reuse existing primitives before adding new ones. Add abstractions only when they remove repeated error handling or make a broken pattern impossible to repeat.
- Do not hide production bugs behind `?? []`, `?? {}`, `catch {}`, `as any`, loose casts, or handwritten transport interfaces.
- Preserve user work on all recoverable failures: forms, assessment answers, course edits, uploads, code editor content, AI draft prompts, and grading actions.

## Existing Sources of Truth

Use these files and extend them when needed:

- `apps/web/src/components/ui/error-state.tsx`
  - `ErrorState`, `InlineError`, `SupportReference`
  - Use these for route, section, widget, and inline failures.
- `apps/web/src/lib/api/assertSuccess.ts`
  - `APIError`, `ApiErrorEnvelope`, `parseApiErrorEnvelope`, `parseApiError`, `clientApiError`, `isApiError`, `isRetryableApiError`, `getSupportReference`
  - This is the frontend error contract.
- `apps/web/src/lib/api/orval-mutator.ts`
  - Orval requests must flow through this mutator so generated hooks/functions throw `APIError`.
- `apps/web/src/lib/api/generated/**`
  - Generated API functions, React Query hooks, and schema types. Do not edit generated files manually.
- `apps/web/src/lib/react-query/queryClient.ts`
  - Global query/mutation error telemetry, retry rules, `queryErrorMeta`, `mutationErrorMeta`, and expected error handling.
- `apps/web/src/lib/error-i18n.ts`
  - Shared localized error vocabulary.
- `apps/web/src/app/error.tsx`, `apps/web/src/app/global-error.tsx`, `apps/web/src/app/[locale]/error.tsx`, `apps/web/src/app/not-found.tsx`
  - Route-boundary patterns to copy.
- `apps/api/src/app/errors.py`, `apps/api/src/app/exceptions.py`, `apps/api/src/app/error_context.py`
  - Backend error envelope and app error source.
- `docs/error-catalog.md`, `docs/error-copy.md`, `docs/FULLSTACK_TYPESAFETY.md`
  - Product rules for codes, messages, UI treatment, and generated contracts.

## Orval and Type-Safety Rules

The backend OpenAPI schema is the transport contract. The frontend must consume that contract through Orval.

- Backend DTOs and FastAPI `response_model` declarations define request and response shapes.
- Regenerate contracts after backend DTO/router changes:

```bash
bun run generate:contracts
```

- Check contract drift:

```bash
bun run check:contracts
```

- Frontend API code should import generated functions/hooks/types from `apps/web/src/lib/api/generated`.
- New API calls should not use handwritten `fetch`, `apiFetcher`, or duplicated service DTOs when an Orval function/hook exists or can be generated.
- Keep generated transport types at the boundary. If UI state needs a different shape, create an explicit mapper in the feature/service layer.
- Do not weaken generated types with `Partial<T>`, `Record<string, unknown>`, `unknown as T`, `as any`, or broad optional fields to silence errors.
- If the backend can return `null`, model that in the backend DTO and OpenAPI schema. Normalize nullable values once at the frontend boundary.
- If the UI expects a field that OpenAPI does not provide, fix the backend DTO or create a deliberate derived UI field. Do not fake it with fallback data.
- Orval errors must keep the `APIError` path through `orvalMutator`; do not wrap generated calls in code that discards `status`, `code`, `fieldErrors`, `requestId`, or `headers`.

## Error UX Taxonomy

Use the smallest UI treatment that gives the user a clear next step.

| Failure                   | UI treatment                                                                               |
| ------------------------- | ------------------------------------------------------------------------------------------ |
| Page-critical load failed | Route `error.tsx` or `ErrorState variant="page"` with retry and support reference          |
| Section/widget failed     | `ErrorState variant="section"` or `InlineError` inside the affected area                   |
| Form validation failed    | `react-hook-form` field errors from `APIError.fieldErrors`, plus a short summary if needed |
| Inline mutation failed    | Toast or inline error with retry/undo where appropriate                                    |
| Permission denied         | Access-denied state with navigation or request-access path                                 |
| Not found                 | Not-found state with link back to parent list                                              |
| Conflict                  | Conflict-resolution UI that keeps local work visible                                       |
| Rate limited              | Disable the action until retry window; do not spam retries                                 |
| Network/timeout           | Retry affordance, offline/pending state, preserve local work                               |
| 5xx/dependency failure    | Generic public copy, support reference, telemetry                                          |
| User code/test failure    | Domain result, not an app error                                                            |

## Anti-Patterns to Remove

Audit and fix these patterns:

- `data ?? []`, `data ?? {}`, `value ?? '-'`, `value ?? 'N/A'` used before checking query success.
- Empty states that render during failed requests.
- `catch {}` or `catch (error) { console.error(error) }` without user feedback, telemetry, or rethrow.
- `toast.error('Failed')`, `toast.error(t('featureFailed'))`, or duplicated generic copy at each call site.
- Throwing raw backend messages into the UI.
- Swallowing Orval/React Query errors and returning fallback data.
- Handwritten request/response types that duplicate generated schemas.
- Feature-specific error unions that duplicate `APIError`.
- Route segments with `loading.tsx` but no matching `error.tsx`.
- Complex widgets that can crash the whole route.

Some fallbacks are valid. Keep them only after you prove the data load succeeded and the field is truly optional. Add a short comment only when the distinction is easy to lose.

## Audit Checklist

Create or update an audit note before changing a feature area.

- Find every `useQuery`, `useSuspenseQuery`, `useInfiniteQuery`, `useMutation`, generated Orval hook, and service call.
- For each call site, record:
  - query/mutation key
  - generated API function or handwritten transport function
  - loading state
  - error state
  - empty state
  - retry/recovery path
  - telemetry path
  - whether user work is preserved
- Search for fallback masking:

```bash
rg -n "\?\? \[\]|\?\? \{\}|\?\? '-'|\?\? \"N/A\"|\|\| \[\]|\|\| \{\}" apps/web/src
```

- Search for silent catches:

```bash
rg -n "catch\s*(\{|\()" apps/web/src apps/api/src
```

- Search for generic toasts:

```bash
rg -n "toast\.error|sonner" apps/web/src
```

- Search for handwritten transport drift:

```bash
rg -n "apiFetcher|apiJson|fetchResponseMetadata|fetch\(|interface .*Response|type .*Response" apps/web/src --glob '!**/generated/**'
```

- Find route boundary gaps:

```bash
rg --files apps/web/src/app | rg "loading\.tsx$|error\.tsx$"
```

## Implementation Plan

### 1. Strengthen the API Contract Path

- Ensure Orval generation is current with `bun run generate:contracts`.
- Prefer generated Orval hooks/functions for API access.
- Replace duplicated handwritten transport types with generated schema imports.
- Keep service-layer mappers explicit and typed.
- Add backend `response_model` declarations where OpenAPI output is missing or weak.
- Make generated error types flow through `APIError` without losing envelope fields.

### 2. Build One Shared Error Presenter

Create or extend a single frontend helper/hook for user-facing errors. It should:

- Accept `unknown`.
- Normalize with `isApiError`, `parseApiErrorEnvelope`, and `APIError`.
- Return:
  - title
  - description
  - severity
  - retry policy
  - support reference
  - field errors
  - whether telemetry is expected
- Map known codes from `docs/error-catalog.md`.
- Use localized shared copy from `src/lib/error-i18n.ts`.
- Allow feature-specific business messages without replacing the shared fallback logic.

Feature code should call this helper instead of inventing new error copy.

### 3. Fix Query and Mutation UI

For every query-driven component:

- Render loading only while loading.
- Render error UI when `isError` or `error` is present.
- Render empty UI only when the query succeeded and the returned collection is empty.
- Use `queryErrorMeta` for feature, operation, expected codes, and user-facing behavior.

For every mutation:

- Use `mutationErrorMeta`.
- Show validation errors at fields via `setError`.
- Keep dirty form/editor state.
- Use retry only when retry can help.
- Show support references for unknown, timeout, network, dependency, and 5xx failures.

### 4. Add Component-Level Error Isolation

Create a shared `WidgetErrorBoundary` if one does not already exist.

It must:

- Call `reportClientError`.
- Render `ErrorState` or `InlineError`.
- Support retry/reset.
- Integrate with TanStack Query reset behavior where needed.
- Preserve the surrounding page.

Wrap high-risk widgets first:

- AI chat/tutor streaming UI
- Monaco editor
- code execution result panel
- video player
- PDF preview/export
- analytics charts
- rich text editor extensions
- upload/dropzone flows

Fix `EmbedObjectsErrorBoundary` so it uses the shared boundary or reports telemetry and renders the shared error UI.

### 5. Fill Route Error Boundaries

For each route segment with `loading.tsx`, add or verify `error.tsx`.

Copy the existing route-boundary pattern:

- `use client`
- `useEffect` telemetry via `reportClientError`
- localized copy
- `ErrorState`
- retry via `reset`
- chunk-load handling where relevant
- `SupportReference`

### 6. Improve Backend Error Contracts

Backend errors should produce stable envelopes.

- Add or reuse `AppError` codes for known business failures.
- Update `docs/error-catalog.md` when adding codes.
- Return field-level errors for validation that the frontend can map to RHF fields.
- Do not leak stack traces, SQL, dependency hostnames, secrets, or raw provider messages.
- Include request/correlation IDs for internal and dependency failures.
- Add tests for new error codes and envelope shapes.

### 7. Add Regression Checks

Use the existing audit scripts where possible:

```bash
bun run audit:errors
```

Add or extend scripts so CI catches:

- query result fallbacks used without an error branch
- silent catches without a comment, telemetry, toast, or rethrow
- direct edits/imports from generated files where forbidden
- handwritten DTOs that duplicate generated schemas
- route `loading.tsx` without `error.tsx`

The check can be conservative. It should make risky patterns visible during review.

## Testing Requirements

Add focused tests for each feature area you touch.

- Unit/component tests for shared error presenter mappings.
- React tests for query error vs empty state rendering.
- RHF tests for backend `fieldErrors` mapping.
- Playwright tests for high-traffic flows:
  - login/session expiration
  - course viewing 500/404/403
  - submission save timeout/conflict
  - grading mutation validation failure
  - upload validation/dependency failure
- Backend tests for new `AppError` codes and OpenAPI schema output.

## Validation Commands

Run the smallest relevant set while iterating, then run the broader checks before handoff.

```bash
vp check
bun run audit:errors
bun run --cwd apps/web checktypes
bun run --cwd apps/web test
```

If setup or runtime behavior is wrong, run:

```bash
vp env doctor
```

## Definition of Done

- Every user-facing query has distinct loading, error, empty, and success states.
- Failed requests never render as empty lists, blank panels, zero counts, or placeholder dashes.
- Every mutation has a visible failure path and preserves user work where possible.
- Backend validation errors land on the specific form fields.
- Unknown, timeout, network, dependency, and 5xx errors show a support reference.
- Expected 4xx business errors are not reported as crashes.
- Unexpected render errors in high-risk widgets stay contained and report telemetry.
- Route segments with loading states have matching error boundaries.
- Frontend transport types come from Orval-generated OpenAPI artifacts.
- Handwritten API clients/types remain only where there is a documented reason.
- Contract artifacts are regenerated and committed when the API shape changes.
- Regression checks prevent the app from drifting back to silent fallbacks.

## Final Handoff Format

For each completed feature area, report:

- Files changed
- Error states added or improved
- Orval/generated types adopted
- Fallbacks removed
- New or updated backend error codes
- Tests added
- Commands run and results
- Remaining known gaps
