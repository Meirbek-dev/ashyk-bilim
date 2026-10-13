# Repository map

- `justfile` - the single entry point. `just dev-up` starts local services, `just server <recipe>`
  and `just web <script>` / `just web2 <script>` proxy into the apps, `just deploy` / `rollback` / `backup` / `restore`
  run production ops. Add a recipe instead of documenting ad-hoc commands.
- `apps/server/` - Rust API (axum + sqlx), `/api/v2`. Read `apps/server/AGENTS.md` first.
- `apps/web/` - production Next.js frontend (rollback 2026-10-04); normal fixes allowed. Read its `AGENTS.md`.
- `apps/web-2/` - replacement TanStack frontend; read its `AGENTS.md` before changes.
- `infra/` and `compose*.yaml` - stack definition (nginx, Postgres, Judge0, storage, env templates,
  ops scripts).
- `QUESTIONS.md` - decisions only the owner can make.

## Docs

- `docs/ARCHITECTURE.md` - server design; `docs/DECISIONS.md` - deviations from it.
- `docs/INFRA.md` - stack, networks, secrets, web contract.
- `docs/RUNBOOK.md` - deploy, rollback, backup, restore, certificates, incidents.
- `docs/FINDINGS.md` - open production and infra issues.
- `docs/archive/` - finished one-off reports (incl. the GAUNTLET browser QA ledger and loop brief).
- Large docs (`DECISIONS.md` ~160 KB, `MODERNIZATION-STAGE-2.md` ~150 KB, `MODERNIZATION-STAGE-1.md`,
  `ARCHITECTURE.md`): never read whole. `grep -n '^##' <doc>` is the index; read only the matching section.

## Rules

- Work on `main` with direct commits, or on a `wt/<name>` worktree branch landed by `just wt land` (no PRs).
- Never edit an applied migration; add a new one.
- Never commit `.env`, `server.env`, `temp-restore/`, keys or tokens.
- `just setup` installs pinned tools/dependencies, generates skill copies and enables the git hooks;
  `just setup-server`, `setup-web`, `setup-web2` do one app. `just doctor` checks the full setup in the
  recipe shell. Windows needs Git Bash (`sh` on PATH), not WSL Bash.
- Hooks (`.vite-hooks`, `infra/dev/hooks.ts`) check a checkout of what you commit/push, never the working
  tree, so other people's unstaged work cannot fail them. pre-commit (< 30 s): format + type-aware lint of
  the staged web files, cheap web-2 gates, rustfmt of staged `.rs`, no edits to migrations on origin/main.
  pre-push: `just check` on the pushed commit (only CI skips it). Never `--no-verify`.
- `just fmt <files>` formats exactly like the hook (root `vite.config.ts` holds the one web format config,
  same result from any cwd; rustfmt for `.rs`). `just eol` rewrites CRLF working copies (Windows) as LF.
- Run focused checks during an edit batch. `just ci-server`, `ci-web`, `ci-web2` validate each app (CI runs
  all three); `just ci` runs all local app/infra gates (not hosted image, E2E or secret scans).
- `.agents/skills` is canonical. `.claude/skills` is an ignored compatibility copy made by
  `just skills-sync`; never edit the copy. Read only the instructions/docs relevant to the task.

## Working with agents

- QA/fix sweeps: hand each agent `docs/agents/QA.md` plus its lane; it covers roles, accounts, testing,
  fixing, report format and orchestration (max 3 agents per checkout, one lane owns contract changes,
  commit per finished item, never leave files staged, progress in a report file).
- Parallel work without blocking: `just wt new <name>` (worktree in `../ashyq-wt/<name>`, shared
  node_modules and cargo target), commit there, `just wt land <name>` (rebase, `just check`, fast-forward
  main, remove); `just wt ls`, `just wt rm <name> [--force]`.
- One command per task: `just stack up|status|logs|restart` (dev stack per slot), `just login-as <user>`,
  `just db fresh <name>`, `just check [--all]`, `just contract`, `just e2e`, `just fmt <files>`.
