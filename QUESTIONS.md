# Questions for the owner

Agents append here when blocked on something only you can decide/do.
Answer inline (any format); agents check this file each session and move
answered items into the docs.

## Q-2026-09-13-1 — Brand spelling: «Ashyk Bilim» vs «Ashyq Bilim»

The web `<title>` and header say **Ashyk Bilim**; the server's `DEFAULT_PLATFORM_NAME`
(TOTP issuer, email subjects, certificate PDF) says **Ashyq Bilim**. Pick one; the
other side is a one-line change. Not blocking — left as is until answered.

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
