# Production findings

Open issues and accepted risks, ordered by severity. Keep stable finding
numbers for code references; remove resolved items unless they document a
constraint or are cited by code. Historical reports are in Git.

## Critical

### 3. Backups never leave the machine (accepted risk)
The nightly restic snapshots live in `${BACKUP_DIR}/restic` **on the same disk**
they back up. A disk failure, host compromise, or `rm` mistake loses the
application *and* every backup of it.

**Owner decision 2026-10-02: no offsite backups.** Kept here as an accepted
risk. Stage 1 reduced what it can: snapshots are logical dumps plus volumes and
secrets, restorable by one script and checked by `just restore-drill`
(RUNBOOK 3.5). Copying the repository off the host by hand before risky work is
the only offsite protection left (`restic copy` to any second repository).
`docs/REWRITE.md` phase 0 proposes a restic repository on a second machine the owner
controls (owner decision 16.4 there).

## Medium

### 9. No monitoring or alerting in production (accepted risk)
The server exports OTLP (`AB__TELEMETRY__OTLP_ENDPOINT`) but nothing alerts.
**Owner decision 2026-10-02: no external monitoring services** (no uptime
check, no dead-man ping). Covered at deploy time only: `preflight` warns on
Zitadel PAT expiry (30 days), TLS certificate expiry (14 days) and disk over
85%, and `smoke` checks readiness after every deploy and rollback. Between
deploys an outage, a failed nightly backup or a filling disk goes unnoticed
until someone looks. `docs/REWRITE.md` phase 0 proposes a dead-man check (owner
decisions 16.4 and 16.5 there).

### 31. University proxy response-header limit (operating constraint)
The university proxy answers 502 when response headers overflow its 4 KiB buffer.
The edge hides `Link` on web responses and deployment smoke checks require headers
below 3500 bytes. Preserve both guards when switching frontends: the Stage 2 web
contract forbids preload `Link` headers. See `docs/INFRA.md` for the proxy contract.

### 32. University proxy rejects large single PUTs (operating constraint)
The public origin returns HTTP 413 for a signed PUT declaring 308 MiB or more (100 MiB is accepted);
the same PUT through the stack's nginx succeeds, and the app and stack permit 2 GiB. The outer university
TLS proxy is the limit. **Owner decision 2026-10-31: multipart is the permanent answer**; no proxy change
will be requested from university IT.

Both frontends send videos above 32 MiB as 32 MiB multipart parts (a 308 MiB production probe through the
public hostname completed and verified, 2026-10-13), and map a storage 413 to `payload-too-large` instead
of claiming the user is offline. Keep the multipart path and the 413 mapping. Server tests cover
assembly/finalize, ownership, replay, cancellation, reaping and the exact 2 GiB boundary.

## Low

### 33. shadcn CLI retains an unpatched braces dependency

Both frontends' development dependency chain `shadcn -> @shadcn/registry -> fast-glob -> micromatch -> braces`
includes `braces@3.0.3`. [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) rates its
stack-exhaustion denial of service high; no patched release is available as of 2026-10-17. It is used by tooling,
not the application runtime. Avoid processing untrusted glob patterns with the CLI. Remove this finding when
shadcn drops the affected dependency or a compatible patched version becomes available; do not suppress the audit.

### 34. Tiptap mathematics has not declared KaTeX 0.19 compatibility

`apps/web-2` pins `katex@0.19.1`, but `@tiptap/extension-mathematics@3.32.2` declares
`^0.16.4 || ^0.17.0 || ^0.18.0` as its peer range. The markdown round-trip and browser math tests pass with
the pinned version; this is an upstream compatibility declaration gap, not an observed rendering failure.
Keep those tests when updating either package. Remove this finding when the extension's peer range includes
0.19; do not downgrade KaTeX or edit installed package metadata just to silence the peer warning.

### 18. The per-assessment `required` flag does not drive progress
Legacy progress hard-coded `required = True` for every submission-backed
activity; v2 keeps that behaviour (so migrated courses complete the same way) and
carries the flag as `assessments.required`. Owner decision 2026-10-31: keep it
inert until after the Stage 2 cutover, then revisit (switching it on now would make
most existing assessments optional overnight).

### 25. Imported data: duplicate email addresses
Two imported users shared `Nurgul287@mail.ru`; the import gave the duplicates
stable `+legacy-{id}` aliases. Tell the affected account holders which address to
retain.

## Resolved by v2 (kept because code cites the numbers)

- **16.** Legacy search matched `User.email` for anonymous callers. v2 search
  never matches email and shows people only to signed-in callers.
- **20.** Legacy declared `analytics_event` but never wrote a row. v2 records
  events from the write paths.
