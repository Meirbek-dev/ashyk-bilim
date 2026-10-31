# Repository map

- `justfile` - the single entry point. `just stack up [slot]` runs the local dev stack (docs/RUNBOOK.md 5.3), `just server <recipe>`
  and `just web <script>` / `just web2 <script>` proxy into the apps, `just deploy` / `rollback` / `backup` / `restore`
  run production ops. Add a recipe instead of documenting ad-hoc commands.
- `apps/server/` - Rust API (axum + sqlx), `/api/v2`. Read `apps/server/AGENTS.md` first.
- `apps/web/` - production Next.js frontend (rollback 2026-10-04); normal fixes allowed. Read its `AGENTS.md`.
- `apps/web-2/` - replacement TanStack frontend; read its `AGENTS.md` before changes.
- `infra/` and `compose*.yaml` - stack definition (nginx, Postgres, Judge0, storage, env templates,
  ops scripts).
- `QUESTIONS.md` - decisions only the owner can make.

## Docs

- `docs/ARCHITECTURE.md` - server design; `docs/DECISIONS.md` - frozen history of deviations (2026-10-31): a new
  decision updates the doc of the behavior in place and the commit message says why.
- `docs/INFRA.md` - stack, networks, secrets, web contract.
- `docs/RUNBOOK.md` - deploy, rollback, backup, restore, certificates, incidents.
- `docs/FINDINGS.md` - open production and infra issues.
- `docs/COURSE_ARCHIVING.md` - archive/restore behavior and regression criteria.
- `docs/web/DESIGN.md` - replacement frontend design system; `docs/web/ROUTES.md` - its routes, access and shell.
- `docs/agents/DATA.md` - where things live in the database, ready queries for finding review data.
- `docs/REWRITE.md` - proposed v3 rewrite (ops fixes first, then delete-in-place to one binary,
  Postgres only, web-2 as SPA): schema, auth, contract, stack, CI, tooling, docs, phases, cut list.
  Not started; current docs still describe production.
- `docs/STAGE-2-CUTOVER.md` - frontend rollout: constraints, acceptance, cutover, rollback, cleanup;
  `apps/web-2/BACKLOG.md` lists open work.
- Large references (`DECISIONS.md`, `ARCHITECTURE.md`, `INFRA.md`, `RUNBOOK.md`):
  use `rg -n '^##' <doc>` as the index; read only the matching section.
- Keep docs about current behavior, constraints, operations and unfinished work.
  Completed reports, audits and superseded plans belong in Git history.

## Rules

- Work on `main` with direct commits, or on a `wt/<name>` worktree branch landed by `just wt land` (no PRs).
- Never edit an applied migration; add a new one.
- Never commit `.env`, `server.env`, `temp-restore/`, keys or tokens.
- `just setup` installs pinned tools/dependencies, generates skill copies and enables the git hooks;
  `just setup-server`, `setup-web`, `setup-web2` do one app. `just doctor` checks the full setup in the
  recipe shell. Windows needs Git Bash (`sh` on PATH), not WSL Bash.
- Commit with `just commit -m "..." [paths]` and push with `just push` (skill `ship`). The checkout is jj colocated
  with git; jj runs no git hooks, so plain `jj commit` / `jj git push` skip every check. `just commit` runs the
  pre-commit checks on the new commit and undoes it (`jj op restore`) when they fail; `just push` moves `main` to `@-` and
  pushes through git so pre-push runs. Plain git users get the same hooks natively.
- Hooks (`.vite-hooks`, `infra/dev/hooks.ts`) check a checkout of what you commit/push, never the working
  tree, so other people's unstaged work cannot fail them. pre-commit (< 30 s): format + type-aware lint of
  the staged web files, cheap web-2 gates, rustfmt of staged `.rs`, no edits to migrations on origin/main.
  pre-push: `just check` on the pushed commit (only CI skips it). Never `--no-verify`.
- Every red gate (check, hooks, web-2 gates) is logged to `tmp/gates/hits.jsonl`; `just metrics` lists the gates that
  caught nothing in 30 days. Propose deleting such a gate to the owner instead of satisfying it mechanically.
- `just fmt <files>` formats exactly like the hook (root `vite.config.ts` holds the one web format config,
  same result from any cwd; rustfmt for `.rs`). `just eol` rewrites CRLF working copies (Windows) as LF.
- Run focused checks during an edit batch. `just ci-server`, `ci-web`, `ci-web2` validate each app (CI runs
  all three); `just ci` runs all local app/infra gates (not hosted image, E2E or secret scans).
- `.agents/skills` is canonical. `.claude/skills` is an ignored compatibility copy made by
  `just skills-sync`; never edit the copy. Project skills: `server-slice`, `web2-slice`, `debug-e2e`, `ship`;
  third-party ones (`skills-lock.json`) only where the app uses the library. Read only the docs relevant to the task.
- Every `AGENTS.md` has a sibling `CLAUDE.md` holding `@AGENTS.md` (a plain file: Windows checkouts flatten symlinks,
  and Claude Code loads only CLAUDE.md); `bun test ./infra/dev` checks it.

## Working with agents

- Start with `just brief`: vcs state, running slots, the last check/e2e verdict, open owner questions, production
  health. Real failures come first: `just prod-report [--since 24h]` (read-only, on the production host) lists server
  warnings/errors by message, 5xx by route and dead jobs.
- Scaffold instead of copying a reference: `just new feature <name>` (web-2), `just new endpoint <tag> <op>` (server
  test plus a `file:line` checklist), `just new migration <name>`.
- Models: exploration, QA sweeps and log triage suit a fast model (Sonnet/Haiku class); contract, auth, migrations
  and cross-app design need the strongest one. One writer per file set; reviewers read.

- For repeated browser debugging, start `just e2e web2 --serve` once and run focused tests with
  `just e2e web2 --reuse <playwright args>`. Test edits reuse the build and database; application edits
  require `--stop`, then `--serve`. Fixtures clean up their own data. Run the full suite after focused fixes pass.
  `--keep` alone retains only the database, not the servers.
- Watch CI with one `just ci-watch <run>` process. Read its output when it changes; do not launch parallel
  polling loops. Use `just ci-retry <run>` after a completed failed run to preserve successful shards.
  Report changes or a wait lasting a few minutes; remain quiet between them where host instructions permit
  (higher-priority heartbeat requirements still apply).
- Save full diagnostic output under `tmp/`, then use `just diagnose <log>` or `just diagnose --trace <extracted.trace>`.
  Excerpts are capped at 40 lines / 12,000 characters, with 500 characters per line. Never print raw trace snapshots,
  minified matches, complete CI logs or cleanup logs. For minified bundles print filenames/counts or bounded excerpts.
  For pulls use `git pull --quiet --ff-only` and report the old/new revision. Test tools print summaries and retain logs.

- QA/fix sweeps: hand each agent `docs/agents/QA.md` plus its lane; it covers roles, accounts, testing,
  fixing, report format and orchestration (max 3 agents per checkout, one lane owns contract changes,
  commit per finished item, never leave files staged, progress in a report file).
- Parallel work without blocking: `just wt new <name>` (worktree in `../ashyq-wt/<name>`, own
  `bun install` and cargo target dir), commit there, `just wt land <name>` (rebase, `just check`, fast-forward
  main, remove); `just wt ls`, `just wt rm <name> [--force]`.
- One command per task: `just stack up|status|logs|restart` (dev stack per slot), `just login-as <user>`,
  `just db fresh <name>`, `just db sql "<sql>"`, `just check [--wip|--all]`, `just contract`,
  `just e2e [web2 --changed]`, `just shoot` (screenshots as real accounts), `just restore-media`, `just fmt <files>`,
  `just metrics` (sizes to shrink), `just clean [--deep]` (old stands, logs, cargo incremental caches).
- Server DB tests clone one migrated template per migration set (`#[ab_testdb::test]`); the suite runs 12 at once on
  a 24+ CPU host (~2 min), 4 elsewhere.
- `.claude/settings.json` runs `infra/dev/agent-guard.ts` before every shell command: it refuses a bare `python`
  (an endless REPL in Git Bash), backticks inside `node -e "..."` (bash runs them first) and `jj commit`,
  `jj git push` or `--no-verify` (they skip the checks: use `just commit` / `just push`).
