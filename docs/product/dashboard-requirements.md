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

Inline quiz is removed from new authoring entry points until it becomes first-class.

Current state:

- The backend schema exposes `/api/v1/assessments/inline-quiz`.
- The TipTap node and legacy rendering path remain so existing documents do not break.
- The author and learner NodeViews still have TODOs for real creation, item rendering, attempt state, and grading.

Decision:

- Hide inline quiz from the insert menu now.
- Keep the extension registered for legacy content.
- Reintroduce it only when it uses canonical assessment APIs for creation, policy, attempt, grading, analytics, and E2E coverage.

Acceptance criteria for reintroduction:

- Teacher creates an inline quiz from a real activity context.
- Learner answers inline using the canonical assessment attempt runtime.
- Grade, release state, completion state, and analytics match normal quiz behavior.
- Playwright covers teacher authoring and learner attempt.
