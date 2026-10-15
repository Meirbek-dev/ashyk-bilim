# Frontend replacement acceptance

Production still uses Next.js. Check these requirements on the release being
considered; old CI run numbers and completed implementation logs are in Git.
Procedure: `docs/STAGE-2-CUTOVER.md`. Remaining work: `apps/web-2/BACKLOG.md`.

## Before cutover

- Current app gates and production-build E2E pass; no unexplained skips,
  warnings or suppressions. Allowlist entries have reasons.
- Full local Judge0 scenarios pass; record any AI coverage that CI omits.
- The replacement image builds without domain-specific arguments and is the
  same image tested by CI and deployed to production.
- G-07 classifies every operation; G-10 covers every feature behavior.
  Temporary removals agree with `apps/server/docs/phase9-removals.md`.
- G-14 loses no editor/markdown content on a fresh production restore, before
  and after data migration. G-15 passes every supported theme and mode.
- Role access is verified in ru, with kk/en smoke. Student and grading flows
  work at 390 px, without page overflow, serious/critical axe findings,
  unexpected console errors or CSP violations.
- Bundle/performance budgets pass. Firefox and WebKit smoke pass; investigate
  the unresolved authenticated Windows WebKit crash and verify real Safari.
- Fresh backup, exam-free window, smoke accounts and rollback images are ready.

## At cutover and during observation

- Public pages, sign-in/out, each role's main flow, password-reset links,
  certificate verification (including printed QR URLs), uploads and downloads work.
- CSP has a nonce; response headers fit the university proxy limit.
- Watch client/server errors, 5xx, user reports and memory for seven days.
  Any data-loss report triggers rollback and triage.
- The owner explicitly closes the rollback window before irreversible migration.

## After the rollback window

- Remove the old frontend, compatibility operations/fields/settings and temporary
  contract exceptions. Rename `apps/web-2` to `apps/web`; update all callers/configs.
- The web container needs only `PUBLIC_ORIGIN`, `INTERNAL_API_URL` and system
  variables; remove Next.js environment keys and build arguments.
- No stale Next.js, old API names, `web-2` paths or temporary rollout markers
  remain in active source/configuration. All final application and release gates pass.
- Refresh root/app agent guides and delete completed rollout guides/backlog.
