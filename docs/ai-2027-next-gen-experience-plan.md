# 2027 AI Experience Plan

## Current State

The legacy AI implementation has been removed from the active product surface. The app should no longer expose the old student assistant launcher, right-side AI layer, shared activity chat provider, authoring AI editor toolkit, `/api/v1/ai/*` chat routes, TanStack AI client adapter, or Pydantic AI service tree.

This is an intentional reset. The previous implementation behaved like an AI chat panel attached to an LMS. The next version must be an AI-native learning and authoring system where the model is part of the workflow, not a detached box competing with the content.

## Product Thesis

The 2027 AI experience should make Ashyq Bilim feel like an adaptive learning operating system:

- Students get contextual coaching, practice, and feedback inside the activity they are doing.
- Teachers get intervention queues, rubric-aware feedback, misconception maps, and class-level insight.
- Authors get AI-assisted course design, content transformation, localization, assessment generation, and quality review.
- Admins get governance, auditability, policy controls, cost controls, and safety reporting.
- Use new shadcn ui AI components where it makes sense.

The interface should be fast, calm, inspectable, and role-specific. Do not rebuild a generic "Ask AI" chat feature.

## Non-Negotiables

- AI must never cover the primary learning or authoring surface during serious work.
- Every AI action must be policy-gated by role, activity type, assessment state, course settings, and organization settings.
- Every substantive answer must expose what context was used, what was not used, and confidence limits.
- Generated changes to course content, assessments, rubrics, grades, or feedback must require preview and explicit approval.
- Student help must protect learning: hints before answers, practice before solutions, and assessment lockouts by default.
- Teacher workflows must improve decisions, not replace professional judgment.
- All AI runs must be observable, replayable, and tied to cost, latency, safety, and quality metrics.

## Experience Architecture

### 1. AI Study Layer

Students should see AI as a study instrument embedded in the activity shell.

Core modes:

- `Understand`: explain a selected passage, diagram, video timestamp, code block, or question.
- `Practice`: generate retrieval questions, flashcards, short quizzes, and misconception checks.
- `Hint`: provide progressive hints that stop short of giving away graded answers.
- `Review`: summarize what the student has completed, where they struggled, and what to do next.
- `Debug`: for code challenges, inspect compiler output and guide the student through the next correction.

The layer should use a compact contextual launcher, an inline answer workspace, and optional side evidence. It should not resurrect the old side sheet.

### 2. Teacher Intelligence Console

Teachers need a work queue, not a chatbot.

Core surfaces:

- `Needs attention`: students blocked, inactive, repeatedly failing, or submitting low-confidence work.
- `Misconception map`: common errors grouped by concept, activity, class, and cohort.
- `Feedback drafts`: rubric-grounded comments that teachers can accept, edit, or reject.
- `Intervention builder`: recommended small-group actions, remedial content, and direct messages.
- `Assessment integrity`: anomaly signals, plagiarism context, excessive AI-help flags, and policy violations.

The teacher console should default to evidence and next actions. Long AI prose is secondary.

### 3. Authoring Studio

Authors need a professional editing workflow with diffs and approvals.

Core capabilities:

- Course outline generation from goals, audience, prerequisites, and time budget.
- Lesson transformation into summaries, examples, checks for understanding, and alternate explanations.
- Assessment generation from learning objectives, with rubric and difficulty controls.
- Localization across Kazakh, Russian, and English with glossary preservation.
- Accessibility review for headings, alt text, reading level, captions, and keyboard flow.
- Content quality review for broken references, stale instructions, weak examples, and missing prerequisites.

AI-generated authoring output should land in a review lane with structured diffs, not directly inside the editor document.

### 4. Admin Governance

Admins need policy, control, and audit.

Core controls:

- Role-level feature flags.
- Course-level and assessment-level AI policy.
- Organization-level budget caps.
- Provider/model allowlists.
- Data retention settings.
- PII redaction and logging policy.
- Safety categories and escalation workflows.

The admin view should expose AI usage as operational telemetry: spend, latency, failures, blocked requests, teacher overrides, and student outcomes.

## Runtime Architecture

### Command Model

Replace chat-first APIs with typed commands:

- `student.explain_selection`
- `student.generate_practice`
- `student.request_hint`
- `student.review_progress`
- `student.debug_code`
- `teacher.summarize_class_risk`
- `teacher.draft_feedback`
- `teacher.plan_intervention`
- `author.generate_outline`
- `author.transform_lesson`
- `author.generate_assessment`
- `author.localize_content`
- `author.review_quality`

Each command should declare:

- Actor role and permissions.
- Required context inputs.
- Allowed tools.
- Output schema.
- Safety policy.
- Cost budget.
- Streaming events.
- Approval requirements.

### Context System

Create a context graph instead of passing raw activity JSON to prompts.

Context nodes:

- Course goals.
- Chapter objectives.
- Activity content.
- Assessment policy.
- Rubric.
- Student progress.
- Submission history.
- Teacher feedback.
- Discussion context.
- Code execution output.
- Locale and glossary.

The runtime should select context by command, role, and policy. Users must be able to inspect the selected context in plain language.

### Agent Runtime

Build the next backend around a small set of explicit orchestrators:

- `CommandRouter`: validates command, actor, policy, and budget.
- `ContextAssembler`: builds the allowed context graph.
- `Planner`: decides whether retrieval, tools, or direct generation are needed.
- `ToolExecutor`: runs constrained tools with typed inputs and outputs.
- `ArtifactGenerator`: produces structured outputs only.
- `SafetyGate`: moderates input, intermediate tool output, and final output.
- `ApprovalStore`: records generated changes and human decisions.
- `RunLedger`: stores events, cost, latency, model, tool calls, and evaluation results.

Do not build one giant universal agent. Route to narrow, testable workflows.

### Stream Contract

Use versioned, typed events:

- `run.started`
- `policy.checked`
- `context.selected`
- `tool.started`
- `tool.completed`
- `artifact.delta`
- `artifact.completed`
- `safety.checked`
- `approval.required`
- `run.completed`
- `run.failed`

The frontend should render these as workflow state, not as a debug console.

## Data Model

Add durable tables for the next implementation:

- `ai_commands`: command registry and version metadata.
- `ai_threads`: user-visible workflow sessions.
- `ai_runs`: one execution attempt with actor, command, policy, model, and status.
- `ai_events`: append-only event stream.
- `ai_context_refs`: selected context references and hashes.
- `ai_artifacts`: structured generated outputs.
- `ai_approvals`: human accept/edit/reject records.
- `ai_usage_ledger`: tokens, cost, latency, provider, and cache hit data.
- `ai_eval_results`: automated and human quality checks.
- `ai_policy_overrides`: org/course/activity exceptions.

Legacy AI chat sessions and vector chunks should not be reused as the source of truth.

## Frontend Implementation Plan

### Phase 1: Foundations

- Define AI command types in a shared package.
- Add feature flags for student, teacher, author, and admin AI surfaces.
- Add role and activity policy checks before rendering any launcher.
- Build a shared `AiRunPanel` for status, evidence, safety state, and approvals.
- Add generated API types from the new backend contract only.

Done when no UI imports legacy AI code and every future entry point goes through a typed command.

### Phase 2: Student Study Layer

- Add contextual launchers to activity header, text selections, video timestamps, code output, and feedback areas.
- Build inline answer cards with citations, hint steps, practice items, and next actions.
- Add assessment lockout behavior.
- Add student-facing context inspection.
- Add telemetry for use, abandonment, blocked requests, and learning outcomes.

Done when students can use AI without leaving or covering the activity.

### Phase 3: Authoring Studio

- Add an authoring AI route or resizable workspace.
- Build draft lanes for outline, lesson patch, assessment, localization, and quality review.
- Implement structured diffs for editor content.
- Require approval before applying changes.
- Store every accepted, edited, and rejected suggestion.

Done when AI-assisted authoring produces reviewable changes instead of direct document mutations.

### Phase 4: Teacher Console

- Build the teacher work queue.
- Add misconception clustering and class risk summaries.
- Add feedback drafts tied to rubrics and submissions.
- Add intervention plans with editable messages and content links.
- Track teacher edits as quality feedback.

Done when teachers can act from AI insight without trusting an opaque answer.

### Phase 5: Governance And Evals

- Add admin policy pages.
- Add cost controls and per-org budgets.
- Add replayable run audit pages.
- Add automated eval datasets for every command.
- Add dashboards for safety, quality, latency, and cost.

Done when AI is operable in production, not just demoable.

## Quality Bar

### UX Acceptance Criteria

- No overlapping AI panels on learning or authoring screens.
- No generic empty chat box as the primary interface.
- No hidden context selection.
- No direct content mutation without preview.
- No AI affordance during blocked assessment states unless explicitly allowed.
- Mobile, tablet, and desktop layouts must have separate interaction designs.

### Engineering Acceptance Criteria

- All commands have typed input and output schemas.
- All streamed events are versioned and tested.
- All provider calls have timeout, retry, budget, and cancellation behavior.
- All generated artifacts are validated before display.
- All human decisions are persisted.
- All AI tests run without live provider calls in CI.
- Contract generation removes stale routes from frontend types.

### Safety Acceptance Criteria

- Input and output moderation are separate.
- PII redaction happens before provider calls where policy requires it.
- Assessment states are enforced server-side.
- Student answer leakage is tested.
- Teacher feedback remains editable and attributable.
- Admin audit can reconstruct what happened.

## Suggested First Build Slice

Start with one narrow, high-value path:

1. `student.request_hint` for non-exam activities.
2. Context from current activity content and student progress only.
3. Output as a typed hint ladder with three steps.
4. Server-side policy gate for locked activities and active assessments.
5. Inline UI inside the activity shell.
6. Run ledger with events, cost placeholder, and safety result.
7. CI tests with deterministic fake model output.

This proves the new architecture without rebuilding the whole AI platform at once.

## Explicitly Out Of Scope

- Re-adding the removed chat provider.
- Re-adding the old editor AI toolkit.
- Reusing `/api/v1/ai/start/activity_chat_session`.
- Rebuilding `features/ai` as a mixed UI/runtime folder.
- Directly inserting generated authoring content into Tiptap.
- Shipping provider calls without run ledger and policy gates.
