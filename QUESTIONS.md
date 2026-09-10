# Questions for the owner

Agents append here when blocked on something only you can decide/do.
Answer inline (any format); agents check this file each session and move
answered items into the docs.

## Open

### Pass-1 gauntlet: v2 contract gaps (2026-09-10)

Raised by the browser-QA gauntlet (`docs/rewrite/GAUNTLET.md`). Each item is a
contract gap with **no `docs/rewrite/DECISIONS.md` entry**: the v2 server has no
route, `apps/web` still calls the legacy v1 one, and closing the gap means either
adding a server route or deleting a user-facing feature. Everything else found in
pass 1 is being fixed without asking; only these are blocked.

### Q-2026-09-10-1 — How does an account get created after cutover? (blocks F38, BUG-001)

Self-registration is deliberately out of v2 (`apps/web/AGENTS.md` "Not in v2"; the
login page already tells users an admin creates accounts). But there is no **admin**
user-creation route either — `openapi.v2.json` has no `POST /users`, only
`GET /users`, `PATCH /users/me`, `PATCH /users/{id}/status` and the role endpoints.
Legacy had `POST /users` (`apps/api/src/routers/users.py:60`).

After cutover the only way to mint a user is `ashyq admin etl` / `zitadel-import`
against the legacy database — i.e. no new humans can join the platform.

**Options:** (a) add `POST /users` (creates the Zitadel human + the `users` row) and
an admin UI on `/dash/admin/users`; (b) declare account creation an operator task and
add an `ashyq admin create-user` command; (c) confirm Google-only onboarding
auto-provisions on first login (the current `auth/google/callback` does not).

### Q-2026-09-10-2 — Teacher "my courses" listing (blocks F19, F26, the whole `/dash/courses` surface)

`apps/web` calls `courses/editable/page/{p}/limit/{l}` in three places
(`src/services/courses/courses.ts`, `src/hooks/courses/courseKeys.ts`). v2 has only
`GET /courses` (public catalogue, keyset), with no "courses I can edit" filter and no
`creator_id` query param. The v2 `Course` schema also carries no permissions, so the
client cannot filter locally either.

**Options:** (a) add a `mine=true` / `editable=true` filter to `GET /courses`;
(b) add `GET /courses/editable`; (c) return `CoursePermissions` on list items so the
client filters. Note the legacy endpoint also backed `query`, `sort_by` and `preset`
parameters and a summary count — decide whether those survive.

### Q-2026-09-10-3 — Course collaboration / contributors (blocks F29)

No v2 route for `courses/{id}/contributors`, `apply-contributor`,
`bulk-add-contributors`, `bulk-remove-contributors` (all called from
`src/services/courses/courses.ts`). The `/dash/courses/[uuid]/collaboration` page and
`open_to_contributors` on the `Course` schema both imply the feature is meant to exist.

### Q-2026-09-10-4 — Smaller gaps — keep or drop?

| web call | used by | legacy |
|---|---|---|
| `GET users/{id}/courses` | public profile "courses" section | `apps/api/src/routers/users.py:240` |
| `GET utils/link-preview` | link blocks in the activity editor | legacy `utils` router |
| `GET assessments/exam/config` | exam registry defaults | legacy assessments router |
| `GET assessments/policy-preset/{kind}` | assessment authoring presets | legacy assessments router |
| `courses/{id}/rights`, `access`, `readiness`, `thumbnail` | course settings + access pages | legacy courses router |

For `users/{id}/courses` the client currently approximates by filtering
`courses?limit=100` on `creator_id` — that silently drops contributors and anything
past the first 100 courses, so it is a wrong answer rather than a missing one.

### Q-2026-09-10-5 — `request_id` is documented in the error envelope but never set

`ARCHITECTURE.md` §5 and `apps/web/AGENTS.md` both say problem+json responses carry
`request_id`; `apps/server/crates/api/src/error.rs:76` hard-codes it to `None` and
nothing else populates it, so the key never reaches the wire. The web client falls
back to the `x-request-id` response header (now exposed to cross-origin callers), so
the impact is limited to a user who copies a JSON error body.

**Options:** (a) inject it in a response middleware inside `PropagateRequestIdLayer`
(costs a body rewrite on error responses); (b) drop the field and correct both docs.

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
