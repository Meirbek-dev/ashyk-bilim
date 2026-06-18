# Assessment And Testing UI/UX Redesign Plan

Current as of 2026-06-18.

## Design Read

Reading this as a production LMS assessment studio for teachers, instructors, and course authors. The target experience is a calm, high-density assessment command center: fast to scan, hard to misconfigure, clear about learner impact, and rigorous enough for high-stakes exams.

Dial settings:

- `DESIGN_VARIANCE: 4`: this is operational product UI. Distinction should come from workflow clarity, not visual theatrics.
- `MOTION_INTENSITY: 2`: motion should explain save, validation, navigation, drawer, and state changes. No decorative movement.
- `VISUAL_DENSITY: 8`: teachers need policies, learners, questions, blockers, submissions, and next actions in one workspace without hunting through disconnected cards.

Primary stack assumptions:

- Next.js 16.2, React 19, App Router, RSC enabled.
- shadcn/Base UI, Tailwind v4, semantic tokens, lucide icons, RTL enabled.
- Existing assessment domain models, readiness gates, lifecycle transitions, access policies, policy overrides, result review, and student attempt shell stay in place.

## Executive Verdict

The current exam and testing implementation has strong functional pieces, but the UI does not feel like one coherent assessment product. It feels like several screens placed inside a fixed three-column frame. Teachers see large unused white space, narrow centered forms, repeated blocker cards, distant controls, and panels that do not line up with the task they are trying to complete.

The backend already supports important product capabilities:

- Course-scoped assessment access narrowing.
- Student and group allowlists.
- Effective learner counts.
- Policy overrides and lifecycle audit notes.
- Readiness checks before publishing.
- Item locking after published assessments receive submissions.
- Review queues, submission stats, item analytics, CSV export, bulk publish, and teacher grading.
- Student attempt autosave, recovery, conflict handling, timers, anti-cheat controls, and bottom action bar.

The redesign should not restart the assessment system. It should reorganize the experience around the teacher workflow, make existing capabilities legible, and replace the current "card islands in a shell" with a real workspace.

## Evidence Reviewed

Screenshots:

- Image 1: settings overview with large unused workspace, narrow centered cards, persistent right blocker rail.
- Image 2: settings lower section with integrity controls and repeated blocker cards.
- Image 3: question builder with left outline, centered item editor, inspector, and right blocker rail.
- Image 4: question builder with validation state and cramped middle editor.
- Image 5: access tab with three separated columns and disconnected save/apply controls.
- Image 6: results tab with metrics, queue, item analytics, and blocker rail.
- Image 7: publish tab with readiness banner, preview panel, metrics, and blocker rail.

Frontend:

- `apps/web/src/features/assessments/studio/workspace/AssessmentWorkspaceShell.tsx`
- `apps/web/src/features/assessments/studio/AssessmentStudioWorkspace.tsx`
- `apps/web/src/features/assessments/studio/context.tsx`
- `apps/web/src/features/assessments/studio/studioTypes.ts`
- `apps/web/src/features/assessments/studio/tabs/GeneralSettingsTab.tsx`
- `apps/web/src/features/assessments/studio/tabs/BuilderCanvasTab.tsx`
- `apps/web/src/features/assessments/studio/tabs/AccessManagementTab.tsx`
- `apps/web/src/features/assessments/studio/tabs/ResultsReviewTab.tsx`
- `apps/web/src/features/assessments/studio/tabs/PublishDashboardTab.tsx`
- `apps/web/src/features/assessments/domain/readiness.ts`
- `apps/web/src/features/assessments/shell/AssessmentLayout.tsx`
- `apps/web/src/features/assessments/shell/AssessmentActionBar.tsx`
- `apps/web/src/features/assessments/registry/exam/ExamAttemptContent.tsx`
- `apps/web/src/features/assessments/registry/exam/ExamQuestionCard.tsx`
- `apps/web/src/features/assessments/registry/exam/ExamQuestionNavigation.tsx`

Backend:

- `apps/api/src/services/assessments/access_service.py`
- `apps/api/src/services/assessments/assessment_crud.py`
- `apps/api/src/services/assessments/review_service.py`
- `apps/api/src/services/assessments/policy_service.py`

Guidelines used:

- Vercel composition patterns.
- Vercel React and Next performance practices.
- Next.js App Router practices.
- shadcn/Base UI rules.
- Vercel Web Interface Guidelines.
- UI/UX Pro Max rules.
- frontend-design and design-taste redesign critique discipline.
- stop-slop prose rules.

Note: the `ui-ux-pro-max` helper script was not available from the pointer files in this checkout, so this plan uses the loaded skill rules rather than generated helper output.

## What Is Already Strong

### The Domain Has Real Substance

The backend protects important assessment invariants. It scopes restricted access to learners who already have course access, blocks invalid user and group assignments, blocks publishing when readiness fails, records lifecycle audit notes, caps item count, blocks scoring-field changes after submissions, and keeps policy overrides auditable.

### The Studio Has URL State

`AssessmentWorkspaceProvider` stores active view, selected item, and selected issue in the URL. That gives support staff and teachers shareable links to specific blockers and questions. Preserve this and expand it.

### The Attempt Shell Is A Better Pattern Than The Authoring Shell

`AssessmentLayout` centralizes timer, guard, recovery, conflict, chrome, and action bar behavior. Kind modules register controls through `useAttemptShellControls`. This is closer to the target architecture than the studio shell because it makes one shell own shared behavior and lets exam/code modules provide the body.

### Readiness Is A Product Asset

The readiness model already classifies issue area, field, item, severity, target view, and action labels. The UI currently renders this as repeated cards, but the data can support a much better guided repair flow.

## Critical Findings

### 1. The Studio Shell Wastes Space And Crowds The Actual Work

`AssessmentWorkspaceShell` uses `lg:grid-cols-[260px_minmax(0,1fr)_320px]` with a fixed navigator, center pane, and readiness rail. Screenshots show a narrow center column floating in a wide desktop canvas while the right rail repeats blockers.

Impact:

- Teachers scan empty gutters instead of seeing more useful information.
- The settings page has form cards capped at `max-w-3xl`, so high-value desktop space does not help the task.
- The builder center editor is capped at `max-w-2xl`, which makes long question text and markdown editing feel constrained.
- The readiness rail competes with each tab even when the current task already has inline validation.

Target:

- Use one assessment workbench shell with a fluid center region and contextual right panel.
- Let each tab decide whether it needs a side panel.
- Replace the always-on blocker rail with a compact readiness strip and an expandable "Issues" drawer.
- Keep blockers globally visible, but do not spend 320 px on repeated cards on every screen.

### 2. Navigation Names Reflect Implementation, Not Teacher Workflow

The current views are `SETUP`, `BUILDER`, `ACCESS`, `RESULTS`, and `PUBLISH`. They are valid modules, but the UI presents them as peer tabs instead of a workflow with dependencies.

Impact:

- Teachers do not know which step matters next.
- "Settings and policies" mixes description, timing, grading, randomization, release, integrity, and accessibility exceptions.
- "Access" hides learner impact and accommodations in the middle of a crowded layout.
- "Results" combines review queue, analytics, regrade, integrity, and item action prompts without a clear next action.

Target IA:

1. **Overview**: readiness, learner impact, policy summary, next action, lifecycle.
2. **Questions**: structure, item editing, scoring, feedback, preview.
3. **Delivery**: timing, attempts, grading, result release, integrity controls.
4. **Audience**: learners, groups, access mode, exclusions, accommodations.
5. **Review**: submissions, grading queue, publish grades, regrade, integrity events.
6. **Quality**: item analytics, discrimination, weak questions, accessibility, issue history.
7. **Publish**: final checklist, preview as learner, schedule, publish, audit note.

This can ship incrementally. The first pass can keep route/view IDs stable and change labels, grouping, and layout.

### 3. The Access Tab Is The Weakest Experience

`AccessManagementTab` renders a three-column grid: left policy/save/preview, middle students and groups, right selected audience and accommodations. The screenshot shows the teacher must coordinate choices across distant columns and then decide which save button applies.

Specific problems:

- The layout spreads one task across three columns with no central object.
- `max-w-7xl` plus `22rem / 1fr / 22rem` creates awkward density on wide screens.
- Two separate lists for students and groups force teachers to reason about overlap themselves.
- Selected audience is a drawer-like panel, but it is not a drawer. It is a narrow right column with truncated names.
- Saving access and applying accommodations are separate, yet the UI does not make the boundary obvious.
- `AccessList` has `min-h-[560px]`, which creates heavy vertical blocks even with few rows.
- Search runs in `useEffect` without an abort signal.
- Eligible users load in batches of 50, but the list UI does not communicate partial results or pagination.
- Group expansion only shows a count, not the members, duplicates, or excluded learners.
- The accommodation panel applies only to currently selected users, but teachers can easily think it applies to selected groups too.
- `time_limit_override_seconds` exists in API types, but backend rejects it as unsupported. The UI should not imply time override support until the backend supports it.

Target:

Replace the tab with **Audience Builder**:

```txt
+--------------------------------------------------------------------------------+
| Audience Summary: Restricted to 24 learners | 2 excluded | 3 accommodations     |
+----------------------------++--------------------------------++------------------+
| Mode & Rules                || Roster                         || Selection        |
| All course learners         || [Students] [Groups] [Imported] || Selected learners|
| Restricted audience         || Search, filters, table         || Groups           |
| Save bar                    || columns: name, source, status  || Accommodations   |
+----------------------------++--------------------------------++------------------+
| Sticky footer: 24 will receive this exam | Save Audience | Preview As Learner  |
+--------------------------------------------------------------------------------+
```

Required behavior:

- Make audience the central object, not an incidental side tab.
- Use a unified roster table with source tags: direct learner, group member, excluded, accommodated.
- Add group overlap and duplicate detection.
- Show "effective learners" as an audited calculation, not only a metric card.
- Make selected learners and groups removable through chips or a table, not cramped mini-cards.
- Put accommodations in a separate table with one row per learner and columns for attempts, due date, late penalty, reason, expiry, and granted by.
- Disable unsupported individual time limit fields until backend support lands.
- Add "Apply accommodation to selected learners" and "Apply to group members" as separate explicit actions.
- Require an internal note for accommodations that change deadline or late penalty.
- Add bulk import by email or username for large courses.
- Add a compare/preview state: "24 included, 48 excluded from uploaded list because they are not enrolled."
- On mobile, use tabs or staged sheets: Rules, Roster, Selection, Accommodations.

### 4. Settings Are Correct But Not Decision-Oriented

`GeneralSettingsTab` has useful controls, but it stacks many cards in a narrow center column. The teacher sees form sections, not the learner consequence of each policy.

Specific problems:

- Details, timing, grading, randomization, review visibility, integrity, and accessibility exceptions all use similar card weight.
- `PolicyImpactSummary` is helpful, but it repeats outcomes in small pills instead of driving the screen.
- Integrity controls use success-green cards when enabled, which makes restrictive anti-cheat controls feel universally good.
- Accessibility exceptions are only static guidance. Teachers need to define actual exceptions or jump to Audience accommodations.
- Warning styles use hardcoded amber and lime families instead of semantic state variants.
- Several option sets use custom button/card selection instead of `ToggleGroup`, `RadioGroup`, `FieldSet`, and `Field` composition.

Target:

- Rename this surface to **Delivery**.
- Put a policy outcome strip at the top:
  - Availability
  - Attempts
  - Time
  - Results release
  - Integrity level
  - Accessibility impact
- Split settings into two columns on desktop:
  - left: learner schedule and scoring.
  - right: result release, integrity, and accommodation links.
- Use progressive disclosure for advanced integrity controls.
- Show clear warnings next to risky controls:
  - "Fullscreen can block learners using assistive technologies."
  - "Copy/paste blocking may interfere with browser translation and accessibility tools."
- Link directly to Audience accommodations when policy choices require exceptions.

### 5. The Question Builder Has The Right Pieces But The Wrong Composition

`BuilderCanvasTab` provides outline, DnD sorting, bulk actions, item editor, feedback editor, item preview, and inspector. The layout still feels heavy and brittle.

Specific problems:

- The entire tab is `h-[calc(100vh-120px)] overflow-hidden`, which creates nested scroll behavior.
- The left sidebar is fixed at `w-80`, the inspector is separate, and the editor is capped at `max-w-2xl`.
- The right global readiness rail remains visible in screenshots, so the builder can end up with four simultaneous columns.
- Item actions rely on hover-only controls for drag, move, section, and edit affordances.
- `transition-all` appears in interactive rows and violates the web guideline to list animated properties.
- Some buttons place manually sized icons inside shadcn `Button`.
- Validation appears both in outline icons and inline issue boxes, but there is no grouped repair mode.
- Preview is another card below the editor, so teachers cannot compare edit and learner view side by side.
- Bulk editing is a compact tool block above the outline, which makes it easy to apply changes to the wrong scope.

Target:

Use a **Question Workbench**:

```txt
+----------------------+-----------------------------------+-------------------+
| Structure             | Question Editor                   | Inspector         |
| Add question          | Prompt, answers, feedback         | Points            |
| Sections              | Inline issues                     | Difficulty        |
| Question list         | Split preview toggle              | Tags              |
| Bulk actions menu     |                                   | Outcomes          |
+----------------------+-----------------------------------+-------------------+
```

Required behavior:

- Keep the outline fixed but collapsible. Let the editor use more width on large screens.
- Make Preview a right-side mode of the editor or a split pane, not a card at the bottom.
- Use a visible "Question Actions" menu for duplicate, delete, move, add section, and bulk operations.
- Preserve keyboard reordering and add explicit move controls that do not rely on hover.
- Group readiness issues by question and field with "Fix" buttons that focus the correct input.
- Add item templates for common exam patterns:
  - single correct choice.
  - multiple correct choice.
  - matching.
  - passage with question set.
  - randomized section.
- Add a score distribution summary that updates as teachers edit.
- Use `FieldGroup`, `Field`, `FieldSet`, `FieldLegend`, `ToggleGroup`, `InputGroup`, and `Alert` consistently.

### 6. The Readiness Rail Repeats Problems Instead Of Orchestrating Repair

The current right rail lists every issue as an independent card. Screenshots show repeated messages such as "For choice elements, at least two variants are required" and "Mark at least one correct variant."

Impact:

- Repetition makes blockers feel noisy rather than actionable.
- The rail consumes space even when no action is needed.
- Teachers cannot batch repair or understand issue categories.
- The same readiness content appears again in Publish.

Target:

Replace the rail with a **Readiness Command Strip**:

```txt
[7 blockers] [2 question setup] [3 answer keys] [1 audience] [1 publish] [Open issue drawer]
```

Issue drawer behavior:

- Group by area, then by question or policy section.
- Show one issue per canonical problem with affected count.
- Provide "Fix next", "Open all affected", and "Mark reviewed" for advisory issues.
- Preserve deep links through `view`, `item`, and `issue` query state.
- Keep issue messages specific:
  - "Q3 needs at least two answer options."
  - "Q3 has no correct answer."
  - "Audience is restricted but no learners or groups are selected."

### 7. Results Needs Teacher Triage, Not A Static Dashboard

`ResultsReviewTab` fetches stats, item analytics, and a paginated queue. It renders metric cards, filters, a table, insight cards, score distribution, and item analytics.

Specific problems:

- The primary teacher job is grading and publishing results, but the layout begins with generic metrics.
- The review queue has no saved views, no owner/filter presets, no "next submission" flow, and no clear bulk publish status.
- Item analytics is separated below the queue, so teachers do not see weak questions while grading.
- Integrity events and regrade candidates appear as summary cards, not as actionable queues.
- Search and filters are kept in local state only. They should be URL state for shareable views.
- Recharts loads in the tab body. It should be dynamically loaded or placed behind a Suspense boundary.
- CSV export manually creates a blob and anchor. The UI lacks export states such as "queued", "ready", and "failed".

Target:

Create **Review & Operate**:

- Top action band:
  - Needs grading.
  - Ready to publish.
  - Returned for revision.
  - Integrity events.
  - Regrade candidates.
- Queue presets:
  - Needs grading.
  - Late submissions.
  - Low confidence or manual review.
  - Integrity flagged.
  - Ready to publish.
  - Returned.
- Split view on desktop:
  - left: queue.
  - right: selected submission summary, score, integrity, feedback, next action.
- Keep table mode for bulk operations, but make item-by-item review a first-class flow.
- Add saved filters and URL-synced filters.
- Move question analytics into Quality or a linked panel from Review.
- Add "Publish grades" as a guarded action with impact preview.

### 8. Publish Uses A Simulated Preview Gate

`PublishDashboardTab` tracks previewed scenarios in local component state. Running a preview adds the active scenario to a `Set`, but the code shown does not actually launch a learner preview or verify the scenario.

Impact:

- A high-stakes preview gate can look authoritative while only recording a click.
- Teachers may believe they tested a learner path when no path ran.
- Publish and readiness duplicate the right rail, so teachers see blockers in two places.

Target:

- Publish should be a final confirmation workspace, not another dashboard.
- Preview scenarios must launch real preview sessions:
  - ordinary learner.
  - specific learner.
  - expired timer.
  - repeat attempt blocked.
  - late attempt.
  - restricted access.
  - result view.
- Store preview runs with timestamp, actor, scenario, outcome, and link.
- Make publish disabled until required preview scenarios pass for high-stakes assessments.
- The confirmation dialog should show:
  - affected learners.
  - availability and due date.
  - attempt limit.
  - time limit.
  - result release.
  - integrity controls.
  - unresolved blockers.
  - audit note.

### 9. Student Attempt UX Is Functional But Not Calm Enough

The student attempt shell handles many hard problems: autosave, local recovery, server conflict, anti-cheat, timer, mobile navigation, and bottom action bar. The experience still needs refinement.

Specific problems:

- Anti-cheat copy and overlays feel punitive before they explain learner recovery.
- Security countdown uses pulsing animation and strong destructive styling.
- Question navigation uses hardcoded lime and amber states instead of semantic variants.
- Mobile navigation uses raw arrow glyph text and custom buttons instead of icon buttons with labels.
- Card mode and scroll mode persist in localStorage, but the UI does not explain the mode change to assistive tech.
- Plagiarism status strings inside `ExamAttemptContent` are hardcoded in English.
- Some status and date formatting should use `Intl.*` consistently.

Target:

- Make the attempt shell feel like a focused exam environment:
  - compact header with title, timer, save state, policy state.
  - stable bottom action bar.
  - visible progress and question map.
  - clear recovery path for warnings.
- Use semantic state tokens for answered, flagged, current, unanswered, submitted, returned, and locked.
- Replace punitive warning language with specific action:
  - "Return to the exam window within 10 seconds to continue."
  - "Your exam will submit if this happens 3 times."
- Use `aria-live="polite"` for save and progress updates, `aria-live="assertive"` only for time-expiry and auto-submit warnings.
- Add reduced-motion paths for countdown and ring updates.

### 10. Component Architecture Will Not Scale Cleanly

The studio provider exposes a broad context value containing assessment, items, active view, selected item, selected issue, refresh, editability, points, validation, readiness, save ledger, and setters. Many tab components contain their own fetches, local search state, mutations, error handling, and layout.

Impact:

- Broad context changes can rerender large trees.
- Tabs own side effects that should live in query hooks or view models.
- UI composition mixes layout, data fetching, validation, mutation, and copy in large files.
- Future role variants will invite boolean prop sprawl.

Target:

Use explicit composition slots and narrow selector hooks:

```tsx
<AssessmentStudio.Provider assessmentUuid={assessmentUuid}>
  <AssessmentStudio.Shell>
    <AssessmentStudio.Header />
    <AssessmentStudio.Navigation />
    <AssessmentStudio.Workbench />
    <AssessmentStudio.IssueDrawer />
  </AssessmentStudio.Shell>
</AssessmentStudio.Provider>
```

Recommended component map:

| Current                    | Target                                                                                               |
| -------------------------- | ---------------------------------------------------------------------------------------------------- |
| `AssessmentWorkspaceShell` | `AssessmentStudioShell`, `StudioHeader`, `StudioNav`, `ReadinessStrip`, `IssueDrawer`                |
| `GeneralSettingsTab`       | `DeliveryPolicyView`, `SchedulePanel`, `ScoringPanel`, `ResultReleasePanel`, `IntegrityPanel`        |
| `BuilderCanvasTab`         | `QuestionWorkbench`, `QuestionOutline`, `QuestionEditor`, `QuestionPreviewPane`, `QuestionInspector` |
| `AccessManagementTab`      | `AudienceBuilder`, `AudienceRosterTable`, `AudienceSelectionPanel`, `AccommodationTable`             |
| `ResultsReviewTab`         | `ReviewOperateView`, `SubmissionQueue`, `SubmissionActionPanel`, `QualityInsightsPanel`              |
| `PublishDashboardTab`      | `PublishGateView`, `PreviewRunPanel`, `LifecycleAuditPanel`, `PublishImpactDialog`                   |
| readiness rail             | `ReadinessStrip` plus `IssueDrawer`                                                                  |

Avoid boolean prop APIs such as `showInspector`, `compact`, `isAccessMode`, `showPreview`, and `hasRail`. Prefer explicit variants and slots:

```tsx
<StudioWorkbench>
  <StudioWorkbench.LeftPanel>
    <QuestionOutline />
  </StudioWorkbench.LeftPanel>
  <StudioWorkbench.Main>
    <QuestionEditor />
  </StudioWorkbench.Main>
  <StudioWorkbench.RightPanel>
    <QuestionInspector />
  </StudioWorkbench.RightPanel>
</StudioWorkbench>
```

## Target Experience

### Global Studio Header

The header should answer four questions without opening a tab:

- Which assessment am I editing?
- Can learners take it now?
- Are changes saved?
- What blocks publishing?

Required header content:

- Breadcrumb.
- Assessment title.
- Lifecycle badge.
- Save state.
- Affected learners count.
- Readiness strip.
- Preview as learner.
- Publish or scheduled action.
- Overflow actions: duplicate, archive, audit log.

The header should stay compact. It should not become a second dashboard.

### Overview

Overview should be the first screen when a teacher opens an assessment. It should show:

- next required action.
- readiness summary.
- learner impact.
- policy summary.
- question count and total points.
- last edit, last preview, last publish event.
- recent submissions if published.

This replaces the current first impression of a mostly blank settings page.

### Questions

Questions should support two teacher modes:

- **Drafting**: create questions quickly, add answers, set points.
- **Repairing**: navigate blockers and fix invalid questions.

Required states:

- Empty question set.
- One invalid question.
- Many invalid questions.
- Published but unlocked.
- Published and locked by submissions.
- Large assessment with more than 50 items.

Large item lists must virtualize or window. The current `getOutlineWindow` helper is a good start, but the UI should communicate windowing and provide search/jump.

### Delivery

Delivery should make policy choices feel consequential:

- Availability and due date.
- Attempts and late policy.
- Time limit and grace period.
- Passing score and negative marking.
- Result release.
- Randomization.
- Integrity controls.
- Accessibility and accommodations entry point.

Use `FieldSet` and `Field` structure. Use `ToggleGroup` for compact option sets such as result release. Use `Alert` for warnings, not custom amber cards.

### Audience

Audience should be optimized for real teachers:

- 20 learners in a small course.
- 200 learners in a large course.
- one group assignment.
- several overlapping groups.
- uploaded list with non-enrolled emails.
- individual accommodations.
- restricted access with no selected learners.

Use a data table with virtualization when rows exceed 50. Keep selected state, filters, and active tab in URL state.

### Review

Review should reduce teacher workload:

- Start with queues, not generic charts.
- Show one primary action per selected submission.
- Bulk actions should be visible only after selection.
- Integrity events should open the affected submission and event details.
- Item analytics should create a regrade or revise-question workflow.

### Publish

Publish should be a gate:

- It summarizes risk and impact.
- It requires real preview runs for high-stakes exams.
- It records an audit note for publish, schedule, unpublish, and archive.
- It points teachers to blockers with exact fix actions.

## Visual System

### Product Language

Use a restrained operational LMS style:

- background: `bg-background`
- surfaces: `bg-card`, `bg-muted`, `border-border`
- text: `text-foreground`, `text-muted-foreground`
- primary action: existing `primary`
- state colors: semantic variants for success, warning, destructive, info
- radius: 6 to 8 px for workspace panels and cards
- typography: existing shadcn preset font is acceptable; use tabular numbers for timers, counts, percentages, and scores

Do not add a landing-page aesthetic, AI gradients, decorative orbs, large hero sections, or oversized cards. This is repeated-use teacher software.

### Density Rules

- Reserve cards for repeated items, panels, tables, dialogs, and focused tools.
- Use page sections and split panes instead of card-inside-card layouts.
- Use compact `Table`, `Tabs`, `Resizable`, `ScrollArea`, `Badge`, `Alert`, `Field`, `InputGroup`, and `ToggleGroup`.
- Make line lengths readable. Question text editors can be wider than metadata forms.
- Keep controls stable. Hover states must not shift layout.
- Keep fixed UI clear of content through explicit padding and safe-area handling.

### Status Vocabulary

Define reusable status variants for:

- Draft.
- Scheduled.
- Published.
- Archived.
- Saved.
- Unsaved.
- Saving.
- Save failed.
- Ready.
- Blocked.
- Warning.
- Restricted.
- Accommodation.
- Submitted.
- Needs grading.
- Graded.
- Released.
- Returned.
- Integrity event.

Do not use raw `lime`, `amber`, `blue`, `emerald`, or `red` Tailwind classes in assessment UI. Add semantic tokens or badge variants.

## Accessibility Requirements

P0 accessibility fixes:

- Icon-only buttons need `aria-label`.
- Decorative icons need `aria-hidden`.
- Form controls need labels and meaningful names.
- Option sets use semantic radio, toggle group, or tabs.
- Inline validation appears next to the field.
- On submit, focus the first invalid field.
- Drag and drop has keyboard alternatives and visible reorder controls.
- Hover-only controls must also appear on focus.
- Save, validation, and preview updates use `aria-live="polite"`.
- Auto-submit and time-expiry alerts use `aria-live="assertive"`.
- Tables expose headers and selected row state.
- Empty states include a recovery action.
- Dates and numbers use `Intl.DateTimeFormat` and `Intl.NumberFormat`.
- Long names and emails use `min-w-0`, `truncate`, and accessible title/tooltip only where needed.

P1 accessibility improvements:

- Add a keyboard shortcut registry for question builder and attempt shell.
- Add skip links for long builder and review screens.
- Add reduced-motion variants for countdown, progress, drag, drawer, and panel transitions.
- Add page-level axe checks for studio, audience, review, publish, and student attempt.

## Performance And Next.js Plan

### Data Boundaries

Server Components should provide the initial shell and stable assessment metadata when practical. Client islands should own editing, selection, drag, search, and live autosave.

Recommended split:

- Server or cached read:
  - assessment metadata.
  - course path.
  - lifecycle.
  - initial readiness payload.
  - learner/group counts.
- Client islands:
  - question editor.
  - roster selection.
  - autosave.
  - DnD.
  - active filters.
  - submission queue actions.

### Query Patterns

- Use TanStack Query hooks for tab data rather than raw `useEffect` fetch blocks.
- Add abortable search for learners and groups.
- Keep filters in URL state.
- Use Suspense boundaries for submissions, analytics, preview runs, and charts.
- Dynamically import Recharts and heavy markdown/editor surfaces.
- Virtualize roster, submission queue, and item lists above 50 rows.
- Avoid `transition-all`.
- Prefer CSS/container queries over JS viewport state for layout.

### Bundle Boundaries

- The assessment studio should not load review charts when the teacher is editing questions.
- The audience tab should not load DnD code.
- The student attempt should not load authoring markdown editor code.
- The publish tab should not load Recharts.

## Redesign Phases

### Phase 0: Assessment UX Inventory

Deliverables:

- Create one inventory of assessment states, roles, permissions, and lifecycle transitions.
- Map each current tab to teacher jobs and backend capabilities.
- Define canonical status labels in English, Russian, and Kazakh.
- Identify analytics events for disabled actions, blocker clicks, save failures, publish attempts, preview runs, and accommodation changes.

Done when:

- The team can trace every major control to a teacher job, backend endpoint, and telemetry event.

### Phase 1: Studio Shell And Readiness

Deliverables:

- Replace always-on readiness rail with readiness strip and issue drawer.
- Add Overview as the default landing view.
- Keep URL state for view, item, and issue.
- Add issue grouping and "Fix next".
- Normalize save state placement in the header.

Done when:

- The first viewport shows status, next action, and learner impact.
- The center work area uses desktop width effectively.
- The screenshots no longer show repeated blocker cards occupying the right side on every tab.

### Phase 2: Audience Builder

Deliverables:

- Replace `AccessManagementTab` with `AudienceBuilder`.
- Add unified roster table with students, groups, source, status, and accommodation columns.
- Add selection panel and accommodation table.
- Add abortable search and URL-synced filters.
- Add group overlap display.
- Hide or disable unsupported time-limit overrides.
- Add bulk import and excluded learner review.

Done when:

- A teacher can answer "who can take this exam and why?" in one glance.
- Accommodations cannot be confused with global access settings.
- Large course rosters remain responsive.

### Phase 3: Question Workbench

Deliverables:

- Rebuild builder layout with collapsible outline, wide editor, and contextual inspector.
- Add side-by-side learner preview.
- Replace hover-only controls with visible focus and menu actions.
- Convert forms to `FieldGroup`, `Field`, `FieldSet`, and `ToggleGroup`.
- Add item templates.
- Add grouped repair mode.

Done when:

- Teachers can create and repair questions without scrolling through unrelated cards.
- The editor and preview fit comfortably on desktop.
- Keyboard users can reorder and navigate questions.

### Phase 4: Delivery Policy

Deliverables:

- Recompose settings into Delivery.
- Add policy outcome strip.
- Group schedule, attempts, grading, release, integrity, and accessibility.
- Add consequences and accommodation links to risky controls.
- Replace raw state colors with semantic tokens and variants.

Done when:

- Teachers understand learner impact before saving policy changes.
- Integrity controls no longer look like harmless green success cards.

### Phase 5: Review And Quality

Deliverables:

- Build queue-first Review.
- Add queue presets and URL-synced filters.
- Add selected submission action panel.
- Move item analytics into Quality or a linked right panel.
- Add publish-grade impact preview.
- Add export state handling.

Done when:

- Teachers can clear grading work from one screen.
- Analytics creates actions, not just charts.

### Phase 6: Publish Gate

Deliverables:

- Replace local preview click tracking with persisted preview runs.
- Add real scenario preview launch.
- Add publish impact dialog.
- Add lifecycle audit panel.
- Add high-stakes gate rules.

Done when:

- Publish requires actual successful preview for high-stakes assessments.
- Audit history answers who changed lifecycle, when, why, and who was affected.

### Phase 7: Student Attempt Polish

Deliverables:

- Normalize attempt status tokens.
- Replace raw mobile arrows with icon buttons and labels.
- Localize plagiarism status strings.
- Add reduced-motion countdown and progress states.
- Improve anti-cheat recovery copy.
- Use semantic states in question navigation.

Done when:

- The attempt flow feels calm and focused.
- Students understand what happened, what to do, and what the system saved.

### Phase 8: Design System And Quality Gates

Deliverables:

- Add assessment-specific badge/status variants.
- Add page-state and data-state primitives.
- Add visual regression screenshots for studio tabs.
- Add Playwright axe checks.
- Add tests for URL state, issue navigation, access selection, and preview gate.
- Add lint checks for raw status colors in assessment UI.

Done when:

- New assessment UI cannot reintroduce the current incoherence without failing review or tests.

## Immediate First PR

Ship a narrow foundation PR before redesigning every surface:

1. Add an `AssessmentStatusBadge` and semantic status variant map.
2. Add `ReadinessStrip` and `IssueDrawer` while keeping the existing rail behind a feature flag.
3. Add `Overview` as a new view that reads existing assessment, access, readiness, and stats data.
4. Add URL-synced filter utilities for assessment studio views.
5. Replace hardcoded lime, amber, blue, red, and emerald status classes in the workspace shell with semantic variants.
6. Add Playwright screenshots for current studio tabs to lock the baseline before layout changes.

This PR should not try to solve the whole UI. It creates the structure that makes the next changes smaller and reviewable.

## Acceptance Criteria

### Product

- Teachers can identify the next required action within 5 seconds.
- Teachers can answer who can take the exam, when, under which policy, and with which accommodations from one screen.
- Teachers can fix all blockers without manually searching for the affected question or field.
- Publishing shows learner impact and requires a real preview for high-stakes assessments.
- Review starts from actionable queues, not passive metrics.

### UX

- Desktop layouts use available width without burying the main task in a narrow centered column.
- Mobile layouts use staged panels and do not preserve desktop side rails.
- Every tab has loading, empty, error, disabled, saved, unsaved, and permission states.
- Readiness issues are grouped, deduped, and actionable.
- One primary action exists per screen state.

### Accessibility

- Keyboard-only users can complete setup, question editing, audience selection, review filtering, and publish.
- Icon-only controls have labels.
- Hover-only controls also appear on focus.
- Form errors focus the first invalid field.
- Reduced motion is honored.
- Page-level axe checks pass for studio, audience, review, publish, and attempt.

### Performance

- Roster, question, and submission lists stay responsive with 200 rows.
- Heavy charts and editors load only for tabs that use them.
- Search requests abort when the query changes.
- Filters and selected views persist in URL state.
- Static shell and dynamic editing state are split into reasonable server/client boundaries.

### Engineering

- Assessment tabs are composed from slots rather than boolean prop sprawl.
- Data fetching lives in hooks or server loaders, not scattered `useEffect` blocks.
- Semantic tokens replace raw status color classes.
- All new visible strings use locale files and the assessment glossary.
- Tests cover issue deep links, access selection, accommodations, preview gates, and student attempt recovery.

## Open Decisions

- Should Overview become the default view immediately, or only for published assessments first?
- Should Delivery and Audience remain separate tabs, or should they combine into a single "Delivery" workspace with sub-tabs?
- Which preview scenarios are mandatory for high-stakes exams?
- Should group members be fetched inline in Audience Builder, or through a lazy drawer per group?
- What is the product rule when a learner is included directly but excluded through an uploaded list?
- Should accommodations support individual time limit overrides now, or should the UI continue to block them until backend support lands?
- Should item analytics live in Review, Quality, or both?

## Non-Goals

- Do not rewrite the assessment backend.
- Do not replace shadcn/Base UI.
- Do not change route slugs or lifecycle semantics without a separate migration plan.
- Do not add decorative AI, marketing-page visuals, gradients, or animated spectacle.
- Do not make the student attempt shell less strict. Make it calmer and clearer.

## Source Anchors

- `AssessmentWorkspaceShell` currently defines the fixed three-column studio frame and always-on readiness rail.
- `AccessManagementTab` currently spreads access mode, roster, selected audience, and accommodations across three columns.
- `BuilderCanvasTab` currently owns outline, DnD, item editing, preview, and inspector in one client component.
- `GeneralSettingsTab` currently stacks policy cards in a narrow center column.
- `ResultsReviewTab` currently combines metrics, submission queue, insight cards, chart, and item analytics.
- `PublishDashboardTab` currently tracks preview completion locally with a `Set`.
- `AssessmentLayout` and `AssessmentActionBar` show a stronger composition model for shared attempt behavior.
- `access_service.py`, `assessment_crud.py`, `review_service.py`, and `policy_service.py` show backend capabilities the redesign should expose clearly.
