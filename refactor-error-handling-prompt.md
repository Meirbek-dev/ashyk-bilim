You are working in the **ashyk-bilim** monorepo, specifically `apps/web` (Next.js 16 + TanStack Query + react-hook-form). Your task is to make error handling consistent and user-legible across the app. **Do not build new infrastructure from scratch — the good primitives already exist and are underused. Your job is to audit, generalize, and enforce them, not reinvent them.**

## What already exists and must be reused, not replaced

- `src/components/ui/error-state.tsx` — `ErrorState` (page/section variant, title/description/retry button), `InlineError` (for inline/alert-style failures), and `SupportReference` (shows a request-ID/reference code from `getSupportReference(error)`). This is the correct visual language for every error state in the app. Anywhere you add error UI, use these — don't invent a new error card design.
- `src/lib/error-i18n.ts` — `ERROR_MESSAGES`/`detectLocale`, used by the route-level boundaries. Extend this vocabulary; don't create parallel one-off translation keys per feature.
- `src/lib/api/assertSuccess.ts` — the typed error contract: `ApiErrorEnvelope` (`code`, `message`, `details`, `request_id`, `field_errors`), `parseApiErrorEnvelope`, `clientApiError`, `isApiError`, `getSupportReference`. This is the source of truth for _what actually went wrong_. Every user-facing error message should be derived from this, not from a hand-written string per call site.
- `src/app/error.tsx`, `src/app/global-error.tsx`, `src/app/[locale]/error.tsx`, `src/app/not-found.tsx` — the route-level boundaries. These are well-built (retry via `reset()`, chunk-load-error → hard reload, digest shown via `SupportReference`, reported via `reportClientError`). Copy this exact pattern when adding missing route-level boundaries; don't design a new one.
- `src/lib/react-query/queryClient.ts` — global `QueryCache`/`MutationCache` handlers that key off `isApiError(error)`, `error.status`, `error.code`, and per-query `meta.expectedCodes`/`meta.userFacing`. Any new shared error-handling hook must integrate with this `meta` convention, not bypass it.
- `src/components/Objects/Editor/Extensions/EmbedObjects/EmbedObjectsErrorBoundary.tsx` — the one existing component-level error boundary. Its shape (class component, `getDerivedStateFromError`, amber alert box, `role="alert"`) is the pattern to generalize into a shared, reusable primitive — it's currently a one-off and doesn't even call `reportClientError`.

## The actual problems (verified, not assumed)

1. **Errors are fetched but not rendered.** Most components that call `useQuery`/`useMutation` never check `.error`/`isError` at all. They destructure `data` with a fallback (`data ?? []`, `role.permissions ?? []`, etc.) and render that. A failed request and an empty result are visually indistinguishable to the user.
2. **No component-level error isolation.** `react-error-boundary` isn't installed. Outside of Next's route-segment `error.tsx` convention, nothing catches a render error in a specific widget. Monaco, the video player, chart panels, the AI chat stream, PDF export, and the judge0 result panel can each crash the entire route.
3. **Generic, non-actionable, duplicated error copy.** Dozens of near-identical translation keys per feature area, each driving a bare `toast.error(t('xFailed'))` with no retry action, no distinction between "you did something wrong" (validation) vs. "we broke" (5xx) vs. "try again" (network/timeout), and no use of `field_errors` to point at the actual bad field.
4. **Some real silent failures.** A handful of `catch { }` blocks with no user feedback and no telemetry call at all (as opposed to the intentional, commented `catch` blocks used for non-critical things like `localStorage` writes, which are fine as-is — don't "fix" those).

## Hard constraints

- Reuse `ErrorState` / `InlineError` / `SupportReference` / `ERROR_MESSAGES` / `ApiErrorEnvelope` / `isApiError` everywhere. No new error-card designs, no new ad hoc error-type unions.
- Every new/updated error boundary must call `reportClientError` (from `src/services/telemetry/client.ts`), matching the existing route-level pattern — including fixing `EmbedObjectsErrorBoundary`, which currently only `console.error`s.
- Don't touch the intentionally-silent `catch` blocks that already have an explanatory comment (e.g. the `localStorage` quota/incognito ones) — those are correct as written.
- Roll this out **by feature area, not as one repo-wide PR.** Pick the highest-traffic areas first (auth, course viewing, submissions/grading), ship, verify, then continue. A single giant diff touching every component is not reviewable and not what's being asked for.
- Distinguish severity. Not every failure deserves a full-page error state — a failed inline edit is a toast with retry, a failed page-critical fetch is a section-level `ErrorState`, a failed root layout fetch is `global-error.tsx`. Don't upgrade everything to the loudest treatment.

## Steps

### 1. Audit and inventory

- Find every `useQuery`/`useSuspenseQuery`/`useMutation`/`useInfiniteQuery` call site in `src/`. For each, record whether it currently checks `.error`/`isError`/`isPending` and whether a failure is visibly distinguishable from an empty/loading state in the rendered output.
- Grep for `?? []`, `?? {}`, `?? '-'`, `?? 'N/A'` and similar fallbacks used directly in JSX or in values passed to render. For each hit, classify it: (a) legitimate default for a genuinely-optional field, (b) masking an unchecked query error — flag these, they're the real bugs.
- Grep for `toast.error(t(` across the codebase and list every distinct translation key used this way. Cluster them by underlying cause (validation / auth / network-timeout / rate-limit / permission / unknown-5xx / feature-specific-business-rule). Feature-specific business-rule messages should stay feature-specific; everything else is a candidate to collapse into the shared vocabulary from step 2.
- Grep for `catch {` / `catch (` blocks with no `reportClientError`/`toast`/re-throw inside. For each, decide: intentional-and-commented (leave it) vs. genuinely silent failure (fix it).
- List every route segment that has a `loading.tsx` but no matching `error.tsx` (there are currently far more `loading.tsx` files than `error.tsx` files — find the gaps).

### 2. Build the shared error-handling hook

Create one hook (e.g. `useApiError()` or extend the existing `queryErrorMeta`/`mutationErrorMeta` helpers in `queryClient.ts`) that:

- Takes an `unknown` error, runs it through `isApiError`/`parseApiErrorEnvelope`.
- Maps known error codes to a specific, localized, actionable message + suggested action: validation errors → return `field_errors` for the caller to apply via RHF's `setError` (see step 5); `RATE_LIMITED` → "try again shortly," no retry button (it'll just fail again immediately); `NETWORK_UNAVAILABLE`/`CLIENT_TIMEOUT` → "check your connection" + retry button; `401`/`403` → session/permission-specific copy, not a generic failure; unknown/5xx → generic apology text **plus** the `SupportReference` code, always.
- Is the single place feature code calls instead of writing a new `toast.error(t('someFeatureError'))` each time. Feature-specific copy is still supported (pass an override message), but the fallback path, the support reference, and the retry affordance come from this hook every time.

### 3. Generalize the component-level error boundary

- Extract `EmbedObjectsErrorBoundary`'s pattern into a shared `WidgetErrorBoundary` (or adopt `react-error-boundary` properly as a real dependency, since the codebase's own internal docs already reference it as the intended pattern). It must: report via `reportClientError`, render via `ErrorState`/`InlineError` (not a bespoke box), and integrate with TanStack Query's `QueryErrorResetBoundary` so retrying actually resets the wedged query instead of just re-rendering the same cached error.
- Wrap the following in it, in priority order: the AI chat/tutor streaming view, the Monaco code editor, the judge0 code-execution result panel, the video player, PDF export/preview, and dashboard chart panels. Each should degrade to a contained inline error, not take down the surrounding page.

### 4. Fix the silent-fallback sites from the audit

For every `?? []`/`?? {}` flagged in step 1(b): if the query `isError`, render `InlineError`/`ErrorState` (`variant="section"`) instead of silently falling through to the empty-array UI. Reserve the empty-state UI for `isSuccess && data.length === 0`, with its own "nothing here yet" copy that's visibly different from the error copy.

### 5. Wire server-side validation errors into forms

For `react-hook-form` mutations, when `parseApiErrorEnvelope(error).field_errors` is non-empty, call `setError(field, { message })` for each one instead of (or in addition to) a generic toast, so the user sees exactly which field is wrong, inline, next to the field.

### 6. Fill the route-level boundary gaps

For every route segment identified in step 1 with `loading.tsx` but no `error.tsx`, add one using the exact pattern from `src/app/[locale]/error.tsx` (same `ErrorState`, `ERROR_MESSAGES`, `reportClientError` call) — copy, don't redesign.

### 7. Prevent regression

- Add a lint rule (custom oxlint/eslint rule, or a small `knip`-style script like the existing `check-empty-folders.mjs`/`check-markdown-migration.mjs`) that flags a query-result fallback (`?? []`/`?? {}`) rendered in JSX without an `isError`/`.error` check anywhere in the same component. It doesn't need to be perfect — it needs to make the old pattern loud enough that it stops reappearing.
- Add Playwright tests for the highest-traffic flows (login, course viewing, submission) that mock a 500/timeout/401 response and assert the user sees a specific, non-generic error affordance with a retry path — not a blank section or an infinite spinner.

## Definition of done

- No `useQuery`/`useMutation` in a user-facing component can fail silently — every failure renders `ErrorState`/`InlineError`/a toast produced by the shared hook, never a bare fallback that looks like "no data."
- Every complex/third-party-heavy widget (editor, video, charts, AI chat, PDF, code execution) is wrapped in `WidgetErrorBoundary` and reports telemetry on catch.
- Every user-visible error communicates, in plain language: what happened, whether the user needs to do anything, and — for anything that isn't a validation error — a support reference code.
- Route segments with a `loading.tsx` have a matching `error.tsx`.
- Form validation errors from the backend land on the specific field, not just in a toast.
- The regression check from step 7 is in CI (or at least documented as a required manual check) so this doesn't quietly drift back to `?? []` over the next six months.

### Don't stop until you have fully made error handling consistent and user-legible across the app
