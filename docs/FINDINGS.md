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

## Medium

### 9. No monitoring or alerting in production (accepted risk)
The server exports OTLP (`AB__TELEMETRY__OTLP_ENDPOINT`) but nothing alerts.
**Owner decision 2026-10-02: no external monitoring services** (no uptime
check, no dead-man ping). Covered at deploy time only: `preflight` warns on
Zitadel PAT expiry (30 days), TLS certificate expiry (14 days) and disk over
85%, and `smoke` checks readiness after every deploy and rollback. Between
deploys an outage, a failed nightly backup or a filling disk goes unnoticed
until someone looks.

### 13. Production release gate awaits its first hosted run
The `web-release-e2e` CI job now gates production publication on browser checks
against the built image and a synthetic backup/restore integrity drill. Focused
production browser and fixture checks pass; the complete image/restore lane still needs
its first hosted validation. The real Judge0 shard likewise needs hosted
validation. The longer production journey remains a local regression suite.

### 35. Production journey stalls after successful enrollment
On the local production build, the serial `journey.spec.ts` creates and
publishes a fresh course, then its learner's Start Course request returns
HTTP 200 without navigating to the first activity. The enrollment test keeps
its navigation assertion and fails; later serial stages do not run. Reproduce
with `just e2e web journey.spec.ts --project=chromium`. Investigate the landing
CTA after the enrollment response before treating the whole journey as green.

### 31. University proxy response-header limit (operating constraint)
The university proxy answers 502 when response headers overflow its 4 KiB buffer.
The edge hides `Link` on web responses and deployment smoke checks require headers
below 3500 bytes. Preserve both guards when switching frontends: the Stage 2 web
contract forbids preload `Link` headers. See `docs/INFRA.md` for the proxy contract.

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

### 33. shadcn CLI retains an unpatched braces dependency

Both frontends' development dependency chain `shadcn -> @shadcn/registry -> fast-glob -> micromatch -> braces`
includes `braces@3.0.3`. [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) rates its
stack-exhaustion denial of service high; no patched release is available as of 2026-10-17. It is used by tooling,
not the application runtime. Avoid processing untrusted glob patterns with the CLI. Remove this finding when
shadcn drops the affected dependency or a compatible patched version becomes available; do not suppress the audit.

### 34. Tiptap mathematics has not declared KaTeX 0.19 compatibility

`apps/web-2` pins `katex@0.19.1`, but `@tiptap/extension-mathematics@3.32.0` declares
`^0.16.4 || ^0.17.0 || ^0.18.0` as its peer range. The markdown round-trip and browser math tests pass with
the pinned version; this is an upstream compatibility declaration gap, not an observed rendering failure.
Keep those tests when updating either package. Remove this finding when the extension's peer range includes
0.19; do not downgrade KaTeX or edit installed package metadata just to silence the peer warning.

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

## Resolved by v2 (kept because code cites the numbers)

- **16.** Legacy search matched `User.email` for anonymous callers. v2 search
  never matches email and shows people only to signed-in callers.
- **20.** Legacy declared `analytics_event` but never wrote a row. v2 records
  events from the write paths.
