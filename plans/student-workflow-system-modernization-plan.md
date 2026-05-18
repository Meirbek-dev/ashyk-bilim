# Student Workflow System Modernization Plan

## Intent

Rebuild the student learning workflow and teacher grading workflow as one coherent LMS operating model. This is not a visual refresh and not a compatibility pass. The target system has one canonical activity runtime, one canonical assessment/submission runtime, one progress model, one grading model, and one design language.

The current activity route has already moved toward a new shell, but the surrounding product surface still contains deprecated assignment terminology, old navigation components, duplicated grading concepts, and inconsistent student states. The rewrite must remove those boundaries entirely.

## Non-Negotiables

- No assignment domain remains in application code, database tables, API contracts, route names, messages, analytics labels, or gradebook rollups, except where "assignment" is the unrelated RBAC meaning of a role-to-user or permission-to-role assignment.
- No wrapper or adapter keeps deprecated assignment tables alive.
- No route-level split where the same activity type can be rendered by two competing student runtimes.
- No DOM-query layout behavior for core navigation or sticky UI.
- No generic bordered activity box for every content type.
- No student workflow state that exists only in client memory when it affects grading, progress, or teacher work.
- No hidden grading policy. Attempt penalty, late penalty, release mode, passing rule, completion rule, and manual-review state must be visible and traceable.

## Audit Summary

### Activity Runtime

Primary files audited:

- `apps/web/src/app/_shared/withmenu/course/[courseuuid]/activity/[activityid]/page.tsx`
- `apps/web/src/app/_shared/withmenu/course/[courseuuid]/activity/[activityid]/activity.tsx`
- `apps/web/src/app/_shared/withmenu/course/[courseuuid]/activity/[activityid]/ActivityContentRenderer.tsx`
- `apps/web/src/app/_shared/withmenu/course/[courseuuid]/activity/[activityid]/activity-view-model.ts`
- `apps/web/src/app/_shared/withmenu/course/[courseuuid]/activity/[activityid]/useActivityCompletion.ts`

Findings:

- The route now has a `StudentActivityPageShell`, view model, outline rail, progress summary, mobile action bar, inline assessment workspace, and type-specific renderer. That is the correct direction.
- The shell still derives only a shallow activity status: `course_end`, `unavailable`, `complete`, or `not_started`. It does not yet expose submitted, needs grading, returned, grade hidden, failed, passed, overdue, locked, or attempt states for all activity types.
- Completion is still a manual trail mutation for many activities. Assessable activities and file submissions use separate progress sources, so the primary CTA can be wrong or unavailable.
- The course outline shows completion but not teacher-action-required, returned, overdue, locked, failed, grade-hidden, or attempt-exhausted states.
- The shell still has two side concepts, course outline and action panel, but the content renderer owns much of the activity-specific state. The action panel cannot reliably choose the next best action for submissions and assessments.
- The old route components still exist outside the activity shell: `ActivityIndicators`, `ActivityChapterDropdown`, and `FixedActivitySecondaryBar`. Even if unused on the activity route, they keep an old mental model alive and should be removed from the student activity surface.

### Dynamic Lecture Layout

Primary files audited:

- `apps/web/src/components/Objects/Editor/views/InteractiveViewer.tsx`
- `apps/web/src/components/Objects/Activities/DynamicCanva/TableOfContents.tsx`
- `apps/web/src/components/Objects/Editor/styles/prosemirror.css`
- `apps/web/src/app/_shared/withmenu/course/[courseuuid]/activity/[activityid]/ActivityContentRenderer.tsx`

Current problem:

- `ActivityContentRenderer` constrains dynamic lecture content to `max-w-4xl`.
- Inside that constrained region, `InteractiveViewer` adds a fixed/sticky TOC column with `width: clamp(15rem, 20vw, 22rem)`.
- On common desktop widths, the TOC can consume a disproportionate share of the already constrained content area. This matches the reported failure where actual lecture content receives roughly 25 to 30 percent of the page width.

Target behavior:

- Dynamic lectures use the full activity content column, not a nested narrow `max-w-4xl` shell.
- TOC is an optional navigation rail with a strict max width and collapse threshold.
- The reading column keeps a comfortable text measure, but rich blocks, embeds, tables, images, and interactive widgets can break out to the available width.
- On desktop, the lecture grid should be `minmax(0, 1fr) minmax(12rem, 16rem)` or content-first with TOC on the right, not TOC-first.
- Below large desktop, TOC becomes a sheet/drawer or inline compact "On this page" menu. It must not compete with reading width.

### Assessment And Submission Runtime

Primary files audited:

- `apps/web/src/features/assessments/shell/InlineAssessmentWorkspace.tsx`
- `apps/web/src/features/file-submissions/student/FileSubmissionWorkspace.tsx`
- `apps/api/src/services/grading/pipeline/orchestrator.py`
- `apps/api/src/services/grading/pipeline/grade.py`
- `apps/api/src/services/grading/pipeline/penalize.py`
- `apps/api/src/services/grading/pipeline/persist.py`
- `apps/api/src/services/grading/registry.py`
- `apps/api/src/services/grading/quiz_grader.py`
- `apps/api/src/services/grading/teacher.py`
- `apps/api/src/services/progress/submissions.py`

Findings:

- Assessments are mostly canonical: `Submission`, `AssessmentPolicy`, `GradingEntry`, item registry, and a grading pipeline exist.
- File submissions are separate from assessment submissions. This can be acceptable, but student progress and teacher gradebook states must be normalized into one student workflow contract.
- Manual completion, assessment submission, and file submission currently use different state machines.
- Gradebook still exposes `assignment_group` as a rollup kind in `apps/web/src/features/grading/domain/gradebook.ts` and `CourseGradebookCommandCenter.tsx`. This must be renamed to an activity-category or assessment-kind concept.
- Translation files still contain many assignment-facing strings. Any student-facing "Assignment" copy must be replaced with "Assessment", "Task", "File submission", "Practice", or a type-specific label.

### Database And Deprecated Assignment Removal

Primary migration audited:

- `apps/api/migrations/versions/2026_05_14_f1c2d3e4a5b6_purge_legacy_assignment_artifacts.py`

Current state:

- There is already a cleanup migration that retypes `TYPE_ASSIGNMENT` activities to `TYPE_FILE_SUBMISSION`, strips assignment metadata keys from `submission.metadata_json`, and drops `assignmenttasksubmission`, `assignmentusersubmission`, `assignmenttask`, `assignment_task`, and `assignment`.
- Application code search no longer shows active assignment DB models, but old assignment copy and old comments remain.

Required end state:

- Database has no assignment tables.
- `activity.activity_type` contains no `TYPE_ASSIGNMENT`.
- Submission metadata contains no assignment keys.
- OpenAPI schema contains no assignment contract.
- Generated frontend schema contains no assignment contract.
- Messages contain no student or teacher workflow assignment wording.
- Gradebook taxonomy contains no `assignment_group`.
- Tests assert these invariants.

## Clarification Required Before Grading Rewrite

I found grading behavior that needs a product decision before implementation:

1. Quiz attempt penalty appears to be applied twice.
   `QuizGrader` applies `apply_attempt_penalty(...)`, and the pipeline later calls `apply_penalties(...)`, which applies attempt penalty again. Should attempt penalty be applied only once in the pipeline after raw grading?

2. Manual-review submissions do not snapshot late penalty at submit time.
   `apply_penalties(...)` returns `late_penalty_pct=0` when `needs_manual_review` is true. Later, teacher grading applies `submission.late_penalty_pct`, so late manual submissions may avoid late penalty. Should late penalty be calculated at submit time for every submitted attempt, including manual review?

3. File submission pass threshold is hardcoded to `60` in progress calculation.
   Assessment progress uses policy passing score. Should file submissions use the same `AssessmentPolicy`-style passing rule, or a file-submission-specific policy field?

4. Published grade correction is allowed by sending `PUBLISHED -> RETURNED`.
   Should teachers be allowed to recall an already published grade into returned/revision state, or should corrections produce a new grade revision while preserving published audit history?

## Target Architecture

### Domain Model

Canonical concepts:

- Course
- Chapter
- Activity
- ActivityContent
- Assessment
- AssessmentItem
- SubmissionAttempt
- FileSubmissionAttempt
- ActivityProgress
- CourseProgress
- GradebookEntry
- TeacherReviewQueue

Deprecated concepts to remove:

- Assignment table
- Assignment task table
- Assignment user submission table
- Assignment task submission table
- `TYPE_ASSIGNMENT`
- `SUBTYPE_ASSIGNMENT_ANY`
- Student-facing "Assignment" copy
- Gradebook `assignment_group`
- Any migration or runtime metadata that depends on assignment IDs after the cleanup migration has run

### Student Activity Contract

Create one server-built view model for the activity route:

```ts
type StudentActivityRuntime = {
  course: CourseHeader;
  activity: ActivityHeader | null;
  content: ActivityContentRuntime;
  outline: CourseOutlineRuntime;
  progress: ActivityProgressRuntime;
  submission: SubmissionRuntime | null;
  policy: StudentVisiblePolicy | null;
  permissions: StudentActivityPermissions;
  primaryAction: StudentPrimaryAction;
  secondaryActions: StudentSecondaryAction[];
};
```

Required states:

- `not_started`
- `in_progress`
- `viewed`
- `draft`
- `submitted`
- `needs_grading`
- `graded_hidden`
- `published`
- `returned`
- `passed`
- `failed`
- `complete`
- `locked`
- `unavailable`
- `attempt_exhausted`

The client shell should render this contract. It should not infer grading state from unrelated query fragments.

### Teacher Workflow Contract

Create one teacher-facing review contract:

```ts
type TeacherReviewRuntime = {
  course: CourseHeader;
  activity: ReviewActivityHeader;
  queue: ReviewQueue;
  selectedAttempt: ReviewAttempt | null;
  rubric: RubricRuntime | null;
  gradingPolicy: TeacherVisiblePolicy;
  actions: TeacherReviewAction[];
  audit: GradeAuditTrail;
};
```

Teacher workflow must support:

- Queue triage by needs grading, returned, late, failed, high-risk, and stale draft.
- Side-by-side student work and grading form.
- Per-item feedback and overall feedback.
- Batch publish only when grade-release policy supports it.
- Explicit return for revision with required feedback.
- Grade correction as an auditable revision, not silent overwrite.
- Student-visible preview before publishing.

## Student UX Rewrite

### Activity Shell

Keep the shell concept, but promote it to the canonical student workspace:

- Header: course breadcrumb, title, chapter position, status, due/attempt info.
- Left rail: course outline with activity state indicators and current position.
- Main surface: type-specific content renderer.
- Right panel: primary action, policy summary, submission/result status, help, next activity.
- Mobile: compact header, content-first flow, bottom action bar, outline drawer, help drawer.

The right panel must be driven by `primaryAction`, not by local component heuristics.

### Dynamic Lecture

Replace the current nested TOC layout with:

```text
desktop xl:
content column: minmax(0, 1fr)
toc column: clamp(12rem, 16vw, 16rem)

desktop lg:
content column only
toc in popover or sheet

mobile:
content column only
toc as sheet
```

Implementation rules:

- Remove `max-w-4xl` from the dynamic activity renderer wrapper.
- Make text blocks readable through ProseMirror content styles, not by shrinking the whole activity.
- Give TOC a max width of 16rem and place it after content in DOM order.
- Hide TOC automatically when there are fewer than two headings.
- Keep anchors accessible with visible focus state and current-heading tracking.
- Support rich block full width via CSS utilities such as `.lesson-wide` and `.lesson-full`.

### Assessment Experience

All assessment-like activity types render in the activity shell:

- Quiz and exam: preflight, active attempt, autosave, submit, result, feedback.
- Code challenge: editor/test runner/result inside full-width attempt mode.
- Custom assessment: registry-driven renderer.
- File submission: instructions, requirements, draft uploads, receipt, grade/result, revision.

The `/assessments/[assessmentUuid]` route should become an internal deep link or redirect to the canonical activity workspace. It should not be a competing student experience.

### Progress And Next Action

Every activity has one primary action:

- `Start`
- `Continue`
- `Mark complete`
- `Submit`
- `View receipt`
- `View feedback`
- `Revise`
- `Next activity`
- `Review policy`

The action must be computed from server state and policy. The client can optimistically update local UI, but the server remains the source of truth.

## Teacher UX Rewrite

### Course Command Center

Teachers need one course operations surface:

- Curriculum structure
- Publish readiness
- Student progress
- Review queue
- Gradebook
- Analytics
- Access and cohorts

Avoid separate pages that force teachers to understand implementation categories. The teacher should move from "what needs attention" to the exact grading/review workspace in one click.

### Review Workspace

Target layout:

```text
queue rail | student work | grading and feedback panel
```

Rules:

- Queue rail is filterable and keyboard navigable.
- Center pane shows the submitted artifact, answers, code output, files, and attempt history.
- Right panel shows score, rubric/item feedback, release mode, return/publish actions.
- Autosave teacher draft feedback locally and server-side as review draft if long forms are involved.
- Publishing must show exactly what the student will see.

### Gradebook

Rewrite gradebook terminology and grouping:

- Rename `assignment_group` to `activity_category` or `assessment_kind`.
- Group by activity type, chapter, cohort, learner, and status.
- Use state chips that match the student activity shell.
- Make every cell explain why it is in that state.
- Batch actions must be policy-aware and disabled with reasons.

## API And Backend Rewrite

### Activity Runtime Endpoint

Add one endpoint for the activity workspace:

```text
GET /courses/{course_uuid}/activities/{activity_uuid}/runtime
```

It returns the `StudentActivityRuntime` contract with:

- Course and chapter context.
- Activity content metadata.
- Assessment or file-submission state.
- Progress state.
- Policy state.
- Primary action.
- Next/previous navigation.
- Permissions.

### Action Endpoint

Add one command endpoint:

```text
POST /courses/{course_uuid}/activities/{activity_uuid}/actions
```

Commands:

- `start`
- `mark_viewed`
- `mark_complete`
- `unmark_complete`
- `start_attempt`
- `save_draft`
- `submit`
- `request_revision_start`
- `acknowledge_feedback`

Each command validates against the same state machine that produced the primary action.

### Progress Engine

Create a single progress reducer:

```py
def reduce_activity_progress(activity, policy, attempts, file_attempts, manual_events) -> ActivityProgressSnapshot:
    ...
```

Rules:

- One reducer owns state names.
- Assessment and file-submission adapters feed normalized attempts into the reducer.
- The reducer writes `ActivityProgress`.
- Course progress is recalculated from activity snapshots.
- Trail completion is derived from progress, not parallel manual state for assessable activities.

### Grading Pipeline

Target pipeline:

1. Validate attempt and policy.
2. Normalize submitted answers/files/code output.
3. Grade raw work.
4. Apply policy penalties once.
5. Persist submission, grade entry, progress, and audit event in one transaction.
6. Emit non-critical notifications after commit.

Required cleanup:

- Remove duplicate attempt penalty from the quiz grader or the pipeline after clarification.
- Calculate late penalty consistently for auto-graded and manual-review submissions.
- Make grade release status explicit: `needs_review`, `graded_hidden`, `published`.
- Use one passing score source per activity.
- Store raw score, penalty, final score, and visible score separately.
- Make every teacher override an auditable grading revision.

## Database Plan

### Cleanup Migration

Add a final invariant migration after current cleanup migrations:

- Assert no deprecated assignment tables exist.
- Assert no `TYPE_ASSIGNMENT` activity rows exist.
- Assert no assignment metadata keys remain in `submission.metadata_json`.
- Assert no assessment rows depend on assignment IDs.
- Assert no foreign keys reference dropped assignment tables.
- Fail the migration if any invariant is violated.

### Schema Convergence

- Store activity UUIDs as native UUID where feasible, or consistently prefixed strings with explicit constraints.
- Remove duplicated hierarchy columns that can drift, especially activity/course/chapter denormalization where joins are authoritative.
- Normalize file submission policy into the same policy visibility model as assessments.
- Add indexes for runtime endpoint lookup:
  - activity by UUID
  - progress by `(user_id, activity_id)`
  - submissions by `(user_id, activity_id, status, attempt_number)`
  - file attempts by `(user_id, activity_id, status, updated_at)`

## Frontend Plan

### Module Boundaries

Create feature modules:

```text
features/student-activity/
  api/
  domain/
  shell/
  renderers/
  actions/
  tests/

features/teacher-workflow/
  course-command-center/
  review-workspace/
  gradebook/
  analytics/
```

The activity route should become thin:

- Fetch runtime contract.
- Hydrate query cache only for interactive subfeatures.
- Render `StudentActivityWorkspace`.

### Component Removal

Remove from the student activity route and then delete if no longer used:

- `ActivityIndicators`
- `ActivityChapterDropdown`
- `FixedActivitySecondaryBar`
- any duplicated activity toolbar
- any assessment redirect/handoff card that competes with inline rendering

### Design System Rules

- Use semantic tokens from `components/ui`.
- Cards only for repeated items, modals, receipts, file rows, feedback blocks, and contained tools.
- No nested cards for page structure.
- Activity pages use bands, rails, and panels, not stacked decorative boxes.
- Icons for common actions, with tooltips where needed.
- Stable dimensions for outline rows, bottom bars, attempt nav, grade cells, upload slots, and code runner panes.

## Internationalization Plan

Remove or rewrite student and teacher workflow strings containing assignment terminology:

- Activity type labels.
- File submission copy.
- Old assignment modal strings.
- Gradebook rollup copy.
- Submit confirmation copy.
- Permission descriptions that refer to grading assignments when the permission is assessment grading.

Keep RBAC "assignment" only where it means assigning roles or permissions.

## Testing Plan

### Backend

- Migration invariant test for assignment table removal.
- Runtime endpoint contract tests for every activity type.
- Progress reducer tests for all student states.
- Grading pipeline tests for attempt penalty, late penalty, release mode, manual review, returned revision, and published correction.
- File submission progress tests using policy passing score.
- Permission tests for student, teacher, contributor, and admin.

### Frontend

- Student activity workspace view-model tests.
- Primary action matrix tests.
- Dynamic lecture layout tests with headings, no headings, long headings, embeds, and mobile.
- Assessment inline runtime tests.
- File submission draft/submit/result/revise tests.
- Gradebook terminology test that rejects student/teacher assignment labels.

### End To End

- Student starts a course, opens lecture, uses TOC, completes activity, continues.
- Student submits quiz, sees held or published grade based on policy.
- Student submits manual review work, teacher returns it, student revises.
- Student submits file work, teacher grades and publishes.
- Teacher opens course command center, reviews queue, grades, publishes, and sees gradebook update.
- Migration test proves no deprecated assignment artifacts remain after upgrade.

## Rollout Plan

This rollout uses replacement milestones, not incremental UI patches.

### Milestone 1: Canonical Contracts

- Define `StudentActivityRuntime`.
- Define `TeacherReviewRuntime`.
- Define normalized progress states.
- Lock grading policy decisions from the clarification section.
- Add backend tests for current and target state machines.

Exit criteria:

- Runtime contracts compile.
- State/action matrix is documented and tested.
- Assignment-removal invariants are encoded as tests.

### Milestone 2: Backend Runtime Rewrite

- Build activity runtime endpoint.
- Build action endpoint.
- Build single progress reducer.
- Normalize file submission progress into the same state vocabulary.
- Fix grading penalty/release ambiguity after clarification.

Exit criteria:

- Student progress is correct from server state for all activity types.
- Teacher queue and gradebook consume the same progress states.
- Deprecated assignment tables and metadata cannot reappear.

### Milestone 3: Student Workspace Rewrite

- Replace route internals with `StudentActivityWorkspace`.
- Move primary action selection to runtime contract.
- Replace dynamic lecture layout.
- Inline all assessment/file submission activity types in the shell.
- Convert `/assessments/[assessmentUuid]` into canonical activity deep link behavior.

Exit criteria:

- One activity route owns the student workflow.
- Lecture content never collapses behind the TOC.
- Mobile workflow is content-first with a single bottom primary action.

### Milestone 4: Teacher Workflow Rewrite

- Build course command center.
- Build review workspace.
- Rewrite gradebook taxonomy and filters.
- Add publish/return/correction audit UI.
- Remove assignment wording from teacher workflow.

Exit criteria:

- Teacher can triage and grade without leaving the workflow.
- Grade state is clear to teacher and student.
- Batch actions are policy-aware.

### Milestone 5: Removal And Verification

- Delete old activity components not used by the new route.
- Delete old assessment route UI that competes with the activity workspace.
- Remove deprecated messages.
- Run schema, OpenAPI, generated client, and repository text checks.
- Run Playwright layout verification for desktop and mobile.

Exit criteria:

- No deprecated assignment domain remains.
- No old student activity runtime remains.
- Tests and visual checks pass.

## Acceptance Criteria

- Student can understand location, task, status, and next action within five seconds on every activity.
- Dynamic lecture content uses the majority of the content area; TOC never consumes more than a bounded rail.
- Every activity type has one canonical student runtime.
- Every assessable activity has traceable policy, submission, grading, progress, and result state.
- Teacher review queue and student status use the same state vocabulary.
- No assignment tables, activity types, metadata, generated API contracts, UI labels, or gradebook group names remain.
- Migration fails loudly if deprecated assignment data still exists.
- All grading penalties are applied exactly once and are visible in audit history.
