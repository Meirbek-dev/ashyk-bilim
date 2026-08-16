# Decision log (deviations & refinements vs ARCHITECTURE.md)

## 2026-08-16 — Zitadel is fully internal; passkeys dropped; first-party Google OAuth

Owner declined a dedicated auth subdomain (QUESTIONS.md #1). Passkeys/WebAuthn
are origin-bound and thus dropped (owner's explicit trade). That removes the
last reason for any public Zitadel surface:

- **Zitadel gets no public route.** It lives on the internal network only; the
  Rust BFF is its sole client (Session API for password/TOTP checks, User API
  for lifecycle). No EXTERNALDOMAIN exposure, no TLS termination for it, no
  nginx route.
- **Google login is first-party**: the Rust server runs the authorization-code
  flow against Google directly (port of the legacy
  `src/services/auth/google_oauth.py` semantics), then finds-or-creates the
  Zitadel user (`PasswordSpec::None`) and stores the Google `sub` linkage in
  our own DB. No Zitadel IdP intents.
- **Email verification stays headless**: Zitadel v2 user APIs return
  verification codes to the caller (`returnCode`) — we send them via Resend
  and confirm via API. No Zitadel-hosted UI is ever linked.
- **MFA = TOTP only**, optional, enrolled/verified through the BFF.

## 2026-08-16 — zitadel-setup collapses to zitadel-check

The original 0.10 plan (`ashyq admin zitadel-setup` creating org/project/OIDC
app/IdP/custom texts) assumed a public Zitadel with hosted flows. With Zitadel
internal-only (see above), no OIDC app, no IdP config, and no custom texts
exist to provision — the `ZITADEL_FIRSTINSTANCE_*` compose env vars already
create the org and the provisioner PAT declaratively. What remains is
fail-fast deploy diagnostics: `ashyq admin zitadel-check` verifies
reachability, PAT validity, and prints the org — run it in the cutover
runbook after boot. If provisioning needs ever grow (SMTP config, policies),
they extend this command.

## 2026-08-16 — Observability backend decided at cutover

OTLP wiring is vendor-neutral and disabled by default (0.12). Logfire remains
the default recommendation; the P11 runbook includes a paste-able setup
checklist for whichever backend is current-best then (QUESTIONS.md #2).


## 2026-08-16 — Schedules are interval-based, not cron expressions

ARCHITECTURE §9 sketched `job_schedules.cron_expr`. Implemented as
`interval_seconds` instead: every legacy schedule (assessment auto-publish
*/2min, assessment timer poll, plagiarism sweep */10min, upload reaper 6h) is a
plain interval, and the available Rust cron crates (croner, cron) are
chrono-based — pulling chrono into a jiff codebase for expressiveness nothing
uses yet is a bad trade. Anchored times ("daily at 02:00 Almaty") can be
expressed by seeding `next_run_at` at the anchor with a 24h interval; if real
cron expressiveness is ever needed, swap the column back and parse at that point.
Leadership: no persistent leader — every worker ticks, correctness comes from
`pg_try_advisory_xact_lock` + `FOR UPDATE SKIP LOCKED` + enqueue dedupe keys.
