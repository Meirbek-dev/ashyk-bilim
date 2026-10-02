# Repository map

- `justfile` - the single entry point. `just dev-up` starts local services, `just server <recipe>`
  and `just web <script>` proxy into the apps, `just deploy` / `rollback` / `backup` / `restore`
  run production ops. Add a recipe instead of documenting ad-hoc commands.
- `apps/server/` - Rust API (axum + sqlx), `/api/v2`. Read `apps/server/AGENTS.md` first.
- `apps/web/` - Next.js frontend. Read `apps/web/AGENTS.md` first.
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
