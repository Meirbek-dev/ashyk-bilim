# Gauntlet loop brief — Ashyq Bilim v2 (Rust rewrite)

## Mission

Run the gauntlet loop over the whole v2 app (`apps/server` Rust API + `apps/web` Next 16)
until two consecutive passes find nothing. Every feature row in the ledger, every route
each row touches, every branch of every domain function behind those routes, every
role, every locale. Find and fix all bugs. Audit and fix every weird UX moment. Run it
locally, test it in a real browser, prove each fix from a fresh session.

You are autonomous. Owner is solo, busy, not watching. No "shall I", no review requests,
no PRs — direct commits to `rewrite`. Machine gates replace human review. Owner-only
decisions go to `QUESTIONS.md` at the repo root and you keep going on everything else.

## Budget

- Model: Opus 5 for you and every subagent. Never more than **3 subagents alive at once**
  (default 1 critic + 2 builders; 2 critics + 1 builder for a verification pass).
- Every subagent brief is bounded: row ids, file paths, done criteria, and a **report
  cap of 40 lines** in the table shape below. No narration, no file dumps.
- Gates run **once per pass**, never per fix. Inside a pass: `cargo check`,
  `cargo nextest run -E 'test(name)'`, `bun run test -- <file>`, one Playwright spec.
- Commit after every builder batch (subagents die on 429; a dead agent's work must
  already be on disk and in git). Resume a dead agent by spawning a fresh one pointed
  at the same rows and the ledger, not by re-running its whole brief.
- Do not re-read the ledger in full each turn — `grep` the rows you need.
- Headless Playwright before pane clicking. Pane clicking only for visual/UX judgement.

## Step 0 — resume, then stand up the stack

1. `git log -3 --oneline`, then read `docs/rewrite/GAUNTLET.md` **Setup facts** and the
   top of **Pass log**. That is the resume point. Every quirk of this machine is already
   recorded there and in `apps/server/AGENTS.md` — do not rediscover them.
2. Every shell: `$env:CARGO_TARGET_DIR='C:\cargo-target\ashyq-server'`.
3. Stack: podman containers `ashyq-test-pg` :5433, `ashyq-test-redis` :6380,
   `ashyq-zitadel` :8081, `ashyq-rustfs` :9002 (+ CORS and public policy from `extra/`).
   They are `--rm`; if missing, recreate per AGENTS.md, then `ashyq_dev` + migrations,
   then the three accounts (`learner@` / `teacher@` / `admin@ashyq.local`,
   password `GauntletDev!2026`) via Zitadel + `users`/`user_roles` rows or the v2
   admin route.
4. Processes: `ashyq serve` :8000 **and** `ashyq worker` (same env from
   `scratchpad/abenv.sh`), web via `preview_start {name:"web"}` :3000. Never the `api`
   launch entry (legacy Python).
5. Prove it: `GET /api/v2/health` → ok; log in as each role once in the browser.
   Record any new setup fact in the ledger before the first pass.

## The loop

Each pass = plan → critic → triage → build → re-verify → gate → record. Repeat.

### 1. Plan the pass (you, no subagent)

Pick target rows, in this priority:

1. **Stale rows**: rows whose last critic verdict predates the last commit touching
   their code. Compute with `git log --since=<pass date> --name-only` against the
   routes/files each row names. A fix in a shared module (`apiJson`, `AppLink`,
   `rbac_sweep`, projectors, `error.rs`) stales every row.
2. Rows still `fail` or with an open BUG/UX id.
3. Rows never probed **at function level** (see critic scope B and C) — the first eight
   passes were browser-first; the server branches behind each route are the long tail.
4. Cross-role seams: learner action → teacher sees it → learner sees the result, without
   reloads.

Write the pass plan as one line in the pass log (`in progress`) and commit.

### 2. Critic (subagent, fresh context, one per role or per row cluster)

Brief template — fill the brackets, nothing else:

```
Role: critic. Rows: [F..]. Account: [role]. Read only docs/rewrite/GAUNTLET.md rows
[ids] + Setup facts. Do not edit source. Report ≤40 lines in the table
| row | step | expected | actual | evidence | severity |.
Evidence = status code + server log line, or screenshot name, or DOM text.
Severity: bug (wrong/blocked/data loss) | ux (works but feels wrong) | nit.
```

Critic scope per row, all three of these:

- **A. Browser drive** (`apps/web/e2e` helpers, Playwright headless, chromium; one
  kz pass per row): every control on every screen of the row, every state — empty,
  loading, error, success, after-mutation-without-reload, back button, direct URL,
  refresh mid-flow, second tab, logged-out hit. ru first; then kz for copy leaks.
- **B. Contract drive** (curl against :8000 with a minted session — mind the
  single-session hazard, mint curl OR Playwright, not both): for every route the row
  touches, per role: happy path, 401/403 per role, 404 unknown id, 422 with the
  documented problem+json code, idempotency replay, `If-Match` stale, cursor pagination
  to the end, limits at the boundary.
- **C. Function drive** (read the domain service + handler in `apps/server/crates/*`):
  list every branch (`match` arms, `if let`, early returns, constraint checks) and mark
  each `covered` (name the nextest) or `uncovered`. Uncovered branches on a money/grade/
  permission/deadline path are findings; everything else is a one-line test task for a
  builder.

UX audit checklist the critic applies on every screen (each hit is a `ux` row):
dead click; silent failure (no toast, no field error); loading that never resolves;
403/404 rendered as an empty list; English or raw enum/code leaking in ru/kz; number or
date formats that differ across the page; stale state after a mutation until reload;
missing empty state; destructive action without confirm; two primary buttons; `href="#"`
or malformed href (`//`, missing locale prefix → 307); page `<title>` missing or wrong
locale; focus lost after dialog close; keyboard-unreachable control; toast text that
contradicts the visible result; label promising something the action does not do.

### 3. Triage (you)

For each critic line: grep the ledger for a duplicate. New → `BUG-nnn` / `UX-nnn` row
with symptom, root-cause hypothesis, file:line. Decide the lane:

- **fix** (default),
- **DECISIONS** when the legacy semantics and the v2 contract disagree — record the
  choice in `docs/rewrite/DECISIONS.md` then fix,
- **QUESTIONS** only when the owner must choose money, data, or product scope — append
  to `QUESTIONS.md`, mark the row `blocked`, keep going,
- **blocked/environment** (F14 Judge0 class) — setup fact, not a bug.

Group fixes into ≤3 builder batches by disjoint files. Server and web fixes for the same
bug go to the same builder.

### 4. Builder (subagent, one batch each)

```
Role: builder. Fix [BUG-/UX- ids] listed in docs/rewrite/GAUNTLET.md. Files: [paths].
Rules: root cause, not symptom — grep every caller before editing; server bugs are fixed
in the server, never masked in the client; no legacy shims; every user-facing string in
all three catalogs (ru, kk, en); problem+json codes reach the client via apiJson, not
through a 'use server' action (BUG-035); one smallest regression check per fix
(nextest e2e in crates/api/tests, vitest, or a Playwright step). Verify with
cargo check / targeted nextest / targeted vitest only. Commit each fix
(message: fix(scope): BUG-nnn one line). Report ≤40 lines:
| id | root cause | change | check added | commit |.
```

Apply `just openapi` only after `taskkill //F //IM ashyq.exe`, and `just prepare` after
any SQL or `query!` change; restart `ashyq serve` + `ashyq worker` after server changes.

### 5. Re-verify (critic, fresh context)

A row flips to `pass` only when a **different, fresh** critic re-drives the row after
the last commit that touched it. The builder's own "verified" is not a pass. Rows the
re-verifier fails go back to step 3 in the same pass (bounded: two builder rounds per
pass, then carry over).

### 6. Gate (once per pass, nothing else heavy running)

```
just check
cargo nextest run --workspace --build-jobs 4
cd apps/web && bun run typecheck && bun run test && bun run check:error-codes && bun run test:e2e
```

Then `just openapi` (server stopped) if routes changed, commit, push, and watch CI with
`gh run watch` at ≥5-minute intervals. Red gate = your only next task.

### 7. Record

Ledger: feature row verdicts (`pass N (role): one-line evidence`), bug rows with commit
shas, UX rows, new setup facts, pass-log line (features probed / found / fixed / gate
numbers / commit). One line in `EXECUTION-PLAN.md` session log. Commit
`docs(gauntlet): pass N — …`. Update the pass plan for N+1 and loop.

## Stop condition

Stop when **two consecutive passes** each: probe every non-blocked row (stale or not) at
scopes A+B+C, flip zero rows to `fail`, add zero BUG rows, and gate green with CI green.
Then write the final pass-log line and a ≤20-line summary: rows/bugs/UX totals, what
stays `blocked` and why, open QUESTIONS, CI run id. That is the last message.

## Never

- Edit `apps/api` (frozen reference). Commit `temp-restore/`, `.env*`, keys, PATs.
- Run full nextest or two Playwright suites concurrently with builders (page-file and
  `e2e/.auth` hazards). Run `vp check` repo-wide (3 286 pre-existing formatting hits).
- Mark a row `pass` from a builder report, from `javascript_tool`, or from the browser
  network panel — the server log is the source of truth for v2 traffic.
- Ask the owner in chat. Append to `QUESTIONS.md` and continue.
