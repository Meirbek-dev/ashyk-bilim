# apps/web-2

The new web (stage 2): React 19 + TanStack Start, Router, Query, Form + Paraglide, served by srvx on
Node from `.node-version`. Standalone bun project (own `bun.lock`, not in the root workspace).
Production runs `apps/web` after rollback; its freeze is lifted. Spec: `docs/MODERNIZATION-STAGE-2.md`.

## Map

| Path                                | What lives there                                                               |
| ----------------------------------- | ------------------------------------------------------------------------------ |
| `src/routes/`                       | file routes: `validateSearch`, `beforeLoad`, `loader`, `head`, component       |
| `src/features/<name>/`              | `SPEC.md`, `index.ts`, `route.ts` (entry chunk), `queries.ts`, `model/`, `ui/` |
| `src/shared/api/`                   | `client.ts` (the SDK seam), `errors.ts` (`ApiError`), `query-client.ts`        |
| `src/shared/api/gen/`               | generated SDK, types, Valibot schemas, query options. Never edit               |
| `src/shared/auth/`                  | `session.ts` (session query, guards), `access.ts` (workspaces, capabilities)   |
| `src/shared/i18n/`                  | `format.ts` (dates, numbers), `errors.ts` (`presentError`), `validation.ts`    |
| `src/shared/lib/`                   | `env.server.ts`, `storage.ts`, `appearance.ts`, `csp.ts`, `client-errors.ts`   |
| `src/shared/ui/`                    | stock shadcn (base-nova): `bunx shadcn@4.21.1 add <name>`; never hand-edit     |
| `src/shared/components/`            | ours on top: `templates/` (DESIGN 6), `form/` (`useAppForm` + fields), rest    |
| `src/shared/hooks/`, `lib/utils.ts` | `useUpload`; `cn` (shadcn's `cn` package)                                      |
| `src/server.ts`                     | request chain: `/healthz`, `/_client-error`, locale, request id, CSP           |
| `serve.ts`                          | production entry: srvx static files + the Start handler                        |
| `messages/<locale>/<feature>.json`  | catalogs (ru base, kk, en); `glossary.json` = required terms                   |
| `gates/`                            | `gates.ts` (checks lint cannot do), `allowlist.json`                           |
| `e2e/`                              | Playwright: `specs/<feature>.spec.ts`, `fixtures/test.ts` (shared checks)      |

Imports go one way: `routes -> features -> shared`. Another feature only via `#/features/<name>` (or `/route`);
inside a feature use relative paths; across layers use `#/`. Lint enforces all of it.

## Commands (run in apps/web-2)

| Command                          | Does                                                                                                       |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `bun install && bun run codegen` | first run in a fresh tree or worktree (paraglide is gitignored)                                            |
| `vp dev`                         | dev server on :3000; proxies `/api/v2` etc. to `API_PROXY_TARGET` (:8000)                                  |
| `vp check`                       | format + lint + types (G-01); run once after an edit batch                                                 |
| `vp test run`                    | vitest: `unit` (node) and `browser` (Chromium) projects                                                    |
| `bun run g15`                    | G-15 phase gate: kit contrast (axe) in all 63 themes x light/dark; not part of `verify`                    |
| `bun gates/gates.ts <gate>`      | one gate: i18n knip api-coverage under-construction contract codegen trace tokens suppressions freeze docs |
| `vp run verify`                  | check + test + all gates (the pre-push `just check` runs the parts the pushed change touches)              |
| `bun run codegen`                | regenerate SDK (from `../server/openapi.v2.json`), route tree, messages; safe while `vp dev` runs          |
| `bun run build`                  | `vp build`; `bun run start` serves `dist/`                                                                 |
| `vp run e2e`                     | Playwright; `E2E_BASE_URL` targets the stand, otherwise `vp dev`                                           |

## One way to do each thing (lint and gates reject the alternatives)

| Task            | The way                                                                                                                                                                                                                           |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| HTTP to the API | generated SDK (`#/shared/api/gen/sdk.gen`) through `shared/api/client.ts`                                                                                                                                                         |
| Read            | route `loader: ensureQueryData(xOptions())` + `useSuspenseQuery(xOptions())`                                                                                                                                                      |
| Write           | `useMutation({ ...xMutation(), meta: { invalidates: [xQueryKey()] } })`                                                                                                                                                           |
| Query keys      | generated `xQueryKey()`; never literal arrays                                                                                                                                                                                     |
| Route access    | `beforeLoad`: `requireSession` / `requireGuest` / `requireCapability` (table)                                                                                                                                                     |
| Action access   | `allowed_actions` from the API response; never roles or permission strings                                                                                                                                                        |
| URL state       | `validateSearch` (Valibot) + `Link` / `navigate({ search })`                                                                                                                                                                      |
| Forms           | `useAppForm(vXxxRequest, { defaultValues, onSubmit, leaveGuard })` + `field.TextField`: drops a second submit while one runs; `leaveGuard` asks before typed values are lost. A hand-rolled `<form onSubmit>` must do both itself |
| File upload     | `FileInput` (`purpose` sets types and cap) / `FileField`; pasted image: `useUpload` + `clipboardImage`. Caps and types: `gen/upload-policy.gen.ts` (the server's, `just contract`), never a literal                               |
| Pick from list  | `MultiCombobox` (server search, "Show more") / `MultiSelectField`; at a caret: `AnchoredListbox`                                                                                                                                  |
| Rendered text   | class `ab-prose` + `<link href={proseCss} precedence="ab-prose">` from `#/styles/prose.css?url`                                                                                                                                   |
| Text            | `m.<feature>_<key>()`; enums via `Record<Enum, () => string>`                                                                                                                                                                     |
| Dates, numbers  | `#/shared/i18n/format`                                                                                                                                                                                                            |
| Screens         | a template from `#/shared/components/templates`; lists through `ListState`                                                                                                                                                        |
| UI elements     | stock `#/shared/ui/<name>` (`variant`, `size`, `render`) or a composite; layout classes only, tokens                                                                                                                              |
| Button looks    | route: router `Link` + `className={buttonVariants({ variant })}`; pending: `disabled` + `<Spinner />`                                                                                                                             |
| Toast           | `toast.add({ title })` from `#/shared/ui/toast`, only in a mutation's `onSuccess`                                                                                                                                                 |
| API errors      | `ApiError` (branch on `code`) + route `errorComponent`; text `presentError`                                                                                                                                                       |
| Browser storage | `storageItem()` / `cookieItem()` from `#/shared/lib/storage`                                                                                                                                                                      |
| Memoization     | none: React Compiler                                                                                                                                                                                                              |

No suppressions: `oxlint-disable`, `@ts-expect-error`, `as any`, `test.skip`, TODO are errors unless
listed in `gates/allowlist.json` with a reason (G-12).

## Routes, access, shell

- Tree = spec 5.3: `_public` (`ssr: true`), `_guest` (signed-in -> `/home`), `_authed` (`ssr: 'data-only'`) with
  `teach.tsx` / `admin.tsx` guarded by `requireCapability`. `shared/auth/access.ts` is the one table "workspace ->
  section -> capability": guards, sidebar, bottom bar, switcher (and the palette) read it. A new nav section = a row.
- Route `staticData`: `title` (document title, layout heading), `layout: 'focus'` (the route draws
  `FocusPage` itself; the shell steps aside), `tabs` (a layout's tab routes; English label = URL segment). Tabs live
  in the layout route file; its `index.tsx` redirects to the first tab. A 403 thrown in `beforeLoad` renders in place
  (`ErrorView` -> `ForbiddenView`) and SSR answers with the ApiError's status (`shared/lib/ssr-status.ts`).
- No stub routes (gate `under-construction`). Each OpenAPI operation has a consumer in `src/`, is a service operation
  (`allowlist.json`) or is in `gates/server-removals.json` with a reason (G-07; a stale entry is an error).
- Live data: `GET /me/events` -> `shared/api/event-invalidations.ts` (event -> keys). An event skips a read that
  landed after it (`server-clock.ts`: stream-id time, offsets from arrivals and `Date`) and task-keyed reads of
  another activity. e2e: `expectReread(page, path)` when a test changes data behind an open page on purpose.
- Before hydration (/login ~140 ms, more on the stand) an SSR page works natively: navigation is a `Link`; an action
  that changes server-rendered state (a form's fieldset, enrol, leave) stays disabled until `useHydrated()`: a click
  React replays mid-hydration breaks it (React error 418). The auth fieldset carries `data-hydrating`, which the e2e fixture
  awaits. `FormDialog`, `ConfirmDialog` and `SheetPanel` keep their trigger disabled (with `data-hydrating`) the same way. `FileField` / `MultiSelectField` are not bound fields: render them inside `form.AppField`.
- Shell slots: `features/platform/ui/shell-slots.ts` (`search`: palette trigger, everyone; `notifications`: bell,
  signed-in). Set the slice's (lazy) component there, from its `route.ts`; an unset slot renders nothing.
- Entry chunk: only `loader` and the components are code-split; `validateSearch`,
  `search`, `beforeLoad`, `loaderDeps`, `head`, `staticData` and the root route (the shell) stay in the entry, which
  takes whole modules. Those options use a feature only via `#/features/<name>/route` (lint `ab/route-level-imports`);
  `route.ts` holds that code itself, no static import of its feature (`ab/route-entry-imports`; else `import()`). No
  generated SDK there (the session key is spelled out, pinned by `session.test.ts`).

## e2e locally

From the repo root (docs/RUNBOOK.md 5.3-5.4): `just e2e [web2] [playwright args]` builds the production bundle when
sources changed, runs it behind `e2e/prod-stand.ts` (nginx in miniature, CSP sent as on the stand) with its own API on
a fresh database cloned from `ashyq_seed`, and prints the summary (log under `tmp/e2e/`). `just e2e-dev [web2] [args]`
drives the running `just stack up` slot's `vp dev` (`E2E_DEV_URL`; warms every route first). The password, API log
(`E2E_API_LOG`: `auth.spec.ts` reads emailed codes there) and learner pool (`E2E_LEARNERS[_DIR]`) are set by the
recipes; never commit the password. `e2e/fixtures/seed.ts`: `seed`, `test.use({ as: role })` (storage state per
worker), `signInAs(role)`.

## Slice cycle (one feature)

1. Write `src/features/<name>/SPEC.md` first: `Операции:` line, `B-<FEAT>-NN` behaviors, "Изменено",
   "Не переносится" (<= 150 lines). Reference: `src/features/collections/`.
2. Add `messages/{ru,kk,en}/<name>.json` and list the file in `project.inlang/settings.json`.
3. Build `queries.ts`, `model/` (pure, unit-tested), `ui/`; bind it in `src/routes/`. Each `B-` id is in a test title (G-10).
4. Focused tests while editing; pre-commit checks the staged files, pre-push runs `just check` (changes since origin).

Shared code (`shared/`, `styles/`, `gates/`, `vite.config.ts`, this file): parallel slice sessions ask the orchestrator
for it; a single agent on an owner request is the orchestrator. Gates print `file:line rule - what to do` (<= 30 lines
each); Playwright uses the `line` reporter. Search `sdk.gen.ts`, never paste generated files into context.
