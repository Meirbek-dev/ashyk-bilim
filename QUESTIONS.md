# Questions for the owner

Agents append here when blocked on something only you can decide/do.
Answer inline (any format); agents check this file each session and move
answered items into the docs.

## Q-2026-11-01-2: run the server as a least-privilege role? (schema review item 30)

The server and worker connect as `ashyq`, the owner of every object: an injected or mistaken statement
could `DROP`/`TRUNCATE`, and no role has a statement or idle-in-transaction timeout (one stuck transaction
holds locks and blocks vacuum). `infra/postgres/roles.sql` (tested in a rolled-back transaction on a dev
copy) creates `ashyq_app` (rows only, statement 120 s, idle-in-transaction 60 s, lock 30 s) and `ashyq_ro`
(read-only, 30 s) for agents and analytics; migrations stay on `ashyq`. Not switched on because it needs
new secrets in `server.env`, a separate migrate URL in compose and a deploy window, and the 120 s cap could
cut a long job statement nobody has measured on prod yet. Procedure: RUNBOOK 2.5. Recommended: yes,
`ashyq_ro` first (agents' `just db sql` on prod), the app role in the next window. Answer: yes / ro only / no.
