# Stage 2 backlog

Spec: `docs/MODERNIZATION-STAGE-2.md`. Status: `todo` / `wip` / `done` / `blocked(<reason>)`.
Orchestrator updates this file; deleted in phase 9.

Orchestration rules (not in the spec):

- `apps/web-2` is a standalone bun project (own `bun.lock`, not in the root workspace) so the frozen
  old web's Docker build is untouched. Root layout is decided again in 9.3.
- All Rust work goes through one serialized server lane in the main tree (one cargo build at a time).
- Web feature slices run in git worktrees (one per agent); the orchestrator merges them and
  regenerates `routeTree.gen.ts`. Subagents do not commit to `main`.
- Removed by the owner from "not doing" (offline/PWA, user timezone, external monitoring, sitemap):
  not excluded forever, but not in this stage unless the spec body says so.

- Stop hooks run `verify` only in linked worktrees; the main tree is checked by the pre-commit hook.
- Subagents write their final report to `<scratchpad>/reports/<id>.md` (a stop hook can swallow the last message).
- `gates/allowlist.json` has `contractReportOnly` until L-2 lands - remove it then.
- Local API for e2e: copy `E:\dev-caches\cargo-targetshyq-server\debugshyq.exe` to
  `E:\dev-cachesshyq-api-run\`, dot-source `<scratchpad>/api-env.ps1`, run `ashyq.exe serve` with cwd
  `apps/server` (:8000). Seed: `e2e-admin`, `e2e-teacher`, `e2e-student1`, `e2e-student2`; password in
  `reports/L-1.md`. Restart from a fresh copy after each server lane step.

Server gaps found by slices (feed into the server lane): collection cover field + upload purpose; `listCollections`
`q`/`sort`; email links and Google error redirect still point at `/auth/...` (S-11); `GET /courses` items lack
author names (only ids) and the signed-in user's progress; `GET /search` has no cursor (50 per section max).

BLOCKING for settings: `ProfileSection` is `allOf` of a variant with `additionalProperties: false` plus a separate
`type` tag -> generated validator rejects every section (`GET/PATCH /users/me`, `GET /users/{username}` fail dev
validation). `UserProfile` has no `version` (ETag only). `locale` accepts only `ru-RU`/`kk-KZ`/`en-US` (D-03).
Dev storage: presigned `put_url` is `http://localhost:9002` -> blocked by CSP `connect-src 'self'` in `vp dev`;
the API must presign against the web origin (vite proxies `/ab-public`, `/ab-private`).

Certificates: server prints `/{ru|kz|en}/certificates/{code}/verify` into PDFs (`Language::web_prefix`) -> S-11 must
print the prefixless URL; the web serves the prefixed form as a canonical alias for already printed QR codes.
`GET /trail`: no next-activity pointer (`next_action.href` is the old `/course/...` URL), status always `in_progress`,
no pagination; `GET /me/certificates` no pagination; certificate name only inside `Certification.config`; PDF
language only via Accept-Language.

Course/discussions gaps: no course `version`/`If-Match` (S-04); enrol has no Idempotency-Key; `CourseUpdate` has no
author; `next_action.href` old URL + English-only label; no `GET /discussions/{id}` (deep links beyond page 1);
server "visible text" check counts JSON chars (empty doc passes); `GET /learner-state` and discussions list 401 for guests.

Admin gaps: `GET /users` no sort/filter, no admin read of one user; `POST /users`, `/rbac/roles`, `/usergroups` take no
Idempotency-Key; several writes answer 204 without body (allowed_actions stale until reload). Dev storage CORS allows
only `http://localhost:3000` (logo upload e2e fails on other ports). Discussion images: no learner upload purpose.

Analytics gaps: `AtRiskLearnerRow` no `allowed_actions`; `DrillThroughResponse.items` object[]; `SavedView.query`
free; strings without enums (`intervention_type`, `status`, `outcome`, `reason_codes`, ...); alert/insight `params`
free; CSV language only via Accept-Language (needs `?lang=`); unknown `cohort_ids` -> 422 kills the layout.

Player gaps: activity `allowed_actions` has no mark/unmark; mark returns the trail, not the learner state; no attempt
counts, no typed activity content, no "next course"; API login rate limit 20/5min per address hits parallel e2e
(seed fixtures send a random `x-real-ip`).

Kit follow-ups: `shared/ui/command.tsx` (cmdk, catalog palette) overlaps the Base UI `combobox.tsx` - pick one in phase 7; `Dialog` initial focus lands on Close and its tooltip eats the first Escape.

K-3 done (9069df9, dc7d159): the kit is stock shadcn `base-nova` in `shared/ui` (27 components via CLI), our composites in
`shared/components`; initial JS budget 200 KB (stock `cn` in the shell). Stock edits and theme tweaks: `reports/K-3.md`.

Local e2e: `sh <scratchpad>/clear-rate-limits.sh` clears API login throttles. Local API restart recipe: copy the debug
binary to `E:\dev-caches\ashyq-api-run\`, `ashyq.exe migrate`, then `serve` (see notes above).

B-1 done (d4f5364): initial JS 171 KB, budget 180; features expose route-level code in `route.ts`; lint rules
`ab/route-level-imports`, `ab/route-entry-imports` and a build check keep feature/SDK code out of the entry.

Known red e2e for phase 7 (`reports/F-2.md`): analytics table container axe "scrollable-region-focusable"; `FileField`
32px overflow at 390px; B-ADM-07 (empty password now rejected by the generated schema); B-ACH-01/02 cold-dev timeouts.
The CI e2e stand runs as production and cannot relax auth limits: e2e needs one login per worker (storage state).

Server gaps for L-6 (from S-5.3, S-6.1, S-6.3; details in those reports): grader cannot read
`GET /submissions/{id}/feedback`; no group filter in review queues/gradebook, gradebook has no search/status filter;
file-submission queue lacks late filter, sort, counts, bulk publish/extend; no bulk-return; grading history only for
quiz/exam/code; signed download URLs are not same-origin (inline PDF preview blocked); `CodeBody` hints; submission ->
final run link and list of own runs; `feedback_code/params` untyped; reference-check per item with Idempotency-Key;
`/code/languages` 503 without Judge0; AI: streaming endpoints typed as strings, feature switches read-only, quality
report has no teacher verdict field, 8 AI operations without a consumer (delete per G-07); register-then-login 401 race.

## Resume notes (session cut by the usage limit, 2026-10-03 late evening)

- All feature slices of the URL map are built. Integration agent I-2 was merging 5.1, 5.2, 6.3, 5.3, 6.1, 3.8, 3.1 into
  main (see `git log` for `merge: slice ...` commits and `<scratchpad>/reports/I-2.md`); it was running the full e2e
  suite when the orchestrator stopped. Any `worktree-agent-*` branch still listed by `git branch` is NOT merged yet -
  merge it with the recipe (union `project.inlang/settings.json`, regenerate, `route.ts` convention, verify, build).
- Server L-5 (gaps from 5.1/5.2, S-11 link scheme, S-10 renames, D-01..D-03 commands, copy course) was running in the
  main tree `apps/server` (uncommitted); report `reports/L-5.md`. After it: commit server, restart API + worker from
  the new binary (`migrate` first), `bun run codegen` in web-2, fix fallout.
- Then: L-6 (server gaps listed above), phase 7 hardening - flip `apiCoverage` and `underConstruction` to enforcing in
  `gates/allowlist.json`, fix the red e2e list, replace `networkidle` waits, e2e one login per worker, G-14 corpus and
  G-15 re-run, translation back-check, first push + CI (`web2-gates`, `web2-e2e` never ran on GitHub).
- Nothing pushed.

## Server lane (sequential)

| #    | Item                                              | Status |
| ---- | ------------------------------------------------- | ------ |
| L-1  | S-02 session + capabilities + allowed_actions; S-03 seed-e2e | done |
| L-2  | S-01 contract hygiene (wire-compatible), gate at 0 | done  |
| L-3  | S-04, S-05, slice gaps, configurable auth limits (copy-course and cohort_ids 422 not done) | done |
| L-4  | S-08 password reset; S-06 user event stream; S-07 notifications; S-09 agenda; S-13 XP event | done |
| L-5  | gaps from 5.1/5.2; S-11 link scheme; S-10 renames (expand); D-01..D-03 admin commands; copy course | wip |

## Web phases

| #   | Item                                                              | Status |
| --- | ----------------------------------------------------------------- | ------ |
| 0.1 | freeze `apps/web`, explicit workspaces, `.gitignore`              | done   |
| 0.3 | skeleton: Start + Paraglide + hey-api + srvx, gates, hooks        | done   |
| 0.4 | e2e stand: local + CI job `web2-e2e`                              | todo   |
| 0.5 | assumptions recorded in `docs/DECISIONS.md`                       | done   |
| 1.1 | DESIGN.md, tokens, typography, 63 themes                          | done   |
| 1.2 | kit, templates, states, theme infra, G-15; shell, full route tree, nav | done   |
| 1.3 | shared/api (client, errors, upload), shared/auth, guards; events.ts waits L-4 | done (events todo) |
| 1.4 | i18n: strategy, format.ts, validation map, labels, glossary       | done   |
| 1.5 | request chain: CSP, request id, healthz, client-error             | done   |
| 1.6 | reference slice: auth + collections (reset-password waits L-5)    | done   |
| 1.7 | AGENTS.md final                                                   | todo   |
| 2   | editor + markdown core, insert/paste/slash, video, PDF, discussions (in 3.3) | done |
| 3.1 | home (+ reset-password and resend-code pages in auth)             | wip    |
| 3.2 | catalog, landing, search, command palette                         | done   |
| 3.3 | course page + discussions                                         | done   |
| 3.4 | learning, certificates (+ locale-prefixed verify alias)           | done   |
| 3.5 | player (child route stubs for 5.2/5.3/5.4)                        | done   |
| 3.6 | settings, public profile (profile builder e2e waits ProfileSection fix) | done |
| 3.7 | achievements                                                      | done   |
| 3.8 | notifications + shared/api/events.ts + event invalidation table   | wip    |
| 4.1 | course studio                                                     | done   |
| 4.2 | admin: users, roles, groups, platform, gamification config        | done   |
| 4.3 | analytics (e2e red until the server enum casing fix lands)        | done   |
| 5.1 | assessment studio                                                 | done (merge in progress, I-2) |
| 5.2 | attempt                                                           | done (merge in progress, I-2) |
| 5.3 | code arena (CodeMirror)                                           | done (merge in progress, I-2) |
| 5.4 | file submissions                                                  | done   |
| 6.1 | grading, results, gradebook                                       | done (merge in progress, I-2) |
| 6.2 | teach inbox                                                       | done   |
| 6.3 | AI (panel, Q&A, analysis, critique, remediation, admin AI)        | done (merge in progress, I-2) |
| 7   | hardening                                                         | todo   |
| 8   | cutover (needs owner: prod access, exam-free window)              | todo   |
| 9   | legacy removal (after the 7-day observation window)               | todo   |
