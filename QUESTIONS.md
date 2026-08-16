# Questions for the owner

Agents append here when blocked on something only you can decide/do.
Answer inline (any format); agents check this file each session and move
answered items into the docs. Nothing here blocks current work — these
become relevant at the phases noted.

## Needed before cutover (P11) — none block coding today

1. **Zitadel public hostname.** Zitadel needs its own origin for OIDC/WebAuthn
   (passkeys are bound to the domain). Proposal: `auth.cs-mooc.tou.edu.kz`
   (CNAME/A to the same VPS; nginx terminates TLS and proxies to the zitadel
   container). Can you get that DNS record from the university, or should we
   plan for a path-based fallback (worse for passkeys)? — *needed by P1 finish
   for production config; dev uses localhost.*

2. **Logfire project + write token.** Your Logfire is currently empty. Create
   (or confirm) the project and put `AB__TELEMETRY__OTLP_*` values into the
   prod `.env` when asked, or hand me a token and I'll wire it. — *needed by
   cutover; dev runs without it.*

3. **Rotate the production admin password** (it was pasted in chat —
   docs/FINDINGS.md #4) and ideally apply FINDINGS #1/#2 (Judge0/DB/Redis port
   exposure) on the VPS now. I can prepare the exact compose diff on `rewrite`
   if you want it cherry-picked to `main` — say the word.

4. **Cutover window.** MIGRATION.md assumes a weekend window (≤2 days approved).
   When we get to P10 rehearsals I'll propose concrete dates — any blackout
   periods to avoid (exam sessions)?

5. **VPS access at cutover.** deploy.sh is run on the box by you. For the
   cutover runbook (and for the agent to fix things live), do I get SSH access
   in some form, or is the model "agent prepares scripts, you paste them"?

## Answered

(nothing yet)
