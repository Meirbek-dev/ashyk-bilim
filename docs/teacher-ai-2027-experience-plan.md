# Teacher AI 2027 Experience Plan

## Status

The legacy teacher AI surface has been removed from the authoring editor. The editor should not expose the old Ashyk AI toolbar button, bottom floating toolkit, writer prompt box, continue writing action, make longer action, translation action, or critique modal.

Backend AI contracts, stream reducers, activity intents, analytics intervention APIs, and shared runtime adapters remain available so a new teacher experience can reuse stable protocol code without keeping the old UI.

## Why This Rebuild Exists

The previous teacher AI UI acted like a small text generator attached to the editor. It mixed content writing, translation, critique, and generation in one floating bar. It inserted output directly into the document before teachers could inspect structure, source use, policy risk, or downstream student impact.

Teachers need an AI workspace that supports lesson design, assessment quality, feedback review, intervention planning, and course improvement. A teacher should know what the AI is analyzing, what it proposes to change, what evidence it used, and which action remains under human control.

## Product Thesis

Build a teacher AI operations layer for course creation and learning quality. The AI should help teachers plan, review, adapt, and intervene across an activity or course while keeping edits explicit and reversible.

The experience should feel like a professional teaching instrument:

- Context-aware across course structure, activity content, submissions, rubrics, and analytics.
- Review-first, with previews and diffs before any edit reaches content.
- Built for teacher judgment, not automatic content replacement.
- Strong about source boundaries, student privacy, and assessment integrity.
- Integrated with authoring and analytics, not bolted onto the editor.

## Hard Requirements

- Do not restore `AIEditorToolkit`.
- Do not restore an editor toolbar button that opens a generic AI prompt.
- Do not insert AI-generated authoring output directly into the editor without a review step.
- Do not mix teacher AI with student AI components or copy.
- Do not expose raw stream events, artifact internals, or backend run console UI as the default teacher experience.
- Do not send private student work to AI unless the teacher chooses a review mode that requires it and policy allows it.
- Preserve backend protocol code until the replacement contract is agreed.
- Keep teacher-only tools out of student routes.

## Removed Legacy Surface

The authoring shell no longer renders:

- `AIEditorToolkit`
- The editor toolbar `onAIToggle` prop
- The editor toolbar Ashyk AI button
- The authoring `ActivityAIChatProvider` wrapper
- The AI toolbar re-render test tied to `isAIOpen`
- `Activities.AIEditorToolkit` translation blocks
- Editor and toolbar `aiEditor` labels

## Current Technical Baseline

Keep:

- `features/ai/api/ai-event-contract.ts`
- `features/ai/api/activity-ai-client.ts`
- `features/ai/intents/activity-intents.ts`
- `services/ai/activity-chat-adapter.ts`
- `components/Contexts/AI/ActivityAIChatContext.tsx` for shared stream runtime and student AI integration
- API contract support for `authoring_patch`, `rubric_feedback`, and `teacher_intervention`
- Analytics teacher intervention endpoints

Replace:

- Teacher AI entry point
- Authoring AI trigger model
- Direct editor insertion flow
- Generic prompt-driven toolbar
- Freeform critique output
- Translation and expansion tools with no review surface
- AI output presentation
- Approval, rollback, and provenance UI

## Target Experience

### 1. Teacher AI Command Center

The primary entry should be a teacher command center that can open from authoring, activity analytics, grade review, or course structure. It should not be a floating text widget.

Recommended entry points:

- Activity authoring header: opens content improvement modes.
- Course outline: opens sequencing, prerequisite, and gap analysis modes.
- Grade review: opens feedback calibration and rubric consistency modes.
- Analytics dashboard: opens intervention planning modes.
- Command palette action: opens the teacher AI command center from any teacher route.

### 2. Teacher Task Modes

Organize AI around teacher intent, not chat history.

Core modes:

- Plan: create objectives, activity outlines, scaffolds, examples, and prerequisite maps.
- Improve: review clarity, reading load, accessibility, sequencing, and misconception risk.
- Assess: build rubrics, check alignment, generate formative checks, and inspect question quality.
- Differentiate: adapt material by level, language support need, and extension path.
- Review: summarize submission patterns, compare rubric evidence, and draft feedback options.
- Intervene: identify learners or cohorts needing support and propose next teacher actions.
- Localize: adapt language and cultural examples with teacher review.

Each mode should define what data it uses, what it can change, and what requires teacher approval.

### 3. Context Map

Replace hidden context collection with a visible context map.

The context map should show:

- Current activity content
- Course outline and prerequisites
- Rubric and assessment settings
- Selected editor block
- Aggregate analytics
- Student submission samples, only when explicitly enabled
- Excluded sources, including private files and restricted exam content

Teachers should be able to remove sources before running AI.

### 4. Reviewable Output Canvas

AI output should render as reviewable teaching artifacts.

Output types:

- Content patch with side-by-side diff
- Lesson plan with objective alignment
- Rubric matrix with criteria, levels, and evidence expectations
- Feedback bank with tone variants
- Intervention plan with learner groups and next actions
- Accessibility review with severity and fix guidance
- Localization proposal with source and target text
- Assessment quality report with item-level risks

Plain chat can exist as a secondary follow-up surface. The first response should be a structured teacher artifact.

### 5. Approval Boundary

Every AI action needs an approval boundary.

Required controls:

- Preview changes
- Apply selected changes
- Reject proposal
- Save as draft
- Copy
- Export
- Compare with previous version
- Report bad output
- Explain source use

AI should never silently alter course content, grades, rubrics, deadlines, or intervention records.

## Visual Direction

The teacher AI experience should feel like a calm operations cockpit for educators. It should support dense review without becoming a generic admin dashboard.

### Palette

- Canvas: `#FAFAF8`
- Ink: `#1F2328`
- Graphite: `#58606E`
- Review Blue: `#2563EB`
- Alignment Green: `#23845A`
- Risk Amber: `#B7791F`
- Revision Red: `#C2413A`

Use color by job:

- Blue for selected AI mode and active review.
- Green for approved alignment or ready-to-apply output.
- Amber for uncertainty, missing context, and policy limits.
- Red for destructive changes, assessment risk, and blocked actions.

### Typography

- Use the project default UI font for navigation, forms, and controls.
- Use the existing editor typography for content previews.
- Use monospace only for diffs, code, and event IDs.
- Keep headings compact inside tool surfaces.

### Layout Signature

Use a review cockpit layout:

```text
+--------------------------------------------------------------+
| Teacher header                         AI command entry       |
+--------------------------------------------------------------+
| Source map       | Review canvas                     Actions  |
|                  |                                      rail   |
| Activity         | Proposed patch / rubric / plan             |
| Rubric           | Diff, evidence, confidence, notes          |
| Analytics        |                                            |
+--------------------------------------------------------------+
| Follow-up composer      Approval history      Policy summary  |
+--------------------------------------------------------------+
```

On mobile and tablet, teacher AI should degrade to review-only summaries unless authoring is safe on that viewport. The current editor remains desktop-only, so the first teacher AI release can stay desktop-first.

## Component Architecture

Create a teacher-owned namespace:

```text
apps/web/src/features/teacher-ai/
  api/
    teacher-ai-client.ts
    teacher-ai-policy.ts
  components/
    TeacherAiEntry.tsx
    TeacherAiCommandCenter.tsx
    TeacherAiModePicker.tsx
    TeacherAiContextMap.tsx
    TeacherAiReviewCanvas.tsx
    TeacherAiDiffPreview.tsx
    TeacherAiRubricMatrix.tsx
    TeacherAiFeedbackBank.tsx
    TeacherAiInterventionPlan.tsx
    TeacherAiApprovalRail.tsx
    TeacherAiPolicyBoundary.tsx
    TeacherAiRunStatus.tsx
  hooks/
    useTeacherAiAvailability.ts
    useTeacherAiSession.ts
    useTeacherAiSources.ts
    useTeacherAiApprovals.ts
  state/
    teacher-ai-output.ts
    teacher-ai-store.ts
  types.ts
```

Rules:

- Do not place teacher AI UI under `components/Objects/Editor/AI`.
- Do not place teacher AI UI under `features/ai/components`.
- Keep `features/ai` as protocol and runtime code only.
- Keep student AI under `features/student-ai`.
- Route teacher AI through teacher-owned policy and source selection.
- Use typed props for editor, course, analytics, and grading context.

## Runtime Model

The new teacher AI session should track:

- Availability: enabled, disabled, restricted by role, restricted by policy, offline.
- Teacher role: owner, instructor, assistant, reviewer.
- Surface: authoring, analytics, grading, course outline.
- Mode: plan, improve, assess, differentiate, review, intervene, localize.
- Source map: activity content, selected blocks, rubrics, analytics, submissions, excluded sources.
- Run state: idle, preparing, streaming, complete, failed, cancelled.
- Output artifact: typed teacher artifact plus optional follow-ups.
- Approval state: draft, partially accepted, accepted, rejected, exported.
- Safety state: permitted, limited, blocked.

Avoid storing the complete teacher AI UI in the shared chat context. Use a teacher AI session hook with a narrow interface.

## API Contract Direction

The backend should return typed teacher artifacts instead of freeform assistant text.

Proposed response envelope:

```ts
interface TeacherAiRun {
  runId: string;
  mode: TeacherAiMode;
  surface: TeacherAiSurface;
  state: 'streaming' | 'complete' | 'failed' | 'cancelled';
  sources: TeacherAiSource[];
  safety: TeacherAiSafetyState;
  output: TeacherAiOutput;
  approvals: TeacherAiApprovalAction[];
  followUps: TeacherAiFollowUp[];
}
```

Output variants:

- `content_patch`
- `lesson_plan`
- `rubric_matrix`
- `feedback_bank`
- `intervention_plan`
- `accessibility_review`
- `localization_proposal`
- `assessment_quality_report`
- `refusal`

Patch artifacts should include stable block IDs, before and after content, rationale, confidence, and rollback metadata.

## Safety And Governance

Teacher AI needs product policy, not only model prompts.

Required rules:

- AI can propose content changes, but teachers apply them.
- AI can draft feedback options, but teachers choose what students see.
- AI can analyze student submissions only in explicit review modes.
- AI can suggest interventions, but teachers approve records and messages.
- AI cannot change grades, deadlines, rubric weights, enrollment, or access policy without a human confirmation flow.
- AI must identify missing source context before making strong claims.
- AI must show when output relies on aggregate analytics versus individual student work.

## Accessibility Requirements

- Full keyboard operation for entry, mode picker, source map, review canvas, approval rail, and composer.
- Escape closes transient layers in predictable order.
- Focus returns to the AI entry control after close.
- Streaming updates use polite live regions.
- Diffs use text markers and labels, not color alone.
- Approval actions have distinct accessible names.
- Dense tables support keyboard navigation and visible focus.
- Reduced motion disables animated streaming and panel transitions.

## Performance Requirements

- Do not load teacher AI bundles on student routes.
- Lazy-load the command center only after teacher entry interaction or clear availability.
- Keep the editor bundle free of teacher AI UI until the feature is enabled.
- Stream visible structured output without rendering hidden evidence lists.
- Cache source summaries per activity revision.
- Avoid diffing the entire editor document on every keystroke.

## Telemetry

Track product events without logging teacher prompts or student content by default.

Events:

- `teacher_ai_entry_viewed`
- `teacher_ai_opened`
- `teacher_ai_mode_selected`
- `teacher_ai_source_added`
- `teacher_ai_source_removed`
- `teacher_ai_run_started`
- `teacher_ai_run_completed`
- `teacher_ai_run_cancelled`
- `teacher_ai_patch_previewed`
- `teacher_ai_patch_applied`
- `teacher_ai_output_rejected`
- `teacher_ai_policy_blocked`
- `teacher_ai_feedback_reported`

Metrics:

- Time to first reviewable artifact
- Patch acceptance rate
- Partial acceptance rate
- Source removal rate
- Policy block rate
- Teacher edit after apply rate
- Intervention approval rate
- Reported confusion rate

## Implementation Plan

### Phase 0: Policy And Product Contract

- Define teacher AI permissions by role.
- Define allowed sources per surface.
- Define which analytics and submissions can be sent to AI.
- Define approval rules for content, rubric, feedback, interventions, and course settings.
- Decide retention rules for prompts, outputs, and source summaries.

Exit criteria:

- Written policy matrix exists.
- Backend can answer whether teacher AI is available for each teacher surface.
- Product has accepted the approval boundary rules.

### Phase 1: New Entry And Shell

- Create `features/teacher-ai`.
- Add `useTeacherAiAvailability`.
- Add a disabled-by-default `TeacherAiEntry`.
- Integrate entry into authoring header, not the editor toolbar.
- Lazy-load `TeacherAiCommandCenter`.
- Add keyboard and focus behavior tests.

Exit criteria:

- Entry appears only for allowed teacher roles and surfaces.
- Editor toolbar has no AI button.
- No old teacher AI UI imports return.

### Phase 2: Source Map

- Build typed source selection.
- Show activity content, selected block, rubric, course outline, analytics, and excluded sources.
- Let teachers remove sources before a run.
- Add policy copy for student data.

Exit criteria:

- Teachers can see and change what AI will use.
- Restricted sources are visible as restricted.
- Source selection serializes into a typed request.

### Phase 3: Review Canvas

- Build output renderers for content patch, rubric matrix, feedback bank, intervention plan, and accessibility review.
- Add side-by-side diff previews for content patches.
- Add source citations and confidence labels.
- Add copy, export, reject, save draft, and apply selected changes.

Exit criteria:

- First response is a reviewable artifact.
- Each artifact has loading, empty, error, and complete states.
- Applying a patch requires a teacher action.

### Phase 4: Runtime Integration

- Connect the command center to the existing AI stream reducer or a teacher-specific reducer.
- Add abort, retry, and resume handling.
- Add run IDs to telemetry and approval records.
- Preserve output reconstruction from append-only events.

Exit criteria:

- Runs can be cancelled.
- Failed runs produce recovery actions.
- Streamed output remains stable and readable.

### Phase 5: Surface-Specific Modes

- Authoring: plan, improve, assess, localize.
- Course outline: plan, sequence, gap analysis.
- Grade review: review, feedback bank, rubric calibration.
- Analytics: intervene, misconception patterns, cohort support.

Exit criteria:

- Mode list changes by surface and role.
- Unsupported modes are not shown.
- Teacher data permissions are enforced before each run.

### Phase 6: Quality Gate

- Add unit tests for availability, source policy, output mapping, and approval state.
- Add interaction tests for entry, source map, diff review, apply selected changes, cancel, and keyboard close.
- Add accessibility tests for diffs, approval rail, and source map.
- Add visual screenshots for authoring and analytics surfaces.
- Run `vp check` and `vp test`.

Exit criteria:

- No legacy teacher AI UI imports exist.
- Teacher AI passes accessibility smoke checks.
- Product owner can test authoring, grading, and analytics flows.

## Acceptance Criteria

- A teacher can open AI support without losing authoring or review context.
- A teacher can choose a task mode before running AI.
- A teacher can inspect and modify the sources used by AI.
- A teacher receives a structured review artifact.
- A teacher can preview changes before applying them.
- A teacher can apply selected changes and reject the rest.
- A teacher can ask a follow-up without restarting the workflow.
- The UI clearly blocks or limits AI when policy requires it.
- The implementation does not import removed legacy components.
- Teacher AI and student AI remain separate.

## Open Decisions

- Should the first teacher AI release live in authoring only, or also in analytics? (authoring only)
- Should content patch approval write directly to the editor or create a draft revision? decide what's best
- Should teachers see student-level AI source warnings by default? decide best UX
- Should AI-generated feedback be stored as reusable feedback bank items? decide best UX
- Should intervention plans integrate with notifications, gradebook notes, or both? decide best UX
- Should localization support course-level language policy? decide best UX

## First Build Slice

Start with one narrow teacher workflow:

1. Authoring surface only.
2. Entry in the editor header.
3. Modes: improve and assess.
4. Source map: current activity, selected block, and rubric if present.
5. Output renderers: content patch and rubric matrix.
6. Review controls: preview, apply selected changes, reject, copy.
7. No persistence beyond the current session.
8. Feature flag off by default.

This gives teachers a real review workflow without recreating the old prompt toolbar.
