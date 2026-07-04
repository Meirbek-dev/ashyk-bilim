# AI UI and UX redesign plan

## Design read

Reading this as: education workflow product UI for students and teachers, with a restrained operational design language, leaning on the existing Next.js 16, React 19, shadcn base-nova, lucide, TanStack Query, and FastAPI AI runtime.

This is not a landing-page redesign. The AI layer should feel like a learning tool inside the activity workspace, not a separate marketing-style assistant.

Recommended dials:

- Visual density: 7/10 for teacher and admin workflows, 5/10 for student learning.
- Motion intensity: 2/10, limited to progress, panel transitions, streaming text, and state feedback.
- Design variance: 4/10, because trust, focus, and accessibility matter more than visual novelty here.
- Signature interaction: a persistent activity toolbar button that opens an independently scrollable floating AI panel while the activity content remains scrollable.

## Skill lenses applied

- `next-best-practices`: keep route data in Server Components, isolate interactive AI panels as client leaves, use URL-backed state, preserve RSC boundaries, and avoid client-only data waterfalls.
- `vercel-react-best-practices`: use the existing queued run and SSE infrastructure instead of blocking mutations, dynamically load heavy AI surfaces when opened, and keep panel state scoped to avoid re-rendering the activity body.
- `vercel-composition-patterns`: build an `AIWorkspace` and `ActivityAIPanel` from compound components instead of one boolean-heavy assistant component.
- `shadcn`: use existing `toolbar`, `sheet`, `drawer`, `scroll-area`, `tabs`, `message`, `message-scroller`, `field`, `input-group`, `button`, `tooltip`, `badge`, `progress`, `skeleton`, `alert`, and `empty` primitives with semantic tokens.
- `web-design-guidelines`: icon-only controls need labels, async progress needs `aria-live`, panel focus must trap correctly, URL state should represent selected mode and thread, and animations must respect reduced motion.
- `ui-ux-pro-max`: prioritize accessible touch targets, clear loading/error states, semantic status tokens, no horizontal overflow, and responsive panel behavior.
- `frontend-design` and `design-taste-frontend`: avoid generic AI purple, hero-card layouts, "magic" copy, and decorative chat theatrics. Use source-first, task-first, direct copy.
- `stop-slop`: UI copy should name the action: "Ask about this activity", "Explain this step", "Review this submission", "Show sources", "Cancel run".

## Current state verified

The earlier plan in `plans/ai-implementation-improvement-plan.md` is directionally useful but partly stale.

Backend progress already exists:

- `apps/api/src/services/ai/policy.py` derives course AI role server-side and provides course, submission, remediation, run, and admin access guards.
- `apps/api/src/routers/ai/course_qa.py` no longer accepts a client-supplied `role` in `CourseQARequest`.
- `apps/api/src/services/ai/operations.py` has queued run creation, worker dispatch, run events, cancellation checks, citation validation, and fail-closed feature flags.
- `apps/api/src/routers/ai/runs.py` exposes run status, event history, SSE streaming, and cancellation with access checks.
- `apps/api/src/services/ai/context/sources.py` provides source bundles and citation validation, though the source model is still minimal.

Frontend gaps remain:

- `apps/web/src/features/student-activity/shell/ActivityHeader.tsx` already accepts `assistantSlot`, but `apps/web/src/features/student-activity/shell/StudentActivityWorkspace.tsx` does not pass it.
- `StudentActivityWorkspace` renders `CourseAIHub` after the content, so users must scroll to the bottom before they can use AI.
- `apps/web/src/features/course-analysis/api/use-course-analysis.ts`, `apps/web/src/features/submission-analysis/api/use-submission-analysis.ts`, `apps/web/src/features/student-study/api/use-study-companion.ts`, and `apps/web/src/features/course-qa/api/use-ask-question.ts` still call synchronous endpoints for main workflows.
- `apps/web/src/features/ai-experience/api/use-ai-run-stream.ts`, `use-ai-run-status.ts`, and `use-cancel-ai-run.ts` exist, but the main feature panels rarely use them.
- `apps/web/src/features/course-qa/api/use-qa-threads.ts` exists, but `CourseAIHub` does not render a real thread list.
- `CourseAIHub` uses local default tabs, not URL-backed selected mode.
- Teacher activity studio top bars, especially `apps/web/src/features/assessments/studio/AssessmentStudioWorkspace.tsx`, do not expose a persistent AI entry point.
- Several AI feature entries still render isolated `Card` blocks with direct `Button` usage, icon sizing classes, and `space-y-*` drift instead of the shared `AIActionButton` and compound result primitives.
- `apps/web/e2e/specs/07-ai-experience.spec.ts` mocks synchronous final responses, so it does not test queued progress, cancellation, stream failure, panel focus, or activity-toolbar access.

## Product diagnosis

The product currently treats AI as a set of feature cards. That forces students and teachers to leave their working context. In an LMS, AI should sit beside the task:

- A student reads, watches, solves, or submits while asking follow-up questions in a panel.
- A teacher edits, reviews, or grades while asking for analysis without losing the item on screen.
- The assistant shows what context it used, what it cannot see, what sources support the answer, and whether the output is draft or publishable.

The current design misses three UX promises:

1. Availability: AI is not always reachable from activity pages.
2. Continuity: AI results do not consistently survive reloads, panel closing, or route sharing.
3. Trust: context, evidence, progress, cancellation, and visibility are not presented as a coherent workflow.

## Target design

### 1. Activity AI toolbar action

Add an always-visible AI action to the activity toolbar.

Student activity pages:

- Mount the trigger through `ActivityHeader.assistantSlot`.
- Trigger label:
  - Desktop: `Ask AI`
  - Icon-only narrow state: `aria-label="Open AI assistant"`
- Use `Toolbar` or `Button` inside the existing right-side header control group.
- Keep the trigger visible while reading and navigating normal activity content.
- Hide or switch to a constrained "Ask after attempt" state during active assessments where AI would violate exam policy.
- In focus mode, either keep a smaller trigger in `FocusHeader` or explicitly suppress it when focus mode means distraction-free reading.

Teacher activity pages:

- Add the same trigger to teacher top bars:
  - `AssessmentStudioWorkspace` topbar.
  - File submission studio topbar.
  - Dynamic lecture `EditorWrapper` chrome.
  - Review workspaces for grading and submission analysis.
- The teacher trigger opens teacher modes first: `Review`, `Analyze`, `Draft feedback`, `Course Q&A`.
- The trigger should respect backend feature availability and permissions.

### 2. Floating AI panel

Create `apps/web/src/features/ai-experience/activity-panel/*`.

Recommended components:

- `ActivityAIPanel.Root`
- `ActivityAIPanel.Trigger`
- `ActivityAIPanel.Content`
- `ActivityAIPanel.Toolbar`
- `ActivityAIPanel.ModeTabs`
- `ActivityAIPanel.ThreadList`
- `ActivityAIPanel.ContextBar`
- `ActivityAIPanel.RunProgress`
- `ActivityAIPanel.Messages`
- `ActivityAIPanel.Composer`
- `ActivityAIPanel.EvidenceDrawer`
- `ActivityAIPanel.FooterStatus`

Desktop behavior:

- Use a floating right panel or docked side sheet with `position: fixed`.
- Width: `min(28rem, calc(100vw - 2rem))`.
- Height: `calc(100dvh - header offsets - safe-area)`.
- Top aligns below the global nav and activity header.
- Panel content uses `ScrollArea`; the page content keeps its own scroll.
- Panel can be collapsed, resized later if needed, and closed with Escape.
- Focus returns to the toolbar trigger on close.

Mobile behavior:

- Use `Drawer` or bottom `Sheet`, not a tiny right panel.
- Height: `min(88dvh, available viewport)`.
- Keep the composer sticky inside the panel, above the safe-area inset.
- Use one tab row and no secondary columns.

Accessibility:

- `SheetTitle` or visible panel title is required.
- Trigger has an accessible label in icon-only state.
- New messages and run state updates use `aria-live="polite"`.
- Errors use `role="alert"` only when immediate attention is required.
- Panel supports Escape, Tab order, and reduced motion.
- No content should be hidden behind fixed bottom bars.

### 3. AI modes by role and activity

Student modes:

- `Ask`: Q&A about current activity and course.
- `Explain`: explain selected content or the current activity objective.
- `Practice`: generate one small practice task tied to the current activity.
- `Sources`: show citations and context visibility.

Teacher modes:

- `Review`: critique lecture or assessment content.
- `Analyze`: course, activity, or submission analysis.
- `Draft feedback`: create teacher-reviewed feedback.
- `Remediation`: generate and preview remediation gates.
- `Ask`: teacher Q&A that may include unpublished course context only when policy allows.

Mode availability should come from a backend capability response, not from hardcoded frontend role guesses.

### 4. Context model visible to users

Add a compact context bar at the top of the panel:

- Current course.
- Current activity or submission.
- Role-derived visibility: `Student context`, `Teacher context`, or `Admin context`.
- Source count and estimated tokens when available.
- "Show sources" opens an evidence drawer.
- "Not included" list for sensitive contexts, such as hidden rubric, answer keys, private notes, or unpublished content.

This makes the assistant feel bounded and trustworthy.

### 5. Queued run adoption

Replace final-response mutations with queued flows.

Frontend flow:

1. User submits a prompt or action.
2. Client calls the feature queue endpoint.
3. Backend returns `{ run_uuid, status }`.
4. Panel starts `useAIRunStream("ai/runs/${runUuid}/stream")`.
5. `ActivityAIPanel.RunProgress` renders events.
6. When terminal, invalidate the feature result query and read the persisted artifact or message.
7. Cancellation uses `useCancelAIRun`.

Do this for:

- Course Q&A.
- Study companion.
- Course analysis.
- Submission analysis.
- Remediation generation.
- Lecture review.

Keep synchronous endpoints temporarily for compatibility, but hide them behind shared hooks so UI components do not care which transport is active.

### 6. Durable Q&A and URL state

Update Q&A behavior:

- Replace flat thread-message listing with a thread summary endpoint:
  - `thread_uuid`
  - `title`
  - `updated_at`
  - `last_message_preview`
  - `message_count`
  - `activity_uuid`
- Persist selected mode and thread in search params:
  - `?ai=open&aiMode=ask&aiThread=thread_...`
- `CourseAIHub` and the activity panel should share the same state contract.
- Opening the panel from an activity should default to the current activity scoped thread.
- Deleting a thread should update URL state and focus the next sensible thread.

### 7. Composition rewrite

Create a shared `AIWorkspace` layer:

```tsx
<AIWorkspace.Root scope={scope} run={run}>
  <AIWorkspace.Header />
  <AIWorkspace.ContextPreview />
  <AIWorkspace.ModeTabs />
  <AIWorkspace.Body />
  <AIWorkspace.Progress />
  <AIWorkspace.Evidence />
  <AIWorkspace.Actions />
</AIWorkspace.Root>
```

Feature panels should compose this instead of rendering isolated cards. Keep feature-specific rendering in small slots:

- `CourseAnalysisResult`
- `SubmissionAnalysisResult`
- `RemediationPreview`
- `LectureSuggestionList`
- `StudyAnswer`
- `QAMessageList`

Avoid boolean prop sprawl. Prefer explicit variants:

- `StudentActivityAssistant`
- `TeacherActivityAssistant`
- `AdminAIConsole`

### 8. Visual system

Use the current base-nova shadcn system.

- Keep neutral surfaces and semantic status tokens.
- Do not add AI-purple gradients or glow effects.
- Use lucide because the project is configured for lucide.
- Use compact typography inside the panel: `text-sm`, `text-xs`, tabular numbers for tokens and cost.
- Use 8px radius or the existing token default.
- Use `Progress`, `Badge`, `Alert`, `Skeleton`, and `Empty` instead of custom status boxes.
- Keep cards only for repeated artifacts or review items. The panel itself should be an app surface, not cards inside cards.

## Implementation roadmap

### Phase 0: Design contract and safety gates

Goal: define exactly where AI can appear and when it must be disabled.

Tasks:

1. Add an AI capability endpoint:
   - course UUID
   - activity UUID
   - submission UUID when applicable
   - actor role derived by backend
   - enabled features
   - exam or active-attempt restrictions
   - allowed context visibility
2. Add frontend `AIScope` type:
   - `courseUuid`
   - `activityUuid`
   - `submissionUuid`
   - `surface: "student-activity" | "teacher-studio" | "teacher-review" | "course-page" | "admin"`
3. Add no-access, disabled, active-assessment, and budget-exceeded states.
4. Add copy keys for `Open AI assistant`, `Ask about this activity`, `Show sources`, `Cancel run`, and `AI is unavailable for this activity`.

Exit criteria:

- The toolbar trigger never appears when policy forbids AI.
- Disabled states explain the reason and do not invite a failed request.
- No frontend role string controls context visibility.

### Phase 1: Activity panel shell

Goal: make AI reachable from activity pages without changing AI behavior yet.

Tasks:

1. Build `ActivityAIPanel` using `Sheet` on desktop and `Drawer` on mobile.
2. Wire `StudentActivityWorkspace` to pass `assistantSlot` into `ActivityHeader`.
3. Move `CourseAIHub` out of the bottom of `StudentActivityWorkspace`.
4. Render the AI panel as a sibling to `main`, not inside the scrollable content.
5. Add URL state: `ai=open`, `aiMode`, and `aiThread`.
6. Preserve focus on close and support Escape.
7. Add Playwright coverage for opening the panel from an activity page.

Exit criteria:

- A student can open AI from the toolbar while staying at the same scroll position.
- The AI panel scrolls independently from the activity content.
- Closing the panel does not reset content scroll or lose the selected thread.

### Phase 2: Shared AI workspace primitives

Goal: replace scattered card patterns with composable primitives.

Tasks:

1. Create `AIWorkspace` compound components.
2. Convert `CourseAIHub` to use `AIWorkspace` inside the panel.
3. Convert `QAPanel`, `StudyCompanionPanel`, `CourseAnalysisEntry`, `SubmissionAIEntry`, and `LectureAIEntry` to shared trigger, progress, result, evidence, error, and empty states.
4. Replace direct loading `Button` patterns with `AIActionButton` or `AIRunTrigger`.
5. Replace `space-y-*` in AI components with flex or grid gaps.
6. Replace icon sizing inside buttons with `data-icon`.
7. Add `aria-live` to progress and output arrival.

Exit criteria:

- All AI flows share loading, running, cancelled, failed, empty, and success rendering.
- shadcn conventions are followed in AI components.
- No feature card owns its own inconsistent async state UI.

### Phase 3: Queue and stream integration

Goal: make slow AI work visible, cancellable, and durable.

Tasks:

1. Add queued frontend hooks:
   - `useQueueCourseQuestion`
   - `useQueueStudyCompanion`
   - `useQueueCourseAnalysis`
   - `useQueueSubmissionAnalysis`
   - `useQueueRemediation`
   - `useQueueLectureReview`
2. Add a shared `useAIRunController` hook:
   - queue mutation
   - current run UUID
   - stream events
   - status fallback polling
   - cancel mutation
   - terminal artifact refresh
3. Render run phases in `AIWorkspace.Progress`.
4. Add cancellation buttons for all long-running runs.
5. Keep stream parsing defensive against malformed JSON.
6. Add tests for queued, running, finished, failed, and cancelled states.

Exit criteria:

- The panel never waits silently for a 120 second request.
- Users can cancel active runs.
- Run progress persists if the panel closes and reopens.

### Phase 4: Teacher activity integration

Goal: give teachers the same persistent AI access in authoring and review contexts.

Tasks:

1. Add `TeacherActivityAssistantTrigger` to:
   - `AssessmentStudioWorkspace`
   - file submission studio shell
   - dynamic lesson editor chrome
   - grading review workspace
2. Default teacher panel mode by surface:
   - Studio: `Review`
   - Review page: `Draft feedback`
   - Course workspace: `Analyze`
3. Add context preview for unpublished content and teacher-only sources.
4. Add apply/dismiss workflows only where backend actions exist.
5. Store audit events for publish, dismiss, and accepted feedback.

Exit criteria:

- Teachers can scroll/edit content while using AI.
- Teacher AI outputs show source context and review status before any publish action.
- Student-visible effects require explicit teacher action.

### Phase 5: Durable threads and source navigation

Goal: make AI conversations reusable and inspectable.

Tasks:

1. Add thread summary API.
2. Add thread list UI inside the panel.
3. Scope new threads to course plus optional activity or submission.
4. Add source chips to every answer.
5. Let source chips scroll the activity page to matching anchors when possible.
6. Add unsupported-answer rendering when citations are missing or invalid.

Exit criteria:

- Users can resume prior threads after reload.
- URLs can deep-link to an open panel, mode, and thread.
- Sources connect back to course/activity content.

### Phase 6: Admin and operations polish

Goal: make AI manageable after launch.

Tasks:

1. Replace editable-looking disabled switches with real guarded forms or read-only states.
2. Add provider health, failure rate, queue age, latency, token use, and budget warnings.
3. Use `Table` for runs and failures, not custom rows.
4. Use `Chart` only for questions operators ask often.
5. Add filters to URL state.
6. Add confirmation for high-impact setting changes.

Exit criteria:

- Admins can see what ran, who ran it, what it cost, what context it used, and why it failed.
- Settings do not look editable unless they are editable.

## Proposed file map

New frontend files:

- `apps/web/src/features/ai-experience/activity-panel/activity-ai-panel.tsx`
- `apps/web/src/features/ai-experience/activity-panel/activity-ai-trigger.tsx`
- `apps/web/src/features/ai-experience/activity-panel/activity-ai-url-state.ts`
- `apps/web/src/features/ai-experience/activity-panel/use-ai-scope-capabilities.ts`
- `apps/web/src/features/ai-experience/workspace/ai-workspace.tsx`
- `apps/web/src/features/ai-experience/workspace/use-ai-run-controller.ts`
- `apps/web/src/features/ai-experience/workspace/ai-context-preview.tsx`
- `apps/web/src/features/ai-experience/workspace/ai-run-progress.tsx`

Frontend files to modify first:

- `apps/web/src/features/student-activity/shell/StudentActivityWorkspace.tsx`
- `apps/web/src/features/student-activity/shell/ActivityHeader.tsx`
- `apps/web/src/features/course-qa/components/course-ai-hub.tsx`
- `apps/web/src/features/course-qa/components/qa-panel.tsx`
- `apps/web/src/features/student-study/components/study-companion-panel.tsx`
- `apps/web/src/features/course-analysis/components/course-analysis-entry.tsx`
- `apps/web/src/features/submission-analysis/components/submission-ai-entry.tsx`
- `apps/web/src/features/lecture-authoring-ai/components/lecture-ai-entry.tsx`

Backend files likely needed:

- `apps/api/src/routers/ai/admin.py` or a new capability router.
- `apps/api/src/services/ai/policy.py`
- `apps/api/src/routers/ai/course_qa.py`
- `apps/api/src/db/ai_runtime.py` if activity-scoped thread metadata needs first-class columns.

## Acceptance criteria

- Activity pages show an always-visible AI toolbar trigger for eligible students and teachers.
- The AI panel floats above the activity layout and scrolls independently.
- Users can scroll activity content while reading or writing in the AI panel.
- Panel open state, selected mode, and selected thread survive reload through URL state.
- Main AI workflows use queued runs and visible progress.
- Users can cancel long-running AI work.
- Every answer or analysis displays sources or an insufficient-evidence state.
- Student views never include teacher-only, hidden rubric, answer-key, or unpublished context.
- Teacher-visible outputs show draft, reviewed, published, dismissed, or assigned status.
- All icon-only controls have accessible labels.
- Async updates use `aria-live`.
- Playwright covers open panel, scroll independence, Q&A success, stream progress, failure, cancellation, and policy-disabled states.

## First implementation order

1. Build the `ActivityAIPanel` shell and wire it through `ActivityHeader.assistantSlot`.
2. Remove the bottom-of-content `CourseAIHub` from student activities and render it inside the panel.
3. Add URL state for panel, mode, and thread.
4. Add capability gating and disabled states.
5. Convert Q&A to use thread list and queued run flow.
6. Convert study companion to queued run flow.
7. Convert course analysis, submission analysis, remediation, and lecture review.
8. Add teacher studio and review toolbar triggers.
9. Add source navigation and context preview.
10. Replace admin placeholders with guarded settings and run operations views.
