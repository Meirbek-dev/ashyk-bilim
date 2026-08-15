<!--VITE PLUS START-->

# Using Vite+, the Unified Toolchain for the Web

This project is using Vite+, a unified toolchain built on top of Vite, Rolldown, Vitest, tsdown, Oxlint, Oxfmt, and Vite Task. Vite+ wraps runtime management, package management, and frontend tooling in a single global CLI called `vp`. Vite+ is distinct from Vite, and it invokes Vite through `vp dev` and `vp build`. Run `vp help` to print a list of commands and `vp <command> --help` for information about a specific command.

Docs are local at `node_modules/vite-plus/docs` or online at https://viteplus.dev/guide/.

## Review Checklist

- [ ] Run `vp install` after pulling remote changes and before getting started.
- [ ] Run `vp check` and `vp test` to format, lint, type check and test changes.
- [ ] Check if there are `vite.config.ts` tasks or `package.json` scripts necessary for validation, run via `vp run <script>`.
- [ ] If setup, runtime, or package-manager behavior looks wrong, run `vp env doctor` and include its output when asking for help.

<!--VITE PLUS END-->

# Repository map

- `apps/server/` — **Rust backend (the active rewrite target).** Read
  `apps/server/AGENTS.md` before touching it; design in `docs/rewrite/ARCHITECTURE.md`;
  work queue in `docs/rewrite/EXECUTION-PLAN.md`. Rewrite work happens on the
  `rewrite` branch with direct commits.
- `apps/api/` — legacy Python/FastAPI backend. **Feature-frozen, read-only reference**
  for porting semantics; deleted at cutover. Do not modify.
- `apps/web/` — Next.js 16 frontend (Vite+ toolchain above). In scope for rewrite
  adaptation (phase P9).
- `docs/FINDINGS.md` — production/infra issues outside the rewrite scope.
