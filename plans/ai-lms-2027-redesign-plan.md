# AI LMS 2027+ Redesign Plan

## Design Read

Reading this as a full product redesign for an AI-native LMS used by students, teachers, and course authors, with a futuristic but serious learning cockpit language, leaning on Next.js App Router, shadcn/Base UI composition, TanStack AI streaming, and Pydantic AI orchestration.

Dial settings:

- `DESIGN_VARIANCE: 6`: distinctive enough to feel 2027+, restrained enough for repeated academic use.
- `MOTION_INTENSITY: 4`: animated state transitions and live run progress, no decorative motion that distracts from learning.
- `VISUAL_DENSITY: 7`: LMS users need course context, evidence, goals, progress, and actions visible without opening many drawers.

## Executive Verdict

The current AI implementation is not empty. It has meaningful technical groundwork: Pydantic AI, pgvector retrieval, Redis session history, typed artifact contracts, TanStack AI dependencies, streaming, rate limiting, moderation tests, and a newer `features/ai` UI.

The product result still feels weak because the architecture does not yet produce an AI-native LMS experience. The current assistant behaves like a chat panel bolted onto activities. It does not expose a coherent learner model, a teacher copilot workflow, a durable agent run timeline, or high-trust evidence UX. The structured artifacts are mostly post-processed text wrappers, not model-enforced educational objects. The streaming contract is split between legacy v1 events and v2 custom side-channel events. The UI renders those ideas as a narrow sheet with plain bubbles, dashed cards, and a small evidence strip.

The redesign should turn AI from "ask about this activity" into a learning operating layer:

- Student: ask, get grounded tutoring, request hints, practice flashcards, inspect evidence, continue work.
- Teacher: see cohort signals, review AI-generated interventions, approve actions, audit why suggestions were made.
- Author: generate improvements, compare diffs, accept patches, localize content, validate accessibility and reading level.
- System: trace every run, enforce budgets, evaluate quality, preserve privacy, and keep state shareable.

## Current Implementation Findings

### 1. Protocol Is Split

Evidence:

- `apps/api/src/services/ai/models.py:107` through `apps/api/src/services/ai/models.py:143` defines legacy v1 `status`, `delta`, `final`, and `error` events while also unioning `V2StreamEvent`.
- `apps/api/src/services/ai/service.py:565` through `apps/api/src/services/ai/service.py:738` emits v2 run events and legacy v1 status/delta/final events in the same stream.
- `apps/web/src/services/ai/activity-chat-adapter.ts:30` declares `ACTIVITY_CHAT_PROTOCOL_VERSION = 1`.
- `apps/web/src/services/ai/activity-chat-adapter.ts:371` warns when a v2 event arrives, then `apps/web/src/services/ai/activity-chat-adapter.ts:479` through `apps/web/src/services/ai/activity-chat-adapter.ts:491` forwards v2 events as `CUSTOM` chunks instead of making v2 the primary protocol.

Impact:

- The frontend cannot treat tool progress, citations, artifacts, and run lifecycle as the first-class assistant stream.
- The adapter produces AG-UI text lifecycle events itself while the backend also has a richer event model.
- New AI UX work will keep adding glue code unless the wire contract is unified.

### 2. Agent Output Is Text First, Artifact Later

Evidence:

- `apps/api/src/services/ai/agent.py:35` sets `output_type=str`.
- `apps/api/src/services/ai/contracts/outputs.py:142` converts plain text into typed artifacts after the run.
- `apps/api/src/services/ai/contracts/outputs.py:158` generates flashcard fronts like "What should you remember about point N?" from sentence splitting.
- `apps/api/src/services/ai/contracts/outputs.py:180` through `apps/api/src/services/ai/contracts/outputs.py:182` creates generic hint ladder steps rather than model-validated hints.
- `apps/api/src/services/ai/contracts/outputs.py:171`, `apps/api/src/services/ai/contracts/outputs.py:185`, and similar lines assign hardcoded confidence values.

Impact:

- The UI advertises structured learning artifacts, but the model never commits to those schemas.
- Flashcards, hints, teacher interventions, and authoring patches cannot be trusted without manual reconstruction.
- Confidence looks precise but is not derived from retrieval quality, eval score, model calibration, or rubric checks.

### 3. Request Routing Uses Fragile Text Heuristics

Evidence:

- `apps/api/src/services/ai/service.py:215` detects mode through string prefixes.
- `apps/api/src/services/ai/service.py:246` builds policy from that heuristic and the requested intent.
- `apps/api/src/services/ai/service.py:282` disables retrieval for small documents and short questions.

Impact:

- Multilingual prompts, learner intents, and teacher workflows can route incorrectly.
- Retrieval is a hidden policy decision, not an inspectable agent action.
- The system cannot learn from route failures because mode decisions are not modeled as typed classifier outputs or eval targets.

### 4. Pydantic AI Is Underused

Evidence:

- `apps/api/src/services/ai/agent.py:37` uses `Instrumentation()` when Logfire is enabled, which is good.
- The same agent has no domain tools beyond pre-retrieved chunks.
- The implementation does not use Pydantic AI structured output, output validators, toolsets, deferred tools, or `run_stream_events()` for full tool lifecycle streaming.

Impact:

- The LMS cannot expose a real "agent worked through the course" timeline.
- Human approvals, patch insertion, teacher intervention drafts, rubric-sensitive feedback, and code-sandbox actions remain application code around a text generator.

### 5. TanStack AI Is Used As A Transport Shim

Evidence:

- `apps/web/src/components/Contexts/AI/ActivityAIChatContext.tsx:133` uses `useChat`.
- `apps/web/src/services/ai/activity-chat-adapter.ts:479` through `apps/web/src/services/ai/activity-chat-adapter.ts:491` forwards backend v2 events as custom events.
- The adapter comment still describes the backend as proprietary v1 SSE.

Impact:

- TanStack AI's AG-UI model is not the source of truth.
- The UI must parse custom event payloads manually instead of letting the message model carry text, thinking, tool calls, and structured output parts.
- Thread identity and run identity are split between activity UUID, session UUID, generated run IDs, and backend run IDs.

### 6. UI Is Functional But Not AI-Native

Evidence:

- `apps/web/src/features/ai/components/StudentTutorWorkspace.tsx:57` renders the whole assistant in a narrow right sheet.
- `apps/web/src/features/ai/components/StudentTutorWorkspace.tsx:84` through `apps/web/src/features/ai/components/StudentTutorWorkspace.tsx:92` stacks tool timeline, chat thread, artifact card, and evidence drawer as independent blocks.
- `apps/web/src/features/ai/components/AiMessage.tsx:12` renders standard chat bubbles.
- `apps/web/src/features/ai/components/AiArtifactRenderer.tsx:14` renders a dashed card after the assistant message.
- `apps/web/src/features/ai/components/AiComposer.tsx:47` renders intent choices as buttons, not a task model with mode-specific fields, safety states, or previewed outcome.

Impact:

- The assistant does not feel like a learning workspace.
- Evidence and artifacts appear secondary, although trust and provenance should be central in education.
- Teacher and author tasks share the same chat mental model even though they need review, approval, diffing, and audit workflows.

### 7. Multiple AI Surfaces Compete

Evidence:

- `apps/web/src/components/Contexts/AI/ActivityAIChatContext.tsx:4` says one shared context supports `AIActivityAsk` and `AICanvaToolkit`.
- `apps/web/src/features/student-activity/shell/StudentActivityWorkspace.tsx:162` opens `AiAssistantPanel`.
- `apps/web/src/components/Objects/Activities/AI/AIActivityAsk.tsx:36` also opens `StudentTutorWorkspace`.
- `apps/web/src/components/Objects/Editor/AI/AIEditorToolkit.tsx:616` implements an authoring toolbar with its own modal and action model.
- `apps/web/src/components/Objects/Activities/DynamicCanva/AI/AICanvaToolkit.tsx:28` implements another selection bubble.

Impact:

- AI behavior differs by surface.
- The user has no single mental model for "AI can act on the current selection/activity/course".
- Product quality suffers because each surface owns a slice of state, prompts, and rendering.

### 8. Next.js Cache Components Are Available But Not Applied To AI UX

Evidence:

- `apps/web/next.config.ts:34` enables `cacheComponents`.
- AI interaction code is mostly client components around runtime state.

Impact:

- Static and cached LMS context can render instantly, but the AI shell does not separate static layout, cached course state, and dynamic run state.
- The design leaves performance gains on the table: cached course map, cached artifact history, dynamic current run, and streamed evidence can be separate lanes.

## Target Product Vision

Replace the chat sheet with an AI Learning Studio that adapts by role and task. It should still include chat, but chat becomes one part of a richer command surface.

Core surfaces:

- **Student Tutor:** contextual tutoring, progressive hints, source-grounded explanations, practice generation, code hints, and "check my attempt".
- **Teacher Copilot:** cohort risk summaries, misconception clusters, intervention drafts, rubric feedback review, and AI confidence audit.
- **Author Studio:** selected-text rewrite, course-level accessibility review, translation, activity generation, diff preview, and publish approval.
- **AI Run Console:** every run shows status, tools, evidence, costs, safety decisions, approvals, and final artifacts.

Signature UX:

- A three-lane workspace instead of a narrow chat sheet:
  - Left: learning context map with current activity, prerequisites, rubric, and cited fragments.
  - Center: conversation and generated artifact canvas.
  - Right: agent timeline, confidence, next actions, approvals, and audit metadata.
- The assistant speaks in task artifacts: answer, hint ladder, flashcards, patch, rubric explanation, intervention draft.
- Every artifact has source chips, confidence explanation, next action buttons, and "why this" trace.
- Futuristic visual language comes from live structure, not decoration: spatial timeline, evidence map, progressive reveal, crisp dense UI, subtle motion, and strong typography.

## Target Technical Architecture

### Backend: Pydantic AI Agent Runtime

Build an `ai_runtime` service around Pydantic AI primitives:

- Define separate agents or agent specs for:
  - `student_tutor_agent`
  - `authoring_agent`
  - `teacher_intervention_agent`
  - `rubric_feedback_agent`
  - `code_mentor_agent`
  - `router_agent`
- Use Pydantic `output_type` for final artifacts instead of `output_type=str`.
- Keep `str` out of artifact-producing agents unless freeform chat is explicitly allowed.
- Use output validators for:
  - citation IDs must exist in retrieved evidence
  - hint ladders must not reveal full solutions before the allowed level
  - authoring patches must include changed block IDs
  - teacher interventions must include privacy notes
  - rubric feedback must reference rubric criteria when available
- Use Pydantic AI tools instead of pre-retrieval-only context:
  - `search_course_content`
  - `get_activity_structure`
  - `get_learner_progress_snapshot`
  - `get_rubric`
  - `get_submission_summary`
  - `run_code_tests`
  - `draft_authoring_patch`
  - `create_practice_items`
- Use toolsets for role-specific capability bundles.
- Use deferred tools for actions that need approval:
  - insert content into editor
  - publish patch
  - send teacher intervention
  - modify rubric
  - run expensive cohort analysis
- Use `run_stream_events()` or `agent.iter()` when the UI needs the full tool lifecycle. Use `run_stream()` only for simple text streaming.

Doc basis:

- Pydantic AI agents combine instructions, tools, structured output, deps, model settings, and capabilities.
- Pydantic AI structured output validates final values through Pydantic.
- Pydantic AI deferred tools cover approval and external execution.
- Pydantic Logfire and Pydantic Evals support tracing, cost/performance review, and systematic quality checks.

### Stream Contract: AG-UI First, One Version

Create a single v2 protocol and retire v1 after migration.

Target event model:

- `run.started`
- `status.changed`
- `message.delta`
- `thinking.delta` if supported and safe to show
- `tool.started`
- `tool.args.delta`
- `tool.finished`
- `evidence.added`
- `artifact.delta`
- `approval.requested`
- `approval.resolved`
- `usage.delta`
- `run.finished`
- `run.error`
- `run.aborted`

Rules:

- Backend owns `thread_id`, `run_id`, and ordered sequence.
- Frontend does not synthesize run lifecycle if backend already emits it.
- Every event has `version`, `event_id`, `run_id`, `thread_id`, `sequence`, `timestamp`, and typed `payload`.
- Text deltas and structured deltas should map cleanly to TanStack AI `StreamChunk` or `CUSTOM` events with stable names.
- Error events include `recoverable`, `code`, `message`, `user_action`, and `request_id`.

### Frontend: Compound AI Workspace

Replace isolated components with compound composition:

```tsx
<AiStudio.Provider threadId={threadId} role="student">
  <AiStudio.Shell>
    <AiStudio.ContextMap />
    <AiStudio.Main>
      <AiStudio.Thread />
      <AiStudio.ArtifactCanvas />
      <AiStudio.Composer />
    </AiStudio.Main>
    <AiStudio.RunConsole />
  </AiStudio.Shell>
</AiStudio.Provider>
```

Composition rules:

- Provider owns thread/run state, transport, event reducer, and role permissions.
- Slot components read a narrow context interface: messages, artifacts, evidence, timeline, approvals, usage, status, errors.
- Role variants are explicit components, not boolean prop sprawl:
  - `StudentTutorStudio`
  - `TeacherCopilotStudio`
  - `AuthoringStudio`
- Client islands stay small. Static shell and course context render as server components where possible.
- Heavy pieces such as markdown, code preview, timeline detail, and diff viewer load dynamically.

### TanStack AI Integration

Use TanStack AI as the frontend runtime, not just a parser:

- Prefer `fetchServerSentEvents` or `fetcher` when the backend returns a Response.
- Keep custom adapters only where the FastAPI protocol truly differs.
- Forward per-request data through TanStack AI request metadata: activity UUID, role, intent, selected text, locale, thread ID.
- Use `useChat` message parts for text, thinking, and structured output where feasible.
- Use custom events for LMS-specific artifacts, approvals, citations, and usage.
- Add middleware-like client reducers for:
  - event sequence validation
  - duplicate citation merging
  - artifact versioning
  - run cancellation state
  - telemetry breadcrumbs

Doc basis:

- TanStack AI uses AG-UI streaming events for run, text, tool, step, finish, and error lifecycle.
- Connection adapters should honor abort signals and emit terminal events.
- Lazy tool discovery reduces token cost for large tool catalogs.
- Middleware supports lifecycle logging, stream transforms, tool interception, and usage tracking.

### Next.js And Cache Components

Use Cache Components deliberately:

- Static:
  - AI Studio frame
  - role navigation
  - empty-state layout
  - static command definitions
- Cached with `use cache`:
  - course outline
  - activity metadata
  - rubric summaries
  - public teacher-authored course fragments
  - artifact history lists with cache tags
- Dynamic under Suspense:
  - current user permissions
  - live AI run
  - active chat thread
  - approvals
  - usage/cost counters

Invalidation:

- `cacheTag("activity:{uuid}:ai-context")` for activity content.
- `cacheTag("course:{uuid}:ai-map")` for course-level context.
- `updateTag()` after authoring edits that change AI context.
- Use private or dynamic data for learner progress and submissions.

### Data And Memory Model

Persist AI state as domain records, not transient chat blobs:

- `ai_threads`: thread ID, user, role, course, activity, title, retention class.
- `ai_runs`: run ID, model, status, duration, usage, cost estimate, safety state.
- `ai_events`: ordered stream events for replay and audit.
- `ai_artifacts`: typed final and intermediate artifacts.
- `ai_evidence`: citations and retrieval metadata.
- `ai_approvals`: pending, approved, denied, expired.
- `ai_eval_results`: offline and online eval outcomes.

Memory policy:

- Short chat window for generation.
- Durable summaries per thread.
- Role-scoped memories only when useful and approved.
- No hidden cross-course memory for students.
- Explicit retention windows by data class: generated AI, educational record, credential, secret, executable code.

## 2027+ UI/UX Direction

### Visual System

Avoid the generic AI purple gradient look. The product should feel like a high-trust academic cockpit:

- Base surfaces: near-white and near-black paired modes, not a single dark slate theme.
- Accent: one electric cyan or acid green signal color for live agent state, used sparingly.
- Secondary semantic colors: success, warning, destructive through shadcn tokens, not raw hex in components.
- Typography: readable sans for UI, mono/tabular figures for run IDs, confidence, latency, and scores.
- Shape: 6 to 8 px radius for panels and artifacts. Reserve pills for tags and compact status only.
- Motion: 150 to 300 ms transitions for state changes, transform/opacity only, reduced-motion equivalent.

### Workspace Patterns

Student Tutor:

- Activity-aware context rail.
- "Explain", "Hint", "Practice", "Check my answer", and "Show evidence" as mode controls.
- Hint ladder with locked/revealed states.
- Flashcards as study cards with difficulty and citation chips.
- Answer confidence shown as a reasoned statement, not only a percent.

Teacher Copilot:

- Cohort-level misconception clusters.
- At-risk learner queue with explainable factors.
- Intervention draft panel with privacy scope.
- Approval workflow before sending or assigning.
- Audit trace for each recommendation.

Author Studio:

- Selection bubble opens task-specific actions.
- Patch preview uses diff viewer, not plain markdown.
- Insert/replace actions require explicit approval.
- Accessibility and reading-level suggestions include exact block references.
- Translation shows source, target, and glossary constraints.

Run Console:

- Timeline of model, retrieval, tools, citations, validators, approvals, and final artifact.
- Expandable event details for debugging.
- Usage and latency visible to staff roles.
- Student view uses plain language status.

### Accessibility And Interaction Baseline

Use the web interface guideline audit as hard requirements:

- Icon-only buttons need `aria-label`.
- AI progress updates need `aria-live="polite"`.
- Interactive elements use semantic buttons or links.
- Focus states use `focus-visible`.
- Animations honor `prefers-reduced-motion`.
- Long content uses `min-w-0`, wrapping, line clamp, or truncation with access to full text.
- Stateful UI should deep-link when it affects navigation: artifact tab, selected run, evidence drawer, approval item.
- Destructive or publishing actions need confirmation or undo.
- Dates, costs, and scores use `Intl.*`.

## Redesign Phases

### Phase 0: Decision And Inventory

Deliverables:

- Pick one source of truth for stream protocol: v2 AG-UI-compatible events.
- Create an AI surface inventory and remove duplicate prompt ownership.
- Define role/task matrix for student, teacher, author, admin.
- Define privacy classes and retention rules for AI data.

Done when:

- Every AI surface maps to one target workspace.
- The team can answer what the assistant is allowed to know, do, store, and show for each role.

### Phase 1: Contract Unification

Deliverables:

- Replace v1 `status/delta/final/error` with v2 events.
- Generate TypeScript event types from backend Pydantic models or OpenAPI schemas.
- Update the TanStack adapter to treat protocol v2 as supported.
- Add event sequence tests and stream truncation tests.
- Keep a compatibility adapter only during migration.

Done when:

- Frontend no longer warns on v2 events.
- One test fixture can replay a backend stream into the UI event reducer.
- The assistant can cancel a stream and show a recoverable aborted state.

### Phase 2: Structured Agent Outputs

Deliverables:

- Convert `Agent(..., output_type=str)` into artifact-specific agents with typed outputs.
- Add output validators for citations, hints, patches, and rubric feedback.
- Replace `build_artifact_for_intent()` text wrappers with model-validated artifacts.
- Keep a freeform text agent for low-risk chat only.

Done when:

- Flashcards, hint ladders, authoring patches, and rubric feedback come directly from structured model output.
- Artifact rendering has no fake confidence or generic generated fronts.
- Invalid artifacts trigger model retry or safe failure.

### Phase 3: Tool And Retrieval Runtime

Deliverables:

- Move retrieval into an agent tool with streamed tool events.
- Add role-specific toolsets.
- Add lazy/deferred tools for expensive or approval-based actions.
- Add explicit retrieval policy: always cite, explain no-context responses, do not silently skip evidence for short questions.
- Add cache invalidation hooks when activity content changes.

Done when:

- The run console shows retrieval as a tool with inputs, chunk count, and cited results.
- Teacher and author actions use approval flows.
- Retrieval quality is testable with expected citation cases.

### Phase 4: AI Studio UI

Deliverables:

- Build `AiStudio` compound components.
- Replace narrow sheet with responsive three-lane workspace on desktop and staged panels on mobile.
- Render artifacts as primary surfaces, not trailing cards.
- Add run console, evidence map, approval drawer, and artifact actions.
- Replace button-list intents with a task mode selector and contextual composer.

Done when:

- Student, teacher, and author experiences use the same runtime and different role compositions.
- Evidence, artifact, and run progress remain visible without crowding the message thread.
- Keyboard, screen reader, reduced motion, and mobile layouts pass review.

### Phase 5: Memory, Audit, And Governance

Deliverables:

- Persist threads, runs, events, artifacts, evidence, approvals, and usage.
- Add staff-facing audit view.
- Add per-user, per-course, and per-organization AI budgets.
- Add content and PII redaction policies to stream middleware.
- Add retention jobs for generated AI records.

Done when:

- An admin can inspect why an AI suggestion happened.
- A teacher can review AI interventions before use.
- Cost cannot grow unbounded from one learner, class, or tool loop.

### Phase 6: Evaluation And Release Gates

Deliverables:

- Pydantic Evals datasets for:
  - grounded tutoring
  - no-solution hinting
  - flashcard quality
  - rubric explanation accuracy
  - authoring patch safety
  - multilingual Russian/Kazakh/English behavior
- Deterministic unit tests with Pydantic AI `TestModel`.
- Stream replay tests in Vitest.
- Playwright tests for student, teacher, author, cancel, retry, and approval flows.
- Logfire dashboards for latency, tokens, tool errors, refusal rate, citation coverage, and user satisfaction.

Done when:

- AI changes require eval deltas.
- Production incidents can be traced to run, event, tool, model, and artifact.
- Quality is measured before shipping, not judged by manual vibes.

## Component Migration Map

| Current | Target |
| --- | --- |
| `StudentTutorWorkspace` | `StudentTutorStudio` using `AiStudio` slots |
| `ActivityAIChatContext` | `AiStudioProvider` with event reducer and role-scoped capabilities |
| `activity-chat-adapter.ts` | v2 AG-UI-compatible transport or TanStack `fetcher` |
| `AiArtifactRenderer` | artifact-specific canvases: `TutorAnswerCanvas`, `FlashcardDeck`, `HintLadder`, `PatchDiff`, `RubricReview` |
| `AiEvidenceDrawer` | evidence map with source chips, excerpts, relevance, and jump-to-source |
| `AiToolTimeline` | run console timeline with tool args, outputs, errors, and approval state |
| `AIEditorToolkit` | `AuthoringStudio` with selection context and diff approval |
| `AICanvaToolkit` | selection command palette backed by the same studio runtime |
| `AIActivityAsk` | role-aware launcher into the shared studio |

## Technical Acceptance Criteria

- Backend emits one versioned stream protocol.
- Frontend event reducer validates event version and sequence.
- All artifact-producing intents use structured output.
- Citations reference real retrieved chunks or clearly state no source.
- No hardcoded confidence values.
- `stop()` cancels frontend fetch and backend model stream.
- Tool calls appear in the UI timeline.
- Human approval is required before mutating course content or sending interventions.
- AI state persists enough to replay a run.
- Logfire traces include run ID, thread ID, user role, model, tools, usage, and errors.
- Eval suite runs in CI for AI runtime changes.
- Static/cached/dynamic data boundaries align with `cacheComponents`.
- UI uses shadcn/Base UI primitives, semantic tokens, `Field` forms, accessible overlays, and labeled icon buttons.
- No generic "AI assistant" copy where the UI can name the user task.

## Immediate First PR

Ship a narrow but foundational PR:

1. Add a v2 stream fixture and frontend reducer test.
2. Change `ACTIVITY_CHAT_PROTOCOL_VERSION` to support v2.
3. Stop warning on v2 events.
4. Normalize run IDs and thread IDs from backend events.
5. Render v2 `message.delta` as the primary text path or explicitly keep v1 text only behind a migration adapter.
6. Add an ADR documenting that v2 AG-UI-compatible events are the only future protocol.

This first PR does not redesign visuals. It removes the protocol uncertainty that would make every UI improvement brittle.

## Sources Used

- Current backend AI files under `apps/api/src/services/ai/`.
- Current frontend AI files under `apps/web/src/features/ai/`, `apps/web/src/components/Contexts/AI/`, and AI editor/activity toolkits.
- TanStack AI local docs: `ai/docs/getting-started/quick-start.md`, `ai/docs/chat/streaming.md`, `ai/docs/chat/connection-adapters.md`, `ai/docs/tools/lazy-tool-discovery.md`, `ai/docs/advanced/middleware.md`, `ai/docs/structured-outputs/*`.
- Pydantic AI local docs: `pydantic-ai/docs/agent.md`, `pydantic-ai/docs/tools.md`, `pydantic-ai/docs/output.md`, `pydantic-ai/docs/deferred-tools.md`, `pydantic-ai/docs/logfire.md`, `pydantic-ai/docs/evals/quick-start.md`.
- Vercel Web Interface Guidelines: https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md
