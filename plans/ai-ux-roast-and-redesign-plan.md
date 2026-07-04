# AI UX roast and redesign plan

## Executive roast

The current AI experience looks like a prototype that learned the word "assistant" but not the job it is supposed to do. It opens as a modal side sheet, blurs or blocks the actual lesson, then asks the user to trust a tiny isolated panel that cannot comfortably show the content, evidence, history, actions, or consequences of the AI output.

The core mistake is product model, not color. The interface treats AI as a separate widget. In an LMS, AI must be a working layer inside reading, authoring, grading, review, and remediation flows. Right now it interrupts those flows.

The screenshots show three brutal problems:

1. **The assistant hides the work it claims to help with.** The lesson/editor becomes visually and interactively secondary. That defeats the whole "uses this activity as context" promise.
2. **The panel is too narrow for the content it renders.** The course review result collapses into a vertical strip of words, which makes the output unreadable and makes "Publish score" feel reckless.
3. **The UI has modes, but not workflows.** Ask, Review, and Analyze are tabs. They are not useful task flows with context preview, evidence inspection, edit/apply/reject states, history, or source navigation.

This is not an assistant yet. It is a drawer with AI-shaped controls.

## Evidence from current screenshots

### Screenshot 1: Ask mode on a lesson page

What the user sees:

- A right-side "AI Assistant" sheet.
- The lesson content behind it is blurred or visually suppressed.
- Ask, Review, Analyze tabs appear, but Ask has an empty state and a plain textarea.
- The empty state says there are no questions yet.
- There is no visible thread list, suggested prompts, source list, activity outline, or context boundary beyond a vague teacher/student badge.

Why this fails:

- The assistant claims the activity is the context, then makes the activity hard to use while the assistant is open.
- The empty state wastes the most valuable panel space. It should help the user start with relevant actions.
- The input is generic. "Ask about this course..." is weaker than context-aware starters like "Explain the current section", "Quiz me on this paragraph", or "What does this code do?"
- The answer area and composer are disconnected from the lesson. There is no way to reference selected text, current heading, code block, timestamp, PDF page, or assessment item.
- The panel does not feel durable. Threads, history, source chips, and URL state are not surfaced clearly.

### Screenshot 2: Review mode on teacher/course editor

What the user sees:

- The review result is crammed into the same narrow panel.
- "Course quality score 45" is shown with confidence/status badges.
- A long Russian summary wraps into one or two words per line.
- "Publish score" is available even though the evidence and actionable findings are not visible.
- The main editor behind the panel is suppressed.

Why this fails:

- A quality review is not a chat message. It needs a report layout, sections, findings, severity, affected content, evidence, and recommended fixes.
- Publishing a course score from a narrow unreadable card is dangerous. The UI gives the strongest action before the teacher can inspect the basis.
- The panel width is optimized for short chat, then reused for structured review. That is the wrong container for the job.
- The "High confidence" badge is meaningless without showing why the system is confident, which sources were used, and what was omitted.
- The output language/content density is not handled. Long localized text becomes visually broken.

## Current implementation read

Relevant files:

- `apps/web/src/features/ai-experience/activity-panel/activity-ai-panel.tsx`
- `apps/web/src/features/ai-experience/activity-panel/activity-ai-trigger.tsx`
- `apps/web/src/features/ai-experience/activity-panel/activity-ai-url-state.ts`
- `apps/web/src/features/ai-experience/activity-panel/use-ai-scope-capabilities.ts`
- `apps/web/src/features/student-activity/shell/StudentActivityWorkspace.tsx`
- `apps/web/src/features/course-qa/components/course-ai-hub.tsx`
- `apps/web/src/features/course-qa/components/qa-panel.tsx`
- `apps/web/src/features/course-analysis/components/course-analysis-entry.tsx`
- `apps/web/src/features/course-analysis/components/course-analysis-result-shell.tsx`
- `apps/web/src/features/ai-experience/components/ai-result-shell.tsx`

Good progress already exists:

- There is a toolbar trigger in student activity pages.
- There is a URL-backed panel open state: `ai=open`, `aiMode`, `aiThread`.
- AI capability gating exists through `useAIScopeCapabilities`.
- Q&A uses queued runs through `useAIRunController`.
- There are shared primitives for progress, evidence, empty state, action buttons, privacy notice, and result shell.

But the UX is still weak because those pieces are assembled into the wrong spatial model:

- Desktop uses `Sheet`, which behaves like a modal overlay. That is appropriate for settings, not for a learning sidecar.
- The panel has a fixed narrow width: `min(28rem, calc(100vw - 2rem))`.
- Every mode renders inside the same constrained scroll area, regardless of whether the mode is chat, study, course review, remediation, or teacher feedback.
- `CourseAnalysisEntry` nests a `Card` inside the assistant surface, and `CourseAnalysisResultShell` nests another result card. This creates a card-in-panel-in-sheet pattern with poor density.
- `CourseAnalysisResultShell` shows the score, status, and publish action, but does not render the actual review report as structured findings.
- `QAPanel` has no visible thread rail, source rail, prompt starters, selected-context control, or "use current selection" affordance.
- `AIRunProgress` is generic and not tied to meaningful phases like collecting context, checking policy, generating answer, validating sources, or saving result.

## Product principles

1. **AI must not steal the workspace.** On desktop, the lesson/editor/review surface remains readable and interactive while AI is open.
2. **Different AI jobs need different layouts.** Chat can fit in a compact side panel. Course review needs a report view. Submission feedback needs a grading workflow. Remediation needs a preview and assignment workflow.
3. **Context must be visible before trust.** Users need to see what the AI can read, what it cannot read, and where each claim came from.
4. **Actions must follow inspection.** Do not put "Publish", "Apply", or "Assign" before evidence, diff, preview, and human review state.
5. **The UI should be operational, not theatrical.** No AI glow, no novelty layout, no generic assistant copy. Use concrete workflow verbs.
6. **AI output is a draft until a person makes it real.** Every teacher-facing generated artifact needs draft, reviewed, edited, published, dismissed, or assigned state.

## Target IA

Replace the current single "AI Assistant" drawer with an **AI Workspace** that has three presentation modes.

### 1. Compact sidecar

Use for:

- Student Q&A.
- Explain current section.
- Practice prompt.
- Quick source lookup.

Desktop behavior:

- Non-modal docked panel, not a modal `Sheet`.
- Width: 360-440 px by default.
- Main content remains visible, readable, scrollable, and selectable.
- Panel can collapse to icon rail.
- Optional resize handle after the first stable version.

Mobile behavior:

- Bottom drawer is acceptable.
- Composer stays sticky above safe area.
- Lesson is not visible while drawer is open, but that is acceptable on small screens.

### 2. Wide review workspace

Use for:

- Course AI review.
- Lecture critique.
- Assessment quality review.
- Teacher-visible content analysis.

Desktop behavior:

- Open as a wide right workspace or full-height split panel.
- Width: 560-760 px, or 40-48 percent of viewport.
- Main editor shrinks but remains visible.
- The review result uses sections and tables, not chat cards.

### 3. Full review route

Use for:

- Publishing a course score.
- Reviewing high-risk findings.
- Assigning remediation.
- Approving submission feedback for students.

Desktop behavior:

- Dedicated route or full-page workspace.
- Left: content/source navigation.
- Center: findings/result.
- Right: evidence, audit, action panel.

This avoids forcing serious teacher decisions through a narrow drawer.

## Required UX changes

### P0: Stop using a modal sheet for desktop AI

Problem:

- The current desktop panel behaves like a modal overlay.
- It visually suppresses the lesson/editor.
- It prevents the assistant from feeling integrated with the working surface.

Plan:

- Replace desktop `Sheet` in `ActivityAIPanel` with a non-modal docked panel.
- Keep `Drawer` for mobile.
- Use layout state on the workspace root, for example `data-ai-open="true"`.
- Let the workspace grid allocate space:
  - main content: `minmax(0, 1fr)`
  - AI sidecar: `var(--ai-panel-width)`
- Keep page scroll and panel scroll independent.
- Preserve focus behavior manually:
  - opening moves focus to panel title or first useful control
  - Escape closes the panel
  - close returns focus to `ActivityAITrigger`

Acceptance criteria:

- Opening AI does not blur, dim, or block the lesson/editor on desktop.
- Users can select lesson text while AI is open.
- Users can scroll the lesson and the AI panel independently.

### P0: Split chat, review, and action layouts

Problem:

- Ask and Review are rendered in the same narrow container.
- Course review content becomes unreadable.
- "Publish score" appears before sufficient inspection.

Plan:

- Add a mode layout registry:
  - `ask`, `explain`, `practice`, `sources`: compact sidecar.
  - `review`, `analyze`, `draft-feedback`, `remediation`: wide workspace.
- In `ActivityAIPanel`, compute layout from active mode and surface.
- For `review` and `analyze`, use a wider panel or prompt the user into a dedicated review route.
- Move high-impact actions into a sticky footer or explicit review step.
- Require evidence visibility before enabling publish/apply actions.

Acceptance criteria:

- Course review summary does not wrap into unusable one-word columns.
- Publish/apply/assign actions are visually downstream of findings and evidence.
- The same AI panel does not force every task into the same dimensions.

### P0: Redesign Course AI Review as a report, not a card

Problem:

- `CourseAnalysisResultShell` shows score, confidence, status, timeline, and evidence, but not the actual useful report.
- The result reads like metadata wrapped around missing substance.

Plan:

Render structured sections:

- Score summary:
  - current score
  - confidence
  - last run date
  - model used
  - visibility state
- Critical blockers:
  - issue
  - severity
  - affected section/activity
  - evidence
  - recommended fix
- Content quality:
  - learning outcomes
  - alignment
  - sequencing
  - missing prerequisites
  - accessibility/readability
- Assessment quality:
  - coverage
  - ambiguity
  - grading/rubric alignment
  - feedback quality
- Remediation risks:
  - likely misconceptions
  - missing practice
  - weak explanations
- Evidence:
  - grouped source chips
  - source count
  - omitted/private context
- Actions:
  - "Create fix tasks"
  - "Rerun after edits"
  - "Publish reviewed score"
  - "Dismiss report"

Acceptance criteria:

- A teacher can understand why the score is 45 without reading raw markdown.
- Every finding links to a course section, activity, assessment, or source.
- Publishing requires explicit confirmation and shows student/admin visibility.

### P0: Replace empty Ask state with useful starters

Problem:

- "No questions yet" is dead space.
- The user needs help forming the first useful prompt.

Plan:

In `QAPanel`, empty state should show:

- Current context chip: course, activity, heading/selection if available.
- Suggested prompts:
  - "Explain this section"
  - "Summarize the key idea"
  - "Quiz me on this"
  - "What should I know before continuing?"
  - "Find sources for this answer"
- Thread starter:
  - "New question"
  - recent thread list if available
- Source visibility:
  - source count
  - teacher/student/admin context badge
  - "Show sources"

Acceptance criteria:

- First-time panel use has at least 4 useful one-click starters.
- The empty state is actionable and context-specific.
- The user can start from the current activity without typing a generic prompt.

### P1: Add selected-context workflows

Problem:

- The assistant says it uses the activity as context, but the user cannot control or inspect that context.

Plan:

- Add "Ask about selection" for selected text in lesson/editor.
- Add source anchors:
  - current heading
  - current code block
  - video timestamp
  - PDF page
  - assessment item
  - submission answer
- Add context preview:
  - included sources
  - omitted sources
  - restricted sources
  - token estimate
- Add source chips to answers.
- Clicking a source chip scrolls the main content to the source.

Acceptance criteria:

- User can ask about selected content without copying it manually.
- Every answer shows citations or an insufficient-evidence state.
- Source chips navigate back to the actual lesson/editor content where possible.

### P1: Make threads first-class

Problem:

- URL state exists, but the UI does not make conversation history obvious.

Plan:

- Add a thread list inside the assistant:
  - title
  - last message preview
  - updated time
  - mode/scope badge
- Add "New thread" and "Rename thread".
- Scope threads to:
  - course
  - activity
  - submission when relevant
- Keep selected thread in `aiThread`.
- Remove duplicate `thread` query param if possible, or strictly alias it with one source of truth.

Acceptance criteria:

- Reloading preserves open panel, mode, and selected thread.
- Users can switch prior threads without losing current context.
- New activity creates or suggests activity-scoped threads.

### P1: Improve run progress and failure states

Problem:

- Progress currently reports generic state labels.
- Users cannot tell what the AI is doing or whether it is stuck.

Plan:

Render meaningful phases from `AIEvent`:

- Checking access.
- Collecting course context.
- Selecting sources.
- Generating response.
- Validating citations.
- Saving result.
- Complete.

Failure states must include:

- what failed
- whether anything was saved
- retry action
- fallback action
- support/debug ID when available

Acceptance criteria:

- Long AI runs never look like a frozen button.
- Cancellation is visible and works consistently.
- Failures are actionable, not just red text.

### P1: Add teacher review states

Problem:

- Teacher-facing AI output jumps from generated to publishable too quickly.

Plan:

Every teacher artifact should have explicit state:

- draft
- needs review
- edited
- approved
- published
- dismissed
- stale after content changed

Actions:

- Edit before publish.
- Compare AI draft vs teacher-edited version.
- Dismiss with reason.
- Rerun after edits.
- Publish with confirmation.

Acceptance criteria:

- Student-visible output cannot be published accidentally.
- Teachers can edit generated feedback or findings before publishing.
- Audit history records publish, edit, dismiss, and rerun.

### P1: Fix density, typography, and localization

Problem:

- The UI collapses localized text into ugly narrow columns.
- Cards inside cards waste width.

Plan:

- Use compact operational typography:
  - headings inside panel: `text-sm` to `text-base`
  - dense metadata: `text-xs`
  - report body: readable line length, not a tiny column
- Remove nested cards inside the assistant panel.
- Use unframed sections, tables, accordions, and findings lists.
- Add `min-w-0`, `break-words`, and line clamps where needed.
- Ensure Russian and Kazakh strings fit in buttons and badges.
- Use `Intl` for dates, counts, tokens, and cost.

Acceptance criteria:

- Long localized summaries remain readable.
- Buttons do not wrap badly or overflow.
- The panel no longer looks like cards trapped inside a card.

### P2: Build a real AI command surface

Problem:

- Modes are tabs, but users think in commands.

Plan:

Add an assistant command menu:

- Ask about this activity.
- Explain current section.
- Generate practice.
- Show sources.
- Review this lecture.
- Analyze this course.
- Draft feedback.
- Generate remediation.

Commands should be filtered by:

- role
- surface
- activity type
- capability endpoint
- active assessment restrictions
- feature flags

Acceptance criteria:

- Users can discover actions without guessing which tab owns them.
- Commands are role-aware and policy-aware.
- Disabled commands show a reason.

## Component implementation plan

### Phase 1: Desktop docked panel

Files:

- `apps/web/src/features/ai-experience/activity-panel/activity-ai-panel.tsx`
- `apps/web/src/features/student-activity/shell/StudentActivityWorkspace.tsx`
- `apps/web/src/components/Objects/Editor/EditorWrapper.tsx`
- `apps/web/src/features/assessments/studio/AssessmentStudioWorkspace.tsx`
- `apps/web/src/features/file-submissions/studio/FileSubmissionStudio.tsx`

Tasks:

- Replace desktop `Sheet` with `ActivityAIPanel.Dock`.
- Keep mobile `Drawer`.
- Add `ActivityAIPanel.LayoutProvider` or simple URL/layout state.
- Add workspace classes for compact vs wide modes.
- Ensure main content stays interactive.
- Add focus return and Escape behavior.

### Phase 2: Mode-aware layouts

Files:

- `apps/web/src/features/ai-experience/activity-panel/activity-ai-panel.tsx`
- `apps/web/src/features/course-qa/components/course-ai-hub.tsx`
- `apps/web/src/features/course-analysis/components/course-analysis-entry.tsx`

Tasks:

- Add `getAIModeLayout(mode, surface)`.
- Compact modes render chat/study panel.
- Wide modes render report/review workspace.
- Add a route escape hatch: "Open full review".
- Stop rendering structured reports in the compact chat width.

### Phase 3: Q&A empty state and thread rail

Files:

- `apps/web/src/features/course-qa/components/qa-panel.tsx`
- `apps/web/src/features/course-qa/components/qa-input.tsx`
- `apps/web/src/features/course-qa/api/use-qa-threads.ts`
- `apps/web/src/features/course-qa/components/qa-message.tsx`

Tasks:

- Add `QAThreadList`.
- Add `QAPromptStarters`.
- Add selected context chip.
- Add source chips and source drawer.
- Use `setThread` from `useActivityAIUrlState` instead of duplicating selection logic.

### Phase 4: Course review report

Files:

- `apps/web/src/features/course-analysis/components/course-analysis-result-shell.tsx`
- `apps/web/src/features/course-analysis/components/course-analysis-entry.tsx`
- `apps/web/src/features/ai-experience/components/ai-result-shell.tsx`

Tasks:

- Replace generic result shell for course analysis with `CourseAnalysisReport`.
- Render findings, severity, affected content, and evidence.
- Move publish action behind a review confirmation.
- Add stale state if course content changed since analysis.
- Add "Create fix tasks" placeholder only if backend support exists. Otherwise omit it.

### Phase 5: Evidence and source navigation

Files:

- `apps/web/src/features/ai-experience/components/ai-evidence-panel.tsx`
- `apps/web/src/features/ai-experience/components/ai-citation-link.tsx`
- `apps/web/src/features/content-markdown/renderer/*`
- activity/player/editor surfaces that can expose anchors

Tasks:

- Standardize citation shape.
- Add source anchors to rendered content.
- Scroll to source on citation click.
- Show unsupported-answer state when citations are missing.

### Phase 6: Teacher review lifecycle

Files:

- `apps/web/src/features/lecture-authoring-ai/*`
- `apps/web/src/features/submission-analysis/*`
- `apps/web/src/features/remediation/*`
- backend AI approval/audit endpoints as needed

Tasks:

- Add draft/edit/publish/dismiss states.
- Add audit metadata.
- Add edit-before-publish for feedback.
- Add confirmation modals for student-visible changes.

## Design details

### Desktop layout

Compact AI open:

```text
| lesson/editor main content                           | AI sidecar 400px |
```

Wide review open:

```text
| lesson/editor/source content 55-60% | review workspace 40-45% |
```

Full review:

```text
| source nav | report/finding detail | evidence/actions |
```

### Panel header

Replace vague header copy with:

- Title: `Ashyq AI`
- Scope line:
  - `Course: Beginning work with Ashyq Bilim`
  - `Activity: Git branch basics`
- Context badge:
  - `Student context`
  - `Teacher context`
  - `Admin context`
- Source status:
  - `12 sources available`
  - `3 teacher-only sources omitted`

### Mode labels

Student:

- Ask
- Explain
- Practice
- Sources

Teacher:

- Review
- Analyze
- Draft Feedback
- Remediation
- Sources

Do not show unavailable modes as normal tabs. Hide them or show disabled command items with reasons.

### Empty Ask state

Replace:

```text
No questions yet
Ask about this course...
```

With:

```text
Ask about this activity

[Explain current section]
[Quiz me on this]
[Summarize key points]
[Show sources]

Using: current activity + visible course materials
Not using: hidden teacher notes, answer keys
```

### Course review report layout

```text
Course quality
Score 45 / 100
Needs teacher review
High confidence

Critical blockers
1. Learning outcome is not measurable
2. Practice does not cover branch workflows
3. Assessment rubric is missing

Findings
| Severity | Area | Finding | Evidence | Fix |

Sources
[Lecture 1] [Chapter 1] [Assessment rubric]

Actions
[Rerun] [Export report] [Publish reviewed score]
```

## Accessibility requirements

- Desktop AI dock must not trap focus like a modal.
- Mobile drawer can trap focus.
- All icon buttons need `aria-label`.
- Async run updates need `aria-live="polite"`.
- Errors should focus the first actionable recovery control only when user action is required.
- Escape closes the AI panel when focus is inside it.
- Tabs or segmented controls must use consistent keyboard behavior.
- Prompt textareas need `name`, `autocomplete="off"`, and useful labels.
- Source chips need accessible names like `Open source: Lecture 1, section 1.2`.
- Reduced motion must disable nonessential streaming/progress animation.

## Testing plan

### Playwright

Add or update `apps/web/e2e/specs/07-ai-experience.spec.ts`:

- Opens AI from activity toolbar.
- Verifies lesson content is not blurred or blocked on desktop.
- Verifies lesson scroll and AI scroll are independent.
- Verifies compact Ask mode empty starters render.
- Verifies Q&A creates a thread and URL includes `ai=open`, `aiMode=ask`, `aiThread`.
- Verifies Review mode uses wide layout.
- Verifies Course Review report does not render one-word columns at 1440px and 1920px.
- Verifies Publish is disabled or gated until findings/evidence are inspectable.
- Verifies mobile uses bottom drawer.
- Verifies active assessment restriction hides or disables AI with reason.

### Component tests

- `ActivityAIPanel` compact vs wide layout.
- `QAPromptStarters` action submission.
- `QAThreadList` selection updates URL.
- `CourseAnalysisReport` renders findings and evidence.
- `AIRunProgress` renders meaningful phases and cancel action.
- Capability-disabled states.

### Visual checks

Desktop viewports:

- 1366 x 768
- 1440 x 900
- 1920 x 1080

Mobile viewports:

- 390 x 844
- 430 x 932

Checks:

- no unreadable narrow columns
- no clipped buttons
- no overlapping fixed bars
- no hidden composer behind safe area
- no page blur on desktop dock

## Success metrics

Usability:

- Student can ask a context-aware question within 5 seconds of opening the panel.
- Teacher can understand the top 3 course review issues without scrolling through raw markdown.
- Teacher cannot publish AI-generated course score without inspecting review state.

Trust:

- 100 percent of AI answers show sources or an insufficient-evidence state.
- 100 percent of teacher-visible artifacts show draft/review/publish state.
- 0 student-facing outputs include teacher-only context.

Performance:

- AI panel opens within 150 ms after capability data is cached.
- Initial empty state renders without waiting for a model request.
- Long runs show first progress event within 1 second of queue creation.

Quality:

- No AI panel screenshot at supported desktop widths contains one-word-per-line report text.
- No AI action button has vague copy like "Continue" or "Submit" when the action is publish, rerun, ask, cancel, assign, or analyze.

## Priority order

1. Replace desktop modal sheet with non-modal docked panel.
2. Add compact vs wide AI layouts by mode.
3. Redesign Course AI Review as a report.
4. Replace Q&A empty state with prompt starters and visible context.
5. Add visible thread list and clean URL thread state.
6. Add source chips and source navigation.
7. Add teacher review lifecycle states.
8. Expand Playwright coverage and visual regression checks.

The shortest useful fix is not a new coat of paint. It is changing the assistant from an interrupting modal into a workspace sidecar, then refusing to render serious teacher review workflows inside a cramped chat drawer.
