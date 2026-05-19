# Student And Teacher Workflow System Modernization Plan

Status: Draft for product/architecture review  
Date: 2026-05-19  
Scope: Student activity workflow, assessment/file-submission runtime, teacher review workflow, gradebook, assignment-domain removal

## 1. Intent

Rebuild Ashyk Bilim around one coherent LMS workflow:

- One canonical student activity workspace.
- One canonical student progress state machine.
- One canonical assessment/submission runtime.
- One canonical teacher review and gradebook workflow.
- One design language for course learning, assessment, submission, feedback, and grading.
- Zero deprecated assignment domain in live application code, database state, API contracts, generated schemas, UI copy, analytics labels, or teacher/student workflows.

This plan is not a visual polish pass and not a set of incremental fixes. The target is a subsystem replacement with a controlled cutover. Existing incomplete rewrite pieces can be reused only when they already match the target architecture; no wrapper or compatibility layer may preserve deprecated behavior.

## 2. Non-Negotiables

- No student-facing activity type may have two competing runtimes.
- No assessment may force the student out of course context.
- No primary action may be inferred from shallow client-only route state when server state affects grading, progress, attempts, release policy, or teacher work.
- No "assignment" domain may remain except RBAC role/permission assignment language.
- No deprecated assignment tables, activity types, metadata keys, API schemas, generated frontend contracts, route concepts, gradebook groups, teacher copy, or student copy.
- No generic activity card wraps every content type.
- No nested page-structure cards.
- No duplicate navigation model.
- No hidden grading policy.
- No DOM-query or custom-event side channel for core layout state.
- No student workflow state that exists only in client memory when it changes grading, progress, anti-cheat, submissions, or teacher queues.

## 3. Audit Scope

Primary files audited:

- `apps/web/src/app/_shared/withmenu/course/[courseuuid]/activity/[activityid]/activity.tsx`
- `apps/web/src/app/_shared/withmenu/course/[courseuuid]/activity/[activityid]/ActivityContentRenderer.tsx`
- `apps/web/src/app/_shared/withmenu/course/[courseuuid]/activity/[activityid]/activity-view-model.ts`
- `apps/web/src/features/student-activity/domain/runtime.ts`
- `apps/web/src/features/student-activity/api/runtime.ts`
- `apps/web/src/features/assessments/shell/InlineAssessmentWorkspace.tsx`
- `apps/web/src/features/assessments/shell/AssessmentLayout.tsx`
- `apps/web/src/features/assessments/shell/AttemptEntryCard.tsx`
- `apps/web/src/features/file-submissions/student/FileSubmissionWorkspace.tsx`
- `apps/api/src/db/student_activity_runtime.py`
- `apps/api/src/services/student_activity_runtime.py`
- `apps/api/migrations/versions/2026_05_18_1a2b3c4d5e6f_student_workflow_invariants.py`
- message catalogs in `apps/web/src/messages/*.json`

Screenshot surfaces audited:

- Completed dynamic lesson.
- Inline quiz preflight.
- Exam preflight with integrity banner.
- Code challenge workspace.

## 4. Current State Summary

The rewrite has moved in the right direction:

- The activity page now has a three-region shell: outline, main content, action/support panel.
- Assessment handoff is mostly removed from the activity renderer.
- `InlineAssessmentWorkspace` renders assessment preflight, attempt, and result states on the activity route.
- `/assessments/[assessmentUuid]` redirects to the canonical activity route.
- A backend `StudentActivityRuntime` contract and runtime endpoint already exist.
- Assignment cleanup and invariant migrations already exist.

The rewrite is not yet system-complete:

- The activity page still builds its own `StudentActivityViewModel` from course structure and trail data instead of consuming the backend runtime endpoint.
- The frontend view model returns only `complete`, `unavailable`, and `not_started` for most activity states; it does not reflect submitted, needs grading, returned, grade hidden, published, failed, passed, locked, attempt exhausted, or overdue states in the visible shell.
- Assessments and file submissions fetch their own state separately, so the right action panel and mobile action bar can contradict the real activity state.
- The code still contains dead assessment client code, unused focus constants, assignment message namespaces, and assignment migration history.
- File-submission student UI still has inline English, hardcoded status colors, and local state that is not integrated into the canonical activity action model.
- Assessment attempt focus mode still persists through `localStorage`.
- The screenshots show contradictory status, progress, and access states.

## 5. Screenshot UX Diagnosis

### Dynamic Lesson

Observed:

- The top header consumes a large amount of vertical space before content begins.
- Progress is semantically unclear: the header shows current position, completed count, and a right-side count that read as different concepts.
- The left outline truncates almost every meaningful title.
- The right status panel duplicates navigation and support rather than explaining the next best action.
- The lesson body is readable, but it is visually separated from course context by large gutters and competing side panels.
- The floating gamification/action bubble competes with the bottom-right page affordance.

Target:

- Header answers location, status, and policy in one compact band.
- Progress has one meaning: course completion, with current activity position displayed separately.
- Outline uses state indicators and tooltips, not only truncation.
- Right panel is a decision panel: status, one primary action, policy summary, result/receipt if relevant, help.

### Inline Quiz Preflight

Observed:

- The primary CTA says "go to learning task" even though the student is already on the learning task.
- The bottom bar says access is blocked while the preflight card presents a startable assessment surface.
- Metric cards overflow or collide on long Russian labels and "Unlimited".
- "No available draft for editing" is teacher/editor language, not student language.
- The attempt history empty state takes space but does not help the student decide what to do.

Target:

- CTA is type-specific: "Start quiz", "Continue quiz", "View result", "Awaiting release", or "Try again".
- Access-blocked state is rendered only when the primary action is actually blocked.
- Preflight metrics use stable columns, smaller labels, and no text overflow.
- Student language uses attempt, draft, result, review, and feedback, not editor phrasing.

### Exam Preflight

Observed:

- A red integrity warning appears before the attempt and says a violation was already recorded.
- The status panel says complete while the body says ready to start and history says no attempts.
- The bottom locked state contradicts the visible route content.
- Anti-cheat copy is loud but not structured into policy, requirement, and consequence.

Target:

- Exam preflight has a calm policy summary: time, attempts, fullscreen, tab-switching, copy/paste, late policy, release policy.
- Violations are per attempt and never shown as existing unless the current attempt actually has recorded violations.
- Completion, result visibility, and attempt readiness come from the same server state.

### Code Challenge

Observed:

- The title is too long for the header and pushes status into awkward placement.
- The editor is empty and disabled with a tooltip, while the test scenario panel is visible and the CTA remains ambiguous.
- The language selector is detached from the locked editor state.
- The right status panel says not started, while the bottom bar says access blocked.
- The student cannot tell whether they need to click start, choose a language, write code, or view tests first.

Target:

- Code challenge has a first-class workspace: prompt, language selector, editor, tests, run, submit, result, feedback.
- Locked/not-started state has an explicit start action. The editor does not look broken.
- Test cases are readable but secondary until the student starts or selects a language.
- Long challenge titles are clamped in header and fully available in the main prompt.

## 6. Root Causes

1. Split state ownership remains.
   The backend runtime exists, but the current route does not consume it. The route derives progress from trail data, assessments derive attempt state from assessment queries, and file submissions derive status from file-submission queries.

2. Primary action is not server authoritative.
   The action panel uses `vm.primaryAction` from a local client builder. Assessment and file-submission components know richer state than the shell, so the shell cannot reliably show the correct next action.

3. Progress is still fragmented.
   The backend has `ActivityProgress`, trail steps, assessment submissions, and file submission attempts. The UI still shows some trail-derived completion rather than canonical activity progress.

4. Assessment inline rendering is incomplete at the boundary.
   `InlineAssessmentWorkspace` changes layout mode based on `recommendedAction`, but the preflight `onStart` only invalidates a query and flips layout locally. The start command is owned later by kind-specific attempt code.

5. Dead route/client code remains.
   `AssessmentAttemptClient.tsx` still exists even though the route is redirect-only. `FOCUS_MODE_CHANGE_EVENT` and `ASSESSMENT_ATTEMPT_FOCUS_MODE_STORAGE_KEY` still exist. This keeps old concepts alive.

6. The design system lacks enough semantic state tokens.
   Success/warning/grade/review states often use direct green/emerald classes. Some UI primitives define semantic variants, but the activity workflow does not consistently consume them.

7. Legacy assignment language remains in message catalogs.
   There are still `Assignment*`, `NewAssignmentModal`, `assignmentActions`, `assignmentStatus`, and many assignment-keyed strings in `en-US`, `ru-RU`, and `kk-KZ`. Some values have been renamed to "Assessment task" or "Учебная задача", but the domain keys and namespaces remain assignment-based.

## 7. Required Clarifications

These product/architecture decisions are ambiguous and must be resolved before implementation:

1. Historical Alembic migrations:
   Should old assignment migration files remain as historical upgrade steps, or should the migration chain be squashed into a new baseline so the repository itself contains no assignment-domain migration code?

2. Screenshot role:
   The screenshots show an admin user viewing student workflow. Should admin/teacher preview use the exact student UI with a preview banner, or should staff controls remain visible while previewing?

3. Access blocked:
   What does the blue bottom "access blocked" state mean in the screenshots: unauthenticated access, unpublished content, anti-cheat lock, missing attempt draft, or disabled editor?

4. Code challenge start behavior:
   Should the student editor be unavailable until an explicit "Start challenge" action creates a draft attempt, or should selecting a language immediately create the attempt?

5. Exam integrity violations:
   Are integrity violations scoped per attempt and reset before start, or can previous violations carry into a new preflight?

6. File submission completion:
   Is completion achieved only when a teacher publishes a grade, or can a submitted-but-ungraded file task count as complete for course progression?

7. Grade correction:
   Should a published grade be recallable into `RETURNED`, or should corrections create a new auditable grade revision while preserving the published history?

## 8. Target Product Model

### Student Mental Model

Every activity answers:

- Where am I?
- What is this activity?
- What is my current state?
- What policy applies?
- What exactly should I do next?

The answer is shown through:

- Compact header.
- Course outline.
- Content-specific workspace.
- One status/action panel.
- One mobile bottom action bar.

### Teacher Mental Model

Every teacher workflow answers:

- What needs attention?
- Which students are blocked, late, returned, failed, or awaiting feedback?
- What did this student submit?
- What is the grading policy?
- What will the student see if I publish or return this?
- What changed in the audit history?

The answer is shown through:

- Course command center.
- Review queue.
- Submission inspector.
- Grading panel.
- Gradebook matrix.
- Analytics and intervention queue.

## 9. Target Architecture

### Canonical Student Runtime

The activity route must consume:

```text
GET /courses/{course_uuid}/activities/{activity_uuid}/runtime
```

The frontend route becomes a thin renderer:

```text
route wrapper
  -> fetch StudentActivityRuntime
  -> hydrate activity-specific query data when needed
  -> render StudentActivityWorkspace
```

The route must not rebuild completion state from trail data.

### Canonical Action Endpoint

All activity-level actions go through:

```text
POST /courses/{course_uuid}/activities/{activity_uuid}/actions
```

Allowed commands:

- `mark_viewed`
- `mark_complete`
- `unmark_complete`
- `start_attempt`
- `save_draft`
- `submit`
- `request_revision_start`
- `acknowledge_feedback`

Assessment and file-submission internals may perform specialized work, but the activity action endpoint must remain the state machine gate. If an action is owned by a sub-runtime, the runtime response still owns the shell state after completion.

### Canonical Progress Reducer

Create one reducer:

```py
def reduce_activity_progress(activity, policy, attempts, file_attempts, manual_events) -> ActivityProgressSnapshot:
    ...
```

Rules:

- It maps every activity type into `ActivityProgress`.
- Trail/course completion is derived from `ActivityProgress`, not the reverse.
- Assessment submissions and file-submission attempts feed normalized attempt snapshots.
- Progress state names are shared by student shell, teacher gradebook, review queue, and analytics.
- State transitions write audit events.

Required states:

- `not_started`
- `viewed`
- `in_progress`
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

### Canonical Assessment Runtime

The activity shell owns the URL and layout. Assessment modules own only the task-specific attempt body:

```text
StudentActivityWorkspace
  -> AssessmentActivityRenderer
    -> AssessmentPreflight
    -> AssessmentAttemptLayout
    -> AssessmentResult
```

`/assessments/[uuid]` remains a redirect only. Delete the standalone client surface.

### Canonical File Submission Runtime

File submission becomes an activity-native workflow, not a repackaged assignment:

- Preflight requirements.
- Draft upload.
- Submit receipt.
- Awaiting review.
- Published result.
- Returned revision.
- Attempt history.

The shell primary action is derived from file-submission state through the same runtime contract.

### Teacher Review Runtime

Create one teacher review contract:

```ts
type TeacherReviewRuntime = {
  course: CourseHeader;
  activity: ReviewActivityHeader;
  queue: ReviewQueue;
  selectedAttempt: ReviewAttempt | null;
  policy: TeacherVisiblePolicy;
  rubric: RubricRuntime | null;
  actions: TeacherReviewAction[];
  audit: GradeAuditTrail;
};
```

Teacher review and gradebook must consume the same progress vocabulary as student activity.

## 10. Target Student UI

### Desktop Shell

Use a stable, dense LMS workspace:

```text
header: breadcrumb, title, position, status, policy chips
body:   outline rail | activity workspace | action/status panel
```

Grid:

- `xl`: `17rem minmax(0, 1fr) 18rem`
- `lg`: `15rem minmax(0, 1fr)`
- active attempt: full-width attempt layout with task navigation
- reading mode: content-focused layout with slim top bar

### Mobile Shell

Use a content-first workflow:

- Compact sticky header.
- Outline drawer.
- Main content.
- One bottom action bar.
- Help drawer.
- Attempt/task navigation drawer during active assessment.

No desktop toolbar wrapping on mobile.

### Header

Header must show:

- Course and chapter.
- Activity title clamped to two lines.
- Current position.
- Status badge.
- Due/attempt/time chips when relevant.

Header must not show:

- Conflicting completed/current counts.
- Admin-only controls during student preview unless preview mode is explicit.
- Repeated focus buttons in multiple regions.

### Outline

The outline must show:

- Chapter progress.
- Activity icon.
- Activity state.
- Locked/unpublished reason.
- Current row with `aria-current="page"`.
- Full title in tooltip or accessible label.

The outline must not be only a list of checkmarks. It is the student's map.

### Action Panel

The action panel is driven only by `StudentActivityRuntime.primary_action`.

Primary actions:

- `Start lesson`
- `Continue`
- `Mark complete`
- `Submit`
- `Start quiz`
- `Continue attempt`
- `View receipt`
- `View feedback`
- `Revise`
- `Review policy`
- `Next activity`
- `Back to course`

Secondary actions:

- Previous.
- Next.
- Ask AI.
- Focus/reading mode.
- Report issue.

If the primary action is disabled, the reason must be visible.

### Dynamic Lesson

- Use readable prose width for text, not a narrow global content wrapper.
- Let media, tables, embeds, and interactive blocks use available width.
- Hide table of contents when fewer than two headings exist.
- If TOC exists, use a bounded rail or drawer. It must never consume reading width.

### Quiz And Exam

Preflight shows:

- Questions.
- Time limit.
- Attempts remaining, not only maximum attempts.
- Due date.
- Passing score.
- Release policy.
- Anti-cheat requirements.
- Draft/revision status.

Active attempt shows:

- Question navigation.
- Timer.
- Save state.
- Online/offline state.
- Submit control.
- Policy/guard status.

Result shows:

- Score.
- Pass/fail.
- Visible feedback.
- Hidden-grade explanation if release is delayed.
- Retry or revision action when policy allows.
- Next activity.

### Code Challenge

The code challenge workspace must include:

- Prompt and constraints.
- Language selector.
- Starter code.
- Editor.
- Test cases.
- Custom input.
- Run tests.
- Submit.
- Results and feedback.
- Attempt history.

The editor may be disabled only in an explicit locked state with a clear start or unlock action.

### File Submission

The file submission workspace must include:

- Instructions and requirements.
- Due date and late policy.
- Drag/drop and file picker.
- Per-file upload progress.
- Draft save.
- Submit confirmation.
- Immutable receipt.
- Teacher feedback and rubric.
- Revision flow when returned.
- History with attempts.

All user-visible strings must be localized. No inline English remains.

## 11. Target Teacher UI

### Course Command Center

Teachers need one operational surface:

- Curriculum.
- Publish readiness.
- Progress health.
- Review queue.
- Gradebook.
- Analytics.
- Access/cohorts.

The teacher should move from "what needs attention" to the exact grading workspace in one click.

### Review Workspace

Layout:

```text
queue rail | submitted work | grading panel
```

Requirements:

- Queue filters: needs grading, returned, late, failed, high risk, stale draft.
- Keyboard navigation through queue and grading fields.
- Inline file preview.
- Code output/test result preview.
- Per-item feedback.
- Overall feedback.
- Rubric scoring.
- Save draft feedback.
- Return for revision with required feedback.
- Publish with student-visible preview.
- Grade correction as auditable revision.

### Gradebook

Gradebook must:

- Group by learner, activity, chapter, assessment kind, status, and cohort.
- Use the same state chips as student activity.
- Explain every disabled batch action.
- Export the same states visible in the UI.
- Contain no `assignment_group` or assignment-language taxonomy.

## 12. Assignment Domain Removal

### Live Database

Required invariant:

- No `assignment`, `assignment_task`, `assignmenttask`, `assignmentusersubmission`, or `assignmenttasksubmission` tables.
- No `TYPE_ASSIGNMENT` rows in `activity`.
- No assignment metadata keys in `submission.metadata_json`.
- No foreign keys referencing deprecated assignment tables.
- No assessment rows that depend on legacy assignment IDs.

Existing migration `2026_05_18_1a2b3c4d5e6f_student_workflow_invariants.py` is directionally correct and must remain a hard failure if deprecated database state survives.

### Application Code

Remove:

- Assignment namespaces in message catalogs.
- `NewAssignmentModal` copy and routes if not RBAC.
- Student/teacher "Assignment" labels.
- Assignment comments in active code.
- Dead standalone assessment client.
- Unused focus constants and events.
- Any old activity page component no longer used by the new shell.

### Generated Contracts

OpenAPI and generated TypeScript schema must contain no assignment workflow contract. RBAC user-role assignment is allowed and must be explicitly excluded from the ban.

### Migration History Policy

This requires clarification. If "no legacy" includes repository migration history, create a new squashed baseline migration and delete old assignment-era migrations. If deployed upgrade history must be preserved, keep historical migrations but add a repository check that allows assignment terms only in migrations before the invariant migration.

## 13. Frontend Replacement Plan

Create/complete:

```text
features/student-activity/
  api/runtime.ts
  domain/runtime.ts
  shell/StudentActivityWorkspace.tsx
  shell/ActivityHeader.tsx
  shell/ActivityOutline.tsx
  shell/ActivityActionPanel.tsx
  shell/ActivityMobileActionBar.tsx
  renderers/DynamicRenderer.tsx
  renderers/AssessmentRenderer.tsx
  renderers/FileSubmissionRenderer.tsx
  renderers/VideoRenderer.tsx
  renderers/DocumentRenderer.tsx
```

Rewrite route:

- Fetch backend runtime.
- Stop calling `buildStudentActivityViewModel`.
- Stop using trail data directly in the route.
- Stop deriving assessable state locally.
- Hydrate child query data only as an implementation detail.
- Render `StudentActivityWorkspace`.

Delete:

- `AssessmentAttemptClient.tsx`
- unused `FOCUS_MODE_CHANGE_EVENT`
- `ASSESSMENT_ATTEMPT_FOCUS_MODE_STORAGE_KEY` if no longer needed
- old activity route-only components after replacement
- assignment message namespaces
- any standalone assessment UI that competes with activity workspace

Replace:

- `AssessmentLayout` focus persistence with activity layout state.
- localStorage attempt-focus preference with explicit per-session layout state unless a user preference is product-approved.
- hardcoded green/emerald status classes with semantic tokens or badge variants.
- inline English strings in file-submission UI with message catalog keys.

## 14. Backend Replacement Plan

Complete runtime endpoint:

- Include complete outline state.
- Include current position and total count.
- Include policy summary.
- Include submission/file-submission state.
- Include result/release state.
- Include primary and secondary actions.
- Include disabled reasons.
- Include next/previous navigation.

Complete action endpoint:

- Implement all commands in the runtime contract.
- Validate command against the same state machine that produced the action.
- Return refreshed runtime after command.

Complete progress reducer:

- Normalize assessment submissions.
- Normalize file submission attempts.
- Normalize manual completion.
- Update `ActivityProgress`.
- Update course progress derived from activity progress.
- Emit audit events.

Complete grading pipeline:

- Apply attempt penalty once.
- Apply late penalty consistently for auto and manual review submissions.
- Store raw score, penalty, final score, visible score, and release status separately.
- Publish auto-graded results when policy allows.
- Publish code challenge results immediately if that remains the product rule.
- Make teacher overrides auditable revisions.

## 15. Design System Rules

- Use semantic tokens for state: success, warning, info, destructive, muted, pending, returned, hidden grade.
- Use `Badge`, `Button`, `Sheet`, `Tooltip`, `ScrollArea`, `Progress`, `Alert`, and `Separator` consistently.
- Keep cards for repeated items, receipts, result blocks, file rows, modals, and contained tools only.
- Do not nest page-structure cards.
- Keep card radius at existing system scale.
- Use icons for common actions.
- Give long Russian and Kazakh strings stable containers.
- Use fixed dimensions for progress bars, outline icons, status badges, file rows, metrics, and bottom bars.
- No hardcoded `text-green-*`, `text-emerald-*`, `bg-gray-*`, or `text-neutral-*` in the workflow.

## 16. Internationalization

Replace assignment-keyed namespaces with domain names:

- `ActivityWorkspace`
- `AssessmentWorkspace`
- `FileSubmission`
- `TeacherReview`
- `Gradebook`
- `CourseCommandCenter`

All new and rewritten components must use `next-intl`. Inline English is prohibited.

Russian and Kazakh labels must be reviewed for grammar and length. Current examples such as "Описание учебные задачи" and "Оқу әрекетіны" are not production-quality.

## 17. Accessibility

Required:

- `aria-current="page"` for current outline item.
- Keyboard navigable outline and review queue.
- Disabled actions expose reasons.
- Progress has text alternatives.
- Bottom bar does not cover focused inputs.
- Focus/reading mode exits with Escape.
- Assessment guard dialogs are reachable and non-trapping.
- File upload supports keyboard and screen reader operation.
- Timer and save-state updates use polite live regions.

## 18. Performance

Apply Next.js and React performance rules:

- Route remains server-first where possible.
- Fetch runtime and session in parallel.
- Avoid client waterfalls for trail, contributor status, activity state, and assessment state.
- Dynamically import heavy renderers.
- Keep the shell as a small client island.
- Split assessment kind modules.
- Use Suspense around heavy content, not around the whole page.
- Avoid rebuilding course indexes on every client render.

## 19. Cutover Tracks

These are replacement tracks, not incremental fixes. A track is complete only when the old runtime path is deleted or made redirect-only.

### Track A: State Authority Cutover

Deliver:

- Frontend consumes `StudentActivityRuntime`.
- Local `buildStudentActivityViewModel` is removed from the route.
- Primary action comes from server runtime.
- Trail-derived route state is removed.

Exit:

- Screenshots cannot show contradictory "complete", "not started", and "access blocked" states.

### Track B: Student Workspace Cutover

Deliver:

- New `StudentActivityWorkspace`.
- Type-specific renderers.
- New action panel and mobile bar.
- Dynamic, assessment, code, file, video, and document states wired.

Exit:

- One URL owns every activity type.
- Mobile and desktop have one primary action.

### Track C: Assessment And Code Runtime Cutover

Deliver:

- Preflight, active attempt, result, feedback, retry/revision.
- Code challenge editor/test runner/result as first-class workspace.
- Standalone assessment client deleted.

Exit:

- `/assessments/[uuid]` is redirect-only.
- Assessment attempt focus does not rely on old storage constants.

### Track D: File Submission Cutover

Deliver:

- Fully localized file-submission workspace.
- Receipt, result, revision, rubric, history.
- Server runtime owns shell state.

Exit:

- File submission no longer behaves like a migrated assignment.

### Track E: Teacher Workflow Cutover

Deliver:

- Course command center.
- Review workspace.
- Gradebook state alignment.
- Audit-grade correction.

Exit:

- Teacher can triage, review, return, publish, and correct without leaving the coherent workflow.

### Track F: Legacy Removal Cutover

Deliver:

- Assignment copy removed.
- Dead files removed.
- Constants/events removed.
- Database invariants enforced.
- Generated contracts clean.
- Repository checks added.

Exit:

- No assignment workflow survives outside allowed RBAC language and approved historical migrations.

## 20. Testing Plan

### Backend

- Runtime endpoint contract tests for every activity type.
- Action endpoint state matrix tests.
- Progress reducer tests for all states.
- File submission completion tests.
- Assessment grading/release tests.
- Late and attempt penalty tests.
- Grade correction audit tests.
- Assignment invariant migration tests.
- OpenAPI no-assignment contract test.

### Frontend

- `StudentActivityWorkspace` state rendering tests.
- Primary action matrix tests.
- Outline state tests.
- Dynamic layout tests.
- Assessment preflight/attempt/result tests.
- Code challenge workspace tests.
- File submission draft/submit/receipt/result/revision tests.
- i18n no-inline-English checks for rewritten workflow.
- Design-token checks for hardcoded color classes.

### End To End

- Student completes dynamic lesson and continues.
- Student starts quiz, submits, sees result or release hold.
- Student starts exam with anti-cheat policy and submits.
- Student solves code challenge, runs tests, submits, sees result.
- Student uploads file, receives receipt, teacher publishes, student sees feedback.
- Teacher returns work, student revises, teacher republishes.
- Teacher opens gradebook and sees same state as student.
- Mobile workflow for all activity types at `390x844`.
- Desktop workflow at `1440x900` and `1280x800`.

## 21. Acceptance Criteria

- A student understands location, task, status, policy, and next action within five seconds.
- Every activity type uses the same canonical route.
- Every visible status comes from the backend runtime or an activity sub-runtime synchronized into it.
- Every primary action is server-authorized.
- Assessment, code challenge, and file submission never contradict the shell status.
- Teacher review and student status use the same vocabulary.
- Gradebook explains state and disabled actions.
- Assignment workflow is gone from live DB, API, generated contracts, UI, analytics, and active code.
- Visual layout has no overlapping labels, no metric overflow, no contradictory bottom bars, and no nested page-structure cards.
- Russian and Kazakh strings fit and read naturally.
- Tests and Playwright visual checks pass.
