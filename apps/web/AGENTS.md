<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# apps/web — frontend conventions (v2 contract, P9)

The app talks to the Rust backend only (`apps/server`, `/api/v2`). The legacy
Python API (`apps/api`) is frozen reference material — never target it.

## Toolchain

- `bun install`, `bun run dev`, `bun run build`.
- Gates: `bun run typecheck` (tsc), `bun run lint` (oxlint/eslint via vp, applies
  fixes), `bun run test` (vitest, `src/tests/**`), `bun run check:error-codes`,
  `bun run test:e2e` (Playwright against a running stack, see `e2e/`).
- `bunx knip` reports dead files/exports (generated code is ignored).

## The contract and the generated client

- **Source of truth:** `apps/server/openapi.v2.json` (exported by `ashyq openapi`).
  Handler docs live in `apps/server/crates/api/src/routes/*.rs`, DTOs in
  `crates/api/src/dto/*.rs`; design in `docs/rewrite/ARCHITECTURE.md` §5–§7 and
  the per-slice "Routes:" notes in `docs/rewrite/DECISIONS.md`.
- `bun run generate:api-types` regenerates `src/lib/api/generated/**` (Orval,
  react-query hooks per tag + zod schemas). Never edit generated files; fix
  `orval.config.ts` / `scripts/orval-input-transformer.mjs` /
  `scripts/postprocess-orval-output.mjs` instead. Contract defects the
  transformer papers over are listed in `docs/FINDINGS.md`.
- **Types come from the zod module:** `import type { Course, CoursePage } from
  '@/lib/api/generated/zod'`; the same names are zod schemas (`Course.parse`).
  Generated fetchers/hooks: `import { listCourses, useListCourses } from
  '@/lib/api/generated/courses/courses'`. Duplicate operation ids are prefixed
  with their tag (`codeGetRun`, `fileSubmissionsSaveDraft`, …).
- Hand-written calls go through `apiJson(path, init, parse)` /
  `apiResult(...)` (`@/lib/api-client`) with a **path relative to `/api/v2`**
  (`'courses/{id}/curriculum'`), and a zod parser from the generated module.
  `apiResult` also returns response headers (needed for `ETag` versions).

## Wire conventions (ARCHITECTURE §6)

- **Ids are UUID strings** (`id`, `course_id`, `user_id`, …). No numeric ids,
  no `*_uuid` fields, no `course_`/`activity_` prefixes. Route params and
  links carry the id as-is.
- **Timestamps are epoch seconds** named `*_unix`. Convert with `fromUnix` /
  `toUnix` / `unixToIso` from `@/lib/api/contract`.
- **Listings are keyset pages** `{ items, next_cursor }` (`Page<T>` in
  `@/lib/api/contract`, `collectPages` walks them). Pass `next_cursor` back as
  `cursor`; there is no offset paging or `total` except where the contract
  says so (work queue, leaderboard, and every `analytics/teacher/*` listing —
  those keep legacy `page`/`page_size` deliberately, see DECISIONS.md
  "Analytics (2026-09-06, P7)"). Do not "fix" those into cursors.
- **Errors are `application/problem+json`** (`{type,title,status,code,detail,
  details,field_errors,request_id}`). `APIError` (`@/lib/api/assertSuccess`)
  exposes `code` (kebab-case, closed registry), `details`, `fieldErrors`,
  `requestId`, `retryAfterSeconds`. Branch on `hasErrorCode(error,
  'precondition-failed')`, never on English text. Display through
  `useApiError()` (looks up `Errors.codes.<code>` / `Errors.fields.<code>` in
  `src/messages/*.json`; `scripts/sync-error-codes.mjs` keeps the code list in
  sync with the registry and fails the build on gaps).
- **Optimistic locks:** `If-Match: "<version>"` via `ifMatchHeaders(version)`
  (`@/lib/api/headers`); the new version comes back as `ETag`
  (`parseEntityTagVersion(headers)`). Learner draft saves use `draft_version`
  (409 `conflict` with `details {expected, actual}`), teacher grade saves and
  file-attempt grading use `version` (412 `precondition-failed`).
- **Idempotency:** retry-safe POSTs (submission submit, code runs, file
  submission submit) send `Idempotency-Key` via `idempotencyHeaders(key)`; keep
  the same key when retrying one logical action.
- **Uploads never go through the API:** `uploadFile(file, purpose)`
  (`@/services/media/uploads`) does `POST /uploads` → presigned `PUT` →
  `POST /uploads/{id}/finalize` and returns `{id, key}`; attach the `id` to the
  owner (`avatar_upload_id`, block create, file-submission draft). Public
  objects are addressed by storage `key` and served at `/content/<key>`
  (`getContentUrl(key)` in `@/services/media/media`).
- **SSE:** `GET /submissions/{id}/events` (one submission),
  `GET /courses/{id}/grading/events` (every grade change and hand-in on a
  course, graders only — `useCourseGradingEvents` invalidates
  `queryKeys.grading.*`; polling is the fallback while it is down),
  `POST /ai/runs/{id}/stream` and `POST /ai/qa/{course}/chat` (AG-UI);
  `Last-Event-ID` resumes.
- **Sessions:** one httponly `ab_session` cookie set by the BFF; no tokens, no
  refresh. `getSession()` (server) joins `GET /auth/session` (user id, role
  slugs, permission strings) with `GET /users/me`; `useSession()` exposes it
  client-side with `can(resource, action, scope)`. A browser-side 401 redirects
  to `/login`. Auth server actions live in `src/app/actions/auth.ts`.

## Feature layout

- `src/services/**` — plain async functions per resource (server and client
  safe), `src/features/<area>/**` — TanStack Query options/hooks + feature UI,
  `src/app/[locale]/**` — routes, `src/app/_shared/**` — page implementations,
  `src/components/**` — shared UI. Query keys are centralised in
  `src/lib/react-query/queryKeys.ts` (edit, never rewrite the file).
- i18n catalogs: `src/messages/{ru-RU,kk-KZ,en-US}.json` (next-intl). Add
  keys to all three; Russian first, kk/en translations.
- Tests: `src/tests/**/*.test.ts(x)` (vitest + testing-library), Playwright in
  `e2e/` (page objects in `e2e/page-objects`, specs in `e2e/specs`).

## Not in v2 (do not re-add without a contract change)

Password reset (self-registration `/signup`, email verification and
password change came back 2026-09-12 — DECISIONS.md), refresh tokens, numeric ids,
`*_uuid` strings, multipart uploads through the API, offset pagination,
per-user server-side theme, `/members`, `/roles/{id}` numeric role ids,
batch grading, bulk zip download of file submissions, `/trail/start`.
