# apps/web-2

The new web (stage 2): React 19 + TanStack Start, Router, Query, Form + Paraglide, served by srvx on
Node 26. Standalone bun project (own `bun.lock`, not in the root workspace). The old `apps/web` is
frozen: never edit it (gate G-13). Spec: `docs/MODERNIZATION-STAGE-2.md` (until its phase 9).

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
| `gates/`                            | `gates.ts` (checks lint cannot do), `allowlist.json`, `budgets.json`, hooks    |
| `e2e/`                              | Playwright: `specs/<feature>.spec.ts`, `fixtures/test.ts` (shared checks)      |

Imports go one way: `routes -> features -> shared`. Another feature only via `#/features/<name>` (or `/route`);
inside a feature use relative paths; across layers use `#/`. Lint enforces all of it.

## Commands (run in apps/web-2)

| Command                          | Does                                                                                                               |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `bun install && bun run codegen` | first run in a fresh tree or worktree (paraglide is gitignored)                                                    |
| `vp dev`                         | dev server on :3000; proxies `/api/v2` etc. to `API_PROXY_TARGET` (:8000)                                          |
| `vp check`                       | format + lint + types (G-01); the edit hook runs `vp check --no-fmt`                                               |
| `vp test run`                    | vitest: `unit` (node) and `browser` (Chromium) projects                                                            |
| `bun run g15`                    | G-15 phase gate: kit contrast (axe) in all 63 themes x light/dark; not part of `verify`                            |
| `bun gates/gates.ts <gate>`      | one gate: i18n knip api-coverage under-construction contract codegen trace tokens suppressions freeze docs budgets |
| `vp run verify`                  | check + test + all gates; the Stop hook runs it                                                                    |
| `bun run codegen`                | regenerate SDK (from `../server/openapi.v2.json`), route tree, messages                                            |
| `bun run build`                  | `vp build` + chunk budgets; `bun run start` serves `dist/`                                                         |
| `vp run e2e`                     | Playwright; `E2E_BASE_URL` targets the stand, otherwise `vp dev`                                                   |

## One way to do each thing (lint and gates reject the alternatives)

| Task            | The way                                                                                                |
| --------------- | ------------------------------------------------------------------------------------------------------ |
| HTTP to the API | generated SDK (`#/shared/api/gen/sdk.gen`) through `shared/api/client.ts`                              |
| Read            | route `loader: ensureQueryData(xOptions())` + `useSuspenseQuery(xOptions())`                           |
| Write           | `useMutation({ ...xMutation(), meta: { invalidates: [xQueryKey()] } })`                                |
| Query keys      | generated `xQueryKey()`; never literal arrays                                                          |
| Route access    | `beforeLoad`: `requireSession` / `requireGuest` / `requireCapability` (table)                          |
| Action access   | `allowed_actions` from the API response; never roles or permission strings                             |
| URL state       | `validateSearch` (Valibot) + `Link` / `navigate({ search })`                                           |
| Forms           | `useAppForm(vXxxRequest, { defaultValues, onSubmit })` + `field.TextField`                             |
| File upload     | `FileInput` (`purpose` sets types and cap) / `FileField`; pasted image: `useUpload` + `clipboardImage` |
| Pick from list  | `MultiCombobox` (server search, "Show more") / `MultiSelectField`; at a caret: `AnchoredListbox`       |
| Rendered text   | class `ab-prose` + `<link href={proseCss} precedence="ab-prose">` from `#/styles/prose.css?url`        |
| Text            | `m.<feature>_<key>()`; enums via `Record<Enum, () => string>`                                          |
| Dates, numbers  | `#/shared/i18n/format`                                                                                 |
| Screens         | a template from `#/shared/components/templates`; lists through `ListState`                             |
| UI elements     | stock `#/shared/ui/<name>` (`variant`, `size`, `render`) or a composite; layout classes only, tokens   |
| Button looks    | route: router `Link` + `className={buttonVariants({ variant })}`; pending: `disabled` + `<Spinner />`  |
| Toast           | `toast.add({ title })` from `#/shared/ui/toast`, only in a mutation's `onSuccess`                      |
| API errors      | `ApiError` (branch on `code`) + route `errorComponent`; text `presentError`                            |
| Browser storage | `storageItem()` / `cookieItem()` from `#/shared/lib/storage`                                           |
| Memoization     | none: React Compiler                                                                                   |

No suppressions: `oxlint-disable`, `@ts-expect-error`, `as any`, `test.skip`, TODO are errors unless
listed in `gates/allowlist.json` with a reason (G-12).

## Routes, access, shell

- Tree = spec 5.3: `_public` (`ssr: true`), `_guest` (signed-in -> `/home`), `_authed` (`ssr: 'data-only'`) with
  `teach.tsx` / `admin.tsx` guarded by `requireCapability`. `shared/auth/access.ts` is the one table "workspace ->
  section -> capability": guards, sidebar, bottom bar, switcher (and the palette) read it. A new nav section = a row.
- Route `staticData`: `title` (document title, layout heading, stub heading), `layout: 'focus'` (the route draws
  `FocusPage` itself; the shell steps aside), `tabs` (a layout's tab routes; English label = URL segment). Tabs live
  in the layout route file; its `index.tsx` redirects to the first tab. A 403 thrown in `beforeLoad` renders in place
  (`ErrorView` -> `ForbiddenView`) and SSR answers with the ApiError's status (`shared/lib/ssr-status.ts`).
- A stub route has `component: UnderConstruction`. To build it: in that route file only, replace the component with
  the feature's (add `validateSearch`, `loader`, `head`), keep `staticData.title`. `bun gates/gates.ts
under-construction` lists what is left; report-only until phase 7 (`gates/allowlist.json` `underConstruction`).
- Before hydration (/login: ~140 ms, ~540 ms at 4x CPU) clicks do nothing: React cannot replay them until Start has
  loaded the route's chunks and hydrated the root. An SSR page works natively until then: navigation is a `Link`
  (a real `<a>`), a form keeps its fieldset disabled until `useHydrated()` (`features/auth/ui/auth-form.tsx`), and
  e2e waits for an enabled control rather than retrying clicks. `FileField` / `MultiSelectField` are not bound
  fields (they would put the combobox in every form's chunk): render them inside `form.AppField`.
- Shell slots: `features/platform/ui/shell-slots.ts` (`search`: palette trigger, everyone; `notifications`: bell,
  signed-in). Set the slice's (lazy) component there, from its `route.ts`; an unset slot renders nothing.
- Entry chunk (G-05, checked by `bun run build`): only `loader` and the components are code-split; `validateSearch`,
  `search`, `beforeLoad`, `loaderDeps`, `head`, `staticData` and the root route (the shell) stay in the entry, which
  takes whole modules. Those options use a feature only via `#/features/<name>/route` (lint `ab/route-level-imports`);
  `route.ts` holds that code itself, no static import of its feature (`ab/route-entry-imports`; else `import()`). No
  generated SDK there (the session key is spelled out, pinned by `session.test.ts`). The gate prints any other
  feature module or SDK file in the initial chunks with its import chain (`dist/initial-modules.json`).

## e2e locally

API on `http://127.0.0.1:8000` (`vp dev` proxies `/api/v2`, else `API_PROXY_TARGET`; buckets and `/content`: storage
`STORAGE_PROXY_TARGET`, `localhost:9002`), seeded by `ashyq admin seed-e2e`. Run `E2E_PASSWORD=<seed password> vp run
e2e [--grep x]`: it reuses or starts `vp dev` and warms every route first (`e2e/global-setup.ts`). Never write the
password into the repo. `E2E_API_LOG=<API log file>`: without a mailer the API logs email verification codes, and
`auth.spec.ts` reads them there. `e2e/fixtures/seed.ts` gives `seed` (accounts and route params, read with the SDK),
`test.use({ as: role })` (one API sign-in per worker and role, as storage state), `signInAs(role)` to switch.

## Slice cycle (one feature)

1. Write `src/features/<name>/SPEC.md` first: `Операции:` line, `B-<FEAT>-NN` behaviors, "Изменено",
   "Не переносится" (<= 150 lines). Reference: `src/features/collections/`.
2. Add `messages/{ru,kk,en}/<name>.json` and list the file in `project.inlang/settings.json`.
3. Build `queries.ts`, `model/` (pure, unit-tested), `ui/`, then bind it in `src/routes/`.
4. Every behavior id appears in a test title (`test('B-COL-02 ...')`), unit or e2e (G-10).
5. `vp run verify` and `bun run build` green. A gate you cannot satisfy is a question for the orchestrator.

Shared code (`shared/`, `styles/`, `gates/`, `vite.config.ts`, this file) changes only through the orchestrator;
ask for a missing primitive or operation instead of writing your own. Output budgets: gates print `file:line rule -
what to do`, at most 30 lines per gate; Playwright uses the `line` reporter and prints the trace path on failure. Do
not paste generated files into context: search `sdk.gen.ts`.
