# Student AI 2027 Experience Plan

## Status

The legacy student AI surface has been removed from the student activity shell. The current app should not expose the old right-side assistant panel, header AI toggle, activity ask button, shared AI chat wrappers, or the experimental chat/composer component set.

Runtime contracts, stream reducers, authoring AI hooks, and backend-facing AI types remain in place so the next implementation can reuse the stable parts without carrying forward the old UX.

## Why This Rebuild Exists

The previous student AI UI behaved like a debugging console attached to learning content. It exposed internal concepts such as evidence cards, artifact canvases, status badges, stream progress, and generic chat controls in a cramped side sheet. That made the experience hard to understand, hard to trust, and hard to use while studying.

The next version should feel like a native learning layer, not a chat widget. A student should know what the AI can do, why it is using specific context, what it is allowed to change, and what they should do next.

## Product Thesis

Build an AI study layer that sits inside the activity experience and adapts to the student's task: understand content, practice recall, get a hint, debug code, prepare a submission, or review progress.

The AI should feel like a responsive learning instrument:

- Context-aware without being noisy.
- Action-oriented without hiding evidence.
- Helpful without completing assessed work for the student.
- Fast enough for short study loops.
- Visually integrated with the activity, not bolted on as a separate app.

## Hard Requirements

- Do not restore the old side-sheet assistant.
- Do not restore generic "Ask AI" as the primary UX.
- Do not expose raw run events, internal artifacts, or evidence dumps as default student UI.
- Do not make the student leave the activity to use AI.
- Do not allow AI actions during locked, unavailable, or active assessment states unless policy explicitly permits them.
- Preserve backend stream contracts until a replacement contract is agreed.
- Keep authoring AI separate from student AI.

## Removed Legacy Surface

The student shell no longer renders:

- `AiAssistantPanel`
- `AIActivityAsk`
- `StudentTutorWorkspace`
- Legacy shared AI chat wrappers under `components/Shared/AI`
- Legacy feature AI UI components under `features/ai/components`
- Dynamic Canva AI bubble toolkit
- UI-only chat component test for the removed surface

The `features/ai` barrel now exports contracts, intents, reducers, and runtime helpers only.

## Current Technical Baseline

Keep:

- `features/ai/api/ai-event-contract.ts`
- `features/ai/api/activity-ai-client.ts`
- `features/ai/intents/activity-intents.ts`
- `services/ai/activity-chat-adapter.ts`
- `components/Contexts/AI/ActivityAIChatContext.tsx` for authoring and future rebuild integration

Replace:

- Student AI entry point
- Student AI trigger model
- Student chat thread UI
- Evidence rendering
- Artifact presentation
- Prompt suggestions
- Loading and streaming states
- Safety and consent UI

## Target Experience

### 1. AI Study Layer

The primary entry should be an unobtrusive study layer attached to the activity shell, not a full-height right drawer. The layer opens from a compact launcher near the student's current task area and can expand into a focused workspace when needed.

Recommended entry points:

- A small contextual launcher in the activity header only when AI is available.
- Inline selection actions for text, code, and media transcripts.
- Empty-state actions in activities where students commonly need guidance.
- A keyboard-accessible command palette action.

### 2. Task Modes

The UI should organize AI around student intent instead of chat history.

Core modes:

- Understand: explain the current section, define terms, summarize prerequisites.
- Practice: generate recall questions, flashcards, mini quizzes, and spaced repetition prompts.
- Hint: provide progressive hints without revealing final answers.
- Debug: help interpret code errors, test cases, and algorithm choices.
- Submit: check work against rubric requirements without writing the submission.
- Reflect: show what the student has learned and what to review next.

Each mode should set expectations before a run starts.

### 3. Context Lens

Instead of dumping evidence into a rail, show a readable context lens:

- "Using this activity"
- "Using your selected text"
- "Using your latest code output"
- "Using course prerequisites"
- "Not using private submission files"

The student should be able to expand the lens to inspect sources, but the default state should explain context in plain language.

### 4. Progressive Answer Canvas

Responses should render as learning objects, not chat bubbles only.

Answer types:

- Explanation card with key idea, example, and next step.
- Hint ladder with locked progressive reveal.
- Practice set with answer reveal and self-rating.
- Code diagnosis with likely cause, smallest next action, and test to run.
- Submission checklist with rubric mapping.
- Concept map for dense theory pages.

Chat can exist as a secondary surface for follow-ups, but the first response should be structured around the task.

### 5. Consent Boundary

Every AI output should make clear what it can and cannot do.

Examples:

- Hints can guide, but not solve locked exam questions.
- Submission support can check coverage, but not write final work.
- Course edits are not available to students.
- Generated practice items are study aids, not grades.

Consent controls:

- Save to notes.
- Add to practice queue.
- Copy.
- Regenerate with a different mode.
- Report confusing or unsafe output.

## Visual Direction

The student AI should feel calm, precise, and academic, with a visible difference between activity content and AI assistance.

### Palette

- Paper: `#FBFAF7`
- Ink: `#202124`
- Graphite: `#565B66`
- Signal Blue: `#2F6FDB`
- Learning Green: `#2D8A57`
- Caution Amber: `#B86B00`
- Soft Violet: `#7B61FF`

Use color functionally:

- Blue for active AI focus.
- Green for completed learning actions.
- Amber for policy, uncertainty, or assessment limits.
- Violet only for generated practice artifacts or creative study transformations.

### Typography

- UI and body: project default sans stack.
- Data and code: existing monospace stack.
- Learning object titles: semibold, compact, sentence case.
- Avoid oversized hero typography inside activity tools.

### Layout Signature

Use a "study instrument" layout:

```text
+----------------------------------------------------------+
| Activity header                              AI launcher  |
+----------------------------------------------------------+
|                                                          |
| Activity content                                         |
|                                                          |
|    [inline AI action appears near selected content]       |
|                                                          |
+----------------------------------------------------------+
| Optional AI layer                                        |
| +------------------+ +---------------------------------+ |
| | Context lens     | | Structured answer canvas         | |
| | Mode picker      | | Follow-up composer               | |
| | Safety boundary  | | Practice / hints / debug output  | |
| +------------------+ +---------------------------------+ |
+----------------------------------------------------------+
```

On mobile, the AI layer should become a bottom sheet with stable snap points:

- Peek: launcher and current mode.
- Half: answer preview and primary action.
- Full: context lens, answer canvas, follow-up composer.

## Component Architecture

Create a new student-specific feature namespace:

```text
apps/web/src/features/student-ai/
  api/
    student-ai-client.ts
    student-ai-policy.ts
  components/
    StudentAiLauncher.tsx
    StudentAiLayer.tsx
    StudentAiModePicker.tsx
    StudentAiContextLens.tsx
    StudentAiAnswerCanvas.tsx
    StudentAiHintLadder.tsx
    StudentAiPracticeSet.tsx
    StudentAiCodeDiagnosis.tsx
    StudentAiSubmissionChecklist.tsx
    StudentAiFollowUpComposer.tsx
    StudentAiSafetyBoundary.tsx
    StudentAiRunStatus.tsx
  hooks/
    useStudentAiAvailability.ts
    useStudentAiSession.ts
    useStudentAiSelection.ts
  state/
    student-ai-store.ts
  types.ts
```

Rules:

- Do not place student AI components under `features/ai/components`.
- Keep `features/ai` as shared runtime and protocol code.
- Keep authoring AI under editor-owned modules.
- Student shell imports only from `features/student-ai`.
- Activity-specific renderers should pass context snapshots through typed props, not hidden global assumptions.

## Runtime Model

The new student AI session should track:

- Availability: enabled, disabled, locked, assessment-limited, offline.
- Activity context: course, activity, selection, attempt state, progress state.
- Mode: understand, practice, hint, debug, submit, reflect.
- Run state: idle, preparing, streaming, complete, failed, cancelled.
- Output object: typed learning object plus optional conversation turns.
- Source summary: human-readable context lens items.
- Safety state: permitted, restricted, blocked.

Avoid storing the entire UI state in the old chat context. Use a student AI session hook with a narrow interface.

## API Contract Direction

The backend should return typed student learning objects, not only freeform assistant text.

Proposed response envelope:

```ts
interface StudentAiRun {
  runId: string
  mode: StudentAiMode
  state: 'streaming' | 'complete' | 'failed' | 'cancelled'
  context: StudentAiContextSummary[]
  safety: StudentAiSafetyState
  output: StudentAiOutput
  followUps: StudentAiFollowUp[]
}
```

Output variants:

- `explanation`
- `hint_ladder`
- `practice_set`
- `code_diagnosis`
- `submission_checklist`
- `concept_map`
- `refusal`

Stream events should remain append-only and resumable. The UI should be able to rebuild the final state from events.

## Safety And Learning Policy

Policy should be visible in product behavior, not hidden in backend prompts.

Required rules:

- During active attempts, AI availability must be policy-driven.
- For graded submissions, AI can critique against rubric but must not write final answers.
- For code challenges, AI can explain errors and concepts but should not produce complete accepted solutions unless the activity allows it.
- For locked content, AI should not reveal unavailable material.
- For teacher-created content, student AI should cite current activity context when making factual claims.
- When confidence is low, the UI should say what context is missing and offer a narrower action.

## Accessibility Requirements

- Full keyboard operation for launcher, mode picker, context lens, answer canvas, and composer.
- Escape closes transient layers in predictable order.
- Focus returns to the launcher after close.
- Streaming updates use polite live regions.
- Reduced motion disables animated transitions and token streaming effects.
- Color is never the only signal for policy or confidence.
- Touch targets are at least 40 px.
- Mobile sheets must not trap users below the fold.

## Performance Requirements

- No student AI bundle should load on pages where AI is unavailable.
- Lazy-load the AI layer after launcher interaction or clear availability.
- Keep initial activity page layout stable.
- Stream visible structured output progressively.
- Avoid rendering long hidden evidence lists.
- Cache context summaries per activity until content changes.

## Telemetry

Track product events without logging private student content by default.

Events:

- `student_ai_launcher_viewed`
- `student_ai_opened`
- `student_ai_mode_selected`
- `student_ai_run_started`
- `student_ai_run_completed`
- `student_ai_run_cancelled`
- `student_ai_policy_blocked`
- `student_ai_context_lens_opened`
- `student_ai_practice_saved`
- `student_ai_feedback_submitted`

Metrics:

- Time to first useful output.
- Mode selection frequency.
- Follow-up rate.
- Cancellation rate.
- Policy block rate.
- Practice save rate.
- Reported confusion rate.

## Implementation Plan

### Phase 0: Product And Policy Contract

- Define student AI availability rules per activity type.
- Define assessment restrictions with product, teaching, and safety owners.
- Confirm whether AI is enabled for anonymous users.
- Confirm which activity context can be sent to the model.
- Confirm retention rules for prompts and generated learning objects.

Exit criteria:

- Written policy matrix exists.
- Backend can answer "is AI available here?" for every student activity state.

### Phase 1: New Shell Integration

- Create `features/student-ai`.
- Add `useStudentAiAvailability`.
- Add a disabled-by-default launcher behind a feature flag.
- Integrate launcher into `ActivityHeader` without restoring the old button behavior.
- Add keyboard and mobile behavior tests.

Exit criteria:

- Launcher appears only when policy allows it.
- No old AI UI imports return.
- Activity layout does not shift when AI is disabled.

### Phase 2: Context Lens

- Build typed context summary collection.
- Show selected text, current activity, attempt state, and course context as readable chips.
- Add expandable source inspection.
- Add policy boundary copy.

Exit criteria:

- Students can see what the AI is using before sending.
- Restricted contexts are visible as restricted, not silently omitted.

### Phase 3: Structured Answer Canvas

- Build typed renderers for explanation, hint ladder, practice set, code diagnosis, and submission checklist.
- Use Markdown only inside controlled rich text fields.
- Add copy, save, regenerate, and report actions.

Exit criteria:

- The first AI response is a useful learning object, not a plain chat bubble.
- Each output type has loading, empty, error, and completed states.

### Phase 4: Streaming Runtime

- Connect the new UI to the existing stream reducer or a student-specific reducer.
- Add abort, retry, and resume handling.
- Render partial structured output during streaming.
- Log telemetry.

Exit criteria:

- Runs can be cancelled.
- Failed runs produce clear recovery actions.
- Streamed output remains stable and readable.

### Phase 5: Activity-Specific Modes

- Dynamic lesson: understand, practice, reflect.
- Code challenge: debug, hint, practice.
- File submission: submit, understand, reflect.
- Video: summarize transcript, practice, explain timestamp.
- Exam: policy-limited hint mode only when allowed.

Exit criteria:

- Mode list changes by activity type and policy.
- Unsupported modes are not shown.

### Phase 6: Quality Gate

- Add unit tests for availability, state reducer, and output renderers.
- Add interaction tests for launcher, mode picker, streaming, cancel, and mobile sheet.
- Add visual screenshots for desktop and mobile.
- Run `vp check` and `vp test`.

Exit criteria:

- No legacy AI UI imports exist.
- Student AI passes accessibility smoke checks.
- Product owner can test the full flow on at least three activity types.

## Acceptance Criteria

- A student can open AI help from the activity without losing reading context.
- A student can choose a task mode before asking.
- A student can inspect what context the AI will use.
- A student receives a structured learning object instead of an undifferentiated chat answer.
- A student can ask a follow-up without restarting the flow.
- A student can save practice material or copy an explanation.
- The UI clearly blocks or limits AI in restricted assessment states.
- The implementation does not import removed legacy components.
- The implementation works on desktop and mobile.

## Open Decisions

- Should student AI be available globally or per-course feature flag?
- Should generated practice sets persist to a study queue?
- Should teachers see aggregate AI usage signals?
- Should students be able to attach files, or only use activity context?
- Should AI explain course content in the student's selected locale automatically?
- Should the first release support voice, or defer it until the core task flows work?

## First Build Slice

Start with one narrow, high-quality path:

1. Dynamic lesson activity only.
2. Launcher in activity header.
3. Modes: Understand and Practice.
4. Context lens: current activity and selected text.
5. Output renderers: explanation and practice set.
6. No persistence beyond the current session.
7. Feature flag off by default.

This gives the team a real student experience to evaluate without recreating the old generic assistant.
