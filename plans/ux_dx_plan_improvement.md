# Ashyk Bilim — World-Class SaaS LMS UX & DX Improvement Plan

> Scope: critical review of the provided Repomix repository snapshot, focused on SaaS LMS user experience, developer experience, robustness, speed, and low-cost/high-gain improvements.

## Executive diagnosis

This is already a substantial LMS codebase, not a prototype. It has strong primitives: Next.js App Router, React 19, strict TypeScript, typed routes, React Compiler, TanStack Query, Base UI/shadcn-style components, Vitest, Playwright, FastAPI, Pydantic, SQLModel, OpenAPI generation, Redis, Taskiq workers, Logfire hooks, Dockerized deployment, and domain work around assessments, grading, file submissions, code execution, analytics, gamification, and AI.

The main issue is not missing ambition. The main issue is systemization. The repo contains many good pieces, but quality gates, contract discipline, migration discipline, typed boundaries, state-machine consistency, and UX recovery patterns are not yet strict enough for a world-class SaaS LMS. The fastest path is not a rewrite. It is a sequence of small enforcement layers that turn existing good practices into defaults.

## Confirmed snapshot signals

- Web source: 813 TypeScript/TSX source files, about 134,547 LOC under `apps/web/src`.
- API source: 288 Python source files, about 58,777 LOC under `apps/api/src`.
- Largest non-generated frontend files include `EditLanding.tsx` at 2,030 LOC, `UserProfileBuilder.tsx` at 1,671 LOC, `NativeItemStudio.tsx` at 1,372 LOC, and several 900+ LOC learner/assessment/editor components.
- Largest backend files include analytics, courses, assessment shared services, file submissions, code execution, grading teacher service, and assessment DB models.
- Generated frontend OpenAPI schema is 18,567 LOC; `openapi.json` has 207 paths and 319 schemas.
- Static route scan found 248 API route decorators; 123 had no explicit `response_model` in the decorator. OpenAPI also includes 47 generic/empty JSON schemas and 38 inline non-reference schemas.
- Backend type artifacts show 5 pyright errors and a 729-line mypy report.
- Static scans found roughly 711 frontend `any` occurrences, 122 web `console.*` occurrences, 148 backend `except Exception` occurrences, 25 backend `type: ignore` occurrences, and 4 frontend `@ts-ignore`/`@ts-expect-error` occurrences.
- Locale key drift exists: English has 7,774 flattened keys, Russian 7,802, Kazakh 7,921; Russian is missing 11 English keys and Kazakh is missing 12 English keys in the snapshot.
- Migration graph inspection found 51 migration files, 9 apparent heads, 7 apparent bases, and 3 missing `down_revision` references. This should be treated as release-blocking until verified/fixed.
- `src.db.model_registry.import_orm_models()` is a no-op despite being used by runtime engine startup and Alembic env.py.
- The packed snapshot did not include root `bun.lock` or `apps/api/uv.lock`, although Dockerfiles and scripts expect lockfile-based reproducibility. Verify whether Repomix excluded them or they are actually absent.
- CI exists but is incomplete as a merge gate: web lint is present, API tests/lint are present, contract sync is present, but web typecheck/tests/e2e and backend typechecks are not clearly required together.
- Docs contain stale paths/names: `FULLSTACK_TYPESAFETY.md` references `apps/web/lib/...` while actual generated types are under `apps/web/src/lib/...`; app Docker README examples still reference `learnhouse-*` image names.

## Priority model

- **P0:** release-blocking or high risk of data loss/security/reproducibility failure.
- **P1:** high-leverage improvements that should enter the next two to four engineering cycles.
- **P2:** important scale, polish, or enterprise-readiness work after the foundation is stable.

## Recommended first 14 days

- **Day 1:** Freeze the migration graph, verify lockfile status, and fix the five pyright errors.
- **Day 2:** Add migration graph check, lockfile/frozen install checks, and web/API typecheck gates to CI.
- **Day 3:** Implement real ORM model registry imports and add a metadata completeness test.
- **Day 4:** Add i18n drift check and docs path checker; fix stale docs immediately.
- **Day 5:** Create standard API error envelope and update frontend APIError parsing.
- **Days 6-7:** Start response-model hardening: top 20 JSON routes by product importance get explicit response models.
- **Days 8-9:** Centralize no-direct-fetch/no-console rules with allowlists and autofix obvious violations.
- **Days 10-11:** Create shared PageState/DataState components and migrate highest-traffic dashboard/learner pages.
- **Days 12-13:** Add Playwright smoke workflow for login, course creation, learner activity, submission, and grading.
- **Day 14:** Review metrics: migration single-head, zero pyright errors, CI required gates active, i18n no missing keys, first 20 routes typed.

## Detailed improvement backlog

The backlog below contains **150 concrete suggestions**. Items intentionally skew toward low-cost/high-gain changes before larger product architecture work.

### Build reproducibility

#### 003. [P0] Commit and enforce lockfiles

- **Effort:** S
- **Impact:** Very high
- **Evidence:** Dockerfiles copy `uv.lock` and `bun.lock`, root scripts use frozen installs, but the packed snapshot only contained `skills-lock.json`.
- **Action:** Verify whether lockfiles were excluded from the snapshot or are actually absent. If absent, generate and commit root `bun.lock` and `apps/api/uv.lock`; make CI use frozen/locked installs.
- **Done when:** API and web Docker builds succeed from a clean checkout with no network-side dependency drift; CI fails when lockfiles are out of sync.

### CI/CD

#### 004. [P0] Add a single required `quality` workflow that runs all cheap gates

- **Effort:** S
- **Impact:** Very high
- **Evidence:** Current workflows run lint/tests selectively; web typecheck, web tests, API typecheck, migration graph checks, and contract checks are not unified as one required gate.
- **Action:** Create `.github/workflows/quality.yaml` with root install, contract sync, web typecheck, web unit tests, API ruff, API pyright, API mypy baseline, API tests, migration graph check, i18n key check, and Docker smoke build.
- **Done when:** A PR cannot merge if any critical gate fails; branch protection requires the combined status.

### API contracts

#### 008. [P0] Standardize the error envelope

- **Effort:** S
- **Impact:** High
- **Evidence:** Backend has a custom HTTP/validation handler, but frontend has multiple parsing paths with `any`; not all errors share typed `code`, `message`, `details`, `request_id`.
- **Action:** Define `ApiErrorEnvelope` in Pydantic and OpenAPI. Include `code`, `message`, `details`, `field_errors`, and `request_id`. Update frontend `APIError` to use generated types.
- **Done when:** Every non-2xx JSON error has the same shape; UI can render localized field errors and support ticket IDs.

### Frontend API

#### 010. [P1] Create one typed generated client layer instead of handwritten endpoint parsing

- **Effort:** M
- **Impact:** High
- **Evidence:** The repo already generates OpenAPI TypeScript types, but services still use manual `apiFetcher<T>` and hand-built response parsing.
- **Action:** Adopt `openapi-fetch` or a small path-keyed wrapper over generated `paths`. Keep custom `apiFetch` for auth/cookies/timeouts, but make endpoint calls typed by path and method.
- **Done when:** At least 20 highest-traffic endpoints use generated request/response types; contract drift becomes a compile error.

### UX/Product

#### 011. [P1] Map the three core learner journeys as first-class product flows

- **Effort:** S/M
- **Impact:** High
- **Evidence:** The app has many LMS modules, but no visible journey contract tying discovery, enrollment/access, learning, submission, grading feedback, and certification into one UX scorecard.
- **Action:** Create a journey map for learner, teacher, admin. For each step define primary action, success state, empty state, error state, latency target, and telemetry event.
- **Done when:** Every major page can be traced to a journey stage and has a defined primary action.

#### 012. [P1] Introduce an LMS information architecture audit

- **Effort:** S/M
- **Impact:** High
- **Evidence:** Routes and components span `_shared`, locale routes, dashboard, features, and legacy components, making mental models expensive.
- **Action:** Inventory learner-facing, teacher-facing, and admin-facing navigation. Remove duplicate paths and make URLs reflect product domains, not implementation history.
- **Done when:** A one-page IA diagram exists and route naming follows it.

#### 013. [P1] Add a learner dashboard command center

- **Effort:** S/M
- **Impact:** High
- **Evidence:** The repo has course/trail/progress/gamification pieces, but a world-class LMS needs one prioritized next-action surface.
- **Action:** Create a dashboard section: continue learning, due soon, needs resubmission, teacher feedback, certificates, XP streak, saved courses.
- **Done when:** Learner can answer 'what should I do next?' within five seconds.

#### 014. [P1] Make activity completion transparent

- **Effort:** S/M
- **Impact:** High
- **Evidence:** StudentActivityWorkspace gates completion for dynamic content based on scroll completion only.
- **Action:** Add visible completion criteria: read to bottom, pass quiz, submit file, watch video threshold, code tests passed. Explain why action is disabled.
- **Done when:** Every disabled primary action has a reason and next step.

#### 015. [P1] Add a persistent course progress outline with states

- **Effort:** S/M
- **Impact:** High
- **Evidence:** OutlineRail exists, but the plan should ensure all activity states are consistent: locked, available, in progress, submitted, needs grading, complete.
- **Action:** Use one runtime state enum from backend to render outline, status strip, bottom action, and gradebook.
- **Done when:** No component invents its own activity state label or color.

#### 016. [P1] Upgrade empty states from generic blanks to guided recovery

- **Effort:** S/M
- **Impact:** High
- **Evidence:** Large admin/analytics/course pages can show empty or unavailable data without a next step.
- **Action:** Standardize empty state anatomy: cause, recommended action, CTA, secondary docs link, permission hint when relevant.
- **Done when:** All dashboard tables and course workspaces have useful empty states.

#### 017. [P1] Add unsaved-work protection everywhere authoring happens

- **Effort:** S/M
- **Impact:** High
- **Evidence:** There are dirty-guard hooks, but many large editors and modals can still be missed.
- **Action:** Create one `useAuthoringDirtyGuard` policy and run a test matrix across course settings, curriculum, assessment studio, landing editor, profile builder, and file-submission studio.
- **Done when:** Navigation, refresh, and tab close warnings work consistently for all authoring surfaces.

#### 018. [P1] Add save-state language consistency

- **Effort:** S/M
- **Impact:** High
- **Evidence:** The code contains autosave and save badge components, but UX can drift across editors.
- **Action:** Standardize states: Saved, Saving, Unsaved changes, Save failed, Offline changes pending, Conflict detected. Use the same badge across course, assessment, markdown, and profile editors.
- **Done when:** Every editor uses the same save-state component and copy.

#### 019. [P1] Add conflict resolution to all collaborative course edits

- **Effort:** S/M
- **Impact:** High
- **Evidence:** A ConflictResolutionModal exists under course pages, but optimistic updates and multi-user editing require systematic handling.
- **Action:** Use ETags or version fields for course, chapter, activity, assessment items, and settings mutations. Return 409/412 with server version and diff hints.
- **Done when:** Two teachers editing the same resource get a deterministic conflict UX, not silent overwrite.

#### 020. [P1] Make teacher grading queues action-oriented

- **Effort:** S/M
- **Impact:** High
- **Evidence:** There are gradebook, review workspace, analytics backlog panels, and bulk actions, but queues should reduce teacher work.
- **Action:** Add a unified teacher queue: needs grading, overdue, resubmission requested, flagged for plagiarism, low-confidence AI grade, learner asked question.
- **Done when:** Teacher starts from one queue and can clear work item by item.

#### 023. [P1] Add due-date and calendar surfaces

- **Effort:** S/M
- **Impact:** High
- **Evidence:** Assessments, submissions, and grading exist, but learner/teacher time management needs visibility.
- **Action:** Add calendar/agenda views and iCal export for due dates, scheduled assessments, grading windows, course releases.
- **Done when:** Learners and teachers can see upcoming work by date without opening each course.

#### 024. [P1] Make accessibility a visible product feature

- **Effort:** S/M
- **Impact:** High
- **Evidence:** There are accessibility tests, but UX needs consistent keyboard, focus, reduced motion, and captions/transcripts policies.
- **Action:** Add an Accessibility settings page and per-activity checks: captions for video, alt text for images, keyboard shortcuts overlay, reduced-motion support.
- **Done when:** Core learner and teacher journeys pass keyboard-only smoke tests.

#### 025. [P1] Add course readiness scoring

- **Effort:** S/M
- **Impact:** High
- **Evidence:** CourseReviewPublish exists, but publish readiness should be enforced uniformly.
- **Action:** Define readiness rules: title, description, thumbnail, at least one chapter/activity, no broken embeds, valid assessment policy, accessibility metadata, enrollment/access settings.
- **Done when:** Publish button shows a checklist and blocks only truly unsafe states.

#### 026. [P1] Instrument product funnels

- **Effort:** S/M
- **Impact:** High
- **Evidence:** Analytics modules exist, but product UX should track friction in creation, learning, submission, and grading.
- **Action:** Emit events for course creation abandonment, activity lock views, disabled primary action clicks, submission errors, grading completion, search no-results.
- **Done when:** Dashboard can show funnel drop-off and top UX blockers.

#### 027. [P1] Improve search relevance and no-results recovery

- **Effort:** S/M
- **Impact:** High
- **Evidence:** Search exists and DB has FTS indexes, but world-class LMS search needs useful filters and recovery.
- **Action:** Add filters by course/activity/type/teacher/tag/status and no-results suggestions. Log no-result queries.
- **Done when:** Search no-results pages offer corrections and useful fallback links.

#### 028. [P1] Create role-aware navigation previews

- **Effort:** S/M
- **Impact:** High
- **Evidence:** RBAC is rich, but admins need to understand what users can see.
- **Action:** Add 'Preview as learner/teacher/admin' for course and platform navigation. Use RBAC checks and route policy, not fake UI-only toggles.
- **Done when:** Admins can verify access before inviting users.

#### 030. [P1] Standardize localized educational copy

- **Effort:** S/M
- **Impact:** High
- **Evidence:** Locale files have thousands of keys and drift; copy quality varies across English/Russian/Kazakh.
- **Action:** Create a terminology glossary for assessment, attempt, submission, grade, course workspace, organization, and permissions.
- **Done when:** New keys use glossary terms; translation drift checks run in CI.

### Design system

#### 031. [P1] Create a page-state component contract

- **Effort:** S/M
- **Impact:** Medium-high
- **Evidence:** Many pages individually render loading/error/unavailable strings.
- **Action:** Build `<PageState>` and `<DataState>` primitives for loading, empty, error, unauthorized, stale, offline, and partial data.
- **Done when:** At least 30 pages replace ad-hoc states with the shared primitives.

#### 032. [P1] Add design tokens for semantic LMS states

- **Effort:** S/M
- **Impact:** Medium-high
- **Evidence:** Activity, submission, grade, lock, overdue, and risk states likely use local labels/colors.
- **Action:** Define tokens and variants for success, warning, danger, info, locked, draft, published, scheduled, archived, needs grading.
- **Done when:** State colors and labels are consistent across gradebook, activity shell, assessment studio, and analytics.

#### 033. [P1] Reduce giant visual components by extracting view models

- **Effort:** S/M
- **Impact:** Medium-high
- **Evidence:** Files like EditLanding.tsx, UserProfileBuilder.tsx, NativeItemStudio.tsx, and ExamAttemptContent.tsx exceed 900-2000 LOC.
- **Action:** Move data shaping, validation, and presentation rows into domain/view-model files; keep components as composition shells.
- **Done when:** Top 10 non-generated frontend files shrink below 700 LOC or have documented exceptions.

#### 036. [P1] Add automatic a11y scans to Playwright

- **Effort:** S/M
- **Impact:** Medium-high
- **Evidence:** There are unit accessibility tests, but page-level a11y regressions can slip.
- **Action:** Use axe-core in Playwright for login, dashboard, course details, activity, assessment, gradebook, admin users.
- **Done when:** Serious/critical axe violations fail CI.

#### 037. [P1] Normalize keyboard shortcuts

- **Effort:** S/M
- **Impact:** Medium-high
- **Evidence:** StudentActivityWorkspace registers O/F/Escape shortcuts locally.
- **Action:** Create a central shortcut registry that prevents conflicts, documents shortcuts, and disables inside editable targets.
- **Done when:** KeyboardShortcutsModal reads from the registry and tests assert no duplicate chord conflicts.

#### 038. [P1] Prefer CSS/container queries over runtime viewport state

- **Effort:** S/M
- **Impact:** Medium-high
- **Evidence:** There are mobile/reduced-motion hooks and many client components.
- **Action:** Audit layout components that use JS for viewport-only decisions; replace with CSS/container queries where practical.
- **Done when:** Less client state, fewer hydration risks, faster interaction startup.

#### 039. [P1] Create a zero-decorative-motion standard

- **Effort:** S/M
- **Impact:** Medium-high
- **Evidence:** The product is a utilitarian LMS dashboard; motion dependencies exist and can add noise.
- **Action:** Document motion rules: motion only clarifies state transitions, always honors reduced motion, never gates task completion.
- **Done when:** Review major dashboards/editors against the motion standard.

#### 040. [P1] Add skeleton standards

- **Effort:** S/M
- **Impact:** Medium-high
- **Evidence:** Loading components exist, but data-heavy LMS screens need stable skeleton layout to avoid jumps.
- **Action:** Create skeleton patterns for tables, cards, editor panes, activity content, analytics charts, and gradebook.
- **Done when:** Core pages have stable loading dimensions and CLS stays low.

#### 041. [P1] Improve table ergonomics for gradebook/admin screens

- **Effort:** S/M
- **Impact:** Medium-high
- **Evidence:** Gradebook uses a fixed min-width table with sticky learner column; admin tables likely need the same discipline.
- **Action:** Standardize data-table toolbar, column visibility, density, sticky columns, keyboard row navigation, CSV export, and saved filters.
- **Done when:** Gradebook, users, roles, courses, analytics tables share table primitives.

#### 042. [P1] Make form validation inline and localized

- **Effort:** S/M
- **Impact:** Medium-high
- **Evidence:** Backend and frontend validation are separate, and backend validation currently serializes generic 422 details.
- **Action:** Map backend field paths to frontend fields; use FieldError consistently; provide localized error copy by code.
- **Done when:** Submitting invalid forms highlights the exact fields with readable localized messages.

#### 043. [P1] Add destructive action review pattern

- **Effort:** S/M
- **Impact:** Medium-high
- **Evidence:** Deletes/archive/revoke actions exist across courses, roles, submissions, discussions.
- **Action:** Use one destructive-dialog component with resource name confirmation for high-risk actions and undo where safe.
- **Done when:** Deletion UX is consistent and tested for roles, courses, activities, submissions, and discussions.

#### 045. [P1] Create route-level metadata and breadcrumb policy

- **Effort:** S/M
- **Impact:** Medium-high
- **Evidence:** DashHeader appears in some new pages, but legacy/shared routes may diverge.
- **Action:** Centralize route labels, breadcrumbs, page descriptions, and required permissions.
- **Done when:** Navigation, breadcrumbs, and document titles stay consistent across locales.

### Frontend architecture

#### 046. [P1] Add a no-direct-fetch lint rule

- **Effort:** S/M
- **Impact:** High
- **Evidence:** Static scan found raw `fetch()` in actions, route handlers, revalidation, AI streaming, certifications, and api-client.
- **Action:** Allow raw fetch only in `api-client`, Next route handlers, and explicitly documented streaming/upload modules. Everything else uses typed service clients.
- **Done when:** A script fails CI on unauthorized `fetch(` usage.

#### 047. [P1] Unify 401 refresh handling

- **Effort:** S/M
- **Impact:** High
- **Evidence:** 401 redirect exists in both `apiFetch` and React Query global error handlers.
- **Action:** Create one auth-refresh coordinator with idempotent pending state, returnTo handling, and test coverage for concurrent 401s.
- **Done when:** Ten concurrent expired-session requests trigger one refresh redirect and no loop.

#### 048. [P1] Add timeout and retry policy by endpoint class

- **Effort:** S/M
- **Impact:** High
- **Evidence:** Central apiFetch uses a 30s timeout; React Query retries are generic.
- **Action:** Define request classes: read, mutation, upload, streaming, code-run, analytics export. Assign timeout, retry, cancellation, and toast policy per class.
- **Done when:** Slow exports/uploads do not time out incorrectly; normal reads fail fast with actionable messages.

#### 049. [P2] Make query keys feature-owned and generated where possible

- **Effort:** S/M
- **Impact:** Medium
- **Evidence:** `queryKeys.ts` is a global object; courseKeys also exists separately.
- **Action:** Move keys to feature modules or generate helpers from endpoint descriptors. Keep a small root barrel only.
- **Done when:** Invalidation calls are discoverable from the feature owning the data.

#### 050. [P1] Add React Query cache invalidation tests

- **Effort:** S/M
- **Impact:** High
- **Evidence:** Mutations exist across course/activity/chapter/assessment, with high risk of stale UI.
- **Action:** For every mutation, assert invalidated query keys using a fake QueryClient in unit tests.
- **Done when:** Creating/deleting/reordering content always refreshes affected list/detail/runtime queries.

#### 051. [P1] Segment heavy editor and chart bundles

- **Effort:** S/M
- **Impact:** High
- **Evidence:** Dependencies include TipTap, Monaco, Recharts, Shiki, pdfme, Artplayer, motion.
- **Action:** Run bundle analysis, then dynamically import Monaco, TipTap extensions, Shiki, chart panels, certificate PDF generation, and video player only where used.
- **Done when:** Initial dashboard and course list bundles exclude heavy authoring/runtime libraries.

#### 053. [P2] Replace repeated `useEffect` state syncing with URL/query utilities

- **Effort:** S/M
- **Impact:** Medium
- **Evidence:** There are 255 `useEffect(` occurrences across 134 web files; some are necessary, some are sync glue.
- **Action:** Audit high-churn pages and use derived state, server components, React Query selectors, or URL state helpers where possible.
- **Done when:** Top 20 client components lose unnecessary effects and become easier to reason about.

#### 054. [P1] Create a typed local-storage/session-storage wrapper

- **Effort:** S/M
- **Impact:** High
- **Evidence:** Static scan found 44 storage/cookie usages across 19 files.
- **Action:** Use Valibot-backed storage schemas with migration/versioning and SSR-safe accessors.
- **Done when:** All persisted preferences and query-cache metadata are schema-validated before use.

#### 055. [P1] Remove `@ts-ignore` from reduced data/motion hooks

- **Effort:** S/M
- **Impact:** High
- **Evidence:** The only `@ts-ignore` usages appear in reduced-data and reduced-motion hooks.
- **Action:** Add proper TypeScript declarations for browser APIs or use feature-detected typed wrappers.
- **Done when:** No `@ts-ignore`; `@ts-expect-error` allowed only with tracking issue and expiry.

#### 056. [P1] Introduce a frontend error taxonomy

- **Effort:** S/M
- **Impact:** High
- **Evidence:** Console errors appear in 60 files and UI error rendering varies.
- **Action:** Define `AuthError`, `PermissionError`, `ValidationError`, `ConflictError`, `NetworkError`, `TimeoutError`, `UnknownError`. Use typed handling in services and components.
- **Done when:** User-facing errors render by taxonomy; console logging is centralized.

#### 057. [P1] Ban production `console.*` outside logging adapters

- **Effort:** S/M
- **Impact:** High
- **Evidence:** There are 122 `console.` occurrences in web source.
- **Action:** Add ESLint rule: no-console except `app/api/log-error`, test setup, and a logger adapter. Replace with telemetry/logger utilities.
- **Done when:** No accidental console spam in production bundles.

#### 058. [P1] Add route-level error boundaries for all dashboard feature islands

- **Effort:** S/M
- **Impact:** High
- **Evidence:** Some routes have error.tsx/loading.tsx, but coverage appears uneven.
- **Action:** Generate a route inventory and add missing loading/error/not-found boundaries for long-loading feature routes.
- **Done when:** Every dashboard route has a localized recovery boundary.

#### 059. [P2] Make frontend service modules return domain view models

- **Effort:** S/M
- **Impact:** Medium
- **Evidence:** Many service modules expose transport shapes or `any` directly.
- **Action:** Use mappers from generated API DTOs to UI view models at service boundaries.
- **Done when:** Components consume stable UI models and do not know OpenAPI wire quirks.

#### 060. [P1] Add pagination metadata contracts

- **Effort:** S/M
- **Impact:** High
- **Evidence:** Course list parses `x-total-count` and summary headers manually.
- **Action:** Standardize list responses as `{items,total,page,page_size,summary}` unless streaming/file download requires headers.
- **Done when:** Frontend stops parsing ad-hoc count headers for normal JSON lists.

#### 061. [P2] Create a frontend dependency-boundary rule

- **Effort:** S/M
- **Impact:** Medium
- **Evidence:** Feature and legacy component directories can import across layers freely.
- **Action:** Use ESLint boundaries or dependency-cruiser: app -> features -> components/ui/lib; features cannot import legacy dashboard internals unless whitelisted.
- **Done when:** New cross-feature imports fail lint unless allowed.

#### 062. [P1] Extract generated OpenAPI schema from normal lint/type hot path

- **Effort:** S/M
- **Impact:** High
- **Evidence:** Generated schema.ts is 18,567 LOC and can slow editor/CI checks.
- **Action:** Mark generated folder as generated, exclude from lint/coverage, and use project references or skip direct linting while retaining type availability.
- **Done when:** Developer feedback loops do not spend time linting generated code.

#### 063. [P1] Normalize UUID handling

- **Effort:** S/M
- **Impact:** High
- **Evidence:** Code trims prefixes like `course_` and `activity_` in UI before navigation/API calls.
- **Action:** Create branded ID helpers: `CourseUuid`, `ActivityUuid`, `normalizeCourseUuid`, `toRouteCourseUuid`; use consistently in services/routes.
- **Done when:** No component manually calls `.replace(/^course_/, '')` or similar.

#### 064. [P2] Add typed URL/search-param helpers

- **Effort:** S/M
- **Impact:** Medium
- **Evidence:** Gradebook manually syncs filters with URLSearchParams.
- **Action:** Create feature-specific search-param schemas with parse/serialize/defaults and tests.
- **Done when:** Changing URL params cannot produce invalid filter state.

#### 065. [P1] Add optimistic update rollback patterns

- **Effort:** S/M
- **Impact:** High
- **Evidence:** Mutations and drag/drop curriculum workflows are high-risk for stale or failed writes.
- **Action:** Standardize optimistic updates with rollback, toast, and query invalidation. Use it for reordering, role toggles, activity publish, grade changes.
- **Done when:** Failed optimistic mutations visibly revert and explain why.

### Backend/API

#### 066. [P1] Add a catch-all unhandled exception handler

- **Effort:** S/M
- **Impact:** High
- **Evidence:** `errors.py` handles HTTPException and RequestValidationError only.
- **Action:** Add a safe 500 handler that logs exception with request_id and returns the standard error envelope without leaking internals.
- **Done when:** Unexpected backend errors return localized-safe JSON with request_id.

#### 067. [P1] Propagate correlation IDs into logs and task events

- **Effort:** S/M
- **Impact:** High
- **Evidence:** Middleware returns X-Request-ID but does not obviously bind it into logging context or background task metadata.
- **Action:** Use contextvars/logging filters to include request_id, user_id, route, tenant/org, and task_id in logs.
- **Done when:** One production error can be traced from browser error report to API log to worker task.

#### 068. [P2] Add typed service exceptions instead of broad `HTTPException` from deep layers

- **Effort:** S/M
- **Impact:** Medium
- **Evidence:** Many services and routers catch broad exceptions; HTTP errors can mix transport and domain logic.
- **Action:** Define domain exceptions in services and translate them to HTTP at router boundary.
- **Done when:** Service tests assert domain exceptions without requiring FastAPI response objects.

#### 069. [P1] Reduce broad `except Exception` blocks with a safety budget

- **Effort:** S/M
- **Impact:** High
- **Evidence:** Static scan found 148 `except Exception` occurrences in 57 API files.
- **Action:** Classify each broad catch as boundary, best-effort side effect, or bug masking. Replace internal ones with specific exceptions; log all swallowed exceptions at debug/warning with context.
- **Done when:** Broad catches remain only at explicit boundary adapters.

#### 070. [P1] Add transaction boundary policy

- **Effort:** S/M
- **Impact:** High
- **Evidence:** Services and routers commit/rollback in many places; background retrieval opens its own sessions.
- **Action:** Document and enforce: routers do not commit except thin use cases; services own transactions or unit-of-work does. Use `session.begin()` for multi-write operations.
- **Done when:** Code review has a transaction checklist and tests cover partial failure rollback.

#### 071. [P1] Make health checks dependency-specific and non-leaky

- **Effort:** S/M
- **Impact:** High
- **Evidence:** Readiness returns exception detail strings for DB/Redis/Taskiq.
- **Action:** Return safe status codes and internal logs; expose details only in development or internal metrics.
- **Done when:** Public readiness does not leak connection strings, hostnames, or exception internals.

#### 072. [P1] Split public and internal health/metrics

- **Effort:** S/M
- **Impact:** High
- **Evidence:** Internal routes include metrics/dead letters under API router; health is public.
- **Action:** Put internal operational endpoints behind network/auth protection and separate prefix. Keep `/health/live` and `/health/ready` public-safe.
- **Done when:** No internal dead-letter/metrics endpoint is reachable by a normal user.

#### 073. [P1] Add API idempotency keys for high-risk mutations

- **Effort:** S/M
- **Impact:** High
- **Evidence:** Course creation, file submissions, grading, code execution, role assignment can be retried by browser/network.
- **Action:** Support `Idempotency-Key` on create/submit/grade/role-write endpoints with Redis or DB-backed response replay.
- **Done when:** Double-click/retry does not create duplicate courses/submissions/grades.

#### 074. [P1] Add optimistic concurrency to mutable resources

- **Effort:** S/M
- **Impact:** High
- **Evidence:** The grading DB model mentions If-Match/version, but policy should cover more domains.
- **Action:** Add `version`/ETag to course, chapter, activity, assessment, submission grade, role permissions, platform settings.
- **Done when:** Concurrent edits produce 409/412 instead of last-write-wins.

#### 075. [P1] Normalize datetime handling at API boundaries

- **Effort:** S/M
- **Impact:** High
- **Evidence:** Schema audit docs mention historical timestamp inconsistencies; strict base model has date coercion helper.
- **Action:** Ensure all public timestamps are timezone-aware ISO strings; reject naive datetimes in new models; add tests around Asia/Almaty due dates.
- **Done when:** No new DTO accepts or emits naive datetime.

#### 076. [P2] Add database query-count tests for hot endpoints

- **Effort:** S/M
- **Impact:** Medium
- **Evidence:** Analytics/course services are large and query-heavy; slow-query logging threshold comment says 500ms but code uses 0.3s.
- **Action:** Use SQLAlchemy event counters in tests for course detail, activity runtime, gradebook, analytics overview, search.
- **Done when:** Hot endpoint query counts have budgets and regression tests.

#### 078. [P1] Create a repository/query helper for SQLModel typing

- **Effort:** S/M
- **Impact:** High
- **Evidence:** Mypy/pyrefly reports show many SQLModel `Session.exec` overload issues.
- **Action:** Wrap common select patterns with typed helpers or use SQLAlchemy execute/scalars consistently. Document when to use `sa_execute`.
- **Done when:** New SQL queries no longer require ad-hoc type ignores.

#### 080. [P2] Introduce API pagination standards

- **Effort:** S/M
- **Impact:** Medium
- **Evidence:** Some endpoints use page/limit path params, headers, arrays, and CSV/file responses inconsistently.
- **Action:** Standardize query params `page`, `page_size`, `cursor`; use consistent response envelope and OpenAPI metadata.
- **Done when:** New list endpoints follow one pagination pattern.

#### 081. [P1] Add request-size limits by endpoint

- **Effort:** S/M
- **Impact:** High
- **Evidence:** Nginx has 500M global body limit; uploads/code/JSON should differ.
- **Action:** Set per-route limits for JSON payloads, file uploads, code submissions, AI messages, and link previews.
- **Done when:** Oversized requests fail early with clear typed errors.

#### 082. [P2] Make background task failures first-class

- **Effort:** S/M
- **Impact:** Medium
- **Evidence:** Taskiq workers exist and dead-letter endpoints exist, but no user-facing task status contract is visible.
- **Action:** Use task records for long jobs: pending/running/succeeded/failed/retryable/cancelled with user-visible status where relevant.
- **Done when:** Bulk grading, plagiarism, AI indexing, upload cleanup expose traceable statuses.

#### 084. [P1] Centralize permission checks at use-case boundaries

- **Effort:** S/M
- **Impact:** High
- **Evidence:** RBAC is robust but scattered route/service checks can drift.
- **Action:** Create use-case guards for course author, learner access, assessment submit, grade review, platform admin. Use them consistently.
- **Done when:** Horizontal privilege escalation tests cover every resource type.

#### 085. [P2] Make SSE/streaming routes contract-tested

- **Effort:** S/M
- **Impact:** Medium
- **Evidence:** AI and grading SSE routes are likely generic/empty in OpenAPI.
- **Action:** Define event schemas, heartbeat policy, retry semantics, and tests for disconnect/cancellation/backpressure.
- **Done when:** Clients can type event payloads and recover from stream interruption.

### Data/domain

#### 086. [P0] Define the tenancy model explicitly

- **Effort:** M
- **Impact:** High
- **Evidence:** UI copy references organization/workspace, but grep found no backend tenant model in core entities.
- **Action:** Decide: single platform, organization-as-tenant, or multi-tenant SaaS. Add tenant/org IDs and row-level scoping plan before enterprise rollout.
- **Done when:** Every core query has a tenant/org scope and tests for cross-tenant access denial.

#### 087. [P1] Create a data classification matrix

- **Effort:** M
- **Impact:** High
- **Evidence:** Uploads, grades, submissions, AI chat, auth sessions, and audit logs have different privacy requirements.
- **Action:** Classify data as public, internal, educational record, credential, secret, generated AI, executable code. Define retention and export policy.
- **Done when:** Engineering knows which fields can be logged, exported, cached, and deleted.

#### 088. [P1] Add audit logs for all grade and permission mutations

- **Effort:** M
- **Impact:** High
- **Evidence:** Auth audit exists; role audit exists; grading has events, but audit scope should be explicit.
- **Action:** Record actor, target, before/after summary, request_id, IP, user_agent, reason/comment for grade overrides, role grants, course access changes.
- **Done when:** Admins can reconstruct critical changes without database spelunking.

#### 089. [P2] Add soft-delete/restore policy for authoring objects

- **Effort:** M
- **Impact:** Medium
- **Evidence:** Courses, chapters, activities, items, submissions, discussions can be accidentally deleted.
- **Action:** Use soft delete with restore windows for author-created content; hard delete only for retention/privacy workflows.
- **Done when:** Teachers can recover mistakenly deleted course content.

#### 090. [P1] Build a canonical LMS state machine document

- **Effort:** M
- **Impact:** High
- **Evidence:** Assessment, submission, activity progress, grading, file submission, code execution all have state concepts.
- **Action:** Document state machines and allowed transitions. Generate enums/shared docs from source where possible.
- **Done when:** State transitions are enforced in service tests and rendered consistently in UI.

#### 091. [P2] Separate question bank from assessment instances

- **Effort:** M
- **Impact:** Medium
- **Evidence:** Existing analysis docs already identify question bank as a world-class LMS gap.
- **Action:** Plan item banks, randomized draws, tags, difficulty, versioning, reuse, and assessment-specific overrides.
- **Done when:** Teachers can reuse questions across assessments without copying item bodies.

#### 092. [P2] Add rubric model as a first-class domain

- **Effort:** M
- **Impact:** Medium
- **Evidence:** Grading has rubric-like fields and feedback, but world-class grading needs reusable rubrics.
- **Action:** Create rubrics with criteria, levels, weights, comments, and criterion-level feedback. Support attaching to file, open-text, code, project activities.
- **Done when:** Teacher can grade consistently with reusable rubrics and learner can see criterion feedback.

#### 093. [P1] Add attempt security policy versioning

- **Effort:** M
- **Impact:** High
- **Evidence:** Assessment policy/code lifecycle exists, but attempts must preserve the policy active at start.
- **Action:** Snapshot relevant policy into attempt/submission at start: time limit, late policy, shuffle seed, access rules, allowed languages, test suite version.
- **Done when:** Policy edits do not retroactively change active attempts incorrectly.

#### 094. [P1] Normalize file metadata and virus/unsafe-content status

- **Effort:** M
- **Impact:** High
- **Evidence:** Uploads are central for LMS; file validation exists.
- **Action:** Track file status: staged, scanning, accepted, rejected, quarantined, deleted. Store MIME, size, hash, owner, resource, retention.
- **Done when:** Users cannot download files until validation/scanning policy passes.

#### 095. [P2] Add data retention jobs

- **Effort:** M
- **Impact:** Medium
- **Evidence:** There are upload reaper/session tasks but no visible global retention policy.
- **Action:** Implement retention for expired sessions, old failed uploads, audit logs, AI chats, code runs, backup rotation, orphaned content.
- **Done when:** Ops dashboard shows retention job success/failure and counts.

#### 096. [P1] Create DB invariant tests

- **Effort:** M
- **Impact:** High
- **Evidence:** Migrations and schema are actively changing; docs mention historical integrity issues.
- **Action:** Add tests for foreign keys, non-null critical fields, cascade rules, unique constraints, timestamps, JSONB usage, and index existence.
- **Done when:** Schema regressions fail before deploy.

#### 097. [P1] Add seeded demo data for development

- **Effort:** M
- **Impact:** High
- **Evidence:** E2E creates users/course but developers need fast local realistic data.
- **Action:** Create `uv run cli.py seed-demo` with org, users, course, activities, assessments, submissions, grades, analytics.
- **Done when:** A fresh developer can load a rich LMS state in one command.

#### 098. [P1] Create stable public IDs and internal IDs policy

- **Effort:** M
- **Impact:** High
- **Evidence:** UI often works with UUID strings and route-normalized IDs.
- **Action:** Document when to expose UUIDs vs integer IDs. Brand types in TS and Pydantic DTOs. Never expose internal DB IDs where not needed.
- **Done when:** New endpoints follow ID exposure policy.

#### 099. [P2] Add analytics rollup freshness tracking

- **Effort:** M
- **Impact:** Medium
- **Evidence:** Analytics rollups exist and refresh command exists.
- **Action:** Persist `last_refreshed_at`, source window, row counts, and warnings for each rollup. Surface stale analytics state in UI.
- **Done when:** Teachers know when analytics were last updated.

#### 100. [P2] Plan read replicas/materialized views for analytics

- **Effort:** M
- **Impact:** Medium
- **Evidence:** Analytics service files are large and likely query-intensive.
- **Action:** For scale, move expensive analytics to rollups/materialized views and async refresh. Keep transactional LMS queries separate.
- **Done when:** Dashboard load is not coupled to live grading/submission writes.

### Testing/quality

#### 101. [P0] Add API typecheck jobs to CI

- **Effort:** S/M
- **Impact:** High
- **Evidence:** API workflows run ruff and pytest but not pyright/mypy/pyrefly as required gates.
- **Action:** Add `uv run basedpyright .` and a mypy baseline ratchet to API workflow.
- **Done when:** Backend type regressions fail before merge.

#### 102. [P0] Add web typecheck and unit tests to CI

- **Effort:** S/M
- **Impact:** High
- **Evidence:** Web workflow runs lint only, not `check-types` or Vitest.
- **Action:** Add `bun run check-types` and `bun run test` to web workflow. Cache Bun and Next typegen.
- **Done when:** Frontend type/unit regressions fail before merge.

#### 103. [P1] Add Playwright smoke to CI on critical PRs

- **Effort:** S/M
- **Impact:** High
- **Evidence:** E2E suite exists but no workflow runs it.
- **Action:** Run smoke on every web/fullstack PR; run full serial journey nightly or on release branch.
- **Done when:** Broken login/course/student/grading journeys are caught automatically.

#### 104. [P1] Make E2E test data isolated per run

- **Effort:** S/M
- **Impact:** High
- **Evidence:** Playwright uses default admin/teacher/student emails and serial state.
- **Action:** Generate unique emails/course titles per run or reset DB. Store created IDs for cleanup.
- **Done when:** Rerunning E2E does not depend on leftover state.

#### 105. [P1] Add contract tests for OpenAPI shape quality

- **Effort:** S/M
- **Impact:** High
- **Evidence:** OpenAPI has generic/empty schemas for many JSON endpoints.
- **Action:** Test: no generic schemas for JSON route responses except allowlist; no anonymous inline schemas on public endpoints; operation IDs stable.
- **Done when:** Contract quality is objectively enforced.

#### 106. [P1] Add i18n key drift CI

- **Effort:** S/M
- **Impact:** High
- **Evidence:** en-US has 7774 keys, ru-RU 7802, kk-KZ 7921; ru misses 11 English keys, kk misses 12 and has 159 extra.
- **Action:** Create a script that flattens locale JSON, fails on missing keys, reports extras, and optionally sorts keys.
- **Done when:** No locale can miss a key used in the base language.

#### 107. [P2] Add route inventory snapshot tests

- **Effort:** S/M
- **Impact:** Medium
- **Evidence:** Next App Router has many route groups and duplicated `_shared` paths.
- **Action:** Generate a route manifest and snapshot it. Require review for route additions/removals and missing metadata.
- **Done when:** Navigation changes are intentional and visible in PRs.

#### 108. [P1] Add mutation error-path tests

- **Effort:** S/M
- **Impact:** High
- **Evidence:** Existing tests focus on many domains, but UI mutation error states can be weak.
- **Action:** For each critical mutation, test validation error, 401, 403, 409/412, 429, 500, timeout.
- **Done when:** Mutations render actionable recovery, not generic failure.

#### 109. [P2] Add property tests for state transitions

- **Effort:** S/M
- **Impact:** Medium
- **Evidence:** The repo already uses fast-check in editor tests.
- **Action:** Apply property-based tests to assessment attempt transitions, grading scoring, activity progress, and access windows.
- **Done when:** Invalid state transitions are rejected for generated inputs.

#### 110. [P1] Add accessibility regression test fixtures

- **Effort:** S/M
- **Impact:** High
- **Evidence:** There are editor accessibility tests only in unit layer.
- **Action:** Use Testing Library + Playwright axe for forms, dialogs, tables, activity shell, assessment attempt, gradebook.
- **Done when:** A11y issues are caught at component and page level.

#### 111. [P2] Add visual regression for high-value flows

- **Effort:** S/M
- **Impact:** Medium
- **Evidence:** No visual regression tooling is visible.
- **Action:** Use Playwright screenshots for login, dashboard, course creation, activity shell, assessment, gradebook, admin roles in light/dark.
- **Done when:** Unexpected UI shifts are reviewed before merge.

#### 112. [P2] Create flaky-test policy

- **Effort:** S/M
- **Impact:** Medium
- **Evidence:** Playwright retries once in CI by config, but no workflow/artifacts are visible.
- **Action:** Track retries, quarantine only with issue links, and fail builds when flake budget is exceeded.
- **Done when:** Flakes become work items, not ignored noise.

#### 113. [P0] Add migration-upgrade smoke with real Postgres

- **Effort:** S/M
- **Impact:** High
- **Evidence:** API tests likely use SQLite fixtures; compose has Postgres.
- **Action:** CI starts Postgres and runs `alembic upgrade head`; optionally `downgrade -1` for latest migration.
- **Done when:** Migrations are validated against the production database engine.

#### 114. [P1] Add upload tests for malicious files

- **Effort:** S/M
- **Impact:** High
- **Evidence:** File validation exists, upload surface is large.
- **Action:** Test MIME spoofing, oversize, path traversal names, ZIP bombs if accepted, SVG scripts, duplicate chunks, abandoned sessions.
- **Done when:** Unsafe files are rejected with typed errors.

#### 115. [P1] Add rate-limit tests with Redis

- **Effort:** S/M
- **Impact:** High
- **Evidence:** Auth rate limiter exists; nginx and backend both rate-limit.
- **Action:** Test login/email/IP limits, refresh limits, Retry-After headers, account lock behavior, and Redis-unavailable fallback.
- **Done when:** Auth abuse controls are deterministic.

#### 116. [P1] Add permission matrix tests

- **Effort:** S/M
- **Impact:** High
- **Evidence:** RBAC is core; current tests cover some workflows.
- **Action:** Generate tests from a permission matrix for anonymous, learner, teacher, course author, admin across course/activity/assessment/grade resources.
- **Done when:** Horizontal and vertical escalation attempts fail consistently.

#### 117. [P2] Add AI safety and cost tests

- **Effort:** S/M
- **Impact:** Medium
- **Evidence:** AI service, moderation, retrieval, embeddings, streaming exist.
- **Action:** Test prompt-size limits, moderation enabled/disabled, cache behavior, timeout fallback, and streaming cancellation.
- **Done when:** AI endpoints cannot accidentally create unbounded cost or unsafe output flows.

#### 118. [P1] Add code runner sandbox tests

- **Effort:** S/M
- **Impact:** High
- **Evidence:** Judge0 integration exists and code_execution tests exist.
- **Action:** Expand tests for timeouts, memory/output limits, disallowed languages, infinite loops, huge stdout, malicious stdin, Judge0 unavailable.
- **Done when:** Code runner failures are safe and user-readable.

#### 119. [P1] Add dependency/license/security scanning

- **Effort:** S/M
- **Impact:** High
- **Evidence:** No workflow for dependency audit is visible.
- **Action:** Add `bun audit` or OSV, `uv pip audit`/pip-audit equivalent, and license review for production dependencies.
- **Done when:** Known critical vulns fail release builds.

#### 120. [P2] Track coverage by critical domain, not global percentage only

- **Effort:** S/M
- **Impact:** Medium
- **Evidence:** API has coverage artifact for security tests; broader coverage gates are not visible.
- **Action:** Define domain coverage goals for auth/RBAC, grading, submissions, assessments, uploads, API client, route guards.
- **Done when:** Critical code coverage cannot silently drop.

### DX/tooling/docs

#### 121. [P1] Fix stale docs paths and product names

- **Effort:** S/M
- **Impact:** High
- **Evidence:** FULLSTACK_TYPESAFETY says generated types are under `apps/web/lib/...`, but actual path is `apps/web/src/lib/...`; READMEs refer to learnhouse image names.
- **Action:** Update docs to current paths, names, commands, and env files. Add a docs lint script that checks referenced files exist.
- **Done when:** Docs no longer instruct developers to use stale paths or image names.

#### 122. [P1] Create a one-command local dev bootstrap

- **Effort:** S/M
- **Impact:** High
- **Evidence:** Root `dev` starts db/redis and turbo, but migrations, seed, contracts, and env validation are separate.
- **Action:** Add `bun run setup:dev`: verify env, install deps, start services, run migrations, generate contracts, seed demo data.
- **Done when:** A new developer reaches login page with seeded data in one command after cloning.

#### 123. [P1] Add preflight diagnostics

- **Effort:** S/M
- **Impact:** High
- **Evidence:** Env contracts exist but config errors may surface during runtime/build.
- **Action:** Create `bun run doctor` that checks Node/Bun/Python/uv/Docker versions, env vars, ports, lockfiles, DB/Redis/Judge0 connectivity, migration heads.
- **Done when:** Common setup failures are diagnosed before app start.

#### 124. [P1] Use frozen installs in CI

- **Effort:** S/M
- **Impact:** High
- **Evidence:** Current CI uses `bun install --no-frozen-lockfile` in multiple workflows.
- **Action:** Switch to frozen installs after committing lockfiles. Cache dependencies by lockfile hash.
- **Done when:** CI is reproducible and faster.

#### 125. [P2] Create code ownership by domain

- **Effort:** S/M
- **Impact:** Medium
- **Evidence:** The codebase spans LMS, auth, grading, AI, analytics, code runner, editor, platform.
- **Action:** Add CODEOWNERS for critical domains and route reviewers automatically.
- **Done when:** High-risk changes get appropriate reviewers.

#### 126. [P2] Add architecture decision records

- **Effort:** S/M
- **Impact:** Medium
- **Evidence:** Plans exist, but decisions should be durable.
- **Action:** Create ADRs for API contracts, state machines, tenancy, auth cookies, background jobs, generated client, editor architecture.
- **Done when:** New contributors can understand why architecture works this way.

#### 128. [P1] Add a source-of-truth module map

- **Effort:** S/M
- **Impact:** High
- **Evidence:** Frontend has `components`, `features`, `services`, `hooks`, legacy `_shared`; backend has routers/services/db/tasks/worker.
- **Action:** Document allowed layer dependencies and domain ownership for both web and API.
- **Done when:** Developers know where new code belongs.

#### 129. [P2] Introduce scaffolding generators

- **Effort:** S/M
- **Impact:** Medium
- **Evidence:** Large codebase consistency will slow without templates.
- **Action:** Add generators for API route + DTO + test + OpenAPI contract; frontend feature query/mutation/component/test; migration template.
- **Done when:** New feature skeletons take minutes and match repo standards.

#### 130. [P2] Add changed-files focused checks

- **Effort:** S/M
- **Impact:** Medium
- **Evidence:** Turborepo exists but CI workflows are hand-written and sometimes install in subdirectories.
- **Action:** Use Turborepo remote/local cache and changed package filters for fast PR checks, plus nightly full checks.
- **Done when:** Normal PR quality feedback is fast enough to encourage small commits.

#### 132. [P1] Create a PR checklist optimized for SaaS LMS risk

- **Effort:** S/M
- **Impact:** High
- **Evidence:** No checklist content inspected beyond issue templates.
- **Action:** Checklist: contracts generated, migration tested, permissions covered, i18n keys added, empty/error/loading states, telemetry event, docs if needed.
- **Done when:** Reviewers consistently catch LMS-specific regressions.

#### 134. [P1] Create domain glossary in repo

- **Effort:** S/M
- **Impact:** High
- **Evidence:** Translations and code use terms like workspace, organization, platform, assessment, exam, quiz, submission.
- **Action:** Publish glossary with canonical English/Russian/Kazakh terms and use it for messages, DTO names, docs.
- **Done when:** New copy and API names are consistent.

#### 135. [P2] Add development observability defaults

- **Effort:** S/M
- **Impact:** Medium
- **Evidence:** Logfire is configurable, logging exists, but local debugging can still be fragmented.
- **Action:** Create local structured logs, SQL query threshold, request IDs in browser API errors, and a debug panel visible only in dev.
- **Done when:** Developers can diagnose a failed request without adding console.log.

### Security/ops/cost

#### 136. [P1] Add Content Security Policy

- **Effort:** S/M
- **Impact:** High
- **Evidence:** Nginx sets HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, but no CSP was visible.
- **Action:** Start with report-only CSP, inventory inline scripts/third-party origins, then enforce. Include frame/media/img/connect policies for LMS embeds.
- **Done when:** CSP reports are clean enough to enforce without breaking core flows.

#### 137. [P0] Do not expose DB, Redis, or Judge0 ports in production compose

- **Effort:** S/M
- **Impact:** High
- **Evidence:** Compose maps Postgres 5432, Redis 6379, and Judge0 2358 to host.
- **Action:** Move host port exposure to development override compose file. Production should use internal networks only, except nginx.
- **Done when:** Production compose exposes only 80/443 unless a deliberate ops override is used.

#### 138. [P1] Gate privileged Judge0 profile carefully

- **Effort:** S/M
- **Impact:** High
- **Evidence:** Judge0 containers are privileged and mounted cgroups; code execution is high-risk.
- **Action:** Keep code runner behind explicit profile, separate host if possible, resource limits, network egress restrictions, monitoring, and regular patching.
- **Done when:** Running LMS without code-runner does not start privileged containers.

#### 139. [P1] Add backup restore drills

- **Effort:** S/M
- **Impact:** High
- **Evidence:** Backups are configured, but restore validation is the real guarantee.
- **Action:** Create automated monthly restore to temporary volumes and run health/migration checks. Document RPO/RTO.
- **Done when:** Backup is considered healthy only after a successful restore drill.

#### 140. [P1] Add secret scanning

- **Effort:** S/M
- **Impact:** High
- **Evidence:** Env examples include many secrets and bootstrap variables.
- **Action:** Enable gitleaks or GitHub secret scanning; fail PRs on committed secrets. Add `.env` patterns to denylist.
- **Done when:** Secrets cannot be merged accidentally.

#### 141. [P0] Separate public content from private submissions

- **Effort:** S/M
- **Impact:** High
- **Evidence:** `/content` is mounted as static files and nginx proxies `/content`; upload privacy requirements differ.
- **Action:** Use signed URLs or authorization-checked download routes for private files; reserve `/content/public` for public assets only.
- **Done when:** Learner submissions cannot be fetched by guessing URLs.

#### 142. [P2] Add object storage abstraction

- **Effort:** S/M
- **Impact:** Medium
- **Evidence:** Current content is a Docker volume under `/app/content`.
- **Action:** Create storage interface for local/S3-compatible backends with signed URLs, lifecycle policies, and virus scanning hooks.
- **Done when:** Production can move media off app containers without rewriting features.

#### 143. [P1] Add rate-limit observability

- **Effort:** S/M
- **Impact:** High
- **Evidence:** Nginx and backend rate limit, but user/admin visibility is unclear.
- **Action:** Log rate-limit decisions with namespace, subject hash, retry-after; expose metrics. Avoid logging raw emails/IPs where not needed.
- **Done when:** Abuse spikes can be diagnosed without leaking PII.

#### 144. [P1] Add per-user and per-organization AI cost controls

- **Effort:** S/M
- **Impact:** High
- **Evidence:** AI settings include model/timeouts/cache but no obvious budget controls.
- **Action:** Track tokens, requests, cache hits, cost estimates by user/org/course. Add quotas and admin controls.
- **Done when:** AI spend cannot grow unbounded from one class or user.

#### 145. [P1] Add code execution cost and abuse controls

- **Effort:** S/M
- **Impact:** High
- **Evidence:** Judge0 integration permits compute-heavy workloads.
- **Action:** Track runs per user/course, CPU/memory/time/out bytes, failures. Add quotas and teacher/admin overrides.
- **Done when:** A single user cannot exhaust code runner capacity.

#### 146. [P1] Add PII-safe logging policy

- **Effort:** S/M
- **Impact:** High
- **Evidence:** Broad exception logs and health details can include sensitive data.
- **Action:** Redact emails, tokens, cookies, file names where necessary. Add logger tests for auth headers/cookies.
- **Done when:** Logs are useful but safe for support/ops access.

#### 147. [P1] Add release rollback checklist with migration compatibility

- **Effort:** S/M
- **Impact:** High
- **Evidence:** Deployment docs discuss manual migrations/rollback.
- **Action:** Add expand/contract migration policy, pre-deploy backups, compatibility checks, and rollback decision tree.
- **Done when:** Releases with schema changes have a documented safe path backward or a no-rollback note.

#### 148. [P2] Add SLOs for learner-critical paths

- **Effort:** S/M
- **Impact:** Medium
- **Evidence:** Health endpoints exist but product SLOs are not visible.
- **Action:** Define SLOs: login p95, course page p95, activity runtime p95, submit p95, gradebook p95, error rate, worker latency.
- **Done when:** Monitoring alerts map to user-visible learning disruption.

#### 149. [P2] Add uptime and status page integration

- **Effort:** S/M
- **Impact:** Medium
- **Evidence:** No public status workflow was visible.
- **Action:** Create basic status checks for web, API, DB readiness, Redis, workers, code runner, AI provider. Use hosted or simple static status page.
- **Done when:** Teachers know whether an issue is platform-wide.

## Suggested engineering operating model

Use a ratchet strategy. Do not attempt to make the whole repository perfect in one pass. Add baselines where needed, then fail CI only on net-new debt. This lets the team keep shipping while quality rises every week.

Recommended recurring checks:

- Weekly: reduce `any`, broad `except Exception`, and ignored type errors by a fixed budget.
- Weekly: convert at least five public JSON endpoints to explicit response models until the allowlist is exhausted.
- Every PR: contract generation, route response-model check, i18n drift check, typecheck, tests, migration graph check.
- Every release: migration upgrade on real Postgres, backup restore rehearsal for staging, Playwright smoke, and rollback review.
- Every major UX feature: loading/empty/error/offline/permission states, accessibility smoke, telemetry events, and localized copy.

## Definition of world-class for this codebase

- Learners always know what to do next, why something is locked, when work is due, and how to recover from failure.
- Teachers can create, publish, grade, and improve courses without guessing which screen owns a task.
- Admins can understand users, roles, analytics, and system health without database access.
- Developers can add a feature through a scaffolded path with typed API contracts, tests, predictable query invalidation, and no hidden build drift.
- Production deploys are reproducible, observable, reversible where possible, and protected by migration, backup, contract, and security gates.

## Caveats

This review is based on the packed repository snapshot, not a live runtime session with screenshots, production telemetry, or user interviews. UX recommendations should be validated with live flows and real teachers/students before large redesigns. Engineering-risk recommendations are grounded in the files and static signals present in the snapshot.
