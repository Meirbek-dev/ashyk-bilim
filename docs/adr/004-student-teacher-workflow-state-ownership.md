# ADR 004: Student and teacher workflow state ownership

- Status: Accepted
- Date: 2026-07-12

## Context

The learner course page, Trail, assessment submissions, file-submission attempts, grading entries, and course editor each inferred overlapping product states. That produced contradictory progress, hidden work, client-only publish gates, and unsafe grading selection.

## Decision

The backend owns workflow truth; the frontend owns only view state and unsaved drafts.

| Product question                                | Canonical owner                                                    | Read surface                               | Mutation surface                           |
| ----------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------ | ------------------------------------------ |
| Can a learner access a course?                  | course visibility, group access, authorship and RBAC               | course access service                      | explicit access commands                   |
| Has a learner started?                          | persisted progress/run evidence                                    | `GET /courses/{course_uuid}/learner-state` | idempotent Trail start                     |
| What should the learner do next?                | published outline + `ActivityProgress` + submission policy         | learner-course state and activity runtime  | activity-specific commands                 |
| Is work awaiting review, returned, or released? | canonical submission/attempt lifecycle and published grading entry | learner-course state and `GET /me/work`    | grading transition commands                |
| Is a course publishable?                        | server readiness assembler                                         | `GET /courses/{course_uuid}/readiness`     | `POST /courses/{course_uuid}/lifecycle`    |
| What work should a teacher open?                | permission-filtered cross-course projection                        | `GET /me/work?role=teacher`                | linked review workspace commands           |
| Is a grade visible to a learner?                | `PUBLISHED` lifecycle / non-null release timestamp                 | learner-safe submission APIs               | explicit publish/release command           |
| Has a course completed?                         | required published `ActivityProgress` rows                         | learner-course state                       | write-side progress projection             |
| Is a grading form dirty?                        | keyed client draft for one attempt UUID                            | review workspace                           | save, discard, or guarded selection change |

Trail remains a learning-history surface. It must not determine completion, certificates, returned work, or the next action. GET handlers must not repair or mutate progress. Repairs run through explicit maintenance/write paths.

## Invariants

1. A grade command target must equal the attempt UUID used to initialize the form.
2. A saved but unreleased grade must not appear as learner feedback, completion, or certificate eligibility.
3. Learners never receive unpublished activities in outline or next-action responses.
4. Course publication can only occur through the lifecycle command and is blocked by server readiness issues.
5. Queue items contain only resources the requesting user can access and link to the exact actionable workspace.
6. Enrollment/start commands are idempotent.
7. URL state owns queue search, filters, pagination, and selected submission deep links; local storage cannot satisfy lifecycle gates.

## Consequences

Legacy Trail-derived UI may remain temporarily for history, but it cannot make workflow decisions. New activity kinds must implement the canonical progress and queue projections before being considered complete. Generated API contracts are regenerated whenever these read models or commands change.
