---
name: web2-slice
description: Build or fix a screen, route, form or query in apps/web-2 (React 19 + TanStack Start). Use for any web-2 UI change in this repo.
---

# web-2 slice

The "one way to do each thing" table in `apps/web-2/AGENTS.md` is binding (lint and gates reject alternatives); read it
and `docs/web/ROUTES.md` before touching `src/routes/`, `shared/auth/` or the shell.

1. New feature: `just new feature <name>` (SPEC.md, index.ts, a page on a template, three catalogs, inlang entry).
   A change: open `src/features/<name>/SPEC.md`; a new behavior gets its id from `bun gates/gates.ts next-id <name>`.
2. Data: generated `xOptions()` / `xMutation()` from `#/shared/api/gen` (search `sdk.gen.ts`, never read it whole);
   route `loader` + `useSuspenseQuery`; writes invalidate through `meta.invalidates`.
3. Text: `m.<feature>_<key>()` in ru, kk and en; dates and numbers through `#/shared/i18n/format`.
4. Every `B-` id in a test title: pure logic in `model/*.test.ts`, UI in a browser test, flows in `e2e/specs/`.
5. Mid-batch: `just check --wip`. Browser loop: `just e2e web2 --serve` once, then
   `just e2e web2 --reuse <spec or --grep B-XXX-NN>` (the `debug-e2e` skill).
6. Look at it: `just shoot --page name=/path --as <login>` (`--ref HEAD` for "before"), rows via `just db sql` and
   `docs/agents/DATA.md`. Before pushing: `just e2e web2 --changed`.

Shared code (`shared/`, `styles/`, `gates/`, `vite.config.ts`) belongs to the orchestrator when several agents run.
