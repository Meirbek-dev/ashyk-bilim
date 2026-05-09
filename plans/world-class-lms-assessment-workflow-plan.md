# World-Class LMS Assessment Workflow Plan

Date: 2026-05-08  
Scope: assessments, assignments, tasks, quizzes, exams, code challenges, forms, student attempts, grading, gradebook, analytics, authoring studio, review workspace, and developer workflow.

## Executive Summary

The assessment system is moving in the right direction. The repo now has a canonical assessment model, unified item bodies and answers, lifecycle states, backend attempt projections, masked student submission reads, a shared student attempt shell, a shared teacher review workspace, and a gradebook built from canonical progress rows.

The product is not yet world-class because the migration is still incomplete. Some parts are genuinely canonical; other parts are compatibility adapters, legacy routes, or kind-specific bypasses. The largest remaining risks are not visual polish. They are workflow coherence, data integrity, attempt durability, assessment versioning, grading ergonomics, code challenge runtime consistency, and a teacher studio that is not yet powerful enough for repeated daily use.

The plan below keeps the core principle simple:

> `Activity` is the course curriculum node. `Assessment` is the canonical gradeable object. `AssessmentItem` is the canonical authored work unit. `Submission` is the canonical learner attempt. Everything else should either be a projection, a compatibility adapter, or removed.

## Current System Map

### Backend

Current strengths:

- Canonical tables exist for `Assessment` and `AssessmentItem` in `apps/api/src/db/assessments.py`.
- Canonical lifecycle states exist: `DRAFT`, `SCHEDULED`, `PUBLISHED`, `ARCHIVED`.
- Canonical item kinds exist: `CHOICE`, `OPEN_TEXT`, `FILE_UPLOAD`, `FORM`, `CODE`, `MATCHING`.
- Canonical answer shapes exist for those item kinds.
- `AssessmentPolicy`, `Submission`, `GradingEntry`, `ActivityProgress`, and `CourseProgress` give the system a real grading and progress backbone.
- Unified routes exist in `apps/api/src/routers/assessments/unified.py` for authoring, lifecycle, start, draft save, submit, student submissions, teacher submissions, grading, and bulk publish.
- Attempt projections now include useful server-owned state: `can_edit`, `can_save_draft`, `can_submit`, disabled reason codes, effective policy, server time, close time, result visibility, and content/policy versions.
- Student-facing canonical submission serialization masks scores and grading details when results are not visible.
- Published assessments with existing submissions are blocked from normal item edits until versioning lands.
- Grade saves have optimistic locking.
- Gradebook reads from canonical progress rows and links back to review.

Current structural risks:

- `get_assessment_by_activity_uuid` still calls `_get_or_project_assessment_for_activity`, and that helper can create canonical assessment rows during a read. The existing `test_activity_lookup_does_not_create_canonical_assessment_rows` expects the opposite, so implementation and tests appear out of sync.
- Assessment policy is still partly duplicated across `AssessmentPolicy`, `activity.settings`, `activity.details`, and kind-specific settings adapters.
- `content_version` and `policy_version` are placeholders that always return `1`.
- Submissions do not yet snapshot the authored item definitions and effective policy used at submit time.
- Returned-for-revision is represented as a submission status, but the revision attempt model needs stronger semantics.
- Code challenge run/test execution is not mounted on the canonical assessment API. `runTests` and `runCustomTest` intentionally throw an unavailable error in `apps/web/services/courses/code-challenges.ts`.
- `AssessmentPolicyPatch` does not expose all important policy fields consistently, especially grade release mode, completion rule, passing score, requiredness, overrides, late cutoff details, and rubric/review options.
- Teacher review can save per-item feedback through the backend, but the main frontend form still sends `item_feedback: []` and focuses on one overall score.

### Frontend

Current strengths:

- The shared assessment registry maps kinds to `Studio`, `Attempt`, and `Review` surfaces.
- `AssessmentStudioWorkspace` gives teachers lifecycle controls, readiness issues, preview, and an inspector area.
- `NativeItemStudio` unifies assignment/exam item authoring for choice, matching, open text, file upload, and form items.
- `AssessmentLayout`, `AssessmentChrome`, and `AssessmentActionBar` provide one student attempt shell with focus mode, save state, timer, anti-cheat state, offline notice, recovery dialog, and conflict dialog.
- `useAssessmentSubmission` provides canonical draft load, autosave, submit, optimistic version headers, conflict resolution, and cache invalidation.
- Assignment and exam student attempts use the shared draft/save/submit system.
- The review workspace provides queue filters, search, sort, keyboard navigation, submission detail, release-state visibility, violations tab, grade form, and bulk actions.
- The gradebook is a dense operational grid with filters, rollups, export, and drill-through to review.

Current UX and DX risks:

- The teacher studio is functional but not yet a true daily authoring studio. It lacks a dense command layout, item reordering controls in the main UI, item-level rubric editing, policy presets, release preview, versioning controls, and a strong "ready to publish" workflow.
- Lifecycle actions are present but not yet modeled as a teacher-friendly publishing workflow with explicit schedule, revise, duplicate, archive, new version, and impact warnings.
- Readiness issues can jump to item cards, but there is no central readiness drawer that groups metadata, policy, content, scoring, and accessibility issues with field-level navigation.
- Student attempt flows are improved, but blocked-state messages are too generic. Backend reason codes need first-class translations and recovery actions.
- The action bar submit button is always present even before some contexts are meaningfully startable. The shell should make start, save, submit, revise, and result states feel distinct.
- Exam timers use `attempt.created_at` in the frontend in places, while backend uses `started_at`. These must be unified around server timestamps.
- Code challenge attempt bypasses canonical `useAssessmentSubmission`; it starts the assessment but passes `answer={undefined}` and a no-op `onAnswerChange` into the code item attempt.
- Creation workflows are inconsistent: assignments and exams create canonical assessments, while code challenge modal still creates a plain activity and relies on later canonical projection/compatibility.
- There are many compatibility query keys (`assignments`, `exams`, `codeChallenges`, `grading`, `assessments`) that increase stale-cache and mental-model cost.
- Some service modules are marked `'use server'` while also being imported into client-side flows through mixed patterns. This should be audited and simplified.

## Critical Diagnosis

### 1. The system has a canonical core, but the product still exposes migration seams.

Teachers and students should not need to know whether something is an assignment, exam, quiz, code challenge, dynamic activity, task, or legacy activity. They should see one assessment system with kind-specific presets.

Currently, assignment and exam are mostly canonical. Code challenge is split between canonical item data, legacy settings, and unavailable run endpoints. Quiz support exists in model mappings, but route and UI coverage remain thinner than assignment/exam. Legacy assignment service adapters still translate old task shapes into canonical items.

Impact:

- Teachers can hit different creation/editing behavior by kind.
- Students get different attempt durability by kind.
- Developers need to understand multiple contracts for the same concept.

### 2. Backend attempt projection is promising, but not yet the single product contract.

`AttemptStateRead` has the right shape. The frontend should be able to render every start/save/submit/result state from it. Today, the frontend still supplements it with local inference, kind-specific hooks, and submission list interpretation.

Required direction:

- Make `AttemptStateRead` authoritative for all student action availability.
- Add localized, documented reason codes.
- Include next recommended action, such as `START`, `CONTINUE_DRAFT`, `SUBMIT`, `WAIT_FOR_RELEASE`, `VIEW_RESULT`, `START_REVISION`, or `NO_ACTION`.
- Include exact timestamps for start, due, close, server now, and time remaining.

### 3. Assessment authoring needs versioning before it can be trusted at scale.

The current edit block for published assessments with submissions is a good stopgap. It is not enough for a production LMS. Teachers need to revise live assessments intentionally, and the system must preserve what each student actually saw.

Required direction:

- Introduce immutable assessment versions.
- Submit against a specific content version and policy version.
- Snapshot item body, max score, correct answer, rubric, files, policy, time limits, release settings, and late policy.
- Review old submissions against their snapshot.
- Let teachers create a new version from published content instead of mutating history.

### 4. Teacher review is not yet item-native.

The backend grading model can represent item breakdowns, but the primary review UI still asks for a final score and feedback. A world-class LMS review flow should make item-level grading the default for mixed assignments.

Required direction:

- Show each submitted item with answer, rubric, score, max score, feedback, and review status.
- Calculate final score from item scores.
- Allow teacher override only with a reason.
- Save grading drafts before publishing.
- Provide release preview showing exactly what the student will see.

### 5. Code challenge needs a first-class canonical runtime.

The code challenge authoring and attempt path are still the least converged. A code LMS workflow needs visible tests, hidden tests, custom run, final submit, runner job status, degraded mode, idempotency, and result auditing.

Required direction:

- Use canonical `CODE` item answers for drafts and final submits.
- Add canonical `/run` endpoints with job IDs and idempotency keys.
- Store visible run history separately from final grading results.
- Treat Judge0 outages as recoverable runtime states, not generic submission failures.
- Add clear teacher settings for language policy, starter code, tests, scoring strategy, time/memory limits, and plagiarism policy.

### 6. The teacher studio needs to become an operating surface, not a form stack.

The existing studio is a reasonable foundation, but a teacher who builds many assessments needs speed, confidence, and structure.

Required direction:

- Persistent three-panel workspace: item outline, item editor, policy/readiness inspector.
- Keyboard-friendly item creation, duplicate, reorder, delete, preview, and publish.
- Direct field navigation from readiness issues.
- Policy presets by kind, with advanced settings collapsed but discoverable.
- Draft autosave with version/conflict handling.
- Publish checklist with blocked and advisory issues.
- "Preview as student" and "Preview released result" modes.

### 7. Student workflow is good in architecture but needs sharper states.

Students need a calm flow: know what is due, start, work safely, submit confidently, and understand what happens next. The current shell has many pieces, but the product language and state transitions need to be more systematic.

Required direction:

- Start screen explains availability, due date, timer, attempts, release policy, late policy, and integrity checks.
- Work screen has one save state, one timer, one progress model, and one submit flow.
- Submit dialog groups unanswered, invalid, unsaved, late, and policy warnings.
- Result screen separates `submitted`, `needs review`, `graded but hidden`, `published`, `returned`, `late penalty`, and `runner failed`.
- Mobile should be explicitly supported for assignment/quiz/form and explicitly constrained for code challenge if needed.

## Target Teacher Workflow

### Create

1. Teacher opens course curriculum.
2. Teacher adds an assessment using one "Assessment" entry point.
3. Teacher chooses a preset: Assignment, Quiz, Exam, Code Challenge, Form Task.
4. The system creates a canonical `Assessment`, canonical `Activity`, default `AssessmentPolicy`, and starter item set in one transaction.
5. Teacher lands directly in the studio for that assessment.

Required UI:

- Preset cards with concise use cases.
- Defaults visible before creation: grading mode, attempts, release mode, time/due defaults.
- No separate legacy modal behavior by kind.

Required backend:

- One creation endpoint for all assessment kinds.
- Creation returns assessment UUID, activity UUID, course UUID, studio URL, and initial readiness.
- No read endpoint creates assessment rows.

### Author

1. Teacher edits title, description, instructions, items, points, rubric, and files.
2. Teacher sees autosave state and issue count.
3. Teacher can reorder items, duplicate items, group sections, and preview as student.
4. Policy and release settings are always accessible but not in the way.

Required UI:

- Left panel: outline with item type, points, readiness, drag handle, quick actions.
- Center panel: selected item editor with task prompt, answer/scoring setup, feedback/rubric, attachments.
- Right panel: tabs for Readiness, Policy, Preview, History.
- Compact controls, no marketing layout, no nested cards.
- Clear disabled states when lifecycle prevents editing.

Required backend:

- Item order uniqueness per assessment.
- Rich item validation by kind.
- Policy validation with reason codes.
- Authoring mutations support optimistic concurrency.

### Publish

1. Teacher clicks publish or schedule.
2. Studio opens a publish checklist.
3. Blocking issues prevent publish; advisory issues can be acknowledged.
4. Teacher confirms release mode, due policy, attempt policy, visibility, and student preview.
5. Published content becomes immutable unless teacher creates a new version.

Required UI:

- Publish drawer with grouped issue list.
- "Preview student start screen" before publish.
- "Create new version" when editing a published assessment with submissions.
- Schedule calendar/time control with timezone clarity.

Required backend:

- Lifecycle transition service is authoritative.
- Scheduled assessment opens according to server time.
- Publish creates a content version.

### Review

1. Teacher opens review queue from assessment, curriculum, analytics, or gradebook.
2. Queue defaults to work needing action.
3. Teacher selects a submission and grades item-by-item.
4. Teacher saves grading draft, publishes, returns for revision, or moves to next submission.
5. Bulk actions are safe, auditable, and explain partial failures.

Required UI:

- Queue left, submitted work center, grading panel right.
- Item-level grading cards with score, feedback, rubric criteria, internal note.
- Final score is calculated, with explicit override control.
- Keyboard navigation across submissions and item grading fields.
- Release preview before publish.
- Batch publish with count, failures, and undo/recall policy.

Required backend:

- Grading drafts.
- Per-item grading model as first-class API.
- Audit log for grade changes, publish, return, override, deadline extension.
- Idempotent bulk publish and batch grade.

### Gradebook and Analytics

1. Teacher sees progress and action backlog by course.
2. Teacher drills into exact submission review.
3. Teacher can filter missing, late, returned, needs grading, failed, and at-risk learners.
4. Analytics reconcile with gradebook and submissions.

Required UI:

- Gradebook columns link to assessment review and student work.
- Rollups by activity group, learner, cohort, and assessment kind.
- Saved views for teachers.
- Export uses the same visible state as the grid.

Required backend:

- Progress rows reconcile from canonical submissions.
- Analytics queries use the same ledger as gradebook.
- Support diagnostics by course, assessment, activity, submission, learner.

## Target Student Workflow

### Before Start

Student sees:

- Title and instructions.
- Availability window.
- Due date and late policy.
- Timer if any.
- Attempts used and attempts remaining.
- Result visibility policy.
- Integrity checks if any.
- Previous attempts and outcomes where visible.
- Clear primary action: Start, Continue, View Result, Wait, or No Attempts Left.

### During Attempt

Student gets:

- Server-backed draft before work begins.
- Autosave to backend.
- Local recovery fallback.
- Offline notice.
- Draft conflict resolution.
- Stable progress indicator.
- Timer from server-started timestamp.
- Submit confirmation with unanswered and invalid items.
- Clear retry behavior for save and submit errors.

### After Submit

Student gets one of:

- Submitted, awaiting review.
- Graded, waiting for release.
- Result visible with score, feedback, item feedback, late penalty, and correct-answer policy.
- Returned for revision with teacher feedback and a revision action.
- Failed auto-grade or runner issue with clear next action.

## Backend Plan

### Phase 0: Contract Reconciliation

Goal: make code, tests, and contracts agree.

- [ ] Fix `get_assessment_by_activity_uuid` so GET has no write side effects.
- [ ] Add explicit migration/admin command for legacy assessable activities.
- [ ] Make the existing no-read-side-effect test pass.
- [ ] Add an error contract for un-migrated legacy activities: `MIGRATION_REQUIRED`.
- [ ] Normalize creation so assignments, quizzes, exams, code challenges, and form tasks all create canonical assessments.
- [ ] Audit all legacy grading and assignment endpoints and mark them `compatibility only` or remove from supported UI paths.

Exit criteria:

- No read request creates `Assessment` or `AssessmentPolicy`.
- Every newly created gradeable activity has a canonical assessment row immediately.
- Frontend never depends on implicit projection.

### Phase 1: Attempt State as Source of Truth

- [ ] Expand `AttemptStateRead` with `recommended_action`, `primary_button_label_key`, `can_start`, `can_continue`, `can_view_result`, `can_start_revision`.
- [ ] Add documented reason codes and frontend translations for every blocked state.
- [ ] Include `started_at`, `server_now`, `timer_started_at`, `timer_expires_at`, `due_at`, `closes_at`.
- [ ] Use the same attempt-state service in `get`, `start`, `draft`, `save`, `submit`, and `me`.
- [ ] Make start idempotency explicit for draft, returned revision, and max-attempt scenarios.
- [ ] Add backend tests for scheduled open, due passed, late allowed, late denied, timer expired, max attempts, archived, draft, and returned revision.

Exit criteria:

- Student UI actions render from backend state with no local policy guessing.
- Attempt blocking behavior is identical across read/start/save/submit.

### Phase 2: Policy Unification

- [ ] Make `AssessmentPolicy` the only write source for assessment policy.
- [ ] Deprecate new writes to `activity.settings` and `activity.details` for assessment behavior.
- [ ] Add missing patch fields: `grade_release_mode`, `completion_rule`, `passing_score`, `grading_mode`, `required`, `late_policy`, release details, review visibility.
- [ ] Add policy presets by kind in backend, not hard-coded only in frontend.
- [ ] Add student override management: due date extension, max attempts, time extension, late penalty waiver, availability override.
- [ ] Add policy audit entries.

Exit criteria:

- One backend service answers "what policy applies to this learner now?"
- Compatibility settings DTOs are read-only adapters with removal dates.

### Phase 3: Versioning and Snapshots

- [ ] Add `assessment_version` table or immutable JSON version payload.
- [ ] Add `content_version` and `policy_version` columns to submissions.
- [ ] Snapshot item definitions, scoring settings, policy, rubric, correct answers, and attachments at submit time.
- [ ] Render teacher review from snapshot, not current authoring state.
- [ ] Make edit-published flow create a new draft version.
- [ ] Add migration for existing submissions with best-effort version `1` snapshots.

Exit criteria:

- Historical submissions remain reviewable after item edits, deletes, reorders, or policy changes.
- Grade disputes can be reconstructed.

### Phase 4: Grading Engine

- [ ] Make item-level grading the canonical save shape.
- [ ] Add grading drafts separate from final grade state.
- [ ] Calculate final score from item scores by default.
- [ ] Support override score with required reason.
- [ ] Add rubric criteria model for open text and file/form work.
- [ ] Add item graders for choice, matching, and code.
- [ ] Mark open text, file upload, and complex form fields as manual by default.
- [ ] Store correct-answer visibility policy and item feedback visibility.
- [ ] Add grade publish, recall, return, override, and bulk audit events.

Exit criteria:

- Mixed assignments can be graded without using a single overall-score field.
- Gradebook values reconcile with grading entries and submissions.

### Phase 5: Code Challenge Runtime

- [ ] Add canonical code run endpoint: `POST /assessments/{uuid}/items/{item_uuid}/runs`.
- [ ] Add run idempotency keys and job IDs.
- [ ] Store visible run history in submission metadata.
- [ ] Store final submitted code as canonical `CODE` item answer.
- [ ] Separate visible tests, hidden tests, custom input, and final grading.
- [ ] Add Judge0 degraded-mode state and retryable failures.
- [ ] Add plagiarism policy and reviewer-only flags.
- [ ] Add runner observability: queue time, runtime, failures, language, test count.

Exit criteria:

- Code challenges use the same draft/save/submit shell as other assessments.
- Runner outages cannot corrupt submissions or silently misgrade learners.

## Frontend Plan

### Phase 1: Unified Creation

- [ ] Replace separate assignment/exam/code creation modals with one assessment creation workflow.
- [ ] Keep kind presets, but route all kind creation through canonical `/assessments`.
- [ ] On success, navigate to `/dash/courses/{course}/activity/{activity}/studio`.
- [ ] Show starter policy and starter item defaults before creation.
- [ ] Remove code challenge legacy activity-only creation path.

### Phase 2: Teacher Studio Redesign

- [ ] Build a production authoring shell with stable three-panel layout.
- [ ] Move item creation, reorder, duplicate, delete, and validation into a single outline system.
- [ ] Add item-level tabs: Prompt, Answer/Scoring, Rubric/Feedback, Attachments, Settings.
- [ ] Add policy tabs: Availability, Attempts, Time, Late Work, Release, Integrity, Overrides.
- [ ] Add readiness drawer with grouped issues and field-level focus.
- [ ] Add preview modes: student start, student attempt, review result.
- [ ] Add version banner for published assessments.
- [ ] Add unsaved/conflict state for teacher authoring.

### Phase 3: Student Attempt Polish

- [ ] Convert code challenge attempt to `useAssessmentSubmission`.
- [ ] Use server `started_at` and `timer_expires_at` everywhere.
- [ ] Add blocked reason panels with concrete next steps.
- [ ] Add submit dialog validation by item type.
- [ ] Add local recovery and conflict behavior to every assessment kind.
- [ ] Add result screen components driven by release state.
- [ ] Add mobile layout audits for assignment, quiz, exam, and form task.

### Phase 4: Review Workspace Redesign

- [ ] Replace overall-score-first `GradeForm` with item-level grading.
- [ ] Keep final-score override as an advanced action with reason.
- [ ] Add grading draft autosave.
- [ ] Add item feedback, rubric criteria, teacher-only notes, attachments, and keyboard navigation.
- [ ] Add release preview before publish.
- [ ] Add batch operations with explicit partial-failure UI.
- [ ] Add queue saved views.

### Phase 5: Gradebook and Analytics Polish

- [ ] Add gradebook saved views and column grouping by chapter/module.
- [ ] Add missing/late/returned/failed/needs-grading quick filters.
- [ ] Add gradebook cell side panel with submission history and actions.
- [ ] Add analytics drill-through to exact review queue filters.
- [ ] Add export parity tests.

## Developer Experience Plan

### Contracts

- [ ] Treat OpenAPI-generated types as the frontend source for API shapes.
- [ ] Remove duplicate hand-written DTOs where generated types are usable.
- [ ] Add contract tests for assessment create, lifecycle, attempt state, draft, submit, review queue, grade save, bulk publish.
- [ ] Document every assessment status, release state, disabled reason, and lifecycle transition.

### Query and Cache Model

- [ ] Make assessment UUID the primary cache identity for assessment flows.
- [ ] Keep activity UUID as a lookup key only.
- [ ] Add one invalidation utility for assessment mutations.
- [ ] Collapse legacy `assignments`, `exams`, and `codeChallenges` query keys where canonical data is available.
- [ ] Add tests proving start/save/submit/grade/publish invalidates attempt, draft, submissions, stats, gradebook, and analytics.

### Module Boundaries

- [ ] Keep reads in Server Components where possible.
- [ ] Keep UI mutations in server actions or route-backed client fetches consistently, not a mixture hidden in service modules.
- [ ] Make kind modules thin: they render item-specific editor/attempt/review components, while the shell owns lifecycle, policy, save, submit, and release.
- [ ] Create an item registry contract for authoring, attempt rendering, review rendering, validation, grading, and default payloads.

### Testing Matrix

Backend:

- [ ] Lifecycle gating for draft, scheduled future, scheduled open, published, archived.
- [ ] Attempt limits, overrides, due date, late allow/deny, timer expiry.
- [ ] Hidden grade masking across canonical and legacy compatibility endpoints.
- [ ] Version snapshot after item edit/delete/reorder.
- [ ] Item-level grading, override reason, return for revision, bulk publish idempotency.
- [ ] Code runner pending, success, compile error, runtime error, timeout, runner unavailable.
- [ ] Migration from legacy assignment, quiz, exam, and code challenge.

Frontend:

- [ ] Studio item authoring and readiness navigation.
- [ ] Publish checklist and scheduled publish controls.
- [ ] Student start, autosave, recovery, conflict, submit, result states.
- [ ] Code challenge draft/run/submit once canonical runtime exists.
- [ ] Review item-level grading and stale grade conflict.
- [ ] Gradebook drill-through and cache invalidation.

E2E:

- [ ] Teacher creates assignment, publishes, student submits, teacher grades, student sees released result.
- [ ] Teacher creates quiz, student auto-graded result hidden until batch release.
- [ ] Teacher creates timed exam, student autosaves, timer expires, auto-submit is handled.
- [ ] Teacher creates code challenge, student runs visible tests, submits, hidden tests grade.
- [ ] Returned-for-revision full flow.
- [ ] Multi-tab draft conflict.
- [ ] Network failure during save and submit retry.

### Observability and Support

- [ ] Structured events for blocked attempts, draft save failures, submit failures, timer expiry, grade conflicts, publish failures, runner failures.
- [ ] Support diagnostics endpoint by assessment UUID and submission UUID.
- [ ] Dashboards for draft-save success, submit success, grading backlog, hidden-grade complaints, runner health, queue latency.
- [ ] Runbooks for lost draft, hidden grade, timer incident, runner outage, gradebook mismatch, migration issue.

## Target Information Architecture

Teacher routes:

- `/dash/courses/{courseUuid}/curriculum`
- `/dash/courses/{courseUuid}/activity/{activityUuid}/studio`
- `/dash/courses/{courseUuid}/activity/{activityUuid}/review`
- `/dash/courses/{courseUuid}/gradebook`
- `/dash/analytics/assessments/{assessmentUuid}`

Student routes:

- `/assessments/{assessmentUuid}` for canonical attempt/result by assessment UUID.
- Course activity routes may redirect or resolve to the canonical assessment route.

Backend routes:

- `/assessments` for create.
- `/assessments/{assessment_uuid}` for detail/update.
- `/assessments/{assessment_uuid}/lifecycle`.
- `/assessments/{assessment_uuid}/items`.
- `/assessments/{assessment_uuid}/attempt-state`.
- `/assessments/{assessment_uuid}/start`.
- `/assessments/{assessment_uuid}/draft`.
- `/assessments/{assessment_uuid}/submit`.
- `/assessments/{assessment_uuid}/me`.
- `/assessments/{assessment_uuid}/submissions`.
- `/assessments/{assessment_uuid}/submissions/{submission_uuid}`.
- `/assessments/{assessment_uuid}/publish-grades`.
- `/assessments/{assessment_uuid}/items/{item_uuid}/runs` for code.

Compatibility routes should be documented as temporary.

## Product Definition of Done

Teacher workflow is production-ready when:

- A teacher can create, configure, publish, review, release, and analyze every supported assessment kind without leaving the canonical workflow.
- The studio feels fast for repeated use: keyboard-friendly, autosaved, dense, predictable, and transparent about readiness.
- Review is item-native, rubric-aware, auditable, and safe for bulk operations.
- Published content changes require intentional versioning.

Student workflow is production-ready when:

- A student never loses work in realistic refresh, offline, duplicate-tab, and retry scenarios.
- Start/save/submit/result states are clear and always match backend truth.
- Grades and feedback never appear before release.
- Timers and late rules are server-enforced and visibly explained.
- Returned revisions are easy to understand and resubmit.

Backend is production-ready when:

- There is one authoritative lifecycle service, one effective policy resolver, one attempt-state resolver, and one submission serializer per audience.
- No GET endpoint writes assessment rows.
- Version snapshots make historical submissions reproducible.
- Gradebook, analytics, and progress reconcile from the same submission and grading ledger.
- High-value mutations are idempotent or optimistic-lock protected, audited, and observable.

Frontend is production-ready when:

- Assessment kind modules are thin and use shared shells.
- Cache keys and invalidations are canonical and tested.
- UI surfaces render backend capabilities instead of guessing.
- Creation, studio, attempt, review, and gradebook use consistent language and state models.

## Immediate Priority Order

1. Reconcile `get_assessment_by_activity_uuid` side effects with tests and remove read-time creation.
2. Unify creation for code challenge and quiz so all new gradeable activities are canonical at creation time.
3. Make `AttemptStateRead` the single student action contract and improve disabled reason UX.
4. Add assessment versioning and submit-time snapshots.
5. Convert teacher review to item-level grading.
6. Convert code challenge runtime to canonical draft/run/submit.
7. Redesign the teacher studio around outline, editor, policy, readiness, preview, and versioning.
8. Expand backend, frontend, and E2E tests around the complete teacher-student lifecycle.

