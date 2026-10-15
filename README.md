# Ashyq Bilim

Learning platform: Rust API, production Next.js app, and a replacement TanStack app.

## Repo map

| Path | What |
| --- | --- |
| `apps/server/` | Rust API (axum + sqlx), `/api/v2`, plus the job worker |
| `apps/web/` | Next.js frontend (Vite+ toolchain) |
| `apps/web-2/` | Replacement TanStack Start frontend (standalone Bun project) |
| `infra/` | nginx, Postgres init, Judge0, storage, env templates, ops scripts |
| `compose*.yaml` | Stack definitions: shared, dev, prod, smoke |
| `justfile` | Single entry point for every task |
| `docs/` | Architecture, decisions, operations, open issues and frontend rollout |

## Quick start

Needs Git, `just` 1.58.0, Bun 1.4.3, Node from `.node-version`, Rustup and Docker or Podman.
On Windows, put Git Bash's `sh` on PATH; recipes use it rather than WSL's `bash.exe`.

```sh
just setup         # pinned Rust tools, dependencies, skill copies, commit hook
just doctor        # validates tools inside the recipe shell
just dev-up        # Postgres, Redis, Zitadel, RustFS on 127.0.0.1
just server dev    # API watch loop (just server test runs the suite)
just web dev       # web app on http://localhost:3000
```

`just --list` shows every recipe.

Focused checks: `just server test-unit -E 'test(name)'`, `just web test <file>`,
`just web2 test --project unit <file>` (or `--project browser`).
Batch gates: `just ci-server`, `just ci-web`, `just ci-web2`; `just ci` runs all local
application/infra gates. Hosted CI also builds images, scans secrets and runs stack/E2E tests.
The commit hook checks staged files; pre-push runs `just check`. No per-edit or Stop hooks repeat checks.

## Production

Deploy, rollback, backup, restore and incident steps: `docs/RUNBOOK.md`.

## License

Business Source License 1.1, see `LICENSE`.
