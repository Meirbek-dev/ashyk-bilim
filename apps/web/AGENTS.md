<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

<!--VITE PLUS START-->

# Using Vite+, the Unified Toolchain for the Web

This app uses Next.js for dev/build and Vite+ for lint/format/test. Run package scripts through
`just web <script>`; `vp dev`/`vp build` are not this app's server/build commands.

Docs are local at `node_modules/vite-plus/docs` or online at https://viteplus.dev/guide/.

## Review Checklist

- [ ] Run root `just setup` for dependencies/tools/hooks; use frozen lockfiles.
- [ ] Run focused tests while editing and root `just ci-web` after a coherent batch.
- [ ] Check if there are `vite.config.ts` tasks or `package.json` scripts necessary for validation, run via `just web <script>`.
- [ ] If setup, runtime, or package-manager behavior looks wrong, run `vp env doctor` and include its output when asking for help.

<!--VITE PLUS END-->

# apps/web - frontend conventions

Production frontend until the stage 2 cutover (`docs/STAGE-2-CUTOVER.md`); its only backend is `apps/server`
(`/api/v2`). Commits, hooks and checks: root `AGENTS.md`.

## Toolchain

- From the repo root use `just web <script>` (= `bun run --cwd apps/web <script>`); the dev server runs in a
  `just stack up` slot.
- Local gates (`just ci-web`): `lint` (oxlint via `vp lint --type-aware --type-check`, read-only), `typecheck`
  (tsc), `test` (vitest, `src/tests/**`), `check:contracts` (generated client matches `openapi.v2.json`),
  `check:error-codes`, `check:messages`. CI runs them (`web-gates` job), builds the image, stack-smokes it and
  runs `web-release-e2e` on it. Production fixes are allowed.
- `bun run lint:fix` applies fixes including `--fix-dangerously`; it rewrites
  unrelated files, so run it deliberately and review the diff.
- Format with `just fmt <files>` (`bun run format` rewrites the whole app). The format config is the
  repo-root `vite.config.ts` (same result from any cwd); lint is `vite.config.ts` here, vitest
  `vitest.config.ts`.
- e2e from the repo root: `just e2e web [args]` (production `next build` + own API on a fresh database) or
  `just e2e-dev web [args]` (the running `just stack up` slot); both set the seed accounts and password.
- Vitest runs at most four workers; use its `--maxWorkers` flag to override deliberately.
  Pure `.test.ts` files run in the `unit` Node project; UI/editor tests run in `components` with jsdom.
  A hook test in a `.ts` file can select jsdom with `@vitest-environment jsdom`.
- `bunx knip` reports dead files/exports (generated code is ignored).

## The contract and the generated client

- **Source of truth:** `apps/server/openapi.v2.json` (exported by `ashyq openapi`).
  Handler docs live in `apps/server/crates/api/src/routes/*.rs`, DTOs in
  `crates/api/src/dto/*.rs`; design in `docs/ARCHITECTURE.md` §5–§7 and
  the per-slice "Routes:" notes in `docs/DECISIONS.md`.
- `bun run generate:api-types` regenerates `src/lib/api/generated/**` (Orval,
  react-query hooks per tag + zod schemas; safe while `next dev` runs: only
  changed files are replaced, by rename). Never edit generated files; fix
  `orval.config.ts` / `scripts/orval-input-transformer.mjs` /
  `scripts/postprocess-orval-output.mjs` instead. Contract defects the
  transformer papers over are listed in `docs/FINDINGS.md`.
- **Types come from the zod module:** `import type { Course, CoursePage } from
  '@/lib/api/generated/zod'`; the same names are zod schemas (`Course.parse`).
  Generated fetchers/hooks: `import { listCourses, useListCourses } from
  '@/lib/api/generated/courses/courses'`.
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
  says so (work queue, leaderboard, and every `analytics/teacher/*` listing -
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
- **Forms:** react-hook-form; the submit button is disabled while the mutation
  `isPending` (a double click must not send twice); course-editor sections save
  through `useSaveSection`; unsaved edits ask before leaving via
  `useUnsavedChangesGuard` (`useDirtyGuard` in the course editor).
- **Upload caps:** `UPLOAD_MAX_BYTES` (`@/services/media/uploads`), read from the
  generated `@/lib/api/generated/upload-policy` (`just contract`); never a literal.
- **Uploads never go through the API:** `uploadFile(file, purpose)`
  (`@/services/media/uploads`) does `POST /uploads` -> presigned `PUT` ->
  `POST /uploads/{id}/finalize` and returns `{id, key}`; attach the `id` to the
  owner (`avatar_upload_id`, block create, file-submission draft). Public
  objects are addressed by storage `key` and served at `/content/<key>`
  (`getContentUrl(key)` in `@/services/media/media`).
- **SSE:** `GET /submissions/{id}/events` (one submission),
  `GET /courses/{id}/grading/events` (every grade change and hand-in on a
  course, graders only - `useCourseGradingEvents` invalidates
  `queryKeys.grading.*`; polling is the fallback while it is down),
  `POST /ai/runs/{id}/stream` and `POST /ai/qa/{course}/chat` (AG-UI);
  `Last-Event-ID` resumes.
- **Sessions:** one httponly `ab_session` cookie set by the BFF; no tokens, no
  refresh. `getSession()` (server) joins `GET /auth/session` (user id, role
  slugs, permission strings) with `GET /users/me`; `useSession()` exposes it
  client-side with `can(resource, action, scope)`. A browser-side 401 redirects
  to `/login`. Auth server actions live in `src/app/actions/auth.ts`.

## Visual conventions

Use the existing shadcn primitives and semantic color tokens. Keep typography,
spacing, borders and radii consistent with neighboring screens. Avoid decorative
gradients, icons and motion; animation should explain a state change and respect
reduced motion. Preserve keyboard access, focus states and responsive layouts.

## Feature layout

- `src/services/**` - plain async functions per resource (server and client
  safe), `src/features/<area>/**` - TanStack Query options/hooks + feature UI,
  `src/app/[locale]/**` - routes, `src/app/_shared/**` - page implementations,
  `src/components/**` - shared UI. Query keys are centralised in
  `src/lib/react-query/queryKeys.ts` (edit, never rewrite the file).
- i18n catalogs: `src/messages/{ru-RU,kk-KZ,en-US}.json` (read by next-intl; inlang message format,
  `project.inlang/settings.json`). Keep nested keys; complex messages are arrays with declarations and
  match variants. Add keys to all three; Russian first, kk/en translations. Verify with
  `just web check:messages`.
- Tests: `src/tests/**/*.test.ts(x)` (vitest + testing-library), Playwright in
  `e2e/` (page objects in `e2e/page-objects`, specs in `e2e/specs`).
  `journey.spec.ts` registers the author/learner/grader/archive scenario from `e2e/journey/` in one serial worker;
  its state is in memory and a retry starts from authoring. Other specs create and remove their own prerequisites.
  CI gates the exact production image with public/auth smoke, isolated release journeys and video upload.

## Not in v2 (do not re-add without a contract change)

Refresh tokens, numeric ids, `*_uuid` strings, multipart uploads through the API, offset pagination,
the legacy org `/members` and numeric `/roles/{id}` endpoints, batch grading, bulk zip download of file
submissions, `/trail/start`. (Self-registration, email verification, password change and reset exist.)
