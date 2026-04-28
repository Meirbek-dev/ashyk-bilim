# ADR 0001: Canonical Activity, Assessment, Submission, and Progress Semantics

## Status

Accepted.

## Context

The platform currently tracks learning and grading through several overlapping models:

- `Activity` for curriculum items.
- `Assignment` and `AssignmentTask` for assignment authoring.
- `Submission` for the newer unified grading model.
- `QuizAttempt`, `ExamAttempt`, and `CodeSubmission` for older type-specific attempts.
- `TrailStep.complete` for course progress and certificates.

This makes teacher progress tracking unreliable because the same learner can be "complete", "submitted", or "graded" in different systems at the same time.

## Decision

Use one canonical vocabulary and source-of-truth chain for all course progress and gradeable work.

### Activity

An `Activity` is a course curriculum item. It belongs to a course and chapter, has ordering and publication state, and can be content-only or gradeable.

Activities are not attempts, submissions, or completion records.

### Assessment

An assessment is the grading and completion policy attached to a gradeable activity.

The canonical policy record is `assessment_policy`. It defines:

- assessment type: quiz, assignment, exam, or code challenge
- grading mode: automatic, manual, or automatic then manual
- completion rule: viewed, submitted, graded, passed, or teacher verified
- due date
- attempt limits
- time limits
- passing score
- late policy

Type-specific editors can keep rich authoring data in assignment tasks, exam questions, quiz blocks, or code challenge settings, but operational grading rules belong to the policy.

### Task

A task is a sub-item inside an assignment. It is not a course-level activity.

Assignment tasks define what the student must answer or upload. Student answers are stored in `Submission.answers_json`, keyed by task UUID. Teacher per-task grading is stored in `Submission.grading_json.items`.

### Submission

A `Submission` is one learner attempt for one gradeable activity.

Every quiz, assignment, exam, code challenge, file submission, open answer, and form answer that affects grading or completion must produce or update a `Submission`.

Legacy attempt models may exist during migration, but they are not the long-term operational source of truth.

### Completion

Completion is the result of applying an activity's completion rule to the learner's current state.

Examples:

- Content activity: completed when viewed or teacher verified.
- Quiz: completed when graded or passed, depending on policy.
- Assignment: completed when graded or passed, depending on policy.
- Exam: completed when passed, depending on policy.
- Code challenge: completed when passed.

Course completion is derived from required activity completion. It must not depend on `TrailStep.complete`.

### Visible Statuses

`Submission.status` remains the attempt workflow status:

- `DRAFT`: learner is working.
- `PENDING`: submitted and awaiting grading or review.
- `GRADED`: score exists but may not be published/final.
- `PUBLISHED`: grade is final and visible to the student.
- `RETURNED`: teacher returned work for revision.

`ActivityProgress.state` is the teacher-facing learner/activity state:

- `NOT_STARTED`
- `IN_PROGRESS`
- `SUBMITTED`
- `NEEDS_GRADING`
- `RETURNED`
- `GRADED`
- `PASSED`
- `FAILED`
- `COMPLETED`

Students may see simplified states: not started, in progress, submitted, returned, graded, passed, failed, completed.

Teachers may see all states plus action flags such as overdue, late, needs grading, and violation review.

## Consequences

- New progress features must read from `ActivityProgress` or `CourseProgress`.
- New gradeable write paths must create/update `Submission`.
- Certificates must move away from `TrailStep.complete`.
- Analytics rollups should become projections from canonical progress and submission state.
- Legacy quiz/code challenge/attempt tables can be kept temporarily as migration inputs or artifact storage, but not as progress truth.
