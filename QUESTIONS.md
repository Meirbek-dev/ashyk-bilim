# Questions for the owner

Agents append here when blocked on something only you can decide/do.
Answer inline (any format); agents check this file each session and move
answered items into the docs.

## Q-2026-11-01-1: refuse deleting a course that has learner work? (schema review item 3)

Today `DELETE /courses/{id}` deletes the course with its whole history (DECISIONS 2026-10-02
"Course archive is orthogonal to `public`": delete cascades history, archive keeps it). The cascade
takes submissions, the append-only grade journal, file attempts and issued certificates
(`certificate_users`), so a certificate's verification code stops resolving. The review proposes
`ON DELETE RESTRICT` from `courses` (and `certifications`) onto learner records, like activities
already refuse (409 `activity-has-learner-work`).

A bare RESTRICT would turn such a delete into a 500, so it needs a domain guard first: a new
409 `course-has-learner-work` ("archive it instead"), the webs showing that message (contract
regeneration), then the FK switch. Not done tonight because it reverses your 2026-10-02 decision and
changes an endpoint's outcome. Recommended: yes (archive covers "take it away"; a teacher's delete
should not erase other people's grades and certificates). Answer: yes / no.
