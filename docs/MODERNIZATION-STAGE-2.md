# Frontend replacement

Current state: production runs `apps/web` (Next.js). `apps/web-2` is the
implemented TanStack replacement, pending production cutover. Both accept
normal fixes; the old frontend freeze (G-13) was lifted on 2026-10-10.

This guide retains the replacement's scope and constraints. Feature behavior
lives in `apps/web-2/src/features/*/SPEC.md`, development conventions in
`apps/web-2/AGENTS.md`, visual rules in `docs/web/DESIGN.md`, and implementation
decisions in `docs/DECISIONS.md`. The original audits and completed phase plans
are recoverable from Git.

## Product scope

- Learning: public catalog, collections, search, course pages, discussions,
  home/agenda, enrolled courses, player, assessments, code, file submissions,
  certificates, achievements and notifications.
- Teaching: inbox, course/content/assessment studios, roster and groups,
  grading/history/feedback, gradebook, analytics/CSV and AI tools.
- Administration: users, roles, groups, platform, AI and gamification settings.
- Account: password/TOTP/Google sign-in, registration, email verification,
  password reset, public profile/builder, security, appearance and notifications.
- One shell with learning, teaching and administration spaces; a focus layout
  for authoring, taking and grading work. Tabs and filters are URL state.
- ru (default), kk and en; all supported themes share typography and spacing.
  Theme changes affect colors, radii and shadows; mode follows the system by default.
- Notifications stay inside the application; email/push notifications,
  a messenger and a separate calendar are outside this replacement's scope.

## Contract and data safety

- The server owns authorization, progress, grading and validation. The web
  consumes session `capabilities` and resource `allowed_actions`.
- Sessions use the server's HttpOnly `ab_session` cookie. The web does not
  decode, create or delete it. API and bucket requests use the same origin.
- The new image has runtime `PUBLIC_ORIGIN` and `INTERNAL_API_URL`; it needs
  no domain-specific build arguments. CSP with a nonce applies to every document.
- Expand before cutover; remove compatibility only after the rollback window.
  The production Next.js client must keep working until then. Pending removals:
  `apps/server/docs/phase9-removals.md`.
- Editor documents, user themes and locales have idempotent admin migrations.
  Rehearse on a fresh production restore and compare content with G-14.
  `migrate-editor-docs --after-cutover` may produce `url` embeds the old web
  cannot render; defer it until the owner closes the rollback window.
- Preserve printed certificate verification URLs, including their locale aliases.
  Legacy page URLs with equivalents redirect to web-2; unmatched URLs stay 404
  (DECISIONS, 2026-10-11, supersedes the original no-redirect plan).
- Assessment drafts must survive reloads, network failures, concurrent tabs
  and version conflicts. Never replace server drafts with a second persistence layer.

## 9. Verification and acceptance

Use root `just` recipes from the app guide. Run focused checks during editing,
then `just ci-web2` for a coherent batch and production-build E2E before release.
The pre-commit hook checks staged files; pre-push runs `just check`.

- Every feature behavior (`B-...`) has a test (G-10); every API operation has
  a consumer or an explicit service/removal classification (G-07).
- Generated contract/client drift, import boundaries, dead code, translations,
  UI tokens, suppressions and bundle budgets are checked by the app's gates.
  Gate implementations/configuration are the current source for exact thresholds.
- Heavy editors, renderers and media components stay out of the entry bundle.
  Avoid repeated GETs on navigation; the original SSR targets are at most three
  course-page reads and p95 TTFB at most 400 ms on the CI stand.
- E2E checks role access, ru with kk/en smoke, CSP/console errors, axe serious
  and critical violations, and horizontal overflow at 390 px. Student and grading
  flows work on phones; block/code-test authoring can require desktop.
- Chromium runs the full suite; Firefox and WebKit have smoke coverage.
  Tagged Judge0/AI scenarios need an explicit full local run when CI omits them.
- Content corpus (G-14) and theme contrast (G-15) pass without excluding failures.
- Target replacement container memory is 512 MiB; observe it during cutover.

Release checklist: `docs/web/ACCEPTANCE.md`. Do not use historical green CI runs
as evidence for a new release.

## Remaining rollout

`docs/STAGE-2-CUTOVER.md` is the operational procedure: release preparation,
backup, exam-free window, web/link switch, smoke, seven-day observation and rollback.
The owner closes the rollback window before irreversible data/contract cleanup.

Afterward: remove the old frontend and its environment/configuration, remove
legacy contract entries, rename `apps/web-2` to `apps/web`, update paths and
guides, and delete the temporary rollout documents. Keep a single frontend,
client contract and development workflow. `apps/web-2/BACKLOG.md` lists open work.
