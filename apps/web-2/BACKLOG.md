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

## Server lane (sequential)

| #    | Item                                              | Status |
| ---- | ------------------------------------------------- | ------ |
| L-1  | S-02 session + capabilities + allowed_actions; S-03 seed-e2e | wip |
| L-2  | S-01 contract hygiene (wire-compatible)           | todo   |
| L-3  | S-04 concurrency + idempotency; S-05 pagination   | todo   |
| L-4  | S-06 user event stream                            | todo   |
| L-5  | S-08 password reset, resend code                  | todo   |
| L-6  | S-07 notifications                                | todo   |
| L-7  | S-09 agenda; S-10 renames (expand)                | todo   |
| L-8  | D-01..D-03 data migrations                        | todo   |
| L-9  | S-11 link scheme switch                           | todo   |

## Web phases

| #   | Item                                                              | Status |
| --- | ----------------------------------------------------------------- | ------ |
| 0.1 | freeze `apps/web`, explicit workspaces, `.gitignore`              | done   |
| 0.3 | skeleton: Start + Paraglide + hey-api + srvx, gates, hooks        | wip    |
| 0.4 | e2e stand: local + CI job `web2-e2e`                              | todo   |
| 0.5 | assumptions recorded in `docs/DECISIONS.md`                       | todo   |
| 1.1 | DESIGN.md, tokens, typography, 63 themes, G-15                    | todo   |
| 1.2 | kit, templates, shell, focus layout, states                       | todo   |
| 1.3 | shared/api (client, errors, events, upload), shared/auth, guards  | todo   |
| 1.4 | i18n: strategy, format.ts, validation map, labels, glossary       | todo   |
| 1.5 | request chain: CSP, request id, healthz, client-error             | todo   |
| 1.6 | reference slice: auth + collections                               | todo   |
| 1.7 | AGENTS.md final                                                   | todo   |
| 2   | editor, markdown, video, PDF, discussions                         | todo   |
| 3.1 | home                                                              | todo   |
| 3.2 | catalog, landing, search, command palette                         | todo   |
| 3.3 | course page                                                       | todo   |
| 3.4 | learning, certificates                                            | todo   |
| 3.5 | player                                                            | todo   |
| 3.6 | settings, public profile                                          | todo   |
| 3.7 | achievements                                                      | todo   |
| 3.8 | notifications                                                     | todo   |
| 4.1 | course studio                                                     | todo   |
| 4.2 | admin: users, roles, groups, platform                             | todo   |
| 4.3 | analytics                                                         | todo   |
| 5.1 | assessment studio                                                 | todo   |
| 5.2 | attempt                                                           | todo   |
| 5.3 | code arena                                                        | todo   |
| 5.4 | file submissions                                                  | todo   |
| 6.1 | grading, gradebook                                                | todo   |
| 6.2 | teach inbox                                                       | todo   |
| 6.3 | AI                                                                | todo   |
| 7   | hardening                                                         | todo   |
| 8   | cutover (needs owner: prod access, exam-free window)              | todo   |
| 9   | legacy removal (after the 7-day observation window)               | todo   |
