# apps/web-2

The new web (stage 2): React 19 + TanStack Start, Router, Query, Form + Paraglide, served by srvx on
Node from `.node-version`. Standalone bun project (own `bun.lock`, not in the root workspace).
Production still runs `apps/web`; both take normal fixes. Rollout: `docs/STAGE-2-CUTOVER.md`; open work: `BACKLOG.md`.

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
| `src/shared/ui/`                    | stock shadcn (base-nova): `bunx shadcn@4.23.0 add <name>`; never hand-edit     |
| `src/shared/components/`            | ours on top: `templates/` (DESIGN 6), `form/` (`useAppForm` + fields), rest    |
| `src/shared/hooks/`, `lib/utils.ts` | `useUpload`, `useSwapFocus`; `cn` (shadcn's `cn` package)                      |
| `src/server.ts`                     | request chain: `/healthz`, `/_client-error`, locale, request id, CSP           |
| `serve.ts`                          | production entry: srvx static files + the Start handler                        |
| `messages/<locale>/<feature>.json`  | catalogs (ru base, kk, en); `glossary.json` = required terms                   |
| `gates/`                            | `gates.ts` (checks lint cannot do), `allowlist.json`                           |
| `e2e/`                              | Playwright: `specs/<feature>.spec.ts`, `fixtures/test.ts` (shared checks)      |

Imports go one way: `routes -> features -> shared`. Another feature only via `#/features/<name>` (or `/route`);
inside a feature use relative paths; across layers use `#/`. Lint enforces all of it.

## Commands (run in apps/web-2)

| Command                          | Does                                                                                                        |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `bun install && bun run codegen` | first run in a fresh tree or worktree (paraglide is gitignored)                                             |
| `vp dev`                         | dev server on :3000; proxies `/api/v2` etc. to `API_PROXY_TARGET` (:8000)                                   |
| `vp check`                       | format + lint + types (G-01); run once after an edit batch                                                  |
| `vp test run`                    | vitest: `unit` (node) and `browser` (Chromium) projects                                                     |
| `bun run g15`                    | Kit contrast (axe) in all 63 themes x light/dark; required by CI and `just ci-web2`, separate from `verify` |
| `bun gates/gates.ts <gate>`      | one gate: i18n knip api-coverage under-construction contract codegen trace tokens suppressions freeze docs  |
| `vp run verify`                  | check + test + all gates (the pre-push `just check` runs the parts the pushed change touches)               |
| `bun run codegen`                | regenerate SDK (from `../server/openapi.v2.json`), route tree, messages; safe while `vp dev` runs           |
| `bun run build`                  | `vp build`; `bun run start` serves `dist/`                                                                  |
| `vp run e2e`                     | Playwright; `E2E_BASE_URL` targets the stand, otherwise `vp dev`                                            |

## One way to do each thing (lint and gates reject the alternatives)

| Task            | The way                                                                                                                                                                                                                               |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| HTTP to the API | generated SDK (`#/shared/api/gen/sdk.gen`) through `shared/api/client.ts`                                                                                                                                                             |
| Read            | route `loader: query({ ...xOptions(), staleTime: 'static' })` (`infiniteQuery` for pages) + `useSuspenseQuery(xOptions())`                                                                                                            |
| Write           | `useMutation({ ...xMutation(), meta: { invalidates: [xQueryKey()] } })`                                                                                                                                                               |
| Query keys      | generated `xQueryKey()`; never literal arrays                                                                                                                                                                                         |
| Route access    | `beforeLoad`: `requireSession` / `requireGuest` / `requireCapability` (table)                                                                                                                                                         |
| Action access   | `allowed_actions` from the API response; never roles or permission strings                                                                                                                                                            |
| URL state       | `validateSearch` (Valibot) + `Link` / `navigate({ search })`                                                                                                                                                                          |
| Forms           | `useAppForm(vXxxRequest, { defaultValues, onSubmit, leaveGuard })` + `field.TextField`: drops a second submit while one runs; `leaveGuard` asks before typed values are lost. A hand-rolled `<form onSubmit>` must do both itself     |
| File upload     | `FileInput` (`purpose` sets types and cap) / `FileField` (inside `form.AppField`, as `MultiSelectField`: not bound fields); pasted image: `useUpload` + `clipboardImage`. Caps and types: `gen/upload-policy.gen.ts`, never a literal |
| Pick from list  | `MultiCombobox` (server search, "Show more") / `MultiSelectField`; at a caret: `AnchoredListbox`                                                                                                                                      |
| Rendered text   | class `ab-prose` + `<link href={proseCss} precedence="ab-prose">` from `#/styles/prose.css?url`                                                                                                                                       |
| Text            | `m.<feature>_<key>()`; enums via `Record<Enum, () => string>`                                                                                                                                                                         |
| Dates, numbers  | `#/shared/i18n/format`                                                                                                                                                                                                                |
| Screens         | a template from `#/shared/components/templates`; lists through `ListState`                                                                                                                                                            |
| UI elements     | stock `#/shared/ui/<name>` (`variant`, `size`, `render`) or a composite; layout classes only, tokens                                                                                                                                  |
| Button looks    | route: router `Link` + `className={buttonVariants({ variant })}` from `#/shared/components/button-variants` (merged); pending: `disabled` + `<Spinner />`                                                                             |
| Toast           | `toast.add({ title })` from `#/shared/ui/toast`, only in a mutation's `onSuccess`                                                                                                                                                     |
| API errors      | `ApiError` (branch on `code`) + route `errorComponent`; text `presentError`                                                                                                                                                           |
| Browser storage | `storageItem()` / `cookieItem()` from `#/shared/lib/storage`                                                                                                                                                                          |
| Memoization     | none: React Compiler                                                                                                                                                                                                                  |

No suppressions: `oxlint-disable`, `@ts-expect-error`, `as any`, `test.skip`, TODO are errors unless
listed in `gates/allowlist.json` with a reason (G-12).

## Routes, access, shell

Route tree, guards, `staticData` tabs, live data (`/me/events`), hydration rules, shell slots and the entry chunk:
`docs/web/ROUTES.md`. Read it before changing `src/routes/`, `shared/auth/`, the shell or an SSR-page action.

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
4. Mid-batch: `just check --wip` (lint, types, gates and related tests of the uncommitted files); before pushing:
   `just e2e web2 --changed` (the specs the diff reaches). New id: `bun gates/gates.ts next-id <feature>`. A SPEC rule
   on what the UI shows exactly ("as sent", a key's text) gets a unit or browser test, not only e2e.
5. Look at it on real data: `just shoot` (screenshots per role, width and mode; `--ref HEAD` for the "before"),
   rows via `just db sql` and docs/agents/DATA.md.

Shared code (`shared/`, `styles/`, `gates/`, `vite.config.ts`, this file): parallel slice sessions ask the orchestrator
for it; a single agent on an owner request is the orchestrator. Gates print `file:line rule - what to do` (<= 30 lines
each); Playwright uses the `line` reporter. Search `sdk.gen.ts`, never paste generated files into context.
