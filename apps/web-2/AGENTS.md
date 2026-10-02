# apps/web-2

The new web (stage 2): React 19 + TanStack Start, Router, Query, Form + Paraglide, served by srvx on
Node 26. Standalone bun project (own `bun.lock`, not in the root workspace). The old `apps/web` is
frozen: never edit it (gate G-13). Spec: `docs/MODERNIZATION-STAGE-2.md` (until its phase 9).

## Map

| Path                               | What lives there                                                             |
| ---------------------------------- | ---------------------------------------------------------------------------- |
| `src/routes/`                      | file routes: `validateSearch`, `beforeLoad`, `loader`, `head`, component     |
| `src/features/<name>/`             | `SPEC.md`, `index.ts` (public entry), `queries.ts`, `model/`, `ui/`          |
| `src/shared/api/`                  | `client.ts` (the SDK seam), `errors.ts` (`ApiError`), `query-client.ts`      |
| `src/shared/api/gen/`              | generated SDK, types, Valibot schemas, query options. Never edit             |
| `src/shared/auth/`                 | `session.ts` (session query, guards), `access.ts` (capabilities)             |
| `src/shared/i18n/`                 | `format.ts` (dates, numbers), `errors.ts` (`presentError`), `validation.ts`  |
| `src/shared/lib/`                  | `env.server.ts`, `storage.ts`, `appearance.ts`, `csp.ts`, `client-errors.ts` |
| `src/shared/ui/`                   | kit components; the only place with raw `<button>`, `<input>`, `<a>`         |
| `src/shared/ui/templates/`         | the 6 screen templates (DESIGN.md 6); `form/` = `useAppForm` + bound fields  |
| `src/server.ts`                    | request chain: `/healthz`, `/_client-error`, locale, request id, CSP         |
| `serve.ts`                         | production entry: srvx static files + the Start handler                      |
| `messages/<locale>/<feature>.json` | catalogs (ru base, kk, en); `glossary.json` = required terms                 |
| `gates/`                           | `gates.ts` (checks lint cannot do), `allowlist.json`, `budgets.json`, hooks  |
| `e2e/`                             | Playwright: `specs/<feature>.spec.ts`, `fixtures/test.ts` (shared checks)    |

Imports go one way: `routes -> features -> shared`. Another feature only via `#/features/<name>`;
inside a feature use relative paths; across layers use `#/`. Lint enforces all of it.

## Commands (run in apps/web-2)

| Command                          | Does                                                                                            |
| -------------------------------- | ----------------------------------------------------------------------------------------------- |
| `bun install && bun run codegen` | first run in a fresh tree or worktree (paraglide is gitignored)                                 |
| `vp dev`                         | dev server on :3000; proxies `/api/v2` etc. to `API_PROXY_TARGET` (:8000)                       |
| `vp check`                       | format + lint + types (G-01); the edit hook runs `vp check --no-fmt`                            |
| `vp test run`                    | vitest: `unit` (node) and `browser` (Chromium) projects                                         |
| `bun run g15`                    | G-15 phase gate: kit contrast (axe) in all 63 themes x light/dark; not part of `verify`         |
| `bun gates/gates.ts <gate>`      | one gate: i18n knip api-coverage contract codegen trace tokens suppressions freeze docs budgets |
| `vp run verify`                  | check + test + all gates; the Stop hook runs it                                                 |
| `bun run codegen`                | regenerate SDK (from `../server/openapi.v2.json`), route tree, messages                         |
| `bun run build`                  | `vp build` + chunk budgets; `bun run start` serves `dist/`                                      |
| `vp run e2e`                     | Playwright; `E2E_BASE_URL` targets the stand, otherwise `vp dev`                                |

## One way to do each thing (lint and gates reject the alternatives)

| Task            | The way                                                                      |
| --------------- | ---------------------------------------------------------------------------- |
| HTTP to the API | generated SDK (`#/shared/api/gen/sdk.gen`) through `shared/api/client.ts`    |
| Read            | route `loader: ensureQueryData(xOptions())` + `useSuspenseQuery(xOptions())` |
| Write           | `useMutation({ ...xMutation(), meta: { invalidates: [xQueryKey()] } })`      |
| Query keys      | generated `xQueryKey()`; never literal arrays                                |
| Route access    | `beforeLoad`: `requireSession` / `requireGuest` / `requireCapability`        |
| Action access   | `allowed_actions` from the API response; never roles or permission strings   |
| URL state       | `validateSearch` (Valibot) + `Link` / `navigate({ search })`                 |
| Forms           | `useAppForm(vXxxRequest, { defaultValues, onSubmit })` + `field.TextField`   |
| Text            | `m.<feature>_<key>()`; enums via `Record<Enum, () => string>`                |
| Dates, numbers  | `#/shared/i18n/format`                                                       |
| Screens         | a template from `#/shared/ui/templates`; lists through `ListState`           |
| UI elements     | `#/shared/ui`; colors and spacing only via tokens and the Tailwind scale     |
| API errors      | `ApiError` (branch on `code`) + route `errorComponent`; text `presentError`  |
| Browser storage | `storageItem()` / `cookieItem()` from `#/shared/lib/storage`                 |
| Memoization     | none: React Compiler                                                         |

No suppressions: `oxlint-disable`, `@ts-expect-error`, `as any`, `test.skip`, TODO are errors unless
listed in `gates/allowlist.json` with a reason (G-12).

## Slice cycle (one feature)

1. Write `src/features/<name>/SPEC.md` first: `Операции:` line, `B-<FEAT>-NN` behaviors, "Изменено",
   "Не переносится" (<= 150 lines). Reference: `src/features/collections/`.
2. Add `messages/{ru,kk,en}/<name>.json` and list the file in `project.inlang/settings.json`.
3. Build `queries.ts`, `model/` (pure, unit-tested), `ui/`, then bind it in `src/routes/`.
4. Every behavior id appears in a test title (`test('B-COL-02 ...')`), unit or e2e (G-10).
5. `vp run verify` green. A gate you cannot satisfy is a question for the orchestrator, not an
   allowlist entry.

Shared code (`shared/`, `styles/`, `gates/`, `vite.config.ts`, this file) changes only through the
orchestrator; ask for a missing primitive or operation instead of writing your own.

## Output budgets

Gates print `file:line rule - what to do`, at most 30 lines per gate. Playwright uses the `line`
reporter and prints the trace path on failure. Do not paste generated files into context: search
`sdk.gen.ts` for the operation name.
