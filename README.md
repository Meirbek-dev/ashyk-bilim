# Ashyq Bilim

Learning platform: Rust API (`apps/server`) and TanStack Start web app (`apps/web`).

## Repo map

| Path | What |
| --- | --- |
| `apps/server/` | Rust API (axum + sqlx), `/api/v2`, plus the job worker |
| `apps/web/` | Web app: React + TanStack Start (Vite+ toolchain) |
| `infra/` | nginx, Postgres init, Judge0, storage, env templates, ops scripts |
| `compose*.yaml` | Stack definitions: shared, dev, prod, smoke and e2e stand |
| `justfile` | Single entry point for every task |
| `docs/` | Architecture, decisions, infra, runbook, QA ledger |

## Quick start

Needs `just`, `bun`, a Rust toolchain and Docker or Podman.

```sh
just dev-up        # Postgres, Redis, Zitadel, RustFS on 127.0.0.1
just server dev    # API watch loop (just server test runs the suite)
just web dev       # web app on http://localhost:3000 (first: bun install in apps/web)
```

`just --list` shows every recipe.

## Production

Deploy, rollback, backup, restore and incident steps: `docs/RUNBOOK.md`.

## License

Business Source License 1.1, see `LICENSE`.
