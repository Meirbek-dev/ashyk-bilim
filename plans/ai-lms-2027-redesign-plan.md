# AI LMS 2027+ Redesign Plan

Current as of 2026-06-11.

## Design Read

Reading this as a full product redesign for an AI-first LMS used by students, teachers, and course authors. The target language is a high-trust learning cockpit: dense, fast, evidence-first, calm under repeated daily use, and futuristic through workflow intelligence rather than decorative "AI" visuals.

Dial settings:

- `DESIGN_VARIANCE: 6`: distinctive enough to feel next-gen, restrained enough for serious learning.
- `MOTION_INTENSITY: 4`: motion explains state changes, progress, and spatial continuity. No decorative motion.
- `VISUAL_DENSITY: 7`: an LMS needs context, evidence, progress, next actions, and audit state visible without drawer hunting.

Primary stack assumptions:

- Next.js 16.2, React 19, App Router, `cacheComponents: true`.
- shadcn/Base UI components with semantic tokens and the project icon system, currently lucide.
- TanStack AI and AG-UI for client runtime.
- Pydantic AI for backend agents, structured output, validators, tool execution, and evals.

## Executive Verdict

The current AI implementation has real engineering progress. It is not a blank slate and should not be thrown away blindly.

Strong pieces already exist:

- A v2 ordered stream event model with `run.started`, `status.changed`, `tool.started`, `message.delta`, `citation.added`, `artifact.delta`, `run.finished`, `run.error`, and `run.aborted`.
- A frontend reducer for ordered AI runtime state.
- A compound `AiStudio` shell with context map, main area, artifact canvas, and run console.
- A Pydantic AI text agent with a `search_course_content` tool.
- A Pydantic AI artifact agent with structured output types and validators.
- Next.js Cache Components are enabled.
- TanStack AI is integrated through a custom adapter.

The product result is still not world-class. The screenshots show the core failure: AI competes with the learning and authoring surface instead of becoming the surface. The user sees overlapping sheets, bottom toolbars, tiny run details, generic artifact cards, and multiple launchers with different mental models. The experience feels technical, cramped, and inconvenient because the UI exposes implementation fragments rather than learning tasks.

The redesign goal is to turn AI from "ask a side panel" into an operating layer for learning, authoring, feedback, and governance.

## Evidence Reviewed

Screenshots:

- `C:/Users/bmk/AppData/Local/Temp/codex-clipboard-8671a28f-a5e6-44d3-9745-1534b16a4d8e.png`
- `C:/Users/bmk/AppData/Local/Temp/codex-clipboard-d0b04c44-53a4-40bb-b9ef-7195be82728a.png`

Code:

- `apps/web/src/features/ai/components/StudentTutorWorkspace.tsx`
- `apps/web/src/features/ai/components/AiStudio.tsx`
- `apps/web/src/features/ai/components/AiComposer.tsx`
- `apps/web/src/features/ai/components/AiArtifactRenderer.tsx`
- `apps/web/src/features/ai/api/ai-event-contract.ts`
- `apps/web/src/components/Contexts/AI/ActivityAIChatContext.tsx`
- `apps/web/src/services/ai/activity-chat-adapter.ts`
- `apps/web/src/components/Objects/Activities/AI/AIActivityAsk.tsx`
- `apps/web/src/components/Objects/Activities/DynamicCanva/AI/AICanvaToolkit.tsx`
- `apps/web/src/components/Objects/Editor/AI/AIEditorToolkit.tsx`
- `apps/api/src/services/ai/agent.py`
- `apps/api/src/services/ai/artifact_agents.py`
- `apps/api/src/services/ai/contracts/outputs.py`
- `apps/api/src/services/ai/orchestration/stream.py`
- `apps/api/src/services/ai/service.py`

Guidelines and skill lenses:

- Vercel composition patterns: compound components, role variants, narrow context interfaces, no boolean prop sprawl.
- shadcn: use existing primitives, semantic tokens, Field/InputGroup composition, accessible overlays, icon button labels.
- Vercel React and Next.js practices: split static, cached, and dynamic work; isolate client islands; avoid waterfalls; dynamic import heavy surfaces.
- Next Cache Components: static shell, cached course context, dynamic active run under Suspense.
- Web Interface Guidelines: keyboard, focus, `aria-live`, deep-linkable state, safe layout, reduced motion, `Intl.*`, no broken long text.
- UI/UX Pro Max, frontend-design, design-taste-frontend: product-specific visual system, no generic AI-purple UI, no stacked cards pretending to be strategy.
- stop-slop: direct copy, active voice, specific labels, no vague assistant prose.

## What Is Already Good

### V2 Runtime Foundation

The v2 stream contract is now real. `StreamEventFactory` emits ordered run events with a run ID, thread ID, event ID, sequence, timestamp, and typed payloads. The frontend reducer tracks events, artifacts, citations, tool events, status, sequence errors, aborts, and terminal states.

Do not restart this from scratch. Harden it.

### Compound Shell Exists

`StudentTutorWorkspace` now composes `AiStudio.ContextMap`, `AiStudio.Main`, `AiStudio.ArtifactCanvas`, and `AiStudio.RunConsole`. This is the right architectural direction. The issue is product depth and layout quality, not the existence of compound composition.

### Structured Artifact Agent Exists

`artifact_agents.py` defines an artifact agent with Pydantic output types and validators for intent matching, citations, hint safety, patch block IDs, and intervention privacy notes. This fixes part of the earlier text-wrapper problem.

The remaining problem is that artifacts still arrive after the text answer and can silently fall back to deterministic wrappers.

### shadcn Usage Improved

`AiComposer` uses `Field`, `FieldGroup`, `InputGroup`, and icon button labels. This is aligned with the project design system.

The issue is the interaction model: three generic intent buttons and one text box cannot carry a serious LMS AI workflow.

## Critical Findings

### 1. AI Is Still A Sheet, Not A Workspace

Evidence:

- `StudentTutorWorkspace.tsx` renders a right-side `Sheet` and places the whole AI studio inside it.
- Screenshot 1 shows the main learning content blurred and displaced behind the assistant panel.
- Screenshot 2 shows AI floating over the authoring canvas while a separate bottom toolbar and editor controls compete for attention.

Impact:

- Students lose the learning surface when they ask for help.
- Authors get overlapping AI controls instead of a clear diff, approval, and insertion workflow.
- Teachers would inherit the same cramped assistant metaphor, even though they need review queues and audit trails.

Redesign decision:

- Keep the sheet only for quick mobile access and short inline help.
- Use a full AI Learning Studio route or resizable workspace for serious tasks.
- Let the activity, evidence, conversation, generated artifact, and run timeline coexist without covering each other.

### 2. The UI Exposes Internal Run Mechanics Too Early

Evidence:

- `AiStudio.RunConsole` is always present on desktop and shows raw event names such as `status.changed` and `run.finished`.
- Screenshot 1 shows "Run console", "Tools", and "Events" in a narrow rail while the main interaction remains weak.

Impact:

- Students see implementation state instead of useful learning state.
- Staff need a real audit view, not tiny raw event strings.
- The UI spends space on event labels while hiding the educational next step.

Redesign decision:

- Student mode shows plain learning progress: "Finding course context", "Building hints", "Ready to practice".
- Staff mode can expand into a full run inspector with tool args, citations, validators, latency, usage, and approval history.
- Raw event sequences belong in a debug/audit panel, not the default student view.

### 3. Surfaces Still Compete

Evidence:

- `AIActivityAsk` opens `StudentTutorWorkspace`.
- `AICanvaToolkit` shows a selection bubble and opens the same modal.
- `AIEditorToolkit` has a separate bottom toolbar, dark fixed modal, direct editor insertion logic, local tool state, and its own visual system.
- `ActivityAIChatContext` says one context exists to share state across `AIActivityAsk` and `AICanvaToolkit`, but `AIEditorToolkit` still owns much of the authoring UX locally.

Impact:

- Users cannot learn one consistent AI model.
- The same action can mean "send to chat", "insert text", "open modal", or "show preview" depending on surface.
- Authoring actions can insert generated text without a first-class diff and approval canvas.

Redesign decision:

- Merge launchers into one command model:
  - selection command
  - activity command
  - course command
  - cohort command
- Route all commands through one `AiStudio` runtime.
- Give each role an explicit composition: `StudentTutorStudio`, `AuthoringStudio`, `TeacherCopilotStudio`, `AdminAiAuditStudio`.

### 4. The Main Agent Is Still Text-First

Evidence:

- `agent.py` still defines the main agent with `output_type=str`.
- `service.py` streams text first with `run_stream()` and `message.delta`.
- Structured artifacts are generated after the full text response.

Impact:

- The UI cannot stream a hint ladder, flashcard deck, authoring patch, or rubric feedback as the primary object.
- Artifacts feel like side effects after chat, which matches the screenshots.
- Approval workflows cannot bind cleanly to a first-class patch or intervention during generation.

Redesign decision:

- Use text streaming only for freeform tutor answers.
- Use artifact-specific agents for artifact-producing intents.
- Stream structured artifact deltas when the intent is `flashcards`, `hint_ladder`, `authoring_patch`, `rubric_feedback`, or `teacher_intervention`.
- Treat chat as one renderer among several, not the root product model.

### 5. Fallback Artifacts Are Too Generic For A Premium LMS

Evidence:

- `artifact_agents.py` falls back to `build_artifact_for_intent()` on any structured generation failure.
- `outputs.py` fallback flashcards generate fronts such as "What should you remember about point N?"
- Hint fallback uses generic steps like "Locate the concept" and "Try the next move".
- Confidence defaults and formula-based estimates are displayed as precise percentages in `AiArtifactRenderer`.

Impact:

- The user sees "AI learning objects" that may be mechanical wrappers around text.
- A precise percentage suggests calibration that the system does not actually have.
- Trust drops fast when flashcards and hints sound generic.

Redesign decision:

- Replace silent fallback with a degraded artifact state:
  - "Structured output failed"
  - recovery action
  - original answer preserved
  - retry option
- Replace confidence percent with trust explanation:
  - evidence coverage
  - citation count
  - validator status
  - model uncertainty note
- Keep deterministic fallback only for tests or explicit safe-mode.

### 6. Routing Still Uses Fragile Heuristics

Evidence:

- `service.py` detects request mode by string prefixes.
- Translation, critique, editorial, and instructional modes depend on small hardcoded phrase lists.
- Retrieval is disabled for translation, critique, editorial, follow-up, and small-document short prompts.

Impact:

- Multilingual and mixed-intent prompts will route incorrectly.
- Users cannot see why evidence was or was not used.
- Retrieval policy is hidden instead of inspectable.

Redesign decision:

- Add a typed router agent or classifier output:
  - role
  - intent
  - context scope
  - retrieval policy
  - allowed tools
  - approval requirement
- Log routing decisions as v2 events.
- Let users switch scope: "selected text", "current activity", "course", "my progress", "cohort".

### 7. The Current Visual System Feels Like Debug UI

Evidence from screenshots:

- Large blank surfaces and nested dashed boxes dominate the authoring page.
- Floating dark AI panels sit over a light editor and bottom toolbar.
- Yellow warning-style blocks appear as empty containers with alert icons.
- The assistant rail uses generic labels: "Artifact", "Evidence", "Tools", "Events".
- Action buttons are generic: "Explain", "Flashcards", "Hints".

Impact:

- The AI feels unfinished and inconvenient.
- The UI does not communicate hierarchy: what to read, what to trust, what to do next.
- The product does not feel like a 2027+ LMS because the user still operates a chat/debug layer manually.

Redesign decision:

- Build a domain-specific surface:
  - Learning map
  - Evidence map
  - Artifact canvas
  - Run trace
  - Approval queue
  - Next-step rail
- Use visual density, source chips, timelines, and diff previews as the futuristic signature.
- Avoid generic gradients, floating blobs, and oversized marketing-style cards.

### 8. Cache Components Are Enabled But The AI Surface Does Not Use The Boundary Well

Evidence:

- `next.config.ts` enables `cacheComponents: true`.
- Most AI UI state lives in client context and the shell renders inside a client sheet.

Impact:

- Static AI chrome, cached course context, and dynamic run state are bundled together.
- Course outline, rubric summaries, artifact history, and AI context maps cannot stream independently.
- The first AI paint is heavier than it needs to be.

Redesign decision:

- Server-render static studio shell and cached context.
- Place live run state in small client islands.
- Use Suspense for active thread, run status, approvals, and usage counters.

## Target Product Vision

The AI Learning Studio should adapt by role and task.

Student:

- Explain the current concept with cited course evidence.
- Reveal progressive hints without spoiling the answer.
- Generate practice and flashcards tied to source fragments.
- Check a learner attempt and suggest the next move.
- Keep a durable study thread per activity.

Teacher:

- Show misconception clusters and at-risk signals.
- Draft interventions with privacy scope.
- Explain why a recommendation exists.
- Require human approval before sending, assigning, or grading.
- Audit citations, model, tools, and validator results.

Author:

- Rewrite selected text with diff preview.
- Improve accessibility, reading level, examples, and localization.
- Generate or revise learning blocks.
- Insert only after explicit approval.
- Keep a change log that links generated patches to activity versions.

Admin:

- Monitor cost, latency, tool failures, refusal rate, citation coverage, eval deltas, and policy violations.
- Replay runs from ordered events.
- Configure retention, budgets, tools, and role permissions.

## Target UX Architecture

### Desktop Layout

Use a resizable three-lane workspace for serious AI tasks:

```txt
+--------------------++--------------------------------------------++----------------------++
|| Context Map        || Thread + Artifact Canvas                   || Next Actions + Trust ||
||                    ||                                            ||                      ||
|| Course/activity    || Student: answer, hints, practice           || Evidence summary     ||
|| Selected fragment  || Author: diff, patch, glossary              || Run state            ||
|| Rubric/progress    || Teacher: cohort cluster, intervention      || Approvals            ||
|| Evidence sources   ||                                            || Audit details        ||
+--------------------++--------------------------------------------++----------------------++
```

Rules:

- Context stays visible while AI answers.
- Artifacts are primary surfaces, not cards below chat.
- The right rail shows next actions first, audit details second.
- Raw event logs stay collapsed unless staff opens them.

### Mobile Layout

Use staged panels:

1. Task composer.
2. Artifact.
3. Evidence.
4. Trace and approvals.

Never render three columns on mobile. Preserve the learning content and avoid fixed overlays that trap the viewport.

### Role Variants

Use explicit role components:

```tsx
<AiStudio.Provider threadId={threadId} role="student">
  <StudentTutorStudio />
</AiStudio.Provider>

<AiStudio.Provider threadId={threadId} role="author">
  <AuthoringStudio selection={selection} />
</AiStudio.Provider>

<AiStudio.Provider threadId={threadId} role="teacher">
  <TeacherCopilotStudio courseId={courseId} />
</AiStudio.Provider>
```

Avoid boolean prop sprawl such as `showRunConsole`, `isTeacher`, `isAuthor`, `enablePatchMode`. Compose role-specific slots from one runtime provider.

## Target Visual System

Do not make this another purple AI sidebar.

Direction:

- Base: neutral high-contrast light and dark modes using existing semantic tokens.
- Accent: one signal color for live AI state. Use sparingly.
- Typography: readable sans for UI, tabular mono for run IDs, latency, cost, confidence inputs, and score deltas.
- Radius: 6 to 8 px for panels and controls. Pills only for compact status tags.
- Motion: 150 to 300 ms, transform and opacity only, reduced-motion path required.
- Density: compact but legible. Users should scan evidence, status, and next action in one glance.

Signature element:

- A live evidence and reasoning map that connects answer sections, artifacts, citations, tools, validators, and approval state.

Copy rules:

- Use task names instead of generic AI labels:
  - "Build Hint Ladder"
  - "Check My Attempt"
  - "Review Patch"
  - "Show Sources"
  - "Approve Intervention"
- Avoid vague UI copy like "Generated learning objects will anchor here".
- Error messages name the cause and next step.

## Target Technical Architecture

### Backend

1. Keep the v2 stream contract and make it the only future contract.
2. Keep the Pydantic artifact agent, but remove silent fallback from production flows.
3. Split agents by role and artifact:
   - `student_tutor_agent`
   - `hint_ladder_agent`
   - `flashcard_agent`
   - `authoring_patch_agent`
   - `rubric_feedback_agent`
   - `teacher_intervention_agent`
   - `router_agent`
4. Use tools and toolsets:
   - `search_course_content`
   - `get_activity_structure`
   - `get_course_map`
   - `get_rubric`
   - `get_learner_progress_snapshot`
   - `get_submission_summary`
   - `run_code_tests`
   - `draft_authoring_patch`
5. Use deferred tools for approval-based actions:
   - insert patch
   - publish content
   - send teacher intervention
   - modify rubric
   - run expensive cohort analysis
6. Emit routing, retrieval, tool, validator, artifact, approval, and usage events.
7. Persist thread, run, event, evidence, artifact, and approval records for replay.

### Stream Contract

Keep:

- `run.started`
- `status.changed`
- `tool.started`
- `tool.delta`
- `tool.finished`
- `message.delta`
- `citation.added`
- `artifact.delta`
- `run.finished`
- `run.error`
- `run.aborted`

Add:

- `route.decided`
- `validator.started`
- `validator.finished`
- `approval.requested`
- `approval.resolved`
- `usage.delta`
- `artifact.versioned`

Rules:

- Backend owns run IDs, thread IDs, event IDs, and sequence.
- Frontend does not generate substitute sequence values for real v2 events.
- Every error event includes `recoverable`, `code`, `message`, `user_action`, and `request_id`.
- Every artifact has a stable `artifact_id` and version.

### Frontend

Refactor toward:

```tsx
<AiStudio.Provider>
  <AiStudio.Layout>
    <AiStudio.ContextMap />
    <AiStudio.ArtifactCanvas />
    <AiStudio.TaskComposer />
    <AiStudio.NextActions />
    <AiStudio.EvidenceMap />
    <AiStudio.RunInspector />
  </AiStudio.Layout>
</AiStudio.Provider>
```

State boundaries:

- Provider owns transport, event reducer, role permissions, active run, artifacts, citations, approvals, and usage.
- Slot components consume narrow selectors to prevent full workspace rerenders on every token.
- Heavy renderers load dynamically: markdown, code diff, Monaco, timeline details, charts.
- Use URL state for selected artifact, selected run, evidence drawer, and approval item.

### Cache Components

Static:

- Studio frame.
- Role navigation.
- Command definitions.
- Empty-state layout.

Cached with `use cache`:

- Course outline.
- Activity metadata.
- Rubric summaries.
- Teacher-authored public fragments.
- Artifact history list.

Dynamic under Suspense:

- Current user permissions.
- Live AI run.
- Active thread messages.
- Approvals.
- Usage and cost counters.
- Learner progress and submissions.

Invalidation tags:

- `activity:{uuid}:ai-context`
- `course:{uuid}:ai-map`
- `rubric:{uuid}:summary`
- `ai-thread:{threadId}:artifacts`

Use `updateTag()` after authoring edits that change AI context.

## Redesign Phases

### Phase 0: Product Inventory

Deliverables:

- Inventory all AI entry points.
- Define role and task matrix.
- Define source-of-truth runtime state.
- Define privacy classes and retention rules.
- Decide which surfaces become full workspace, sheet, inline command, or audit route.

Done when:

- Every AI trigger maps to one runtime command.
- No surface owns private prompt logic without a registered command.

### Phase 1: Runtime Hardening

Deliverables:

- Make v2 the only new protocol.
- Keep legacy parsing only as a temporary migration path.
- Add frontend fixtures for event replay.
- Add sequence, abort, retry, malformed event, and duplicate citation tests.
- Stop generating frontend fallback IDs or sequence values for real v2 events.

Done when:

- A saved stream fixture can replay a full run into the UI.
- The UI renders aborted, failed, partial, and complete runs without hanging.

### Phase 2: Artifact-First Agents

Deliverables:

- Route artifact-producing intents to artifact-specific agents.
- Stream artifact deltas where possible.
- Remove silent deterministic fallback from production.
- Add validators for citations, hint safety, patch block IDs, rubric references, privacy notes, and localized output.

Done when:

- Flashcards, hints, patches, rubric feedback, and teacher interventions are first-class outputs.
- The UI does not need to convert chat text into learning objects.

### Phase 3: Unified Command Model

Deliverables:

- Replace `AIActivityAsk`, `AICanvaToolkit`, and `AIEditorToolkit` action logic with shared AI commands.
- Add command scopes: selection, block, activity, course, learner, cohort.
- Add command permissions by role.
- Add task-specific composers with required fields.

Done when:

- The same command produces the same run lifecycle from any entry point.
- Authoring commands use diff and approval, not direct insertion.

### Phase 4: AI Learning Studio UI

Deliverables:

- Build resizable desktop studio and staged mobile panels.
- Replace generic artifact card with artifact-specific canvases.
- Build evidence map with source chips, excerpts, relevance, and jump-to-source.
- Build next-action rail.
- Build staff run inspector.
- Add keyboard support, focus management, and reduced-motion behavior.

Done when:

- The screenshots no longer show overlapping AI panels and editor controls.
- Evidence, artifact, and next action are visible without crowding the conversation.

### Phase 5: Governance, Memory, And Audit

Deliverables:

- Persist `ai_threads`, `ai_runs`, `ai_events`, `ai_artifacts`, `ai_evidence`, `ai_approvals`, and `ai_eval_results`.
- Add staff audit view.
- Add budgets by user, course, organization, role, and tool class.
- Add retention jobs.
- Add PII redaction and moderation middleware for both input and streamed output.

Done when:

- Admins can replay why an AI result happened.
- Teachers approve interventions before they affect learners.
- Costs and tool loops have hard boundaries.

### Phase 6: Evaluation And Release Gates

Deliverables:

- Pydantic Evals datasets for grounded tutoring, no-spoiler hints, flashcards, authoring patches, rubric feedback, teacher interventions, and Russian/Kazakh/English behavior.
- Pydantic AI `TestModel` unit tests.
- Vitest reducer and stream replay tests.
- Playwright flows for student, author, teacher, cancel, retry, approval, and mobile layout.
- Dashboards for latency, tokens, citation coverage, refusal rate, validator failures, tool errors, and user satisfaction.

Done when:

- AI runtime changes require eval deltas.
- Production incidents can be traced to run, event, tool, model, artifact, and approval.

## Component Migration Map

| Current                    | Target                                                                                                                         |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `StudentTutorWorkspace`    | `StudentTutorStudio` plus `AiStudio` layout slots                                                                              |
| `AiStudio.RunConsole`      | `StudentProgressRail` for students, `RunInspector` for staff                                                                   |
| `AiArtifactRenderer`       | `TutorAnswerCanvas`, `HintLadderCanvas`, `FlashcardDeck`, `PatchDiffCanvas`, `RubricFeedbackCanvas`, `InterventionDraftCanvas` |
| `AiComposer`               | `TaskComposer` with role and intent-specific fields                                                                            |
| `ActivityAIChatContext`    | `AiStudioProvider` with selector hooks and command dispatch                                                                    |
| `activity-chat-adapter.ts` | v2-only AG-UI transport with legacy adapter isolated behind migration flag                                                     |
| `AIActivityAsk`            | activity-scoped command launcher                                                                                               |
| `AICanvaToolkit`           | selection command palette backed by shared commands                                                                            |
| `AIEditorToolkit`          | authoring studio with diff, preview, and approval                                                                              |

## Acceptance Criteria

Runtime:

- Backend emits one future stream protocol.
- Frontend validates event version, sequence, run ID, and thread ID.
- Artifact-producing intents use structured output directly.
- Artifacts have stable IDs and versions.
- No production flow silently downgrades to fake-looking artifacts.
- Run cancellation stops frontend fetch and backend model stream.
- Tool calls, validators, and approvals appear in the event stream.

Trust:

- Citations reference real retrieved evidence or the UI states no source was available.
- Confidence is shown as an explanation, not only a percent.
- Course edits and teacher interventions require approval.
- Run audit is available to staff.

UX:

- AI no longer covers the primary learning or editing surface during serious workflows.
- Student, author, and teacher modes share one command model.
- Keyboard, screen reader, focus, reduced motion, and mobile flows pass review.
- Every icon-only button has a label.
- Progress updates use polite live regions.
- Stateful panels deep-link through URL state where appropriate.
- Empty, loading, error, aborted, retry, and no-evidence states are designed.

Performance:

- Static shell and cached context render through Server Components where possible.
- Dynamic live runs stay in small client islands.
- Heavy renderers load only when needed.
- Long lists and event logs virtualize or use `content-visibility`.

## Immediate First PR

Ship a focused foundation PR before visual overhaul:

1. Add saved v2 stream fixtures for happy path, no evidence, artifact failure, abort, and run error.
2. Add reducer tests for event order, duplicate citations, artifact append, and terminal state.
3. Add a production-safe artifact failure state instead of silent fallback for non-freeform intents.
4. Add stable `artifact_id` and `artifact.version` fields.
5. Add a command registry that maps current entry points to shared command IDs.
6. Document the AI command model in an ADR.

This PR does not need to make the UI beautiful. It removes the ambiguity that makes a UI redesign brittle.

## Open Decisions

- Should serious AI work open as a route, a resizable split workspace, or both?
- Should students see any run inspector details by default?
- Which artifact types need true streaming first: hints, flashcards, patches, or teacher interventions?
- What is the retention policy for student AI threads and generated artifacts?
- What budget limits apply per student, class, teacher, and organization?

## Sources

- Local code files listed in "Evidence Reviewed".
- Latest Vercel Web Interface Guidelines fetched from `https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md`.
- Project shadcn config in `apps/web/components.json`.
- Project Next.js config in `apps/web/next.config.ts`.
- Project package versions in `apps/web/package.json`.
