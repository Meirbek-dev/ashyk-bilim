# Questions for the owner

Agents append here when blocked on something only you can decide/do.
Answer inline (any format); agents check this file each session and move
answered items into the docs.

## Q-2026-10-03-1 - `main` cannot publish a release while `apps/web` reads Paraglide catalogs

Commit 34d8cd2 ("Migrate translation catalogs to Paraglide message format", stage 2
groundwork) changed `apps/web/src/messages/*.json` in place. The current Next.js app
still loads them with next-intl, so `bun run typecheck` fails in CI (plural entries are
now arrays) and the UI would render those keys wrong. The stage-1 pipeline therefore
refuses to publish images from `main`. The cutover was done from `release/stage1`
(2026-10-03); until `main` is green again every release must be cut the same way
(a `release/**` branch without 34d8cd2). Choose: (a) revert 34d8cd2 in `apps/web` and
keep the Paraglide catalogs in `apps/web-2` only; (b) accept that nothing ships from
`main` until stage 2 replaces the web app; (c) cut over from the last green commit
(39eabe9 plus the infra fixes, branch `ci/stage1-verify`) - needs a publish from that
branch. Recommended: (a).

## Q-2026-09-14-1 — Remediation scoring is self-reported

`POST ai/remediation/sessions/{id}/complete` takes `{score}` from the learner
(legacy contract, verbatim: 70+ passes and lifts the gate); the practice
questions travel to the learner with their `answer`/`explanation`. The new
learner surface (BUG-152, `RemediationGate`) therefore renders the
micro-lecture, reveals each answer, and posts a **self-check** tally («Я
ответил(а) верно» × questions) — it is not a graded test, and a learner can
tick everything. If the gate should be a real check, the server needs to
grade: store answers without the key, accept `{answers}` on complete, score
server-side (choice questions exact, open ones LLM/teacher). Decide whether
that is wanted; not blocking.

## Q-2026-09-26-1 — 23 imported assignment activities with no content

Production has 23 file-submission activities (21 published, 10 courses) retyped from
the legacy `ASSIGNMENT` feature, whose tables were dropped before the backups: they have
no instructions, and the feature's 87 task/submission files sit in
`ab-private/quarantine/`. The import gave each a **draft** file-submission config, and
they count as required, so learners of those courses can never reach 100% (same as
legacy). Choose: (a) teachers configure them (nothing else to do), (b) unpublish them,
or (c) mark them not required — (b)/(c) are a one-off SQL update. Not blocking.

**Related (gauntlet pass 28, restored data):** 32 of the 38 migrated certificates belong to
learners whose v2 `course_progress` is not certificate-eligible (8 under 50 %): courses grew
after the legacy certificate was issued, and these content-less tasks count as required.
Analytics counts a certificate holder as completed (legacy rule, `analytics/context.rs`), while
the trail, gradebook and course page show real step progress — e.g. «VR разработка» analytics
41.2 % completion vs 0 eligible. Both screens match legacy. Choose: (a) keep as is, (b) analytics
drops the certificate override (one rule: step progress), or (c) a one-off update marks
legacy certificate holders' `course_progress` completed.
