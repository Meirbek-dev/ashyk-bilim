# Production frontend

Next.js frontend for the Rust `/api/v2` API. From the repository root:

```sh
just setup-web
just web dev
just ci-web
```

Use `just stack up` for the full local development stack. See the root
`README.md` for prerequisites, this app's `AGENTS.md` for development conventions,
`docs/INFRA.md` for build/runtime environment, and `docs/RUNBOOK.md` for deployments.
