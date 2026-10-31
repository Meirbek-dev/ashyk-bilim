# Questions for the owner

Agents append here when blocked on something only you can decide/do.
Answer inline (any format); agents check this file each session and move
answered items into the docs.

## Q-2026-09-26-1 — 23 imported assignment activities with no content

Production has 23 file-submission activities (21 published, 10 courses) retyped from
the legacy `ASSIGNMENT` feature, whose tables were dropped before the backups: they have
no instructions, and the feature's 87 task/submission files sit in
`ab-private/quarantine/`. The import gave each a **draft** file-submission config, and
they count as required, so learners of those courses can never reach 100% (same as
legacy). Choose: (a) teachers configure them (nothing else to do), (b) unpublish them,
or (c) mark them not required — (b)/(c) are a one-off SQL update. Not blocking.

**Answered 2026-10-31: (b) unpublish them.** Pending: the one-off SQL in production after a fresh
backup; remove this item once it has run. Certificate holders keep counting as completed (rule in
DECISIONS, 2026-10-11, retained by the owner).
