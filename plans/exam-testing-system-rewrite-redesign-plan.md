# Exam and Testing System Rewrite + Redesign Plan

Current as of 2026-06-18.

## Design Read

Reading this as an instructor-facing LMS assessment builder and review system. The target product language is a high-trust teaching cockpit: fast, dense, calm, operational, and explicit about readiness, access, grading, learner impact, and publish risk.

Dial settings:

- `DESIGN_VARIANCE: 5`: distinctive and polished, but not experimental. This is repeated daily work for teachers and instructors.
- `MOTION_INTENSITY: 3`: motion explains saving, validation, transitions, drag, publish, and review state. No decorative motion.
- `VISUAL_DENSITY: 8`: instructors need structure, status, counts, errors, selected learners, rubric signals, and next actions visible without hunting through tabs.

Primary stack assumptions:

- Next.js 16, React 19, App Router.
- Existing shadcn/Base UI primitives and semantic Tailwind tokens.
- TanStack Query for client data.
- Existing assessment services in `apps/api/src/services/assessments`.
- Existing item/domain types in `apps/web/src/features/assessments/domain`.

## Executive Verdict

The current exam/testing implementation is not a throwaway prototype. It already has useful primitives: a unified assessment model, lifecycle state, readiness API, access allowlists, item analytics, review queue entry points, item body schemas, and course-workspace embedding.

The product experience is still not production-grade for teachers. The UI is incoherent because it exposes implementation fragments as separate tabs instead of guiding an instructor through real jobs:

- define the assessment purpose
- build a valid question set
- align points, difficulty, outcomes, and sections
- choose who can take it
- configure timing, attempts, review visibility, and integrity settings
- preview as a student
- fix blockers
- publish or schedule with confidence
- monitor submissions
- grade, return, and release results
- improve weak questions after learners submit

The core redesign should not be "make the cards prettier." It should rebuild assessment authoring around workflow, confidence, and operational control.

## Evidence Reviewed

Screenshots:

- `C:/Users/bmk/AppData/Local/Temp/codex-clipboard-acdc56e0-b7f6-47c0-9600-10e4bd5b4148.png`
- `C:/Users/bmk/AppData/Local/Temp/codex-clipboard-d41692ea-c474-431e-b88a-1d2b7eefee86.png`
- `C:/Users/bmk/AppData/Local/Temp/codex-clipboard-2c0b170d-7eb3-4787-a693-ce4884a4d6ff.png`
- `C:/Users/bmk/AppData/Local/Temp/codex-clipboard-eae3735a-87b8-4f01-be91-1b1e246a9460.png`
- `C:/Users/bmk/AppData/Local/Temp/codex-clipboard-7c02b66c-86c6-4ad9-b105-64eeb064835a.png`
- `C:/Users/bmk/AppData/Local/Temp/codex-clipboard-b90f017b-1bc1-4312-a6bb-21bc10bd14f4.png`

Frontend code:

- `apps/web/src/app/[locale]/(platform)/dash/courses/[courseuuid]/activity/[activityid]/studio/page.tsx`
- `apps/web/src/features/assessments/studio/AssessmentStudioWorkspace.tsx`
- `apps/web/src/features/assessments/studio/context.tsx`
- `apps/web/src/features/assessments/studio/components/NativeItemAuthor.tsx`
- `apps/web/src/features/assessments/studio/tabs/GeneralSettingsTab.tsx`
- `apps/web/src/features/assessments/studio/tabs/BuilderCanvasTab.tsx`
- `apps/web/src/features/assessments/studio/tabs/QuestionInspectorPanel.tsx`
- `apps/web/src/features/assessments/studio/tabs/AccessManagementTab.tsx`
- `apps/web/src/features/assessments/studio/tabs/ResultsReviewTab.tsx`
- `apps/web/src/features/assessments/studio/tabs/PublishDashboardTab.tsx`
- `apps/web/src/features/assessments/studio/components/NativeItemBodyEditor.tsx`
- `apps/web/src/features/assessments/studio/utils.ts`
- `apps/web/src/features/assessments/domain/readiness.ts`
- `apps/web/src/features/assessments/domain/items.ts`
- `apps/web/src/features/assessments/registry/exam.tsx`

Backend code:

- `apps/api/src/services/assessments/assessment_crud.py`
- `apps/api/src/services/assessments/access_service.py`
- `apps/api/src/services/assessments/review_service.py`
- `apps/api/src/services/assessments/settings.py`
- `apps/api/src/services/assessments/policy_service.py`
- `apps/api/src/services/assessments/_shared.py`

Guidelines:

- Local `docs/DESIGN_GUIDELINES.md`
- Local `docs/ShadCN UI Design System Guide.md`
- Latest Vercel Web Interface Guidelines fetched from `https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md`

## What Is Already Worth Keeping

### Unified Studio Routing

The activity studio route already embeds assessment authoring inside the course workspace through `renderCourseWorkspacePage`. Keep this. Instructors should not lose course context when editing a test.

### Kind Registry

`apps/web/src/features/assessments/registry/exam.tsx` loads kind-specific authoring, attempt, and review modules. This is a good seam. The rewrite should keep the registry, but make the authoring contract more explicit and less tab-specific.

### Assessment Context

`NativeItemStudioProvider` centralizes assessment, items, selected item, total points, lifecycle editability, refresh, and readiness issues. This is the right direction. It should evolve into a stronger assessment-workspace store with selectors, dirty state, optimistic operations, conflict detection, and URL state.

### Readiness API

Backend readiness already blocks publish and returns structured issue codes. Frontend `classifyValidationIssue` maps issue codes into areas and fields. Keep this and expand it into a first-class readiness model.

### Access Is Course-Scoped

`access_service.py` correctly narrows assessment access to users/groups already connected to the parent course. This is a strong safety invariant.

### Review and Analytics Primitives

`review_service.py` already exposes submission stats, score distribution, item analytics, discrimination index, review queues, grading, grade publication, and policy overrides. The UI does not yet expose this power well, but the backend foundation is useful.

### Lifecycle Locking

`assessment_crud.py` prevents scoring-field changes on published assessments with active submissions. That is essential for trust and auditability.

## Critical Findings

### 1. The Current IA Is Built Around Tabs, Not Instructor Jobs

Evidence:

- `NativeItemAuthor` hardcodes five tabs: setup, builder, access, results, publish.
- Screenshots show instructors moving across isolated horizontal tabs with little cross-tab context.
- Readiness problems live in the builder outline and publish tab, but not as a persistent work queue.

Impact:

- Teachers have to remember which tab controls which consequence.
- Publishing feels like a final screen rather than a continuous readiness state.
- Access, timing, integrity, and result visibility are disconnected even though they define one learner-facing policy.

Redesign decision:

- Replace the flat tab model with a guided workspace:
  - `Build`: questions, sections, item quality, points, outcomes.
  - `Policy`: timing, attempts, grading, review release, integrity.
  - `Audience`: course learners, groups, accommodations, exceptions.
  - `Preview`: student simulation and edge cases.
  - `Operate`: submissions, review, grade release, item analytics.
  - `Publish`: final readiness gate and schedule.
- Keep URL state, but model it as workspace view plus selected item plus selected issue.

### 2. The Visual Layout Wastes Space While Hiding Important State

Evidence:

- Setup screenshots show a narrow centered column with large unused horizontal space.
- Builder view has a left outline, central editor, and inspector, but the center column is too narrow for serious authoring.
- Access view uses columns, but no dense selection summary or bulk operations.
- Results view shows empty metrics and generic panels with little operational depth.

Impact:

- Large monitors do not help instructors work faster.
- Validation, save state, preview, selected learner count, and publish blockers are not persistently available.
- Teachers do not get a cockpit view of "what is wrong, who is affected, and what happens next."

Redesign decision:

- Use a true three-lane desktop layout:

```txt
+----------------------+---------------------------------------------+---------------------------+
| Assessment Navigator | Active Workspace                            | Readiness / Inspector     |
|                      |                                             |                           |
| sections/questions   | question editor, policy editor, access grid | blockers, save, preview   |
| issue queue          | results review, analytics, grading          | student impact, actions   |
| totals/coverage      |                                             | audit/lifecycle           |
+----------------------+---------------------------------------------+---------------------------+
```

- The right rail is always meaningful:
  - readiness blockers
  - current save state
  - selected question settings
  - learner impact summary
  - publish/release next action
- Avoid page sections that are just card stacks. Use dense panels, split panes, tables, and sticky rails.

### 3. Readiness Is Too Shallow For A Production Exam Workflow

Evidence:

- Backend readiness checks title, supported item kind, prompt, choices, points, and basic policy validity.
- Publish tab displays blockers, but no severity, owner, auto-fix, effect, or grouped remediation path.
- Setup only highlights a few fields via `hasIssue`.

Missing readiness categories:

- no schedule consistency beyond simple future schedule
- no access sanity checks, such as restricted audience with zero effective learners
- no result visibility warnings, such as showing correct answers before all attempts close
- no proctoring/integrity compatibility checks
- no item distribution warnings, such as all questions same difficulty
- no point imbalance warnings
- no outcome or tag coverage checks
- no language/locale completeness checks
- no preview-required gate
- no grading/review release policy sanity
- no accommodations/override summary

Impact:

- Teachers can publish tests that are technically valid but pedagogically weak or operationally risky.
- Publish readiness is not enough to support institutional trust.

Redesign decision:

- Split readiness into:
  - `blockers`: cannot publish
  - `warnings`: publish allowed, but risky
  - `advice`: quality improvement suggestions
  - `audit`: immutable facts for later review
- Every readiness issue needs:
  - stable `code`
  - severity
  - affected object
  - target route/view
  - suggested fix
  - optional auto-fix action
  - "why this matters" copy

### 4. Autosave Exists, But Trust Around Saving Is Weak

Evidence:

- `NativeItemAuthor` uses debounced autosave for assessment and item state.
- `handleReorder` catches reorder errors and intentionally swallows them.
- There is no beforeunload guard for dirty changes.
- Save failures appear as toasts, which are easy to miss.
- Access save is manual and shows a toast error "failed to save access" without inline recovery.

Impact:

- Teachers cannot confidently know which changes are saved.
- Drag reorder can visually persist even if server sync fails.
- A failed autosave can leave an assessment looking valid when it is not persisted.

Redesign decision:

- Build a global `AssessmentSaveLedger`:
  - per-section dirty state
  - current save operation
  - last saved time
  - retry queue
  - conflict/version state
  - offline or network degraded state
- Do not silently swallow reorder failure. Roll back or show a persistent inline recovery banner.
- Add route/browser navigation guard when any critical save is dirty or failed.
- Move save errors from toast-only to inline rail state with retry.

### 5. Policy Data Has Multiple Sources Of Truth

Evidence:

- `studioTypes.ts` includes fields such as `randomizeQuestions`, `randomizeOptions`, `partialCredit`, `gracePeriodMinutes`, `availableFrom`, and `negativeMarkingPercent`.
- `buildAssessmentPatch` writes policy fields into both `anti_cheat_json` and `settings_json`.
- `settings.py` defines `ExamAssessmentSettings` with `shuffle_questions`, `shuffle_answers`, `question_limit`, `access_mode`, `whitelist_user_ids`, and lifecycle fields.
- `policy_service.py` and `review_service.py` each define policy presets with slightly different defaults and completion rules.

Impact:

- Feature behavior can drift between activity settings, assessment policy, and frontend state.
- Teachers may set a value that is not honored consistently in attempt runtime, readiness, analytics, or old settings endpoints.
- New UI work will become brittle unless the policy contract is normalized.

Redesign decision:

- Create one canonical assessment policy contract per kind:
  - authoring policy
  - attempt runtime policy
  - review/release policy
  - integrity policy
  - access policy
  - accommodations/overrides
- Deprecate duplicate activity settings paths or make them projections of the canonical policy.
- Generate frontend types from the canonical OpenAPI schema.
- Add migration tests that prove legacy settings map into canonical policy.

### 6. The Builder Lacks Serious Assessment Design Tools

Evidence:

- The builder supports item creation, reorder, duplicate, delete, title, points, prompt, options, and a small inspector.
- Exam module limits authoring to `CHOICE` and `MATCHING`.
- Metadata supports `difficulty`, `tags`, `outcome_ids`, and `estimated_minutes`, but UI exposes only difficulty.
- There is no item bank, import, bulk edit, blueprint, learning outcome mapping, random question pools, section time budgets, or item-level analytics feedback in the editor.

Impact:

- Teachers who build real exams cannot efficiently reuse, balance, tag, or audit questions.
- Quality work happens manually outside the LMS.
- Instructors cannot see coverage or risk while authoring.

Redesign decision:

- Add an assessment blueprint layer:
  - sections
  - target points
  - target difficulty mix
  - outcome coverage
  - item tags
  - estimated time
  - question pools
  - random draw rules
- Add item-bank workflows:
  - browse/import from course bank
  - duplicate from previous assessment
  - bulk tag
  - bulk point edit
  - bulk difficulty edit
  - detect duplicates
  - flag ambiguous options
- Expose all metadata already present in the domain model.

### 7. The Inspector Is Too Narrow And Duplicates Important Fields

Evidence:

- Points can be edited in both central item metadata and right inspector.
- Difficulty only exists in the inspector.
- Explanation lives in a narrow right panel with a full markdown editor, which is cramped.

Impact:

- Teachers do not know which panel is primary.
- Important fields feel secondary because they are hidden in a narrow rail.
- Editing explanations in a 256px panel is uncomfortable.

Redesign decision:

- Use the inspector for contextual summaries and quick toggles.
- Move long-form fields such as explanation, rubric, and feedback into the main canvas.
- Keep the inspector for:
  - points quick edit
  - difficulty
  - tags
  - outcomes
  - estimated time
  - validation
  - item analytics after publishing
  - linked submissions affected by edits

### 8. Access Management Is Not Teacher-Friendly At Scale

Evidence:

- Access loads all eligible users and groups client-side.
- Lists are not virtualized.
- Search is local.
- There is no select all visible, bulk include/exclude, group expansion, "why is this learner eligible", or effective audience preview before save.
- `effectiveLocalCount` does not account for newly selected group members before saving.
- The screenshot shows a failed save toast, but no inline diagnosis.

Impact:

- Large classes will become slow and difficult to manage.
- Teachers cannot confidently verify who will receive the test.
- Access save failures are hard to recover from.

Redesign decision:

- Replace access lists with an audience builder:
  - server-side search and pagination
  - virtualized lists
  - selected audience drawer
  - effective audience preview
  - group expansion
  - conflicts and duplicates explained
  - bulk operations
  - CSV import for exceptions
  - accommodations/exceptions in the same workflow
- Show "58 eligible, 31 selected, 2 exceptions, 1 excluded" as a persistent summary.

### 9. Integrity And Proctoring Copy Overpromises

Evidence:

- UI labels a state as "secure proctoring" when enabled controls are copy/paste, tab switch, devtools detection, right click disable, and fullscreen enforcement.
- These browser-side controls are deterrents, not real proctoring.

Impact:

- Institutions may overtrust the security model.
- Teachers may publish high-stakes exams with false confidence.
- Students may experience intrusive restrictions without clear policy or recovery.

Redesign decision:

- Rename this area to "Integrity Controls" unless real proctoring exists.
- Add explicit strength levels:
  - low: honor code and attempt tracking
  - medium: browser deterrents and violation logging
  - high: supervised/proctored session, if implemented
- Show limitations and learner impact.
- Add a violation policy:
  - record only
  - warn learner
  - require teacher review
  - auto-submit after threshold
- Add accessibility exceptions for fullscreen, paste, assistive tech, and language tools.

### 10. Results Review Is Too Passive

Evidence:

- Results tab shows metrics, a chart only when data exists, item analytics, and generic guidance panels.
- The primary action is "Open review queue."
- There is no integrated queue, filtering, release workflow, batch actions, or item-quality action loop in the tab itself.

Impact:

- Teachers must leave the assessment cockpit to do the most important post-submission work.
- Results do not drive improvements to questions or grading.

Redesign decision:

- Turn results into `Operate`:
  - live submission queue
  - needs grading
  - late submissions
  - returned attempts
  - grade release status
  - item analytics
  - suspicious integrity events
  - accommodations used
  - batch publish/unpublish grades
  - export
  - regrade affected submissions after item correction
- Keep a full grading route for deep review, but make the assessment page operational.

### 11. Accessibility And Interaction Details Need A Full Pass

Evidence:

- Some icon buttons rely on `title` rather than `aria-label`.
- Drag-and-drop has keyboard sensors, but assessment builder does not appear to provide a full keyboard reorder alternative in visible UI.
- Many state changes rely on toasts.
- Lists can grow beyond 50 items without virtualization.
- Stateful panels use query params for tabs, but selected item and issue focus are not deeply linkable.

Impact:

- Keyboard and screen reader users will struggle.
- Teachers can lose context after refresh or shared links.
- Large cohorts degrade performance.

Redesign decision:

- Apply the Web Interface Guidelines across every assessment surface:
  - icon-only buttons require accessible labels
  - async save and validation status use `aria-live="polite"`
  - long lists virtualize
  - destructive delete requires confirmation or undo
  - focus first invalid field when navigating from readiness issue
  - selected item, selected issue, active view, filters, and review queue state live in URL
  - mobile panels have clear focus management

## Target Product Model

### Core Objects

The rewrite should make these objects explicit in frontend and backend contracts:

- `Assessment`: title, description, kind, lifecycle, course context, content version.
- `AssessmentBlueprint`: sections, outcomes, tags, difficulty mix, target time, target points.
- `AssessmentItem`: prompt, answer model, scoring model, feedback, explanation, metadata, analytics.
- `AssessmentPolicy`: timing, attempts, grading, review release, late behavior, integrity.
- `AssessmentAudience`: course learners, groups, selected users, exclusions, exceptions.
- `AssessmentReadiness`: blockers, warnings, advice, audit facts.
- `AssessmentPreview`: student-facing simulation with policy and audience state.
- `AssessmentOperation`: submissions, grading, release, regrade, analytics, exports.
- `AssessmentAudit`: lifecycle transitions, content version changes, policy changes, access changes, grade release.

### Instructor Jobs To Be Done

The redesign must optimize these jobs:

1. Create a test quickly from a course unit.
2. Reuse or import questions from prior materials.
3. Balance points, difficulty, outcomes, and estimated time.
4. Make access decisions for a class, subgroup, or individual exceptions.
5. Understand what students will see before publishing.
6. Fix blockers without guessing where they live.
7. Publish or schedule with confidence.
8. Monitor submissions and integrity events.
9. Grade efficiently and consistently.
10. Release results at the right time.
11. Improve weak questions after seeing analytics.
12. Keep an audit trail for institutional accountability.

## Target UX Architecture

### Desktop Layout

Use one assessment cockpit shell, not disconnected tab pages:

```txt
+--------------------------+-----------------------------------------------+----------------------------+
| Course + Assessment Rail | Active Work Area                              | Readiness + Inspector      |
|                          |                                               |                            |
| Status                   | Build questions                               | Save state                 |
| Sections                 | Edit policy                                   | Blockers and warnings      |
| Questions                | Manage audience                               | Selected object properties |
| Issues                   | Preview as student                            | Student impact             |
| Coverage                 | Operate results                               | Publish actions            |
+--------------------------+-----------------------------------------------+----------------------------+
```

Rules:

- The assessment title, lifecycle, publish readiness, preview, and save state are always visible.
- The left rail switches between outline, issue queue, and coverage.
- The main area owns real work.
- The right rail owns state, validation, selected-object details, and next actions.
- Publish is not a separate mystery screen. It is a readiness-controlled action from the rail and a final confirmation view.

### Mobile Layout

Use staged views:

1. Assessment overview.
2. Build.
3. Policy.
4. Audience.
5. Preview.
6. Operate.

Rules:

- Do not cram three panes into mobile.
- Keep primary action and save status sticky.
- Use bottom sheet for selected item inspector.
- Keep keyboard interactions usable for long prompts and options.

### Workspace Views

#### Overview

Purpose: answer "is this assessment ready and what needs attention?"

Must show:

- lifecycle
- readiness score
- blockers/warnings/advice
- total questions
- total points
- estimated duration
- audience count
- attempts/time policy
- integrity level
- result release mode
- recent changes
- next recommended action

#### Build

Purpose: create and improve questions.

Must show:

- sectioned question outline
- add/import/bulk actions
- selected question editor
- validation inline and in rail
- point/difficulty/outcome coverage
- student preview for selected question
- item analytics when submissions exist
- locked-state messaging for published assessments

#### Policy

Purpose: configure learner-facing rules.

Group by consequence, not by database field:

- Availability: available from, due, late behavior, grace.
- Attempts and timing: max attempts, time limit, resume rules.
- Scoring: pass threshold, partial credit, negative marking, completion rule.
- Review visibility: score, answers, explanations, feedback, release timing.
- Integrity: deterrents, violation policy, exceptions.

#### Audience

Purpose: decide who can take the assessment and who has exceptions.

Must show:

- course eligible population
- selected groups/users
- effective learner count
- excluded users
- accommodations and policy overrides
- search, filters, bulk actions
- save preview

#### Preview

Purpose: verify the learner experience before publishing.

Must support:

- preview as generic student
- preview as specific selected student
- preview with restricted access
- preview with accommodation
- preview first attempt, retake, late attempt, expired timer
- show what results page will reveal

#### Operate

Purpose: manage live and completed assessments.

Must show:

- submission status table
- needs review queue
- auto-graded vs manual items
- late and integrity flags
- batch publish grades
- return for revision
- regrade after correction
- item analytics
- exports

## Target Visual System

This should feel like a serious LMS operations tool, not a landing page.

Direction:

- Base: semantic `bg-background`, `bg-card`, `bg-muted`, `text-foreground`, `text-muted-foreground`, `border-border`.
- Accent: one primary blue already used by the product, plus semantic warning/success/destructive states.
- Radius: 6 to 8 px for controls and panels. Avoid large pill/card styling except compact status chips.
- Typography: compact, high-legibility UI type. Use tabular numerals for counts, points, percentages, time, and scores.
- Density: more information per screen, but grouped by task and consequence.
- Motion: 150 to 250 ms for pane transitions, save state, validation focus, drag reorder, and publish confirmation.
- Icons: functional only. No decorative icons.
- Cards: use for repeated items or bounded panels, not for every section stacked down a centered page.

Copy principles:

- Use teacher tasks as labels:
  - "Fix 2 Blockers"
  - "Preview As Student"
  - "Release Grades"
  - "Add From Item Bank"
  - "Review 12 Submissions"
  - "Apply Accommodation"
- Error messages must include a next step:
  - Bad: "Failed to save access."
  - Good: "Access was not saved. Check whether selected learners still have course access, then retry."
- Do not claim secure proctoring unless real proctoring exists.

## Target Technical Architecture

### Frontend Component Model

Replace the tab-owned implementation with a workspace composition:

```tsx
<AssessmentWorkspace.Provider assessmentUuid={assessmentUuid} activityUuid={activityUuid}>
  <AssessmentWorkspace.Shell>
    <AssessmentWorkspace.TopBar />
    <AssessmentWorkspace.Navigator />
    <AssessmentWorkspace.Main />
    <AssessmentWorkspace.Rail />
  </AssessmentWorkspace.Shell>
</AssessmentWorkspace.Provider>
```

Suggested target components:

- `AssessmentWorkspaceProvider`
- `AssessmentWorkspaceShell`
- `AssessmentTopBar`
- `AssessmentNavigator`
- `AssessmentReadinessRail`
- `AssessmentOverviewView`
- `QuestionBuildView`
- `QuestionEditorCanvas`
- `QuestionOutline`
- `QuestionInspector`
- `AssessmentPolicyView`
- `AudienceBuilderView`
- `StudentPreviewView`
- `AssessmentOperateView`
- `PublishConfirmationDialog`

Provider responsibilities:

- assessment detail
- item list
- selected item
- selected issue
- active workspace view
- save ledger
- readiness
- audience summary
- lifecycle actions
- lock status
- user permissions

Use selector hooks so token/editor changes do not rerender the whole workspace.

### Data Contracts

Create canonical contracts:

- `AssessmentStudioRead`
- `AssessmentPolicyRead`
- `AssessmentPolicyUpdate`
- `AssessmentAudienceRead`
- `AssessmentAudienceUpdate`
- `AssessmentReadinessRead`
- `AssessmentPreviewRead`
- `AssessmentOperationSummary`
- `AssessmentItemAnalyticsRead`
- `AssessmentAuditEventRead`

Rules:

- Frontend should not need to reconstruct policy from `settings_json`, `anti_cheat_json`, and activity settings.
- API should return derived summaries needed by the UI:
  - effective learner count
  - selected group member count
  - readiness grouped by severity
  - lock status and editable fields
  - publish impact summary
  - grade release status

### Backend Consolidation

Refactor policy/settings in this order:

1. Decide canonical storage fields in `AssessmentPolicy` and `AssessmentAccessPolicy`.
2. Make `activity.settings` a compatibility projection, not an independent authoring source.
3. Merge duplicate policy preset definitions from `policy_service.py` and `review_service.py`.
4. Add an adapter that reads legacy fields and emits the canonical policy.
5. Update OpenAPI and generated frontend types.
6. Add contract tests for every field visible in the new UI.

### Save and Versioning

Add:

- `content_version` or ETag use on every item/policy update.
- optimistic mutation with rollback for reorder.
- conflict response that names the changed fields.
- draft save queue in frontend.
- persistent save rail.
- undo for destructive actions where possible.

Rules:

- Toasts are secondary. Critical save state must be inline.
- Reorder failures must roll back or show a blocking recovery state.
- Published locked assessments must show which fields are editable before the teacher tries to edit.

### Readiness Engine

Backend should become source of truth for publish readiness. Frontend local validation can provide fast feedback, but cannot be the final gate.

Readiness issue shape:

```ts
type AssessmentReadinessIssue = {
  code: string
  severity: "blocker" | "warning" | "advice" | "audit"
  area: "metadata" | "items" | "policy" | "audience" | "integrity" | "preview" | "results"
  message: string
  why?: string
  itemUuid?: string
  field?: string
  view: "overview" | "build" | "policy" | "audience" | "preview" | "operate"
  actionLabel?: string
  autoFix?: {
    id: string
    label: string
  }
}
```

### Performance

Assessment authoring can involve hundreds of items and large cohorts. Design for that now.

Requirements:

- virtualize question outline over 100 items
- virtualize audience lists over 50 rows
- server-side search and pagination for learners/groups
- dynamically import heavy markdown/editor surfaces
- keep workspace shell static where possible
- split query keys by detail, items, policy, readiness, access, stats, analytics
- avoid refetching full assessment after every keystroke if item mutation can update cache

### Accessibility

Mandatory:

- skip link to main workspace
- semantic landmarks for navigator, main, rail
- icon-only buttons have `aria-label`
- save and validation status use `aria-live="polite"`
- focus moves to invalid field when clicking a readiness issue
- drag reorder has keyboard alternative controls
- destructive delete has confirmation or undo
- all controls have labels and names
- table headings and row actions are accessible
- reduced motion support
- no paste blocking unless policy explicitly requires it, and instructor sees accessibility warning

## Phased Rewrite Plan

### Phase 0: Product And Technical Inventory

Deliverables:

- Map every assessment route, component, endpoint, test, and translation key.
- Document current data flow from activity -> assessment -> policy -> settings -> attempt runtime.
- Identify all current assessment kinds and which UI supports them.
- Identify existing student runtime behavior for every policy field.
- Interview or simulate teacher workflows for create, publish, grade, release, retake, and exceptions.

Done when:

- There is a route/component/API map.
- Every visible UI field has an API source and runtime consumer.
- Duplicate policy/settings fields are listed with a migration decision.

### Phase 1: Canonical Contracts

Deliverables:

- Define canonical policy, audience, readiness, operation summary, and audit DTOs.
- Merge duplicate preset definitions.
- Add compatibility adapter for legacy activity settings.
- Regenerate frontend OpenAPI types.
- Add API tests for each contract.

Done when:

- Frontend can render studio from canonical DTOs without manually normalizing nested JSON blobs.
- Legacy exams still load correctly.
- New fields have one source of truth.

### Phase 2: Workspace Shell

Deliverables:

- Build `AssessmentWorkspaceProvider`.
- Build top bar, navigator, main area, and readiness rail.
- Move active tab URL state to workspace view URL state.
- Add selected item and selected issue to URL state.
- Add global save ledger.

Done when:

- Current setup, builder, access, results, and publish screens can be hosted inside the new shell with feature parity.
- Save state and readiness stay visible while switching views.

### Phase 3: Question Builder Redesign

Deliverables:

- Replace current builder layout with sectioned outline, main editor, and contextual rail.
- Move long explanation/rubric fields out of narrow inspector.
- Add keyboard reorder controls.
- Add reorder rollback/retry.
- Expose tags, outcomes, estimated time, and difficulty.
- Add bulk point/difficulty/tag operations.
- Add item preview.

Done when:

- A teacher can create and validate a complete exam without leaving Build.
- All item issues navigate to the exact field.
- Large item lists remain responsive.

### Phase 4: Policy And Integrity Redesign

Deliverables:

- Build consequence-based policy editor.
- Normalize field names across UI and API.
- Add result release policy.
- Rename proctoring copy to integrity controls unless real proctoring exists.
- Add violation policy and accessibility exceptions.
- Add inline warnings for risky combinations.

Done when:

- Teachers can understand what students can do, see, and retry.
- Risky settings produce warnings before publish.
- Attempt runtime consumes the same policy contract.

### Phase 5: Audience Builder And Accommodations

Deliverables:

- Replace local all-user list with server-side searchable audience builder.
- Add effective audience preview before save.
- Add selected audience drawer.
- Add group expansion.
- Add exclusions and individual overrides.
- Surface existing student policy override APIs in UI.
- Add save diagnostics and retry.

Done when:

- Teachers can confidently answer who can take the test and which exceptions apply.
- Large classes perform well.
- Failed access saves are recoverable without guessing.

### Phase 6: Preview And Publish Gate

Deliverables:

- Add student preview view.
- Add preview as generic/specific learner.
- Add preview for expired timer, retake, late attempt, restricted access, and result view.
- Add publish confirmation with learner impact summary.
- Add schedule confirmation.
- Add audit note option for high-stakes publish.

Done when:

- Publish requires zero blockers and at least one successful preview for high-stakes exams.
- Teachers see exactly what changes when they publish or schedule.

### Phase 7: Operate And Results

Deliverables:

- Integrate submission queue into assessment workspace.
- Add filters, sort, search, batch actions, and release status.
- Add item analytics cards and table with action prompts.
- Add regrade workflow after item corrections.
- Add integrity event review.
- Add export.

Done when:

- Teachers can manage a live test without leaving the assessment cockpit.
- Item analytics lead directly to improvement and regrade decisions.

### Phase 8: Audit, QA, And Rollout

Deliverables:

- Add assessment audit timeline.
- Add Playwright flows for create, edit, access, preview, publish, submit, grade, release, and mobile.
- Add Vitest tests for provider state, save ledger, readiness navigation, and URL state.
- Add API tests for policy, audience, readiness, lifecycle, lock, and overrides.
- Add feature flag for old vs new studio.
- Add migration guide for existing exams.

Done when:

- New studio can be enabled per environment or course.
- Old exams remain readable.
- Regression suite covers instructor-critical flows.

## Component Migration Map

| Current | Target |
| --- | --- |
| `AssessmentStudioWorkspace` | `AssessmentWorkspaceShell` with course context preserved |
| `NativeItemStudioProvider` | `AssessmentWorkspaceProvider` with selectors, save ledger, readiness, policy, audience, operation summary |
| `NativeItemAuthor` | route/view coordinator only, no business-heavy tab ownership |
| `GeneralSettingsTab` | `AssessmentPolicyView` plus metadata in `Overview` |
| `BuilderCanvasTab` | `QuestionBuildView` with outline, editor canvas, readiness rail |
| `QuestionInspectorPanel` | `AssessmentReadinessRail` plus `QuestionInspector` for quick metadata |
| `AccessManagementTab` | `AudienceBuilderView` with server search, virtualization, selected drawer, accommodations |
| `ResultsReviewTab` | `AssessmentOperateView` with queue, analytics, release actions |
| `PublishDashboardTab` | `PublishGate` and persistent publish action in rail |
| `NativeItemBodyEditor` | item-kind editor slots with shared validation and preview contract |
| `domain/readiness.ts` | generated/common readiness model with backend parity |
| `studio/utils.ts` | split into policy adapter, item adapter, save serialization, validation helpers |

## First PR Recommendation

Ship a foundation PR before visual overhaul:

1. Add an ADR for canonical assessment policy and workspace architecture.
2. Merge duplicate assessment policy preset definitions.
3. Add a typed `AssessmentWorkspaceProvider` behind the current UI.
4. Add save ledger state and beforeunload guard.
5. Stop swallowing reorder failures. Roll back or show persistent retry.
6. Add selected item and selected issue URL state.
7. Add readiness issue navigation tests.
8. Add server-side effective audience preview endpoint or extend access read to support unsaved preview payloads.

This PR does not need to redesign every screen. It removes the architectural ambiguity that makes a visual redesign fragile.

## Acceptance Criteria

Product:

- Teachers can create, validate, preview, publish, monitor, grade, and release from one coherent workspace.
- Every publish blocker links to the exact field or item.
- Teachers can see who is affected before access save, publish, schedule, grade release, and regrade.
- Integrity controls are honest about limitations.
- Results analytics produce actions, not just passive numbers.

Engineering:

- Assessment policy has one canonical contract.
- Activity settings are not an independent source for new authoring behavior.
- Save state is persistent, visible, retryable, and guarded on navigation.
- Large question and learner lists remain responsive.
- Generated frontend types match backend contracts.
- Lifecycle locks are visible in UI before failed edits happen.

Accessibility:

- Keyboard users can create, reorder, edit, validate, preview, and publish.
- Screen reader users receive save and validation status.
- Every icon-only action has an accessible name.
- Destructive actions require confirmation or undo.
- State is deep-linkable enough for support and collaboration.

Quality:

- Unit tests cover policy normalization, readiness mapping, save ledger, URL state, and item validation.
- API tests cover canonical policy, readiness, access, lifecycle, locks, overrides, stats, and analytics.
- Playwright covers teacher and student flows on desktop and mobile.
- No critical workflow relies only on toast feedback.

## Open Decisions

- Should old tab routes remain as aliases during rollout, or should the new workspace replace them behind a feature flag?
- What is the institution-level definition of high-stakes exam?
- Does Ashyk Bilim intend to implement real proctoring, or only integrity deterrents?
- Which item types must exams support: only choice/matching, or open text/form/code in future?
- Should item banks be course-local first, organization-wide first, or both?
- What are the required languages for all teacher-facing validation messages?
- What audit retention period is required for published exams and grade releases?

## Non-Goals For The First Rewrite

- Do not rebuild the entire grading engine.
- Do not replace the course workspace shell.
- Do not introduce a second design system.
- Do not add decorative "AI" visuals or marketing-style dashboard cards.
- Do not expand item types until runtime, grading, readiness, and review support are confirmed.

