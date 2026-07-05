# Error Handling Audit Notes

Date: 2026-07-05

## Shared frontend error presenter

Scope: `apps/web/src/lib/api/assertSuccess.ts`, `apps/web/src/hooks/useApiError.ts`, `apps/web/src/components/ui/error-state.tsx`, `apps/web/src/components/ui/widget-error-boundary.tsx`, and existing feature call sites using `useApiError`.

| Call site                    | Key / transport                                                                                      | Loading state | Error state                                                                          | Empty state  | Recovery                                               | Telemetry                                                          | Work preserved                               |
| ---------------------------- | ---------------------------------------------------------------------------------------------------- | ------------- | ------------------------------------------------------------------------------------ | ------------ | ------------------------------------------------------ | ------------------------------------------------------------------ | -------------------------------------------- |
| `useApiError` consumers      | caller-owned query/mutation keys; errors come from `APIError` via `apiFetch`/Orval or legacy callers | caller-owned  | hook maps `APIError`/envelopes to user copy, field errors, retry policy, support ref | caller-owned | retry callback can be passed; field errors bind to RHF | React Query global meta for API calls; caller-owned for direct use | caller-owned; hook does not clear form state |
| `InlineError` / `ErrorState` | display-only                                                                                         | n/a           | displays caller-provided copy plus support reference                                 | n/a          | optional action on `ErrorState`                        | caller-owned                                                       | n/a                                          |
| `WidgetErrorBoundary`        | render boundary, no transport                                                                        | n/a           | catches render errors inside widget                                                  | n/a          | reset via boundary and TanStack Query reset            | `reportClientError` in `componentDidCatch`                         | surrounding page remains mounted             |

Findings:

- `useApiError` already centralizes common API error handling but returns only a message/action shape, so route/widget/component code can still expose raw messages or invent retry rules.
- `WidgetErrorBoundary` reports telemetry and isolates the page, but currently uses the thrown render error message as public copy.
- `ErrorState` and `InlineError` already display support references through `getSupportReference`; no new UI primitive is needed.

Plan for this pass:

- Extract reusable presentation logic into a pure frontend helper that accepts `unknown` and preserves `APIError` code/status/field errors/support reference.
- Keep `useApiError` API-compatible while returning richer presenter fields for future feature-area migrations.
- Change widget render crash copy to a generic public message while keeping telemetry detail in `reportClientError`.
