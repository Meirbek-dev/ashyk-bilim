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
- `docs/GAUNTLET.md`, `docs/GAUNTLET-LOOP.md` - browser QA ledger and loop brief.
- `docs/archive/` - finished one-off reports.

## Rules

- Work on `main` (the only branch) with direct commits.
- Never edit an applied migration; add a new one.
- Never commit `.env`, `server.env`, `temp-restore/`, keys or tokens.
- `just setup` installs pinned tools/dependencies, generates skill copies and enables the commit hook;
  `just doctor` checks setup in the recipe shell. Windows needs Git Bash (`sh` on PATH), not WSL Bash.
- Run focused checks during an edit batch. Full web-2 verification runs once in pre-commit;
  use `just web2 verify` explicitly for an uncommitted batch. `just ci-server`, `ci-web`, `ci-web2`
  validate each app; `just ci` runs all local app/infra gates (not hosted image, E2E or secret scans).
- `.agents/skills` is canonical. `.claude/skills` is an ignored compatibility copy made by
  `just skills-sync`; never edit the copy. Read only the instructions/docs relevant to the task.
