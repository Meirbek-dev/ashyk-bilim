# QA + fix sweep (reusable brief for agents)

On hold: `docs/REWRITE.md` section 13 allows no QA sweep loops until its phase 6 ends. Until then use this brief
only for a sweep the owner asks for by name; a single bug fix follows the app's `AGENTS.md` and the skills.

Hand this file to every QA/fix agent together with its lane (cluster of features). The owner wants every function
to work for every role; agents test exhaustively, fix at the root cause, verify, and commit. Locales: ru (default),
kk, en. Apps: `apps/server` (Rust API), `apps/web-2` (new frontend), `apps/web` (legacy, in production: keep it
working). Read the root `AGENTS.md` and the AGENTS.md of every app you touch first.

## Orchestration

- Start from real failures: `just prod-report --since 7d` and `just brief`. Production errors and dead jobs outrank
  anything a sweep finds; a sweep lane without a production signal tests what real users hit most (below).
- Run sweep lanes on a fast model; the orchestrator and the contract lane on the strongest one.
- At most 3 agents per checkout at once (or one per worktree: `just wt new <name>`, `just wt land <name>`).
- One lane owns contract changes (server DTO/route, `openapi.v2.json`, both generated clients): `just contract`.
  Other lanes ask the orchestrator; they never run codegen themselves.
- Each agent writes progress to `<scratch>/<lane>/REPORT.txt` as it goes (it survives a rate limit or a crash).
- Commit per finished item, right away; never leave files staged; push only when the orchestrator says so.
- Shared files (catalogs, `justfile`, `AGENTS.md`, docs): small Edit-tool edits, re-read first, commit at once.

## Stack and accounts

- `just stack up [slot]` / `status` / `logs <svc>` / `restart <svc>`: containers + API + worker + both webs on the
  slot's ports (slot 0: API 8000, web-2 3100, legacy 3200). Never kill other people's processes or recreate
  containers. After a server `.rs` change: `just stack restart api` (builds) once per batch.
- Fresh data: `just db fresh <name>` (clone of the seeded template in ~1 s). Sign in as anyone on a local copy:
  `just login-as <user> [slot]` (dev-only endpoint).
- Seed accounts (`seed-e2e`): `e2e-admin` (platform admin), `e2e-teacher` (owns «E2E seed course» with one activity
  of every type), `e2e-student1` (enrolled), `e2e-student2` (not enrolled); password from the local env override,
  never printed in reports. Cover: admin, course owner, co-teacher, enrolled learner, non-enrolled user, anonymous.
  Destructive tests use your own users/courses, prefixed with your lane id.

## How to test

- Drive the real UI with Playwright scripts in your scratch dir (headless Chromium); screenshot and look at the shots
  (`just shoot --page name=/path --as <login>` for web-2 pages as a real account).
- Hit the API directly for edge cases, races and permissions. Watch the browser console, failed requests and the
  API log for 5xx/panics on every page.
- ru and en always, kk spot checks; 390 px phone width for main flows; keyboard for dialogs.
- Priority: what real users hit often (students taking tests, teachers authoring/grading, video uploads) > rare
  bugs > UX polish. Keep testing until the lane is clean; do not stop at the first findings.

## How to fix

- Root cause, in the shared function every caller goes through (grep callers first). A fix in shared server
  behaviour keeps BOTH frontends working; a bug fixed in one web is checked in the other.
- A regression test per non-trivial fix (web-2 vitest/e2e, legacy `apps/web/src/tests/**`, Rust `crates/*/tests`),
  then re-run the failing scenario.
- Messages: web-2 `apps/web-2/messages/<locale>/<feature>.json`, legacy `apps/web/src/messages/*.json`; all three
  locales; small edits, never rewrite a catalog.
- Commit only your files: `just commit -m "<subject>" <paths>` (jj runs no git hooks; this runs the checks and
  undoes a failing commit). Never `add -A`, `commit -a`, stash, checkout or reset of files you did not edit, never
  `--no-verify`. Subject `fix(web-2|web|server): <user-visible outcome>`,
  body ends with the `Co-Authored-By` line. The pre-commit hook checks only what you stage (`just fmt <files>`
  fixes formatting); `just check` runs the gates for what changed.

## Report format (REPORT.txt)

- `BUG-<lane>-<n>` / `UX-<lane>-<n>` rows: severity, who hits it and how often, repro, root cause, fix (commit
  subject), regression test, verified yes/no.
- What was tested and found clean (feature x role matrix), and what is left open with the reason.
- The final message is a short summary pointing at REPORT.txt.
