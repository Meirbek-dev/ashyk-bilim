# Questions for the owner

Agents append here when blocked on something only you can decide/do.
Answer inline (any format); agents check this file each session and move
answered items into the docs.

## Open

(none)

## Answered (2026-08-16)

1. **Zitadel public hostname** → Owner wants no new domains; passkeys dropped.
   Consequence (recorded in DECISIONS.md): Zitadel runs fully internal (no
   public exposure), Google OAuth is done first-party in Rust, email
   verification uses Zitadel return-codes sent via Resend, MFA = TOTP only.

2. **Logfire token** → "whatever is best in the future" — OTLP wiring stays
   vendor-neutral and disabled by default; at cutover (P11) the agent prepares
   the exact Logfire setup steps as a paste-able checklist (account actions
   can't be done by the agent).

3. **Prod hardening now (FINDINGS #1/#2/#4)** → declined for now. The exposure
   closes naturally at cutover when the new compose lands (ports removed
   there); FINDINGS.md remains the record.

4. **Cutover blackout dates** → none; schedule when rehearsals are green.

5. **VPS access** → model: agent prepares scripts/runbooks, owner pastes them.
   Cutover runbook (MIGRATION.md) will be structured as copy-paste blocks.
