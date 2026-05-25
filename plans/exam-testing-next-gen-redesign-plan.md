# Exam and Testing Next-Gen Rewrite Plan

Date: 2026-05-25

This document critically analyzes the current exam/testing implementation and proposes a full rewrite plan for a production-grade LMS assessment experience. It is intentionally broader than the earlier timer/autosave refactor plan in `plans/exam-testing-refactor-plan.md`: the current product problem is not only a backend bug problem. It is an end-to-end assessment product problem spanning authoring, learner delivery, access, timing, grading, review, release, analytics, resilience, and UI density.

## Executive Summary

The current implementation has made progress toward a unified assessment engine, but it is still not a world-class LMS testing system. The visible UI wastes large parts of the screen, the authoring model exposes capabilities that the learner runtime and grader do not consistently support, some authoring metadata is stored only in browser local storage, policy fields are duplicated across multiple shapes, and review/results workflows are too shallow for real instructional operations.

The most important conclusion: do not polish the current screens in place. The exam feature should be redesigned around a clear assessment lifecycle, a durable versioned domain model, and dedicated surfaces for four jobs:

1. Build and validate a test.
2. Deliver the test reliably to learners.
3. Review and release results.
4. Improve test quality with analytics.

## Current Implementation Map

Frontend surfaces:

- Authoring shell: `apps/web/src/features/assessments/studio/AssessmentStudioWorkspace.tsx`
- Native exam studio: `apps/web/src/features/assessments/studio/NativeItemStudio.tsx`
- Setup tab: `apps/web/src/features/assessments/studio/tabs/GeneralSettingsTab.tsx`
- Builder tab: `apps/web/src/features/assessments/studio/tabs/BuilderCanvasTab.tsx`
- Access tab: `apps/web/src/features/assessments/studio/tabs/AccessManagementTab.tsx`
- Results tab: `apps/web/src/features/assessments/studio/tabs/ResultsReviewTab.tsx`
- Publish tab: `apps/web/src/features/assessments/studio/tabs/PublishDashboardTab.tsx`
- Learner exam runtime: `apps/web/src/features/assessments/registry/exam/ExamAttemptContent.tsx`
- Attempt shell and guard: `apps/web/src/features/assessments/shell/AssessmentLayout.tsx`, `apps/web/src/features/assessments/shared/hooks/useAttemptGuard.ts`, `apps/web/src/hooks/useTestGuard.ts`

Backend surfaces:

- Canonical assessment tables: `apps/api/src/db/assessments.py`
- Student attempt service: `apps/api/src/services/assessments/attempt_service.py`
- Shared assessment helpers and readiness: `apps/api/src/services/assessments/_shared.py`
- Access service: `apps/api/src/services/assessments/access_service.py`
- Review service: `apps/api/src/services/assessments/review_service.py`
- Grading pipeline: `apps/api/src/services/grading/pipeline/*`
- Grader registry: `apps/api/src/services/grading/registry.py`
- Quiz/exam grader: `apps/api/src/services/grading/quiz_grader.py`
- Timer task: `apps/api/src/tasks/assessment_timer.py`

## Critical Findings

### 1. The UI uses space poorly and does not match the work

Evidence:

- Setup tab constrains the entire form to `max-w-3xl` in `GeneralSettingsTab.tsx`, leaving a wide 2K display mostly empty.
- Builder tab uses a fixed three-column layout, but the central editor is constrained to `max-w-2xl` in `BuilderCanvasTab.tsx`, again wasting horizontal space.
- Publish tab is constrained to `max-w-5xl`, and results/access rely on cards instead of operational work surfaces.
- The screenshots show the teacher doing high-density authoring work in a small centered column, while the rest of the viewport is blank.

Impact:

- Long prompts, explanations, options, rubrics, and question banks cannot be compared comfortably.
- Teachers cannot scan assessment health, question structure, policy, and preview at once.
- The product feels like a form demo rather than an LMS studio.

Needed direction:

- Replace the centered-card authoring pattern with a full-width workbench.
- Use persistent left navigation for structure, a large center canvas, and a contextual right panel only when it adds value.
- Use dense, scan-friendly tables for access, results, grading queues, and analytics.

### 2. Authoring allows item types that the exam learner runtime does not render

Evidence:

- `apps/web/src/features/assessments/registry/exam.tsx` allows `CHOICE`, `MATCHING`, `OPEN_TEXT`, and `FORM` in the exam authoring UI.
- `ExamAttemptContent.tsx` converts assessment items into exam questions only for `CHOICE` and `MATCHING`.
- `apps/api/src/services/assessments/_shared.py` restricts exam allowed item kinds to `CHOICE` and `MATCHING`.
- `apps/api/src/services/grading/quiz_grader.py` grades only canonical `CHOICE` and `MATCHING` items for quiz/exam flows.

Impact:

- A teacher can create Open Text or Form exam items in the UI, but those items are not delivered or graded as real exam questions.
- Publish readiness and learner preview can diverge from authoring reality.
- This is a critical trust failure: teachers cannot know whether what they built is what students will receive.

Needed direction:

- Define a single supported item matrix per assessment type.
- If exams support Open Text and Form, runtime rendering, backend validation, manual grading, scoring, review, analytics, exports, and release must all support them.
- If not, remove those types from exam authoring until they are production ready.

### 3. Assessment policy is fragmented and duplicated

Evidence:

- `NativeItemStudio.tsx` builds patches that write top-level policy fields such as `max_attempts`, `time_limit_seconds`, and `due_at`.
- The same patch also writes overlapping `settings_json` aliases such as `attempt_limit`, `time_limit`, `max_attempts`, and result review flags.
- `settings_loader.py` reads different shapes depending on assessment type and legacy/canonical names.
- Some authoring fields, such as `available_from` and `grace_period_minutes`, appear in `settings_json`, but the attempt-state enforcement path primarily reasons over lifecycle, scheduled time, due date, late policy, max attempts, and time limit.

Impact:

- Policy behavior is hard to reason about and easy to regress.
- UI fields can appear saved while having no real enforcement effect.
- API clients need to understand historical aliases rather than one contract.

Needed direction:

- Create one versioned `AssessmentPolicyContract`.
- Store canonical values once.
- Expose derived aliases only in backward-compatible read models, not as write paths.

### 4. Some authoring features are local-only and not production data

Evidence:

- `BuilderCanvasTab.tsx` stores exam sections in browser local storage through `sections:${assessmentUuid}:v1`.
- `QuestionInspectorPanel.tsx` stores difficulty by casting a UI-only `_difficulty` field onto the item object, with a comment saying there is no backend schema yet.

Impact:

- Sections and difficulty disappear across devices and collaborators.
- Analytics and review cannot use difficulty or sections reliably.
- Publish/readiness cannot validate section-level rules or difficulty distribution.

Needed direction:

- Persist sections, item metadata, tags, difficulty, outcomes, estimated time, and review notes in the canonical schema.
- Treat every author-facing setting as either persisted product data or remove it from the UI.

### 5. Autosave is improved but still not a production-grade answer sync engine

Evidence:

- `useAssessmentSubmission.ts` keeps local answers in React state and uses `PATCH /draft` with `If-Match`.
- It throttles saves with a 5 second interval and handles `429` by retrying later.
- It has conflict handling by answer counts and versions, but not a durable operation log.
- `ExamAttemptContent.tsx` also uses a separate `useAssessmentAttempt` local storage recovery layer.

Impact:

- There are two local persistence concepts: server draft state and browser recovery state.
- Conflict resolution is not granular enough for multi-tab, network flaps, or question-level merge.
- The save state can say "dirty" or "error", but learners need confidence that every answer is safely captured.

Needed direction:

- Use a durable answer operation queue with item-level sequence numbers.
- Persist local operations in IndexedDB, not only local storage.
- Batch operations by item, acknowledge server sequence numbers, and show per-question sync status.
- Submit should close over a server-saved snapshot, not a best-effort browser object.

### 6. Attempt lifecycle is not explicit enough for learner trust

Evidence:

- `_build_attempt_state` derives flags such as `can_start`, `can_continue`, `can_submit`, and `disabled_action_reasons` from many conditions.
- Expired drafts become non-editable and rely on frontend auto-submit or the background timer task.
- `assessment_timer.py` now calls the grading pipeline for expired drafts, which is good, but this remains a backup mechanism rather than a visible state model for users.

Impact:

- Learners can see confusing states around expired drafts, ready/not-ready, hidden results, returned revisions, and attempts used.
- Teachers have limited observability into why a learner cannot start or submit.

Needed direction:

- Model attempt states explicitly: `NOT_OPEN`, `READY`, `IN_PROGRESS`, `SYNCING`, `SUBMITTING`, `SUBMITTED`, `NEEDS_REVIEW`, `GRADED_HIDDEN`, `RESULT_VISIBLE`, `RETURNED`, `EXPIRED_LOCKED`, `VOIDED`.
- Return machine-readable reasons and human-readable display guidance from one endpoint.

### 7. Integrity/proctoring is mostly client-side and should be reframed

Evidence:

- `useTestGuard.ts` detects blur, devtools, copy/paste, context menu, and keyboard shortcuts in the browser.
- `useAttemptGuard.ts` counts violations and triggers a countdown auto-submit.
- The grading pipeline can record an integrity auto-submit reason when violation thresholds are exceeded.

Impact:

- Browser-only detection is easy to bypass and can produce false positives.
- The current UI presents "integrity checks are active" strongly, but the implementation is not a true secure proctoring system.
- Institutions need auditability, not just automatic punishment.

Needed direction:

- Reframe this as an "integrity signal" system unless real proctoring is added.
- Persist every violation event with type, timestamp, page visibility state, focus state, user agent, and attempt id.
- Let teachers review integrity events before punitive release decisions.

### 8. Results review is too shallow for real assessment operations

Evidence:

- `ResultsReviewTab.tsx` shows top-level stats, a per-item analytics table, and an "Open review queue" button.
- The bottom cards are explanatory text, not actionable operations.

Impact:

- Teachers cannot triage manual grading, anomalies, weak questions, low discrimination, suspicious attempts, late submissions, accommodations, or grade-release readiness from one place.
- A production LMS needs the assessment owner to move a cohort from submission to review to release without hunting through separate pages.

Needed direction:

- Build an operations dashboard with queue filters, release controls, item health, learner exceptions, integrity flags, and exports.
- Make analytics actionable: "review item", "drop question", "award credit", "release selected", "message learners", "export CSV".

### 9. Publishing is a checklist, not a deployment process

Evidence:

- `PublishDashboardTab.tsx` computes readiness issues and lifecycle transitions.
- It can publish or schedule but does not provide a full diff/preview/deployment model.

Impact:

- Teachers can publish without a strong understanding of what changed, who will see it, which policy is active, and whether existing attempts are affected.
- There is no explicit versioning model for published content versus draft edits.

Needed direction:

- Introduce assessment versions: draft version, published version, scheduled version.
- Publishing should show a diff, learner preview, affected audience, timing window, accommodations, and release implications.
- Published attempts must snapshot item and policy versions.

## Product North Star

The target experience should feel like a serious assessment cockpit, not a collection of forms.

For teachers:

- Create an exam quickly from a question bank, AI-generated draft, imports, or manual items.
- See validity and readiness continuously.
- Preview exactly what a learner will see.
- Manage access, timing, attempts, accommodations, integrity settings, and release policy without ambiguity.
- Review submissions at scale, grade manually where needed, resolve anomalies, and release results confidently.
- Improve question quality from analytics.

For learners:

- Understand start conditions, time, attempts, rules, and result visibility before starting.
- Answer questions in a focused, fast, accessible interface.
- Trust autosave and offline recovery.
- Navigate, flag, review, and submit without surprises.
- See results, feedback, retake/revision options, and attempt history clearly.

For operators/admins:

- Audit assessment lifecycle changes.
- Diagnose sync and submission issues.
- Export reliable data.
- Handle support cases without database spelunking.

## Proposed Information Architecture

### Teacher Studio

Replace current tab pages with a full-width studio shell:

```text
Course header / assessment title / lifecycle / publish state / preview
---------------------------------------------------------------------
Left rail                Main work surface                 Right panel
Structure               Current tool                       Context
- Overview              - Setup dashboard                  - Validation
- Questions             - Question builder                 - Item metadata
- Policy                - Policy matrix                    - Preview
- Access                - Audience manager                 - Version diff
- Results               - Operations dashboard             - Help only when needed
- Publish               - Deployment review
```

The studio should support three density modes:

- `Compact`: tables and side panels for large cohorts.
- `Comfortable`: default authoring.
- `Preview`: learner-view simulation.

### Learner Runtime

Use a test-taking shell separate from content/course reading:

```text
Exam header: title, time, sync state, integrity state, help
Question workspace: prompt and answer controls
Navigation dock: answered, flagged, skipped, invalid, current
Bottom bar: previous, next, save state, submit/review
```

Key behavior:

- One question at a time by default for timed exams.
- Scroll mode only when the policy allows it.
- Flagging, notes, and review screen before submission.
- Per-question save status.
- Offline banner with queued change count and last successful sync.
- Accessible keyboard navigation and screen-reader labels.

### Review and Results

Create a real operations workspace:

- Submission queue with filters: needs grading, flagged, late, integrity events, accommodations, not started, abandoned, expired, returned.
- Split view: learner list on left, submission detail center, grading/integrity/history right.
- Item analytics with actions: inspect distractors, award credit, exclude item, change key, regrade cohort.
- Release center: hidden/visible status, release selected, release all, notify learners, export.

## Target Domain Model

The domain should be versioned and explicit.

Core entities:

- `Assessment`: stable identity, course activity linkage, kind.
- `AssessmentVersion`: title, description, items, sections, total points, authoring metadata.
- `AssessmentItem`: stable item identity, type, points, tags, difficulty, outcomes, estimated time.
- `AssessmentItemVersion`: immutable item body for a published version.
- `AssessmentPolicy`: canonical policy values.
- `AssessmentPolicyVersion`: immutable policy at publish/attempt time.
- `AssessmentAccessPolicy`: audience rules, groups, users, exclusions.
- `StudentOverride`: per-user accommodations for due date, time, attempts, access, late penalty.
- `Attempt`: one learner attempt with explicit lifecycle state.
- `AnswerRevision`: item-level answer operation log with client sequence and server sequence.
- `AttemptEvent`: start, save, submit, expire, auto-submit, reopen, return, release.
- `IntegrityEvent`: focus, copy, paste, fullscreen exit, devtools heuristic, manual flag.
- `Grade`: scores, item feedback, grader identity, rubric decisions, release state.
- `AssessmentAnalyticsSnapshot`: cohort/item metrics for fast dashboard reads.

Important design rules:

- Published content is immutable.
- Attempts point to the exact assessment and policy version they used.
- Draft edits after publishing create a new draft version, not silent mutation of active learner content.
- Every policy field has one canonical storage path.
- Every user-visible authoring setting has backend schema, API contract, tests, and preview support.

## API Contract Plan

### Studio bundle

Add one high-value endpoint for the teacher studio:

```http
GET /assessments/{assessment_uuid}/studio
```

It should return:

- Assessment identity and lifecycle.
- Draft version and published version metadata.
- Items, sections, tags, outcomes, difficulty, points.
- Policy contract.
- Access summary.
- Readiness issues grouped by setup, content, policy, access, publish.
- Results summary if submissions exist.
- Permission flags.

This reduces frontend waterfalls and gives the UI a single source of truth.

### Item operations

Replace broad item patching with explicit operations:

```http
POST /assessments/{uuid}/items
PATCH /assessments/{uuid}/items/{item_uuid}
POST /assessments/{uuid}/items:reorder
POST /assessments/{uuid}/sections
PATCH /assessments/{uuid}/sections/{section_uuid}
POST /assessments/{uuid}/items/{item_uuid}:duplicate
POST /assessments/{uuid}/items:bulk-update
```

Every write should return:

- New `content_version`.
- Updated readiness issue count.
- Updated totals.
- Updated item summary.

### Policy operations

Create a typed policy endpoint:

```http
GET /assessments/{uuid}/policy
PUT /assessments/{uuid}/policy
POST /assessments/{uuid}/policy/overrides
```

Remove duplicate write shapes. The frontend should never write both `time_limit_seconds` and `settings_json.time_limit`.

### Attempt operations

Create an explicit learner state contract:

```http
GET /assessments/{uuid}/attempt-state
POST /assessments/{uuid}/attempts
POST /attempts/{attempt_uuid}/answer-ops
POST /attempts/{attempt_uuid}/submit
POST /attempts/{attempt_uuid}/events
```

Answer sync request:

```json
{
  "client_id": "browser-install-or-session-id",
  "client_sequence": 42,
  "base_server_sequence": 38,
  "ops": [
    {
      "item_uuid": "item_...",
      "operation": "SET_ANSWER",
      "answer": { "kind": "CHOICE", "selected": ["option_a"] },
      "created_at": "2026-05-25T12:00:00Z"
    }
  ]
}
```

Answer sync response:

```json
{
  "server_sequence": 39,
  "accepted_client_sequence": 42,
  "conflicts": [],
  "attempt_state": "IN_PROGRESS",
  "per_item_sync": {
    "item_...": "SAVED"
  }
}
```

Submit should submit the latest server snapshot. If the client has unsynced operations, the UI should flush first. If the timer has expired, the server should close over the latest accepted server snapshot and return a clear `SUBMITTED_AFTER_EXPIRY` result.

## Teacher Studio Redesign

### Overview

The first screen should be an operational overview:

- Readiness score.
- Question count, total points, estimated duration.
- Policy summary.
- Audience summary.
- Publish state.
- Open issues grouped by severity.
- Recent activity and draft/published diff.

### Setup and Policy

Replace the tall centered settings form with grouped policy rows:

- Availability: available from, due date, close date, late policy.
- Attempts: max attempts, cooldown, retake behavior, best/latest/highest score.
- Timing: time limit, grace period, per-student overrides.
- Scoring: pass threshold, partial credit, negative marking, rounding, dropped questions.
- Feedback: result visibility, correct answer visibility, explanation visibility, feedback release time.
- Integrity: signals, thresholds, teacher review behavior, allowed resources.

Use a policy preview panel:

```text
As a learner, this exam opens on ...
They have 50 minutes.
They can attempt it 1 time.
Results are hidden until manually released.
Correct answers are shown after release.
```

### Question Builder

Replace the current small center canvas with a full workbench:

- Left: outline with sections, items, issue badges, drag handles.
- Center: item editor using the full available width.
- Right: collapsible inspector with persisted metadata and live learner preview.
- Top: add question, import, question bank, duplicate, bulk edit, preview.

Question builder features:

- Persisted sections.
- Persisted difficulty.
- Tags/outcomes.
- Estimated time.
- Required/optional flag if supported.
- Item-level points and scoring strategy.
- Explanation and feedback visibility.
- AI assist/import hooks only after the schema is stable.
- Keyboard-first item creation and reordering.

Item types:

- Phase 1: make exams support `CHOICE` and `MATCHING` only, or fully implement `OPEN_TEXT` and `FORM` across runtime/grading.
- Phase 2: add Open Text with rubric and manual grading.
- Phase 3: add file upload, formula/numeric, ordering, hotspot, and question groups if needed.

### Access

The current access page is close in concept but should become operational:

- Full-width searchable table with selected/current/effective columns.
- Group expansion to show members.
- Exclusions as first-class rules.
- Student overrides side panel.
- Warnings for learners with no access, expired access, or conflicting rules.
- Save bar only when there are unsaved changes.

### Publish

Publishing should be a deploy flow:

1. Readiness.
2. Audience.
3. Policy summary.
4. Learner preview.
5. Draft versus published diff.
6. Confirm publish/schedule.

Required checks:

- At least one gradable item.
- Every item supported by runtime and grader.
- Total points valid.
- Policy valid.
- Access not empty.
- Due/available/schedule dates coherent.
- Result release policy coherent.
- Existing attempts impact explained if republishing.

## Learner Runtime Redesign

### Entry Screen

Before starting, show:

- Title and description.
- Availability/due/close.
- Time limit and attempts.
- Score needed to pass.
- Feedback/result visibility.
- Integrity expectations.
- Attempt history.
- Clear blocked reason if unavailable.

Do not show contradictory states such as "test is not ready" to teachers in preview without a direct "Fix in studio" action.

### During Attempt

Core layout:

- Header: timer, saved/syncing/offline, integrity state, submit availability.
- Question: prompt, answer controls, points, flag.
- Navigation: map with answered/unanswered/flagged/invalid.
- Footer: previous, next, review, submit.

Required runtime features:

- Question flagging persisted server-side.
- Mark for review.
- Keyboard shortcuts that do not conflict with input fields.
- Accessible error messages for invalid answers.
- Mobile layout that does not rely on tiny side navigation.
- No layout shift when timer/save state changes.
- Pause/resume only if policy supports it.

### Autosave and Recovery

Implement a real sync engine:

- Store pending answer operations in IndexedDB.
- Send operations with client sequence numbers.
- Server stores accepted sequence per attempt/client.
- UI shows per-item save status.
- Offline mode queues operations and prevents final submit until sync is resolved, unless the timer expires, in which case the server snapshot is submitted.
- Conflict UI compares item-by-item, not only answer counts.

### Timer and Expiry

Timer should be server-authoritative:

- Attempt start returns `timer_expires_at`.
- Client displays countdown from server time offset.
- Expiry locks editing immediately.
- Client sends final flush if possible.
- Server auto-submit is backup and uses the grading pipeline.
- Expiry result tells learner what happened: submitted automatically, saved snapshot time, pending review/release state.

## Grading, Review, and Release

### Grading Model

Support these grading modes:

- Auto-graded.
- Manual review required.
- Mixed auto/manual.
- Regrade required after item/policy change.
- Returned for revision.

Item grading should produce:

- Raw score.
- Max score.
- Correctness if applicable.
- Feedback.
- Correct answer snapshot if visibility allows.
- Manual-review reason.

### Review Queue

Build a single queue for:

- Needs manual grading.
- Integrity flagged.
- Late.
- Auto-submit.
- Low confidence.
- Returned.
- Regrade needed.
- Accommodation applied.

Review detail should show:

- Learner identity.
- Attempt timeline.
- Answers and item snapshots.
- Score and rubric.
- Integrity event timeline.
- Save/submit history.
- Teacher notes.
- Release state.

### Release Control

Release center should support:

- Release all graded.
- Release selected.
- Hold flagged attempts.
- Return selected for revision.
- Publish feedback without correct answers.
- Publish correct answers later.
- Notify learners.
- Export gradebook CSV.

## Analytics and Quality

The results tab should become a question-quality dashboard:

- Response count.
- Average score.
- Correct percent.
- Discrimination index.
- Distractor analysis for choices.
- Omitted/skipped rate.
- Time per question if captured.
- Manual grading load.
- Integrity flags by item/attempt.
- Cohort distribution.
- At-risk learner list.

Actions from analytics:

- Inspect question.
- Edit draft version.
- Drop question from scoring.
- Award credit to everyone.
- Regrade cohort.
- Export item analysis.

## Data Migration Strategy

Phase the migration to avoid breaking active courses:

1. Add new nullable columns/tables for versions, sections, metadata, answer ops, attempt events, integrity events.
2. Backfill from current `Assessment`, `AssessmentItem`, `AssessmentPolicy`, and `Submission` rows.
3. Keep read adapters for old data.
4. Switch studio writes to new contracts.
5. Switch learner runtime to attempt-state and answer-op endpoints.
6. Make old write paths read-only.
7. Remove duplicate settings aliases after compatibility window.

Migration invariants:

- Existing submissions keep their original item and policy snapshots.
- Existing grades remain visible.
- Draft assessments remain editable.
- Published assessments get a published version.
- Local-only sections/difficulty cannot be recovered automatically; expose a one-time warning if needed.

## Implementation Phases

### Phase 0: Stop the bleeding

Goal: eliminate contradictions before redesign.

Tasks:

- Remove `OPEN_TEXT` and `FORM` from exam authoring unless runtime/grading support is implemented immediately.
- Persist or remove section headers.
- Persist or remove difficulty.
- Add readiness issue when an exam contains unsupported item kinds.
- Add tests proving every allowed exam item kind renders in learner runtime and is graded/reviewable.
- Audit policy fields and document which are currently enforced.

Acceptance criteria:

- A teacher cannot publish an exam with an item type that learners cannot answer.
- Publish readiness catches unsupported or ungradable content.
- No authoring control claims to save data that is only local browser state.

### Phase 1: Canonical contracts

Goal: define one source of truth.

Tasks:

- Create `AssessmentStudioBundle` contract.
- Create canonical `AssessmentPolicyContract`.
- Add persisted item metadata: section, difficulty, tags, outcomes, estimated time.
- Create explicit `AttemptState` contract.
- Add attempt event and integrity event tables.
- Add backend contract tests and generated frontend types.

Acceptance criteria:

- Studio loads from one bundle endpoint.
- Policy writes use one schema.
- Attempt UI renders only from `AttemptState`.
- OpenAPI schema has no duplicate policy aliases for new writes.

### Phase 2: Teacher studio workbench

Goal: redesign the authoring experience.

Tasks:

- Build full-width studio shell.
- Rebuild setup as policy dashboard plus policy preview.
- Rebuild builder as outline, canvas, inspector, and preview.
- Build persisted sections and item metadata.
- Add bulk edit and import-ready item APIs.
- Improve access manager with tables, groups, exclusions, and overrides.
- Rebuild publish as a deployment review flow.

Acceptance criteria:

- 1440px and 2560px screens use space intentionally.
- Teacher can edit long prompts/options without cramped layouts.
- Every publish issue has a direct fix action.
- Preview matches learner runtime exactly.

### Phase 3: Learner runtime and sync engine

Goal: make exam taking reliable and calm.

Tasks:

- Build test-taking shell separate from generic content reading.
- Implement answer operation queue with IndexedDB.
- Add per-item sync status.
- Add server sequence acknowledgements.
- Implement item-by-item conflict resolution.
- Persist flags/review marks.
- Rework timer expiry around server snapshot submission.
- Improve mobile runtime.

Acceptance criteria:

- Network loss does not lose answers.
- Reload after offline edits recovers queued operations.
- Timer expiry submits the last server-accepted snapshot.
- Learner always sees whether answers are saved, queued, or blocked.

### Phase 4: Grading operations and release

Goal: make results management production ready.

Tasks:

- Build review queue filters.
- Add item-level manual grading and rubric support.
- Add integrity event review.
- Add release center.
- Add cohort regrade operations.
- Add gradebook integration checks.
- Add exports.

Acceptance criteria:

- Teacher can move a whole exam from submissions to released grades from one workspace.
- Manual and auto-graded items coexist in one submission.
- Result visibility matches policy exactly.
- Released grades match gradebook entries.

### Phase 5: Analytics and continuous improvement

Goal: make tests better over time.

Tasks:

- Create analytics rollups.
- Add distractor analysis.
- Add discrimination and difficulty health.
- Add item action workflows: drop, award credit, regrade.
- Add learner outcome reports.
- Add exportable audit reports.

Acceptance criteria:

- Teachers can identify weak questions without external spreadsheets.
- Scoring changes are audited and explainable.
- Analytics load quickly for large cohorts.

### Phase 6: Hardening

Goal: production readiness.

Tasks:

- Add Playwright coverage for teacher and learner flows.
- Add backend integration tests for lifecycle, autosave, expiry, review, release, regrade.
- Add accessibility tests for keyboard and screen reader behavior.
- Add load tests for autosave and submission spikes.
- Add observability dashboards for save failures, submit failures, timer worker actions, grading latency, and conflict rates.
- Add support tooling to inspect an attempt timeline.

Acceptance criteria:

- No untested core path remains for start, save, submit, auto-submit, grade, release.
- Support can diagnose a disputed attempt from the UI or admin tooling.
- The feature is safe under realistic exam-day traffic.

## Testing Plan

Backend tests:

- Allowed item kind matrix per assessment type.
- Policy contract validation.
- Attempt-state transitions.
- Answer op idempotency and ordering.
- Offline replay conflict handling.
- Timer expiry and server auto-submit.
- Manual grading and release.
- Regrade after answer key or dropped item.
- Student overrides.
- Integrity event persistence.

Frontend tests:

- Studio bundle rendering.
- Builder item CRUD, reorder, sections, metadata.
- Publish readiness fix navigation.
- Learner start, answer, flag, review, submit.
- Offline queue and recovery.
- Conflict resolution.
- Timer expiry UX.
- Results visibility rules.
- Mobile navigation.

E2E tests:

- Teacher creates exam, publishes, learner completes, teacher reviews, releases.
- Learner goes offline mid-exam and resumes.
- Timer expires with unsynced local edits.
- Teacher adds an accommodation.
- Teacher drops a bad question and regrades cohort.

## UX Acceptance Checklist

Teacher studio:

- Uses wide screens without empty dead zones.
- Presents dense operational data without visual clutter.
- Every warning has a fix path.
- Every saved setting survives reload and collaboration.
- Preview is exact.

Learner runtime:

- Clear start rules.
- Clear timer.
- Clear sync state.
- Clear navigation.
- Clear submit confirmation.
- Clear result/release state.
- Accessible on keyboard and mobile.

Operations:

- Review queue is actionable.
- Release is controlled and auditable.
- Analytics are actionable.
- Support timeline exists.

## Recommended Immediate Next Steps

1. Decide the Phase 0 item matrix: either limit exams to `CHOICE` and `MATCHING`, or fully implement `OPEN_TEXT` and `FORM` for runtime and grading.
2. Create `AssessmentPolicyContract` and stop adding new writes to `settings_json` aliases.
3. Replace local-only sections and difficulty with persisted schema fields.
4. Design the new full-width studio shell before writing more feature-specific UI.
5. Build the attempt-state and answer-op contracts before further learner runtime polish.

## Final Position

The current implementation is a useful prototype with pieces of a strong architecture, but it is not yet a production LMS exam system. The highest-risk issue is not a single bug; it is inconsistency between what the teacher can build, what the learner can take, what the grader can score, and what the review screens can operationalize.

The rewrite should prioritize trust: the same canonical assessment version, policy version, item matrix, attempt state, and grading state must drive every surface. Once that foundation is stable, the UI can become modern, spacious, dense where needed, and genuinely next-generation.
