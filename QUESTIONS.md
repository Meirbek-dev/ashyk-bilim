# Questions for the owner

Agents append here when blocked on something only you can decide/do.
Answer inline (any format); agents check this file each session and move
answered items into the docs.

## Q-2026-11-02-1: accounts whose email state Zitadel cannot tell (schema review 28)

`users.email_verified` goes once no row has it NULL ("not known yet": accounts older than the column, until a
profile read asked Zitadel). `ashyq admin resolve-email-verified [--dry-run]` asks Zitadel for every such row
and stores the answer. Rows it cannot resolve (the Zitadel user is gone or errors: typically anonymised
accounts, RUNBOOK 2.3) stay NULL and are counted as `failed`. Which rule closes them before the column drops?
Proposal: an account Zitadel does not know has no address it can confirm, so "not confirmed"
(`email_verified_at` NULL); a deleted (anonymised) account likewise. The server today answers "verified" when
Zitadel is unreachable, so the other candidate is "verified at `created_at`".
