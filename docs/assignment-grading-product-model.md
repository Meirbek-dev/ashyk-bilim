# Assignment, Submission, and Grading Product Model

## Purpose

The assignment and grading frontend has three coherent product surfaces. Routes and components should map user intent to one of these surfaces instead of mixing authoring, attempting, and grading state in one screen.

## Product Surfaces

### Assignment Studio

Teacher-facing authoring workspace for a single assignment.

Owns:

- assignment title, description, lifecycle, and publication controls
- task authoring and ordering
- grading policy inputs that affect the assignment as a whole
- preview of the student-facing attempt
- publish, schedule, archive, and validation actions

Does not own:

- individual learner submissions
- grading queues
- student draft answers

### Submission Review

Teacher-facing grading workspace for learner submissions.

Owns:

- submission queue, filters, and teacher action state
- submitted answers, files, attempt history, lateness, and violations
- task-level feedback, final score, final feedback
- save grade, publish grade, return work, bulk grade, bulk release, and deadline overrides

Does not own:

- assignment task authoring
- student draft editing

### Student Attempt

Student-facing work surface for one assignment attempt.

Owns:

- assignment instructions and task answering
- draft saving and submit/re-submit actions
- submission status and visible result state
- returned-work revision flow

Does not own:

- teacher-only grading actions
- assignment publication controls

## Canonical Vocabulary

### Assignment Lifecycle

`DRAFT`: teacher can freely edit; students cannot access it.

`SCHEDULED`: teacher has scheduled publication; students cannot access it until `scheduled_publish_at`.

`PUBLISHED`: students can access it; edits should be constrained and explicit.

`ARCHIVED`: read-only historical assignment; not visible for new work.

Allowed transitions:

- `DRAFT -> SCHEDULED`
- `DRAFT -> PUBLISHED`
- `SCHEDULED -> DRAFT`
- `SCHEDULED -> PUBLISHED`
- `DRAFT -> ARCHIVED`
- `SCHEDULED -> ARCHIVED`
- `PUBLISHED -> ARCHIVED`

### Submission Status

`DRAFT`: student has started or saved work but has not submitted.

`PENDING`: student submitted; teacher action may be required.

`GRADED`: teacher has saved a grade that is not necessarily visible to the student.

`PUBLISHED`: grade is visible to the student.

`RETURNED`: teacher returned work for revision; feedback is visible and student can re-submit.

Allowed transitions:

- `DRAFT -> PENDING`
- `PENDING -> GRADED`
- `PENDING -> RETURNED`
- `GRADED -> PUBLISHED`
- `GRADED -> RETURNED`
- `RETURNED -> PENDING`
- `PUBLISHED -> GRADED` for teacher correction only
- `PUBLISHED -> RETURNED` for exceptional revision only

### Progress State

`ActivityProgress.state` is the teacher-facing learner/activity projection. It is derived from canonical submission and policy state. It is not an authoring lifecycle.

States: `NOT_STARTED`, `IN_PROGRESS`, `SUBMITTED`, `NEEDS_GRADING`, `RETURNED`, `GRADED`, `PASSED`, `FAILED`, `COMPLETED`.

### Release State

Release state answers one question: what can the student see?

`HIDDEN`: no score or feedback is visible.

`AWAITING_RELEASE`: teacher has graded, but the grade is not visible yet.

`VISIBLE`: grade/result is visible.

`RETURNED_FOR_REVISION`: feedback is visible and the student may re-submit.

Mapping:

- `DRAFT`, `PENDING` -> `HIDDEN`
- `GRADED` -> `AWAITING_RELEASE`
- `PUBLISHED` -> `VISIBLE`
- `RETURNED` -> `RETURNED_FOR_REVISION`

## Frontend Rule

Every frontend assignment/grading component should consume a domain view model or helper from `features/assignments/domain` or `features/grading/domain`. Raw API objects may enter at query boundaries, but UI components should not duplicate workflow rules, status labels, release visibility checks, score normalization, lateness logic, or legacy answer normalization.
