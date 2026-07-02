# AI implementation improvement plan

## Executive diagnosis

The current AI implementation has useful building blocks, but it is not production ready yet. The backend already has typed output schemas, Pydantic AI agents, prompt files, run/artifact/evidence tables, and feature-specific routers. The frontend already has shared AI UI primitives, TanStack mutations, shadcn components, and feature-local entry points. The main gap is not a lack of pieces. The gap is orchestration, authorization, observability, persistence, and a product model that makes AI feel trustworthy inside an LMS.

The highest-risk issue is data exposure. Several AI endpoints are unauthenticated or under-authorized, and course Q&A trusts a client-supplied `role` to decide whether unpublished course content should be sent to the model. That must be fixed before polishing UI or expanding features.

The second major issue is that the app models AI as synchronous button clicks instead of long-running, auditable workflows. The database has concepts for queued runs, events, approvals, evals, usage, safety, and artifacts, but the service layer mostly fills only final status and artifact fields. The frontend has streaming/status hooks, but the main flows do not use them. This creates a mismatch between the product promise and the runtime reality.

The target should be a quiet, evidence-first AI workspace for teachers and learners. Avoid a marketing-style AI interface, purple glows, generic "magic" copy, and chat-only thinking. The better direction is an operational LMS AI layer: clear permissions, context previews, citation-backed outputs, visible progress, human review, durable threads, cancellation, and measured quality.

## Skill lenses applied

- `next-best-practices`: use Server Components for reads, Server Actions or server-owned mutations where appropriate, route handlers for external APIs and streaming, Suspense for slow data, URL-backed view state, and strict RSC/client boundaries.
- `vercel-react-best-practices`: remove avoidable client waterfalls, keep bundles small, reduce rerenders in AI surfaces, and stream slow work instead of blocking the whole interaction.
- `vercel-composition-patterns`: replace repeated feature cards with composable AI workspace primitives instead of boolean-heavy monoliths.
- `shadcn`: keep Base/Nova tokens, use installed primitives consistently, avoid raw colors and `space-y-*`, use `data-icon` for icons in buttons, compose forms through `Field` and `Form`, and use `Alert`, `Empty`, `Skeleton`, `Progress`, `Badge`, `Dialog`, `Sheet`, and `Tooltip` intentionally.
- `web-design-guidelines`: enforce semantic controls, accessible labels, aria-live for async states, keyboard support, focus-visible states, URL-reflected tabs/filters, robust empty/error states, and reduced-motion behavior.
- `ui-ux-pro-max`, `frontend-design`, and `design-taste-frontend`: treat this as a serious education workflow product, not a landing page. Use dense but readable operational layouts, concrete copy, restrained motion, clear visual hierarchy, and visible evidence.
- `stop-slop`: keep copy specific, direct, and product-grounded. Avoid vague AI claims and generic feature descriptions.

## Current architecture

### Backend

The backend AI stack lives mainly in:

- `apps/api/src/routers/ai/*`
- `apps/api/src/services/ai/operations.py`
- `apps/api/src/services/ai/providers.py`
- `apps/api/src/services/ai/agents/*`
- `apps/api/src/services/ai/context/course_context.py`
- `apps/api/src/db/ai_runtime.py`
- `apps/api/src/services/ai/prompts/*`

The good parts:

- Pydantic AI is already used for structured outputs.
- Feature workflows exist for course analysis, submission analysis, remediation, study companion, course Q&A, and lecture critique.
- The database schema has useful future-facing entities: `AIThread`, `AIRun`, `AIEvent`, `AIArtifactRecord`, `AIEvidence`, `AIApproval`, `AIEvalResult`, and student memory tables.
- Prompt files are separated by task.
- Token estimation and basic budget checks exist.
- Tests already cover some config, context, token budget, provider-disabled behavior, and basic hardening.

The weak parts:

- Authorization is inconsistent.
- Runtime execution is synchronous despite queued/run/event concepts.
- Provider calls do not consistently capture actual model, output tokens, cost, latency, request IDs, or failure taxonomy.
- Context assembly is character-clipped text, not source-ranked context with validated citations.
- Draft-mode fallback can create plausible artifacts when AI is disabled.
- Feature flags are not enforced as production controls.
- Existing memory/vector dependencies are not connected to a durable retrieval or personalization strategy.

### Frontend

The frontend AI stack lives mainly in:

- `apps/web/src/features/ai-experience/*`
- `apps/web/src/features/course-analysis/*`
- `apps/web/src/features/course-qa/*`
- `apps/web/src/features/student-study/*`
- `apps/web/src/features/submission-analysis/*`
- `apps/web/src/features/remediation/*`
- `apps/web/src/features/lecture-authoring-ai/*`
- `apps/web/src/features/ai-admin/*`
- `apps/web/e2e/specs/07-ai-experience.spec.ts`

The good parts:

- Shared AI components already exist: result shell, action button, evidence panel, run timeline, error recovery, empty state, confidence meter, and streaming text.
- The project has a rich shadcn component set installed.
- TanStack Query mutations are already used for most actions.
- There is an admin usage panel, even though it is incomplete.
- The UI is already modular by feature area.

The weak parts:

- Most AI flows are final-response mutations, not streamed or evented workflows.
- Q&A stores thread state locally and loses it on reload.
- Tabs and threads are not represented in the URL.
- Admin feature toggles are disabled placeholders.
- Some routes and E2E mocks do not match.
- Repeated card/button patterns make the experience feel generic and fragmented.
- Accessibility and design-system rules are inconsistently applied.

## Critical findings

### P0: Client-supplied role can expose unpublished course content

`apps/api/src/routers/ai/course_qa.py` accepts `CourseQARequest.role`, passes it into `ask_course_question`, and `apps/api/src/services/ai/operations.py` uses that role to set `include_unpublished`.

Impact:

- A student can send `role: "teacher"` or `role: "admin"` and cause unpublished course material, hidden assessment context, or teacher-only content to be assembled and sent to the model.
- Even if the final answer avoids direct leakage, the provider receives data the user should not be allowed to access.

Plan:

- Delete role trust from the request contract.
- Derive actor role server-side from authenticated user, course enrollment, ownership, and permission checks.
- Treat `audience` as a requested output style only, never as an access selector.
- Add regression tests where a student attempts role escalation and unpublished context is not included.

### P0: Several AI endpoints lack authentication or resource authorization

Examples found during review:

- `apps/api/src/routers/ai/submission_analysis.py`: latest submission analysis read path has no current user dependency.
- `apps/api/src/routers/ai/course_analysis.py`: latest course analysis read path has no current user dependency.
- `apps/api/src/routers/ai/lecture_authoring.py`: list reviews and dismiss suggestion lack current user checks.
- `apps/api/src/routers/ai/remediation.py`: get remediation session and list student remediation lack current user checks.
- `apps/api/src/routers/ai/runs.py`: get run and cancel run lack current user checks.
- `apps/api/src/routers/ai/token_usage.py`: usage and budget endpoints lack admin guard.
- `run_submission_analysis` and `run_remediation_generation` accept a submission UUID but do not prove the actor owns the submission or can grade that course.
- `run_study_companion` and `ask_course_question` load course context without a visible course-access check.

Impact:

- Users may retrieve or generate AI artifacts for courses, submissions, runs, remediation sessions, or usage data they should not see.
- Cancellation could affect another user's run.
- Admin usage data may be exposed.

Plan:

- Add an `AIRequestPolicy` service that centralizes actor, resource, and feature checks.
- Require authentication on the AI router by default, then add resource-specific checks per endpoint.
- Use explicit permission helpers:
  - `can_read_course_ai(user, course)`
  - `can_update_course_ai(user, course)`
  - `can_read_submission_ai(user, submission)`
  - `can_generate_submission_ai(user, submission)`
  - `can_read_remediation(user, session)`
  - `can_read_ai_run(user, run)`
  - `can_cancel_ai_run(user, run)`
  - `can_manage_ai_settings(user)`
- Make admin usage endpoints admin-only and organization-scoped.
- Add tests for anonymous access, cross-user access, student vs teacher access, and admin-only access.

### P0: AI-disabled behavior is not fail-closed

`_require_enabled` returns when global `ai_enabled` is false. Feature-specific flags are only checked if global AI is enabled. The agents also catch provider-disabled errors and return draft-mode artifacts.

Impact:

- In production, disabling AI can still create stored draft artifacts.
- A configuration meant to stop AI activity can degrade into fake AI output, which is risky in education workflows.

Plan:

- Change global AI disabled to fail closed with a clear `503` or `403`, except in an explicit dev/demo mode.
- Add `ai_draft_mode_enabled` and require it to be false in production.
- Surface disabled states in the UI as unavailable features, not generated content.
- Add tests for global disabled, feature disabled, provider unavailable, and explicit demo mode.

### P1: Runs are synchronous, not durable jobs

The database includes queued status, events, cancellation, duration, cost, and eval entities. The active service layer creates a run, calls the provider inside the request, then marks it complete or failed.

Impact:

- Long provider calls block HTTP requests.
- Cancellation only changes database state and cannot reliably stop active work.
- The frontend cannot show real phase progress.
- Retries, backoff, and worker isolation are hard to reason about.

Plan:

- Move model execution to Taskiq workers.
- HTTP endpoints should create `AIRun(status=QUEUED)` and return run metadata immediately.
- Workers should emit `AIEvent` rows for phases:
  - `queued`
  - `authorizing`
  - `collecting_context`
  - `budget_checked`
  - `model_started`
  - `model_streaming`
  - `validating_output`
  - `saving_artifact`
  - `complete`
  - `failed`
  - `cancelled`
- Add a run event stream endpoint using SSE.
- Make cancellation set a cancellation token or worker-visible flag, not only a final status.
- Add timeout and retry policy by feature.

### P1: Provider abstraction lacks production telemetry and control

`ModelProvider.run_structured` creates model and agent instances per call and returns `model_name`, `raw_text`, and estimated input tokens. It does not consistently capture actual fallback model, output tokens, cost, provider request IDs, latency, timeout, or structured failure reasons.

Impact:

- Cost and usage dashboards cannot be trusted.
- Debugging provider failures is hard.
- Fallback behavior is opaque.
- A provider misconfiguration may only appear at runtime.

Plan:

- Add startup validation for configured model names and provider keys.
- Allow fallback-only deployment when explicitly configured.
- Pass model settings from config, including max output tokens, temperature, and timeout.
- Capture actual model used after fallback.
- Capture provider request ID, duration, input tokens, output tokens, and cost estimate.
- Add Logfire instrumentation for Pydantic AI.
- Use lifecycle hooks to write `AIEvent` records around model requests.
- Normalize exceptions into a failure taxonomy:
  - auth/config
  - rate limit
  - timeout
  - provider unavailable
  - safety blocked
  - output validation failed
  - unknown

### P1: Context assembly is not retrieval-grade

`assemble_course_context` and `assemble_submission_context` build plain text from course, chapter, activity, assessment, submission, and grading data. Snippets are clipped by characters, and final context is clipped again. Citations are requested from the model but are not validated against source IDs.

Impact:

- Relevant data can be cut mid-object.
- Long courses will lose context arbitrarily.
- Hidden rubric, grading, and answer data may be included in the wrong audience context.
- Citations can be hallucinated.

Plan:

- Replace raw string assembly with typed `AIContextSource` records:
  - `source_id`
  - `source_uuid`
  - `source_type`
  - `title`
  - `visibility`
  - `audience`
  - `text`
  - `token_count`
  - `metadata`
- Split context into source groups:
  - public course content
  - teacher-only course content
  - student submission content
  - hidden grading/rubric content
  - prior AI artifacts
  - approved student memory
- Rank and select context by task, permissions, recency, and semantic relevance.
- Use pgvector or another retrieval path for larger courses.
- Validate output citations against provided `source_id` values.
- Reject or flag answers whose citations do not map to supplied sources.
- Add prompt-injection boundaries: course and student text are untrusted content, not instructions.

### P1: Token budgets are too shallow

Token budget enforcement currently estimates input tokens and sums recent run metadata in Python. It does not capture output tokens reliably, does not enforce monthly budgets, and does not appear to differentiate remediation budgets at call sites.

Impact:

- Usage dashboards may undercount.
- Monthly budget settings may not actually protect cost.
- Users can generate expensive outputs without accurate enforcement.

Plan:

- Store input tokens, output tokens, total tokens, estimated cost, provider, and actual model for every run.
- Enforce budgets in database queries, not Python loops over many runs.
- Add scopes:
  - user hourly
  - user daily
  - course monthly
  - organization monthly
  - feature monthly
- Use feature-specific multipliers and limits.
- Add warning thresholds for admin UI.
- Add tests around boundary conditions and concurrent run creation.

### P1: Frontend AI UX is fragmented and too synchronous

The UI exposes AI as repeated cards with buttons. Shared components exist, but feature flows do not consistently use them. The product should make every AI result feel reviewable, traceable, and interruptible.

Impact:

- Users do not know what data is being sent, how long the run will take, whether a result is persisted, or who can see it.
- Slow requests feel like stuck buttons.
- Evidence and confidence are not consistently surfaced.
- AI surfaces feel like isolated widgets rather than a coherent LMS assistant.

Plan:

- Introduce a composable `AIWorkspace` pattern:
  - `AIWorkspace.Root`
  - `AIWorkspace.Header`
  - `AIWorkspace.ContextPreview`
  - `AIWorkspace.Trigger`
  - `AIWorkspace.Progress`
  - `AIWorkspace.Result`
  - `AIWorkspace.Evidence`
  - `AIWorkspace.Actions`
  - `AIWorkspace.AuditTrail`
- Use it across course analysis, Q&A, study companion, submission analysis, remediation, and lecture review.
- Do not build one boolean-heavy component. Compose feature-specific flows from shared primitives.
- Use real run status and SSE events for progress.
- Add cancellation to all long-running flows.
- Add context preview for teacher-facing actions:
  - what will be sent
  - what will not be sent
  - estimated tokens
  - visibility of the result
  - whether the artifact is draft, published, or private
- Use precise action copy:
  - "Analyze this submission"
  - "Draft remediation gate"
  - "Review lecture questions"
  - "Ask course assistant"
  - "Publish analysis"

### P1: Q&A thread state is not durable

`QAPanel` keeps `threadUuid` and messages in local state. Reloading loses the conversation, and tabs are not URL-backed.

Impact:

- Students and teachers cannot return to prior Q&A.
- Deep linking and support debugging are harder.
- E2E coverage cannot reliably assert thread behavior.

Plan:

- Add thread list, thread create, thread read, and thread append hooks.
- Load messages from backend.
- Persist selected thread in URL query params.
- Represent selected AI tab in URL query params.
- Use optimistic user messages with retry on failure.
- Add empty, loading, error, and no-access states.

### P1: Admin AI controls are placeholders

`AIFeatureToggles` renders disabled switches from a local constant. Usage endpoints are not guarded enough on the backend.

Impact:

- Admin UI implies settings exist when they do not.
- Operators cannot manage rollout, budget, or safety.
- Sensitive usage data may be exposed.

Plan:

- Create backend settings endpoints:
  - read effective AI config
  - update feature flags
  - update budgets
  - view model/provider health
  - view recent failures
- Guard all settings endpoints with admin permission.
- Replace disabled switches with real forms using shadcn `Form`, `Field`, `Switch`, and `AlertDialog` for risky changes.
- Add per-feature rollout states:
  - off
  - staff only
  - pilot courses
  - all courses
- Show budget usage by provider, model, feature, user, and course.

### P1: Design-system drift weakens polish and accessibility

Several AI components use patterns that conflict with the local shadcn guidance:

- `space-y-*` inside card content instead of flex/grid gap.
- Explicit icon sizes inside buttons instead of `data-icon`.
- Repeated custom mini-card patterns where `Item`, `Accordion`, `Table`, `ScrollArea`, or proper `Card` composition would be clearer.
- Raw error text without consistent `role="alert"` or aria-live.
- Feature buttons often bypass the existing `AIActionButton`.

Impact:

- The UI feels less cohesive.
- Accessibility behavior varies by feature.
- Future maintenance gets harder because each AI surface solves states differently.

Plan:

- Convert AI feature cards to shadcn-consistent composition.
- Use semantic tokens only.
- Replace `space-y-*` with `flex flex-col gap-*` or grid gaps.
- Use `data-icon` for lucide icons inside buttons.
- Use `AIActionButton` or a shared run trigger everywhere.
- Use `Alert`, `Empty`, `Skeleton`, `Progress`, `Badge`, `Tooltip`, `Dialog`, `Sheet`, and `ScrollArea` consistently.
- Add aria-live regions for async progress and error recovery.
- Ensure all icon-only buttons have accessible labels.
- Add reduced-motion handling for progress and streaming transitions.

### P1: E2E and route contracts are drifting

The Q&A frontend posts to `ai/qa/${courseUuid}/ask`, while the E2E mock uses a `course-qa` path. This suggests the test may not be exercising the intended mocked endpoint.

Impact:

- Tests can pass while the actual integration is broken.
- Route renames become risky.

Plan:

- Generate frontend API paths from OpenAPI or a shared route contract.
- Fix the E2E mock route.
- Add contract tests for every AI endpoint and response schema.
- Add Playwright flows for each AI feature:
  - success
  - loading
  - failure
  - unauthorized
  - budget exceeded
  - cancelled
  - disabled feature

## Target backend architecture

### 1. Policy layer

Create `apps/api/src/services/ai/policy.py`.

Responsibilities:

- Resolve authenticated actor.
- Resolve resource ownership and course/submission/remediation access.
- Derive server-side AI role.
- Decide allowed context visibility.
- Decide whether feature is enabled for this actor and resource.
- Decide whether result can be published, dismissed, or completed.

Output:

```python
class AIRequestPolicyResult(BaseModel):
    actor_user_id: UUID
    actor_role: Literal["student", "teacher", "author", "admin"]
    feature: AIFeature
    resource_type: str
    resource_uuid: UUID
    can_run: bool
    can_read: bool
    can_publish: bool = False
    allowed_context: set[AIContextVisibility]
    reason: str | None = None
```

Every AI operation should accept this policy result instead of raw `role` strings or inferred booleans.

### 2. Context layer

Create a source-first context API.

```python
class AIContextSource(BaseModel):
    source_id: str
    source_uuid: UUID | None
    source_type: Literal[
        "course",
        "chapter",
        "activity",
        "assessment",
        "assessment_item",
        "submission",
        "grading",
        "prior_artifact",
        "student_memory",
    ]
    title: str
    visibility: Literal["student", "teacher", "admin"]
    text: str
    token_count: int
    metadata: dict[str, Any] = Field(default_factory=dict)
```

Context assembly should return:

```python
class AIContextBundle(BaseModel):
    sources: list[AIContextSource]
    selected_source_ids: list[str]
    estimated_tokens: int
    omitted_sources: list[AIContextOmission]
```

Then prompts receive a rendered context with stable source IDs. Outputs must cite those source IDs.

### 3. Run orchestration

Use the database run model as the source of truth.

Flow:

1. HTTP endpoint authenticates and authorizes.
2. Endpoint creates an `AIRun` with `QUEUED`.
3. Endpoint enqueues a Taskiq job.
4. Worker reloads policy-relevant resource state.
5. Worker assembles context.
6. Worker checks budget.
7. Worker calls provider with timeout and cancellation support.
8. Worker validates output and citations.
9. Worker stores artifact, evidence, events, usage, cost, and final status.
10. Frontend receives events over SSE and fetches final artifact when complete.

### 4. Provider and agent layer

Use Pydantic AI intentionally:

- Use `deps_type` for request policy, run ID, context bundle, and tracing metadata.
- Use `output_type` for all structured outputs.
- Use `instrument_pydantic_ai` with Logfire.
- Use hooks for redaction, request logging, event emission, and usage capture.
- Use deterministic `TestModel` or `FunctionModel` in tests.
- Use explicit model settings per feature.
- Use fallback models with actual model capture.
- Fail closed on invalid structured output unless the feature explicitly supports partial drafts.

### 5. Evaluation layer

Use `AIEvalResult` for repeatable checks, not as a future placeholder.

Start with small datasets:

- Course Q&A: answer must cite real course sources and refuse unsupported questions.
- Submission analysis: feedback must not invent rubric criteria.
- Remediation: gate must be tied to actual incorrect concepts.
- Lecture critique: suggestions must map to concrete lecture items.

Automate evals in CI with mocked models for structure and scheduled runs with real models for quality drift.

## Target frontend architecture

### 1. AI workspace composition

Build a shared workflow shell under `apps/web/src/features/ai-experience/components/ai-workspace/*`.

Recommended components:

- `AIWorkspaceRoot`
- `AIWorkspaceHeader`
- `AIWorkspaceToolbar`
- `AIContextPreviewSheet`
- `AIRunTrigger`
- `AIRunProgress`
- `AIResultPanel`
- `AIEvidenceList`
- `AIArtifactActions`
- `AIAuditTrail`
- `AIBudgetNotice`

Use compound composition so features can opt into only what they need.

Example shape:

```tsx
<AIWorkspace.Root run={run}>
  <AIWorkspace.Header title="Submission analysis" status={run.status} />
  <AIWorkspace.ContextPreview sources={contextPreview} />
  <AIWorkspace.Trigger action="Analyze this submission" />
  <AIWorkspace.Progress events={events} />
  <AIWorkspace.Result artifact={artifact} />
  <AIWorkspace.Evidence evidence={artifact.evidence} />
  <AIWorkspace.Actions />
</AIWorkspace.Root>
```

### 2. Feature-specific UX

Course analysis:

- Teacher-only by default.
- Show analysis scope before running.
- Show evidence grouped by chapter, activity, and assessment.
- Publish should be explicit and confirm visibility.
- Add stale-state detection when course content changed after analysis.

Course Q&A:

- Durable threads.
- URL-backed selected tab and selected thread.
- Student and teacher modes derived from server permission.
- Source chips on every answer.
- Clear unsupported-answer state.
- Retry and copy actions.

Student study companion:

- Split output into modes instead of one markdown block:
  - explanation
  - practice
  - flashcards
  - misconceptions
- Persist study sessions.
- Let students resume from recent course/chapter context.
- Add "I still do not understand" follow-up tied to same thread.

Submission analysis:

- Teacher view should show rubric alignment, strengths, risks, suggested feedback, and citation to submitted answer.
- Student view should show only teacher-approved feedback.
- Add review state: draft, accepted, edited, published.
- Add diff between AI suggestion and teacher-edited feedback.

Remediation:

- Generate from specific missed concepts, not the whole submission blob.
- Show teacher preview before assigning.
- Student gate should be a complete flow: read micro-lesson, answer gate item, get targeted feedback, complete or retry.
- Completion should be visible in course progress.

Lecture authoring review:

- Suggestions should be actionable and anchored to a lecture item.
- Dismiss should require authorization and store reason.
- Add "apply suggestion" only when the transformation is deterministic and reviewable.

AI admin:

- Replace placeholder toggles with real settings.
- Show provider health, failure rate, latency, token usage, cost, and budget warnings.
- Add filters by feature, course, user, provider, and model.
- Use charts only where they answer an operator question.

### 3. Interaction and accessibility rules

- All async state changes should use aria-live.
- All icon-only controls need labels.
- All destructive or high-impact actions need confirmation or undo.
- Tabs, filters, pagination, selected thread, and selected AI mode should be reflected in the URL.
- Use visible focus states.
- Do not block paste in prompt fields.
- Use `Intl` for dates, relative times, and token/cost numbers.
- Avoid `transition-all`; animate only transform or opacity.
- Respect `prefers-reduced-motion`.
- Use skeletons for initial loading and progress rows for long AI jobs.
- Keep text inside buttons short and specific.

## Roadmap

### Phase 0: Stop unsafe behavior

Goal: prevent data exposure before expanding AI.

Tasks:

1. Add auth and resource checks to every AI endpoint.
2. Remove client-supplied role from Q&A access decisions.
3. Derive actor role and allowed context server-side.
4. Guard admin usage and feature settings behind admin permissions.
5. Fail closed when global AI or feature AI is disabled.
6. Disable draft-mode artifacts outside explicit development mode.
7. Add regression tests for all authorization paths.
8. Fix E2E mock route drift for Q&A.

Exit criteria:

- Anonymous users cannot call AI endpoints.
- Students cannot access unpublished course content through AI.
- Users cannot read, cancel, or generate runs for resources they do not own or manage.
- Disabled AI does not create production artifacts.
- Security regression tests fail before the fix and pass after it.

### Phase 1: Make runs real

Goal: turn AI calls into durable, observable jobs.

Tasks:

1. Add run creation endpoints that return `AIRun` metadata immediately.
2. Move provider calls into Taskiq workers.
3. Persist `AIEvent` records for every run phase.
4. Add SSE endpoint for run events.
5. Wire frontend `useAIRunStream`, `useAIRunStatus`, and cancellation into real flows.
6. Capture duration, actual model, provider, input tokens, output tokens, cost, and failure type.
7. Add worker timeouts and cancellation checks.
8. Add retry policy for safe provider failures.

Exit criteria:

- Long AI requests do not block the browser waiting for a final response.
- Users see queued, running, validating, complete, failed, and cancelled states.
- Operators can inspect run events and failure reasons.
- Token and cost data are present for every completed run.

### Phase 2: Improve context, citations, and prompts

Goal: make answers grounded, permission-aware, and inspectable.

Tasks:

1. Replace text-only context assembly with typed context sources.
2. Add task-specific source ranking.
3. Add pgvector retrieval for large courses.
4. Separate student-visible, teacher-only, grading, and admin context groups.
5. Harden prompts against context injection.
6. Add citation validation.
7. Add unsupported-answer behavior when evidence is insufficient.
8. Add eval datasets for core AI tasks.

Exit criteria:

- Every citation maps to a supplied source.
- Hidden answers and grading context are never included in student outputs.
- Long courses select context by relevance, not arbitrary clipping.
- Evals catch unsupported answers and missing citations.

### Phase 3: Redesign frontend AI workflows

Goal: make AI feel like a coherent LMS workflow layer.

Tasks:

1. Build the shared `AIWorkspace` component set.
2. Migrate feature cards to the shared workspace pattern.
3. Add context preview sheets for teacher-facing runs.
4. Add durable Q&A threads and URL-backed state.
5. Add consistent evidence, confidence, and audit trail panels.
6. Replace raw loading buttons with `AIActionButton` or `AIRunTrigger`.
7. Replace placeholder admin toggles with real settings forms.
8. Clean up shadcn drift: gaps, icons, fields, alerts, empty states, progress, and semantic tokens.
9. Add a11y checks and Playwright coverage for all AI flows.

Exit criteria:

- Every AI feature has loading, progress, cancellation, error, empty, and success states.
- Users can tell what data is sent and who can see the result.
- Tabs and threads survive reloads.
- UI components follow local shadcn conventions.
- Playwright covers core success and failure flows.

### Phase 4: Add production operations

Goal: let the team operate AI safely after launch.

Tasks:

1. Add AI provider health checks.
2. Add feature rollout controls.
3. Add budget warnings and hard limits.
4. Add failure-rate and latency dashboards.
5. Add model version registry and config validation.
6. Add eval result dashboards.
7. Add audit logs for publish, dismiss, complete, and admin setting changes.
8. Add incident playbooks for provider outage, cost spike, and safety failure.

Exit criteria:

- Operators can answer: what ran, who ran it, what it cost, what model answered, what context was used, and why it failed.
- Feature rollout can be limited by user role and course.
- Cost spikes can be detected and stopped.

### Phase 5: Complete product workflows

Goal: make AI outputs usable inside the LMS, not just visible.

Tasks:

1. Course analysis: add stale detection, publish workflow, and course-improvement task generation.
2. Submission analysis: add teacher edit, approve, publish, and student-visible feedback workflow.
3. Remediation: complete assignment, gate attempt, retry, completion, and progress integration.
4. Lecture critique: add anchored suggestions, apply/dismiss history, and authoring diffs.
5. Study companion: add session persistence, mode-specific rendering, and progress-aware follow-ups.
6. Q&A: add thread management, source navigation, and unsupported-answer handling.

Exit criteria:

- AI artifacts move through real review states.
- Teacher changes are tracked.
- Student-facing AI output is intentional and auditable.
- AI work affects course and learner workflows in measurable ways.

## Detailed backlog

### Backend P0

- Add router-level authentication for `/api/v1/ai`.
- Add resource authorization to latest analysis, remediation, run, lecture review, and usage endpoints.
- Remove `role` from Q&A request access decisions.
- Add server-side `AIRequestPolicy`.
- Block production draft-mode artifacts.
- Make global and feature disabled states fail closed.
- Add tests for unauthorized read/generate/cancel paths.
- Add tests for student role escalation against unpublished content.

### Backend P1

- Implement Taskiq-based AI run worker.
- Add SSE run event endpoint.
- Persist `AIEvent` rows during execution.
- Capture output tokens, cost, actual model, duration, provider request ID, and failure type.
- Add provider timeout and fallback policy.
- Add Logfire Pydantic AI instrumentation.
- Validate model config at startup.
- Add source-first context bundle.
- Add citation validation.
- Add prompt-injection hardening.
- Add database-backed budget enforcement.

### Backend P2

- Add semantic retrieval for large course context.
- Add student memory with explicit consent and visibility rules.
- Add eval datasets and scheduled eval runs.
- Add model comparison reports.
- Add admin rollout controls.

### Frontend P0

- Hide or disable AI UI when backend says feature is unavailable.
- Stop sending role as an access selector.
- Fix Q&A E2E mock route.
- Protect admin routes in UI and backend.
- Add no-access states for student/teacher/admin boundaries.

### Frontend P1

- Build `AIWorkspace` shared composition.
- Wire real run status, event stream, and cancellation.
- Add context preview sheets.
- Persist Q&A threads.
- Reflect tab/thread state in the URL.
- Replace placeholder admin toggles with real forms.
- Normalize loading, empty, error, success, and disabled states.
- Migrate repeated AI cards to shared components.
- Clean up shadcn rule drift.
- Add component tests for AI state rendering.
- Add Playwright tests for major AI workflows.

### Frontend P2

- Add source navigation from evidence items to course/submission content.
- Add teacher edit and approval flows.
- Add AI artifact history views.
- Add compare views for revised AI outputs.
- Add admin analytics filters.
- Add reduced-motion and keyboard interaction audits.

## Testing plan

Backend:

- Unit tests for `AIRequestPolicy`.
- Router tests for every AI endpoint with anonymous, student, teacher, and admin users.
- Tests for Q&A role escalation.
- Tests for global disabled, feature disabled, provider unavailable, and draft-mode behavior.
- Tests for context visibility by role.
- Tests for citation validation.
- Tests for budget boundaries and concurrent run creation.
- Worker tests with Pydantic AI `TestModel` or `FunctionModel`.
- Failure taxonomy tests for timeout, rate limit, provider auth, invalid output, and cancellation.

Frontend:

- Unit tests for `AIWorkspace` states.
- Component tests for context preview, run progress, evidence, errors, empty states, and admin settings.
- Tests for aria-live progress and errors.
- Tests for URL-backed tabs and threads.
- Tests for disabled and unauthorized states.
- Playwright flows for course analysis, Q&A, study companion, submission analysis, remediation, lecture review, and admin.
- E2E tests should mock the exact route paths used by `apiClient`.

Contracts:

- Generate OpenAPI client types or route helpers.
- Add contract tests for request and response schemas.
- Add CI check that frontend route mocks match backend route names.

Operations:

- Add seeded eval fixtures.
- Add cost and latency assertions for test provider runs.
- Add dashboard checks for failure rate, queue age, and token budget.

## UI direction

The AI UI should feel like part of a professional learning platform:

- restrained visual system
- high information density
- clear hierarchy
- source-first answers
- explicit review states
- practical progress feedback
- no decorative AI theatrics

Recommended dials:

- Visual density: 7 out of 10 for teacher/admin AI surfaces, 5 out of 10 for student study surfaces.
- Motion: 2 out of 10, limited to progress and streaming affordances.
- Color: semantic status tokens plus the existing Base/Nova palette.
- Layout: workspace and split-panel patterns, not hero sections.
- Copy: direct workflow verbs, not vague AI claims.

Recommended primary surfaces:

- Teacher AI workspace: left column for task and context, main panel for result, right panel for evidence and audit.
- Student AI workspace: main conversation/study panel with compact source drawer.
- Admin AI console: filters, usage chart, run table, failures, budgets, and settings.

## Acceptance criteria

AI can be considered production ready when:

- Every AI endpoint is authenticated and resource-authorized.
- User role and context visibility are derived server-side.
- Disabled AI cannot create production artifacts.
- Every run has durable status, events, usage, cost, model, duration, and failure data.
- Long-running work executes in workers and streams progress to the UI.
- Users can cancel runs.
- Every answer or analysis cites validated sources or states insufficient evidence.
- Teacher-only and grading context cannot leak to student-facing output.
- Admins can control rollout and budgets.
- Core AI workflows have Playwright coverage.
- Evals run for the highest-value AI tasks.
- The frontend uses one coherent AI workspace pattern and follows shadcn/accessibility conventions.

## Recommended first implementation order

1. Fix authorization and role-derived context.
2. Change disabled AI behavior to fail closed.
3. Add regression tests for the security fixes.
4. Implement run events and provider telemetry without moving to workers yet.
5. Move model execution to Taskiq workers.
6. Wire frontend run progress and cancellation.
7. Replace raw context strings with source bundles and citation validation.
8. Build the shared `AIWorkspace` composition.
9. Migrate Q&A to durable threads and URL-backed state.
10. Replace admin placeholders with real guarded settings.

This order reduces risk early, then turns the existing primitives into a reliable product surface.
