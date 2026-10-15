# Production findings

Open issues and accepted risks, ordered by severity. Keep stable finding
numbers for code references; remove resolved items unless they document a
constraint or are cited by code. Historical reports are in Git.

## Critical

### 3. Backups never leave the machine (accepted risk)
`offen/docker-volume-backup` writes nightly archives to `./backups` **on the same
disk** it is backing up, with 7-day retention. A disk failure, host compromise, or
`rm` mistake loses the application *and* every backup of it.

**Owner decision 2026-10-02: no offsite backups.** Kept here as an accepted
risk. Stage 1 reduced what it can: archives are logical dumps plus volumes and
secrets, restorable by one script and checked by `just restore-drill`
(RUNBOOK 3.5). Copying an archive off the host by hand before risky work is
the only offsite protection left.

## High

### 4. Admin credentials were shared in plaintext
The production admin password was pasted into a chat session during rewrite
planning. Rotate it (now a Zitadel credential) and enable MFA on the admin account.

### 30. The production SSH password was written into a repository file
On 2026-10-02 the host's SSH password was pasted into a temporary migration-plan file
(staged, never committed or pushed; scrubbed before the first commit). Rotate it and
switch the host to key-only authentication (`PasswordAuthentication no`).

## Medium

### 9. No monitoring or alerting in production (accepted risk)
The server exports OTLP (`AB__TELEMETRY__OTLP_ENDPOINT`) but nothing alerts.
**Owner decision 2026-10-02: no external monitoring services** (no uptime
check, no dead-man ping). Covered at deploy time only: `preflight` warns on
Zitadel PAT expiry (30 days), TLS certificate expiry (14 days) and disk over
85%, and `smoke` checks readiness after every deploy and rollback. Between
deploys an outage, a failed nightly backup or a filling disk goes unnoticed
until someone looks.

### 13. Production frontend E2E runs only by hand
Lint, typecheck, unit tests, API contract and error-code checks run in CI.
The replacement frontend has a `web2-e2e` CI job; production Next.js Playwright
coverage still runs by hand. `apps/web/scripts/run-vitest.mjs` also pins Vitest
over the vite-plus bundle; remove the wrapper when the bundled version works.

### 31. Responses with more than 4k of headers are a 502 at the university proxy
Found 2026-10-04: the home page answered 502 through the proxy (200 at our nginx)
because Next's `Link` header (hreflang + preloads) was 3.3 KB. **Fixed:** the edge
hides `Link` on web responses and smoke checks the header size. Stage 2 contract:
the web app must keep response headers under 3.5 KB (no preload `Link` headers).

### 29. Flaky server test under coverage
`ab-api::mfa_flow::fenced_totp_login_retries_without_replaying_the_code`
(`crates/api/tests/mfa_flow.rs:580`, "the retry ran": left 0, right 1) failed once in
the `Coverage floor` step (CI run 37062388407) after passing in the plain test step of
the same run and in five other runs. Timing-dependent under llvm-cov instrumentation.
A red server gate blocks `publish`; re-run the job until the test is made deterministic.

### 32. University proxy rejects large single PUTs (multipart workaround)
Confirmed 2026-10-11: the public origin returns HTTP 413 for a signed PUT
declaring 308 MiB or 2 GiB (100 MiB is accepted). The same 308 MiB PUT
directly through the stack's nginx succeeds in 2.7 seconds. Both the app
and the stack already permit 2 GiB; the outer university TLS proxy is the
remaining blocker. University IT must raise its bucket-route body limit
and disable request buffering as described in RUNBOOK.md "Other". SSH to
that proxy was unreachable from the production host. The web fix preserves
storage HTTP status and translates 413 as `payload-too-large` instead of
claiming the user is offline. **Open for large single PUTs until the outer
proxy is changed; multipart mitigates video uploads as below.**

Mitigation 2026-10-13: both frontends now use 32 MiB multipart requests for
videos above 32 MiB. A production storage probe sent 308 MiB through the
public hostname as ten parts, completed the object, verified its MIME,
size and first/last bytes, and removed the object/session. The outer
single-request limit remains; old cached clients still need a reload or
the proxy configuration change. Server tests cover assembly/finalize,
ownership, replay, cancellation, reaping and the exact 2 GiB boundary.

## Low

### 18. The per-assessment `required` flag does not drive progress
Legacy progress hard-coded `required = True` for every submission-backed
activity; v2 keeps that behaviour (so migrated courses complete the same way) and
carries the flag as `assessments.required`. Owner decision pending on whether the
flag should start driving progress (most existing assessments would become
optional overnight).

### 25. Imported data: duplicate email addresses
Two imported users shared `Nurgul287@mail.ru`; the import gave the duplicates
stable `+legacy-{id}` aliases. Tell the affected account holders which address to
retain.

### 26. Pre-assessment exam history was not imported
The legacy database had 19 `exam` and 45 `examattempt` rows from a model the
legacy app itself could no longer render; they were deliberately dropped. They
exist only in pre-cutover backups.

### 28. Leaderboards may carry inflated XP
Legacy `POST /gamification/xp` let learners award themselves XP; imported totals
may be inflated. Owner call whether to reset XP.

### 33. Concurrent authenticator setup has a generic failure
Historical QA (UX-126) found that starting TOTP setup in a second tab replaces
the first tab's secret in Zitadel; the first tab then reports an invalid code.
No per-enrollment nonce was implemented in that pass. Reverify before changing
this flow; the old QA ledger is in Git history.

## Resolved by v2 (kept because code cites the numbers)

- **16.** Legacy search matched `User.email` for anonymous callers. v2 search
  never matches email and shows people only to signed-in callers.
- **20.** Legacy declared `analytics_event` but never wrote a row. v2 records
  events from the write paths.
