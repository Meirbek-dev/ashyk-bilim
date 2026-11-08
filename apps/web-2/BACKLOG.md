# web-2: remaining work

`apps/web-2` is the production web; the old `apps/web` is deleted. Old completion logs and temporary machine setup
are in Git.

- Cutover leftovers (host steps of the first deploy, `migrate-editor-docs --after-cutover`, phase 9 contract and
  rename): `docs/STAGE-2-CUTOVER.md`; server removals in `apps/server/docs/phase9-removals.md`.
- SPA build replacing the Node container: `docs/REWRITE.md` section 7 and phase 1.

Use `just stack up`, `just login-as`, and `just e2e` from the root guide for local work.
Re-run checks on the release being considered; old green runs are not release evidence.
