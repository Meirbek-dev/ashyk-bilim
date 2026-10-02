# Gates baseline

Recorded 2026-10-02 on `main` (HEAD `e1117fe` plus the Stage 1 working tree),
Windows 11, bun 1.4.2, Rust 1.98.1. `apps/web` is due for a rewrite, so red web
gates caused by app code are recorded here, not fixed.

## Web (`apps/web`, run one at a time from that directory)

| Gate | Command | Status | Cause |
| --- | --- | --- | --- |
| install | `bun install --frozen-lockfile` (repo root) | green | - |
| lint | `bun run lint` (`vp lint --type-aware --type-check`) | red | 2 errors, 392 warnings, all app code: `oxc(no-map-spread)` in `src/features/code-arena/domain/codeChallengeMarkdownValidation.ts:66`; `typescript(no-unnecessary-type-conversion)` in `src/features/content-markdown/renderer/MarkdownContent.tsx:242` |
| typecheck | `bun run typecheck` | green | - |
| test | `bun run test` | green | 262 files, 1120 tests |
| contract | `bun run generate:api-types` then `git diff --stat -- apps/web/src/lib/api/generated apps/server/openapi.v2.json` and `bun run check:contracts` | green | no drift |
| error codes | `bun run check:error-codes` | green | 41/41 codes in ru-RU, kk-KZ, en-US |
| build | `bun run build` | not run | skipped: a full `next build` is not quick |
| fmt (not a CI gate) | `bunx vp fmt --check` | red | 75 of 1813 files unformatted |

Tooling fixes made while recording this baseline:

- `lint` no longer mutates files (the old command, with `--fix-dangerously`,
  is now `lint:fix`).
- `src/lib/api/generated/` is excluded from lint (the deleted root
  `vite.config.ts` excluded it; it accounted for 29 of 31 errors and 4315 of
  4706 warnings).
- `scripts/generate-api-types.mjs` ran `vp fmt` from the repo root, which only
  picked up the right fmt config through the root `vite.config.ts`; it now runs
  from `apps/web`. Without that, regeneration reformatted all 578 generated
  files.

## Server (`apps/server`)

| Gate | Command | Status | Cause |
| --- | --- | --- | --- |
| fmt | `just fmt-check` | green | - |
| clippy | `just clippy` | green | the `doc_lazy_continuation` errors from CI run 36810006980 were fixed in `cb09d0b` |
| openapi | `just openapi-check` | green | - |
| sqlx, test, deny, machete, cov | `just sqlx-check` / `test` / `deny` / `machete` / `cov` | not run | need dev services (Postgres, Redis, RustFS) |
