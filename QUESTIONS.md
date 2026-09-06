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

## Q-2026-09-06-1 - Reset gamification XP at cutover?
Legacy learners could self-award XP (FINDINGS #19), so migrated
gamification totals and the leaderboard may be inflated. Options:
(a) migrate ledgers as-is; (b) recompute XP from the migrated ledger keeping
only server-derivable sources (activity/course/quiz/exam/code/login), dropping
rows whose source_id does not match a real activity/course/submission;
(c) zero everyone at cutover. Default if unanswered: **(b)** - the ETL (P10)
recomputes from verifiable sources and logs what it dropped.

## Q-2026-09-06-2 - Retention for analytics tables?
`analytics_events` grows with every submission, completion, post and
login; the five `daily_*` rollup tables and `learner_risk_snapshots` add
one row per (day, key) every day (the legacy never wrote them, so there is
no precedent). Options: (a) keep forever; (b) prune `analytics_events`
older than 400 days and daily rows older than 2 years in the rollup job;
(c) partition by month at cutover. Default if unanswered: **(b)** - adds a
delete step to `analytics:rollup` before P10; dashboards only ever read
the last 180 days.

## Q-2026-09-06-3 - AI provider keys and models for a live smoke run
P8 is complete against a wiremock OpenAI fake; nothing has talked to a real
model yet. To run `ashyq admin ai-eval` (and one manual Q&A) against the
live providers I need, in the server `.env` (never in chat):
`AB__AI__OPENAI_API_KEY`, `AB__AI__OPENROUTER_API_KEY`, and a confirmation
of the model names — the defaults carried from the legacy config are
`openai_model=gpt-5.6-luna` and `openrouter_model=deepseek/deepseek-v4-flash`.
If those are stale, the new names go in `AB__AI__OPENAI_MODEL` /
`AB__AI__OPENROUTER_MODEL`. Also: is the 1,000,000 tokens/month budget
still the intended production cap? Default if unanswered: keys stay unset
(every AI route answers 503 `ai-disabled` / draft artifacts) and the smoke
run moves to the cutover checklist.
