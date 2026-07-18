# Dashboard Requirements

## Product Contract

The dashboard starts with role-aware work instead of a section launcher. Sections remain available, but they move below the queue as Browse tools.

### Learner

- Show learner work first when the backend exposes assignments, due work, returned submissions, remediation gates, or course continuation tasks.
- Until that feed exists, show a no-work state that does not fake assignments.
- Keep Browse Courses and Account Settings available.
- Do not show teacher or admin tools to learner-only accounts.

### Teacher

- Show course readiness work from editable course summary counts.
- Show grading backlog and at-risk learner work from teacher analytics.
- Show a permission-aware no-work state when the teacher has access but no queued action.
- Show an unavailable-state item when analytics permissions exist but the analytics feed fails.
- Keep Courses and Analytics as secondary browse tools.

### Admin

- Show workload and SLA work from admin analytics.
- Show access-control review tasks when the account can manage users or roles.
- Show a permission-aware no-work state if no admin work is queued.
- Keep Users and Admin as secondary browse tools.

## Implemented Contracts

- `LmsStatus` lives in `apps/web/src/features/lms-status/types.ts`.
- `WorkQueueItem` lives in `apps/web/src/features/work-queue/types.ts`.
- The dashboard queue assembler lives in `apps/web/src/features/work-queue/dashboard-work-queue.ts`.
- The dashboard UI lives in `apps/web/src/features/work-queue/components/dashboard-work-queue.tsx`.

## Inline Quiz Decision

Inline quizzes have been fully removed.

Current state:

- The backend no longer exposes `/api/v1/assessments/inline-quiz`.
- Migration `a4b5c6d7e8f9` removes stored inline-quiz nodes, their backing activities, and compatibility columns.
- The TipTap parser and authoring schema no longer register inline-quiz nodes.
- Canonical assessments and their submissions remain accessible through normal assessment routes.

Decision:

- Do not expose inline-quiz authoring, parsing, or attempts.
