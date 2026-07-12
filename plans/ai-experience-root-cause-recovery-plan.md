# AI experience root-cause recovery plan

**Status:** proposed canonical plan  
**Audit date:** 2026-07-11  
**Scope:** student AI assistance, course Q&A, teacher analysis, submission analysis, remediation, lecture review, AI administration, and the runtime that supports them  
**Supersedes for prioritization:** `ai-implementation-improvement-plan.md`, `ai-ui-ux-redesign-plan.md`, `ai-ux-roast-and-redesign-plan.md`, and `ai-chat-ux-roast-and-tanstack-ai-plan.md`

The older plans still contain useful history. They no longer describe the code as it exists today. This document turns the remaining problems into one implementation sequence and removes completed or contradicted work from the critical path.

## 1. Executive verdict

The AI experience presents one assistant but implements several unrelated products behind a shared row of modes. The labels suggest clear jobs. The routing often sends users to reused screens that do something else.

The worst defects are matters of truth, not taste:

1. A saved Q&A thread looks conversational, but the model receives only the latest question and a fresh dump of course context. Follow-up questions such as “Why?” or “Show another example” lose the preceding answer.
2. Commands such as “Explain this activity” do not send the current activity to the study or Q&A endpoints. The backend receives a course UUID and assembles the whole course. The context label promises precision that the request contract does not provide.
3. The backend now has a real token-streaming Q&A endpoint. The visible `QAPanel` still calls the older queued endpoint, waits through a progress widget, then fetches the final message. Users cannot access the better path.
4. The mode resolver has unsafe fallbacks. `draft-feedback` and `remediation` can fall through to `StudyCompanionPanel`; `sources` routes to Q&A; `review` and `analyze` share the same course-analysis body. A user can choose one job and receive another.
5. “Cancel” changes the database state but does not abort an in-flight provider request. The UI claims the work stopped while the model can keep consuming time and budget.
6. The five-stage percentage bar reports invented precision. It can jump from queued to running to complete because the stream parser rejects several states that exist in its own TypeScript union.
7. The admin feature switches are disabled controls backed by read-only environment values. They look operational but cannot operate anything.

The visual problems follow the same pattern. The panel spends its first screenful on a bot title, privacy badges, source badges, an approval sentence, a separator, and up to eight mode toggles. The learner’s question and the answer are pushed down. Repeated bordered cards, badges, timelines, confidence labels, and nested scroll areas make ordinary tasks feel like an audit console.

The recovery plan should make each surface honest before making it attractive.

## 2. Audit method and limits

This audit traced the current frontend and backend paths, including:

- `apps/web/src/features/ai-experience`
- `apps/web/src/features/course-qa`
- `apps/web/src/features/student-study`
- `apps/web/src/features/course-analysis`
- `apps/web/src/features/submission-analysis`
- `apps/web/src/features/remediation`
- `apps/web/src/features/ai-admin`
- `apps/api/src/routers/ai`
- `apps/api/src/services/ai`
- `apps/api/src/db/ai_runtime.py`
- current AI unit and Playwright tests
- the four earlier AI plans

The review applied the current web interface guidelines, project Next.js conventions, FastAPI streaming guidance, and Pydantic AI agent and history patterns.

`vp install` completed without dependency changes. A live local walkthrough could not reach authenticated product surfaces because the API waited on unavailable local service dependencies. The resulting generic home-page network error is not counted as an AI product defect. Findings below come from executable paths, contracts, tests, and the screenshot evidence recorded in the earlier plans.

## 3. Keep these foundations

Do not restart the AI implementation from zero. Preserve:

- server-side authorization in `services/ai/policy.py` and `require_ai_run_access`;
- fail-closed feature checks;
- persisted `AIThread`, `AIRun`, `AIEvent`, `AIArtifactRecord`, `AIEvidence`, and `AIApproval` records;
- Taskiq-backed report generation;
- backend citation allow-list validation;
- mobile drawer behavior, Escape handling, and focus restoration in the AI panel;
- URL-backed panel, mode, and thread state;
- the course analysis report structure and its evidence-review checkbox;
- the separation between conversational assistance and structured report generation;
- generated OpenAPI clients for ordinary JSON endpoints.

These pieces need tighter contracts and simpler presentation. Replacing them would add migration risk without fixing the user journey.

## 4. Current experience roast, with evidence

### 4.1 The mode strip is a menu of implementation nouns

`ActivityAIMode` exposes eight values:

`ask`, `explain`, `practice`, `sources`, `review`, `analyze`, `draft-feedback`, `remediation`.

Users do not have eight stable mental models for these. Several overlap:

- Ask can explain.
- Explain and practice are settings on the same study request.
- Sources belong to an answer, not a separate top-level destination.
- Review and analyze open the same component.
- Draft feedback and remediation are submission actions, not global course modes.

`CourseAIHubPanel` then maps these values with broad conditionals. Any unhandled value becomes a study-companion request. The fallback converts a missing implementation into the wrong implementation instead of failing visibly.

**Impact:** users cannot predict what a mode changes, and developers can add a capability string without adding a matching surface.

### 4.2 The assistant claims context it does not possess

The dock receives `activityUuid` and `submissionUuid` in `AIScope`, but `QAPanel` and `StudyCompanionPanel` accept only `courseUuid`. Their request payloads contain a question, a mode or thread, and a language. Backend context assembly loads the whole course.

The Q&A empty state still shows `activityContext`, and command copy refers to “this activity.” The visible context and sent context disagree.

**Impact:** answers can cite an unrelated chapter, teachers cannot target the item on screen, and users blame the model for a frontend/backend contract defect.

### 4.3 Thread history is storage, not memory

The backend persists `AIQAMessage` rows and renders a thread rail. `answer_course_question` receives the current question and course context only. No prior messages are passed through Pydantic AI `message_history`, a history capability, or a compact transcript.

**Impact:** the first turn can look acceptable while every pronoun, correction, or follow-up request becomes unreliable. The thread UI overstates the feature.

### 4.4 Real streaming exists behind a dead door

`POST /ai/qa/{course_uuid}/chat` emits `TEXT_MESSAGE_START`, `TEXT_MESSAGE_CONTENT`, `TEXT_MESSAGE_END`, citation tool events, and `RUN_FINISHED`. `QAPanel` does not call it. It queues `/ask/queue`, watches a generic run, invalidates thread queries, and shows the final persisted answer.

The app therefore owns:

- a synchronous Q&A route;
- a queued Q&A route;
- a direct streaming Q&A route;
- a generic queued-run AG-UI adapter;
- TanStack AI packages;
- an AG-UI client transport;
- local optimistic message reconciliation.

Only one path should power chat.

**Impact:** users wait longer, code paths drift, and tests exercise old transport shapes.

### 4.5 Progress is decorative telemetry

The frontend defines ten AI work states. `customEventPayload` accepts only six and drops `collecting_context`, `checking_evidence`, and `needs_human_review`. The timeline then converts coarse phases into 20%, 40%, 60%, 80%, and 100% even though the system cannot estimate remaining time.

The panel also wraps its entire changing body in `aria-live="polite"`, while individual progress and streaming components add their own live regions. A screen reader can announce large repeated sections instead of one short state update.

**Impact:** sighted users see fake certainty; screen-reader users receive noisy updates.

### 4.6 Cancellation is a state change, not cancellation

The cancel endpoint writes `aborted`. Worker code checks cancellation before some phases and before saving the artifact. It does not hold or trigger a provider cancellation scope. A request already inside `agent.run()` or `agent.run_stream()` continues until the provider returns.

**Impact:** users cannot trust “Cancel,” capacity remains occupied, and token spend continues.

### 4.7 Recovery disappears on navigation and disconnect

`useAIRunController` keeps `runUuid` in component state. The status query polls, but its terminal status does not drive the controller state or artifact fetch. The stream owns the visible state. If the panel unmounts, the tab sleeps, the connection breaks, or the user refreshes, the run can finish in the backend while the frontend reports failure or forgets it exists.

**Impact:** long analysis runs feel fragile even when the job system succeeds.

### 4.8 Errors expose infrastructure instead of choices

Most surfaces render `error.message` directly. Budget errors, provider errors, network failures, permission changes, and invalid context share the same red alert treatment. Retry often repeats the same payload without explaining whether it is safe or useful.

The backend also emits Russian text inside protocol errors and events regardless of UI locale.

**Impact:** users cannot distinguish “try again,” “shorten the request,” “ask an instructor,” and “feature unavailable.” Support receives screenshots of internal messages without correlation IDs.

### 4.9 The report surfaces display output but do not support decisions

Course analysis has a useful report structure. It still lacks:

- comparison with the previous run;
- a clear explanation of what changed in the course since generation;
- per-finding accept, dismiss, or convert-to-task actions;
- source navigation that records actual review rather than a self-attested checkbox;
- a durable draft/review/published history;
- a way to rerun one section instead of the full report.

Submission analysis stacks analysis, command chips, lifecycle, progress, latest result, remediation generation, a second progress widget, and remediation output inside one card. Two jobs compete in one vertical column.

**Impact:** teachers read AI output but must manually reconstruct the next workflow.

### 4.10 The admin console reports totals without helping an operator

The console shows lifetime token totals, aggregate run states, environment settings, and disabled switches. It lacks:

- time range and feature filters;
- latency and time-to-first-token percentiles;
- failure rate by feature and error code;
- stuck-run detection;
- provider/fallback breakdown;
- cost by course, tenant, or role;
- run drill-through with redacted inputs, events, sources, and artifacts;
- an eval creation and comparison workflow;
- an actual feature-control mutation or an honest read-only presentation.

**Impact:** an admin can see that errors exist but cannot diagnose or contain them.

### 4.11 The tests certify mocks, not the product contract

The AI Playwright suite skips its main journeys when environment UUIDs are absent. Its run-stream mock emits the pre-AG-UI `data: {"state": ...}` shape, while the current client expects AG-UI events. It asserts final text but does not assert partial rendering, reconnection, cancellation, follow-up memory, context scope, or recovery.

**Impact:** the most important regressions can merge while the suite stays green or skipped.

## 5. Backend findings that create frontend pain

### P0: A thread can be selected without course scoping

The queued lookup checks thread owner and course. `ask_course_question` and `prepare_course_question_stream` look up a thread by UUID and owner without requiring the current course ID. A user can attach a new turn from course B to a thread created for course A.

**Fix:** use one shared `get_owned_course_thread` function that requires `thread_uuid`, `user_id`, and `course_id`. Return 404 for a mismatch. Add a database-level invariant where practical.

### P0: Follow-up context never reaches the model

**Fix:** load a bounded set of prior turns for the selected thread, convert them to Pydantic AI message history or a typed conversation transcript, and apply a tested history policy. Keep the current question and current scope at full fidelity. Summarize or drop old turns by token budget.

### P0: Activity and selection context are missing from requests

**Fix:** define a server-validated context descriptor:

```json
{
  "course_uuid": "course_…",
  "activity_uuid": "activity_…",
  "submission_uuid": null,
  "selection": {
    "kind": "text",
    "source_uuid": "activity_…",
    "text": "optional user-selected excerpt"
  }
}
```

The server must derive permissions and canonical content from IDs. Treat selected text as a hint, not an authorization source. Reject IDs that do not belong to the course or user-visible activity.

### P0: Chat has three execution paths

**Fix:** make direct streaming the only interactive Q&A path. Keep queued runs for long report generation. Remove the synchronous and queued Q&A endpoints after clients migrate and a short compatibility window ends.

### P1: Full-course context is duplicated and scales poorly

`assemble_course_context_bundle` builds a full text dump, then `render_context_bundle` appends source excerpts that repeat much of the same material. Every question pays for the course again. Long courses hit a hard token limit instead of retrieving relevant sections.

**Fix in two steps:**

1. Stop duplicating source text. Render one canonical context block with stable source IDs.
2. Add retrieval only when measured course size requires it. Use the existing document chunks and database search before adding another vector system. Retrieve the current activity first, then a small set of relevant published sources. Teachers can include unpublished content through the existing role policy.

### P1: Requests lack idempotency and useful validation

Question fields have no meaningful minimum or maximum. Client retries can create duplicate messages and duplicate spend.

**Fix:** require a trimmed non-empty question with an explicit size limit. Accept a `client_turn_id` or idempotency key, store it with the message/run, and return the existing turn on replay.

### P1: Event sequencing can race

`_emit_run_event` calculates `max(sequence) + 1`. Worker and cancellation requests can write concurrently against a unique `(run_id, sequence)` index.

**Fix:** allocate sequence numbers under a row lock or use a database sequence/counter associated with the run. Make event IDs idempotent for phase transitions.

### P1: Queue submission can orphan a committed run

The endpoint commits a queued run before calling `kiq`. If broker submission fails, the API can return an error while the database retains a run that will never execute.

**Fix:** use an outbox or mark enqueue failure explicitly and retry it. The minimal acceptable fix is to catch broker failure, mark the run `error` with `QUEUE_UNAVAILABLE`, commit, and return a typed service-unavailable response containing the run reference.

### P1: Generic run streaming polls the database per connection

Each report stream holds a request open and queries the run/events table every second through a synchronous session inside an async route.

**Fix:** use SSE support with event IDs, heartbeat comments, and resume via `Last-Event-ID`. Publish worker events through the existing Redis infrastructure, with the database as the durable replay store. If Redis fan-out must wait, move polling to a non-blocking session and back off when no events arrive.

### P1: Provider cancellation and observability are incomplete

**Fix:** keep the task handle/cancellation scope for each running job, propagate cancellation into Pydantic AI/provider requests, and record whether cancellation reached the provider. Instrument run, model request, fallback, validation, and persistence phases with redacted telemetry. Never capture raw student content by default.

### P2: Thread lists perform N+1 work and have no pagination

The list endpoint loads every message for every thread to compute preview and count. The message endpoint returns the entire thread.

**Fix:** query counts and latest previews in SQL, paginate threads, and paginate older messages. Load the newest page first and fetch older messages on demand.

### P2: Budget policy cannot explain a denial

The monthly budget is global and the hourly limit uses generic analysis/remediation buckets. The UI receives plain strings.

**Fix:** return a typed denial with `code`, `scope`, `retry_at`, `limit`, and safe user copy key. Add feature, role, and tenant dimensions only when product policy requires them.

## 6. Target product model

Stop treating every AI capability as a mode in one universal assistant. Use four job-specific surfaces that share primitives and runtime contracts.

| Surface            | User job                                            | Interaction model                                | Primary output                             |
| ------------------ | --------------------------------------------------- | ------------------------------------------------ | ------------------------------------------ |
| Learning assistant | Understand current material and practice            | Conversation with explicit context               | Answer, practice item, source links        |
| Course review      | Find course-level risks before publishing           | Long-running structured report                   | Prioritized findings and teacher decisions |
| Submission support | Understand one learner’s work and plan intervention | Structured analysis followed by explicit actions | Feedback draft or remediation plan         |
| AI operations      | Monitor quality, spend, failures, and policy        | Filterable operational console                   | Decisions, diagnostics, controls           |

### 6.1 Simplified navigation

For students:

- One entry point: **Learning assistant**.
- Composer-level actions: Explain, Give an example, Quiz me, Summarize.
- Sources appear under the answer and in a source drawer.
- Threads live in a collapsible history rail.

For teachers:

- **Ask about this material** uses the conversational surface.
- **Review course** opens the course report workspace.
- **Review submission** appears only inside a selected submission.
- **Draft feedback** and **Create remediation** are actions on analysis, not top-level modes.
- **Review lesson** appears inside the lesson editor and returns anchored suggestions.

Remove `sources`, `analyze`, `draft-feedback`, and `remediation` from the global mode union. Use routes or explicit workflow state for those jobs.

### 6.2 Context ribbon: the signature interaction

The panel should open with a compact context ribbon that states exactly what the server will send:

```text
Course: Algebra I  /  Lesson: Linear equations  /  Selection: 2 paragraphs
[Change context]
```

If the backend cannot honor activity or selection context, omit that scope from the ribbon and disable copy that says “this activity.” The ribbon uses IDs returned by a context-preview endpoint, not labels assembled only in the browser.

### 6.3 Desktop learning assistant

```text
┌──────────────── main learning workspace ────────────────┬──────── assistant ────────┐
│ lesson / assessment content                             │ Context ribbon            │
│                                                        │───────────────────────────│
│                                                        │ conversation              │
│                                                        │ answer                    │
│                                                        │ sources / follow-ups      │
│                                                        │                           │
│                                                        │ [composer........] [Send] │
└────────────────────────────────────────────────────────┴───────────────────────────┘
```

- Use a two-column layout owned by one component. Do not coordinate a fixed panel and host padding through runtime arithmetic.
- Keep the composer pinned inside the assistant column.
- Let only the transcript scroll. Avoid a scroll area inside a page scroll area inside a drawer.
- Open thread history as a narrow rail or popover when width is limited.
- Preserve lesson reading width when the assistant opens. At intermediate widths, switch to an overlay drawer rather than crushing both columns.

### 6.4 Mobile learning assistant

```text
┌──────────────────────────┐
│ Learning assistant   [×] │
│ Algebra I / Lesson 3     │
├──────────────────────────┤
│ conversation             │
│                          │
├──────────────────────────┤
│ [composer..........] [↑] │
└──────────────────────────┘
```

- Use a full-height safe-area sheet, not an 88% drawer that leaves a distracting slice of the lesson behind it.
- Keep the composer above the keyboard and safe-area inset.
- Put history and context editing in header menus.
- Do not autofocus the composer on mobile.

### 6.5 Visual direction

Use the existing design system and theme tokens. Do not introduce another component library or a special AI gradient palette.

- Remove decorative `Sparkles` and repeated bot icons from routine states.
- Reserve one accent for active assistant controls. Use semantic colors only for warning, failure, and approved states.
- Replace most nested cards with spacing, one panel boundary, and lightweight section dividers.
- Keep body text at a readable line length. Render answer Markdown with the same typography as course content.
- Use badges only for compact state that changes a decision. Plain text handles model name, citation count, and context visibility better.
- Use sentence case for controls and headings.
- Show confidence as qualified language when it helps a decision: “Check this answer” plus the reason. A bare Low/Medium/High badge implies calibration the product has not demonstrated.
- Use an indeterminate activity indicator for work with unknown duration. Show named completed steps only when they come from real backend events. Remove synthetic percentages.

### 6.6 Accessibility contract

- One `aria-live="polite"` region announces a short status sentence. Do not mark the whole panel or transcript live.
- Give the transcript `role="log"` only while streaming and set `aria-relevant="additions text"`.
- Preserve visible focus on all controls.
- Keep touch targets at least 44 by 44 CSS pixels on mobile.
- Support Enter to send and Shift+Enter for a newline; expose the hint in help text.
- Restore focus to the trigger on close.
- Announce source expansion, cancellation, retry, and final completion.
- Respect reduced motion. A streaming caret may blink only when reduced motion is off.
- Make source links real links so users can open them in a new tab.
- Localize mode names, statuses, error actions, dates, and counts. Do not send display sentences in backend protocol events.

## 7. Target frontend architecture

### 7.1 Make unsupported combinations impossible

Replace a global string mode and fallback rendering with a discriminated surface contract:

```ts
type AISurface =
  | { kind: 'learning-chat'; courseUuid: string; activityUuid?: string; threadUuid?: string }
  | { kind: 'course-review'; courseUuid: string }
  | { kind: 'submission-review'; courseUuid: string; submissionUuid: string }
  | { kind: 'lesson-review'; courseUuid: string; activityUuid: string }
  | { kind: 'operations' }
```

Render each kind exhaustively. A new kind must fail TypeScript compilation until it has a component. Do not use a default branch that displays another product.

### 7.2 Separate chat state from report-run state

**Chat:**

- Use the direct streaming endpoint.
- Finish one headless client integration for messages, partial text, stop, retry, and tool results.
- Recommended path: finish the installed TanStack AI React integration for Q&A because the direct endpoint and AG-UI event contract already exist. If its pinned beta API cannot meet reconnection and history requirements in a short spike, keep `@ag-ui/client` and remove both unused TanStack AI packages. Do not keep both clients after the decision.
- TanStack Query owns persisted thread lists and history pages. The chat client owns the in-flight turn.

**Reports:**

- Keep TanStack Query mutations and persisted `AIRun` records.
- Replace `useAIRunController` with a small report-run controller that converges stream events, polled status, and persisted artifacts.
- Store the active run UUID in the URL or a recoverable query keyed by surface and resource.
- On reconnect, replay events after the last event ID, fetch terminal status, then fetch the artifact.

### 7.3 Use one canonical state mapping

Backend states and user states serve different purposes. Map them once:

| Backend status/event           | User-facing state                 |
| ------------------------------ | --------------------------------- |
| queued                         | Waiting to start                  |
| running + context event        | Reading selected material         |
| running + model event          | Drafting                          |
| running + validation event     | Checking sources                  |
| finished + artifact            | Ready                             |
| error + retryable code         | Could not finish, retry available |
| error + policy code            | Action required                   |
| aborted + provider confirmed   | Stopped                           |
| aborted + provider unconfirmed | Stopping                          |

Delete parallel hardcoded state dictionaries. Translation catalogs own labels and help text. Protocol events carry codes and structured fields.

### 7.4 Design errors as decisions

Define frontend error presentations by stable code:

| Code family                 | Message                           | Primary action      |
| --------------------------- | --------------------------------- | ------------------- |
| network/stream disconnected | The run is still available        | Reconnect           |
| provider temporary failure  | The assistant could not finish    | Retry               |
| request too large           | The selected context is too large | Use current lesson  |
| hourly limit                | Available again at a known time   | Close               |
| permission changed          | You no longer have access         | Return to course    |
| source unavailable          | One source was removed            | Continue without it |
| queue unavailable           | The run did not start             | Retry later         |

Show a short support reference for unexpected failures. Log details outside the visible message.

### 7.5 File-level frontend changes

| Area                          | Action                                                                                                    |
| ----------------------------- | --------------------------------------------------------------------------------------------------------- |
| `activity-ai-panel.tsx`       | Replace mode strip with surface header and context ribbon; remove fake source count and broad live region |
| `activity-ai-dock-layout.tsx` | Replace fixed panel plus computed padding with responsive grid/overlay layout                             |
| `activity-ai-url-state.ts`    | Store surface, thread, and recoverable run IDs; validate query values                                     |
| `course-ai-hub.tsx`           | Delete conditional mode router; use explicit surface components                                           |
| `qa-panel.tsx`                | Migrate to direct streaming; remove local queued-message reconciliation and progress bar                  |
| `study-companion-panel.tsx`   | Reuse learning chat with a study action, not a second chat implementation                                 |
| `use-ai-run-stream.ts`        | Restrict to report events or replace; accept all canonical states and support replay                      |
| `use-ai-run-controller.ts`    | Replace with chat/report-specific controllers; let persisted status recover stream failure                |
| `ai-run-progress.tsx`         | Remove percentage; render truthful phase and elapsed time only if useful                                  |
| `ai-streaming-text.tsx`       | Render incremental Markdown safely and expose one live transcript contract                                |
| `submission-ai-entry.tsx`     | Split analysis result from follow-up actions; do not stack two run controllers in one card                |
| `ai-admin-panel.tsx`          | Replace fake toggles with read-only rows or add real mutations; add run drill-through                     |

## 8. Target backend architecture

### 8.1 One conversational turn contract

```json
{
  "client_turn_id": "uuid",
  "thread_uuid": "thread_… or null",
  "message": "Why does that work?",
  "language": "en-US",
  "context": {
    "course_uuid": "course_…",
    "activity_uuid": "activity_…",
    "submission_uuid": null,
    "selection": null
  },
  "intent": "explain"
}
```

The server should:

1. authenticate the user;
2. validate the course, thread, activity, submission, and role relationship;
3. resolve canonical context and show a safe context preview before generation when requested;
4. enforce idempotency;
5. load bounded conversation history;
6. assemble relevant source records once;
7. start the provider request with a cancellation scope;
8. stream text deltas and structured source results;
9. validate citations;
10. persist the assistant message and terminal run state;
11. emit one final event that contains stable application IDs.

### 8.2 Stream contract

Keep AG-UI event names if the chosen client supports them. Add application data through typed custom events rather than human-readable backend sentences.

Required events:

- run started;
- context resolved with source count and scope IDs;
- assistant message started;
- assistant text delta;
- source result or citation result;
- assistant message ended;
- run finished with thread/message/run UUIDs;
- run error with stable code, retryability, and support reference;
- heartbeat;
- cancellation requested and cancellation confirmed.

Every event needs a durable event ID. A reconnect sends `Last-Event-ID` and receives missed events before live fan-out resumes.

### 8.3 Conversation history policy

- Include recent user and assistant turns from the same course-scoped thread.
- Preserve the current activity and latest user turn.
- Cap history by tokens, not message count alone.
- Summarize older turns only after a test demonstrates better follow-up quality than dropping them.
- Store any summary as derived data with the source message range.
- Never mix threads, courses, users, or visibility roles.
- Add tests for pronouns, corrections, “give another example,” and a teacher switching from published to unpublished context.

### 8.4 Report workflow contract

Reports remain durable jobs:

```text
queued -> running -> validating -> ready_for_review -> published
                    \-> failed
queued/running -> cancelling -> cancelled
```

`AIRun.status` can retain infrastructure states. Domain records such as course analysis own review and publication states. Do not overload a run state with `needs_human_review` when the computation has finished.

Each report version records:

- source snapshot/version or content hashes;
- prompt and schema version;
- model/provider actually used, including fallback;
- input/output token usage and cost estimate;
- citation validation result;
- who requested, reviewed, dismissed, accepted, and published it;
- relation to the previous report.

### 8.5 Provider and agent layer

- Keep structured Pydantic output for reports.
- Use Pydantic AI message history for conversation after converting persisted messages through a tested adapter.
- Reuse agent instances or cached model configuration where safe; do not rebuild identical provider clients for every request without measuring the cost.
- Record the provider that produced the result, not a preselected string that says “with fallback.”
- Distinguish timeout, rate limit, authentication, structured-output failure, cancellation, and safety refusal.
- Add deterministic `TestModel` or `FunctionModel` tests for output contracts and history behavior.
- Capture model payloads only in targeted, access-controlled debugging because they can contain student data.

### 8.6 File-level backend changes

| Area                                    | Action                                                                                                                       |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `routers/ai/course_qa.py`               | Validate bounded input and context descriptor; make streaming canonical; remove legacy routes after migration                |
| `services/ai/operations.py`             | Split chat orchestration from report orchestration; add scoped thread lookup, idempotency, recovery, and typed failures      |
| `services/ai/agents/course_qa.py`       | Accept bounded history and resolved sources; test follow-up behavior                                                         |
| `services/ai/context/course_context.py` | Stop duplicate rendering; resolve activity-first context; add measured retrieval path                                        |
| `services/ai/providers.py`              | Propagate cancellation; report actual provider/model; classify errors; add instrumentation                                   |
| `routers/ai/runs.py`                    | Add replayable SSE with event IDs/heartbeat; remove blocking one-second polling when Redis fan-out lands                     |
| `db/ai_runtime.py`                      | Add idempotency key, event sequence allocation, source snapshot metadata, and cancellation state if migrations are warranted |
| `routers/ai/admin.py`                   | Add filtered operational queries and run detail; add real control mutations only if config moves out of environment          |

## 9. Delivery plan

Ship vertical slices. Do not build a new shared framework before one user journey works end to end.

### Phase 0: Stop lying in the UI

**Goal:** every visible control maps to a real, correctly scoped capability.

Frontend:

- Replace `CourseAIHubPanel` fallback routing with exhaustive surface routing.
- Hide `draft-feedback`, `remediation`, and `sources` as global modes.
- Rename or hide activity-specific commands until requests carry activity scope.
- Localize the remaining hardcoded mode labels and raw visibility values.
- Replace the fake source count derived from `modes.length`.
- Treat capability query failure as unavailable and show a recoverable message.
- Replace disabled admin switches with honest read-only rows.

Backend:

- Fix course-scoped thread lookup in all Q&A paths.
- Add question validation.
- Return typed error codes without locale-specific protocol sentences.

Tests:

- Exhaustive surface-routing unit test.
- Cross-course thread rejection test.
- Capability-error UI test.
- Translation test for all visible surface names in `en-US`, `ru-RU`, and `kk-KZ`.

**Exit criteria:** no selectable mode renders an unrelated component; no UI claims activity or source context that the request lacks.

### Phase 1: Ship one real Q&A conversation

**Goal:** course Q&A streams, remembers, recovers, and cites.

- Wire `QAPanel` to the direct streaming endpoint through the selected single client.
- Send a client turn ID and enforce idempotency.
- Pass bounded same-thread history to Pydantic AI.
- Render partial assistant text as it arrives.
- Preserve partial text when the user stops generation.
- Persist final messages and reconcile them by stable IDs.
- Move citations into the completed answer without making users watch tool-protocol chrome.
- Add retry from the failed assistant turn.
- Support reconnect and final-status convergence.
- Delete the queued Q&A path and its frontend controller usage after rollout.

**Exit criteria:** a user can ask a follow-up that depends on the prior answer, see first text before completion, stop the response, refresh, reopen the thread, and see one copy of each message.

### Phase 2: Make context precise

**Goal:** “this lesson” and “this selection” become true statements.

- Add the validated context descriptor to chat and study requests.
- Add a context-preview response that returns canonical labels and visibility.
- Build the context ribbon.
- Prefer current activity sources, then retrieve a small relevant course set.
- Show omitted or unavailable sources before generation.
- Update citation navigation for activity, assessment item, and selected text anchors.
- Remove duplicated full-course context rendering.

**Exit criteria:** request logs, answer citations, and the context ribbon agree on course/activity scope; students never receive unpublished content.

### Phase 3: Simplify and strengthen report workflows

**Goal:** teacher AI output leads to a decision.

Course review:

- Recover active runs after navigation.
- Compare current report with its previous version.
- Mark the report stale from content hashes, not elapsed time alone.
- Add accept, dismiss, and create-task actions per finding.
- Record evidence opened or source visited for review audit.
- Keep publication separate from run completion.

Submission support:

- Show analysis first.
- Offer “Draft feedback” and “Create remediation” as explicit next actions.
- Give each follow-up its own run area and output review state.
- Never create or publish learner-facing content without teacher confirmation.

Lesson review:

- Anchor suggestions to editor blocks.
- Support apply, edit, and dismiss.
- Preserve original and proposed text for undo and audit.

**Exit criteria:** each report has a clear owner, state, next action, and durable review history.

### Phase 4: Make the runtime durable

**Goal:** long runs survive real networks and operators can trust their state.

- Add replayable SSE event IDs and heartbeats.
- Use Redis fan-out with database replay.
- Converge stream, status, and artifact state in the frontend.
- Add enqueue-failure handling and worker idempotency.
- Implement provider-aware cancellation and `cancelling` feedback.
- Make event sequence allocation concurrency-safe.
- Detect and repair stuck queued/running jobs.
- Record actual provider/model and phase timing.

**Exit criteria:** refresh, sleep/wake, disconnect, duplicate submit, worker retry, and cancel all converge to one correct terminal result.

### Phase 5: Rebuild the panel shell and visual hierarchy

**Goal:** the interface feels like part of the learning product.

- Replace computed host padding with the responsive grid/overlay shell.
- Add the context ribbon and pinned composer.
- Remove redundant badges, cards, separators, and duplicate status widgets.
- Replace synthetic progress percentages.
- Use full-height mobile behavior with keyboard and safe-area support.
- Validate 320 px, 768 px, 1024 px, 1440 px, and 200% browser zoom.
- Test light/dark themes and all three locales.
- Run keyboard and screen-reader passes.

Visual cleanup can begin during earlier phases. Do the final consolidation after the interaction model stops moving.

### Phase 6: Build an operations console instead of a dashboard poster

**Goal:** admins can find and contain a bad AI run.

- Add time, feature, provider, status, and course filters.
- Show requests, success rate, retry rate, cancellation rate, p50/p95 latency, p50/p95 time to first text, tokens, and estimated cost.
- Add a stuck-run queue and error-code breakdown.
- Add redacted run drill-through with event timeline, resolved context metadata, citation validation, and artifact link.
- Expose feature controls only if the backend can mutate durable settings. Otherwise keep settings visibly read-only.
- Create a small eval workflow with versioned datasets and prompt/model comparisons.

**Exit criteria:** an admin can answer “Which feature failed, for whom, at what phase, using which provider, and what can I do?” without querying the database.

## 10. Test strategy

### 10.1 Contract tests

- Parse every emitted AG-UI event with the selected frontend client.
- Validate event ordering, IDs, and replay.
- Generate ordinary JSON client types from OpenAPI.
- Add explicit protocol fixtures for streaming events that OpenAPI cannot represent.
- Fail CI when a backend AI state lacks a frontend mapping.

### 10.2 Backend tests

- Course/thread/user scoping.
- Student versus teacher source visibility.
- Activity belongs to course.
- Submission belongs to activity and authorized teacher.
- Idempotent duplicate turn.
- Prior-turn history included and token bounded.
- Long-course retrieval chooses current activity first.
- Citation allow-list rejects invented sources.
- Provider timeout, rate limit, fallback, refusal, invalid structured output, and cancellation.
- Broker unavailable after run creation.
- Worker retry does not duplicate artifacts or messages.
- Concurrent cancellation and event emission do not collide.
- SSE replay after a supplied event ID.

Use Pydantic AI `TestModel` for schema behavior and `FunctionModel` for exact streaming, retry, and history cases. Keep provider integration tests separate and opt-in.

### 10.3 Frontend component tests

- Exhaustive rendering for every `AISurface` kind.
- Context ribbon matches server preview.
- Composer keyboard behavior.
- Partial text renders without replacing the whole transcript.
- Stop preserves partial output and changes to `Stopping…` until confirmed.
- Reconnect recovers a terminal artifact.
- Error codes choose the correct action.
- Thread pagination and switching do not mix messages.
- One live region announces updates.
- Source links remain real links.
- Every visible string resolves in all locales.

### 10.4 End-to-end tests

Replace broad response mocks with protocol-valid fixtures.

Required journeys:

1. Student opens the assistant on a lesson, sees exact lesson context, asks, receives partial text, opens a citation, asks a follow-up, refreshes, and resumes the thread.
2. Student attempts AI on a restricted assessment and receives a specific unavailable explanation.
3. Teacher starts course review, leaves the page, returns, reviews evidence, resolves one finding, and publishes the reviewed version.
4. Teacher reviews a submission, drafts feedback, edits it, then creates remediation without publishing either automatically.
5. User disconnects during a run and reconnects without duplicate text.
6. User cancels during provider work and sees confirmed cancellation.
7. Admin filters failed runs and opens a redacted run detail.

Do not skip the core mock-backed tests when UUID environment variables are absent. Keep a smaller optional suite for a seeded real backend.

### 10.5 Visual and accessibility checks

- Screenshot the empty, streaming, complete, error, restricted, long-answer, many-sources, and long-thread states.
- Cover mobile keyboard-open layout and 200% zoom.
- Test long Russian and Kazakh labels.
- Run automated accessibility checks, then keyboard and screen-reader manual passes.
- Confirm reduced motion disables cursor and panel transition motion.

## 11. Success measures

Instrument by feature and role. Establish a baseline before Phase 1.

### User experience

- Median time to first visible assistant text.
- p95 time to final answer/report.
- Follow-up turn success from a small reviewed sample.
- Percentage of answers with at least one valid, accessible citation when sources are expected.
- Retry success rate.
- Runs recovered after reconnect or navigation.
- Duplicate turn/message rate.
- Effective cancellation rate and time to cancellation confirmation.
- Teacher finding accept/dismiss/task-conversion rate.

### Reliability and cost

- Queue wait p50/p95.
- Provider error and fallback rate.
- Structured-output validation failure rate.
- Stuck-run count and age.
- Input/output tokens and estimated cost by feature.
- Context tokens as a share of total input.
- Retrieval hit rate and citation validation rate.

Initial service objectives should come from baseline data. Do not invent a universal latency target before measuring provider and course-size distributions. The first hard targets are zero cross-course thread mixing, zero duplicate messages from retries, and recovery of every persisted terminal run after reconnect.

## 12. Privacy, safety, and educational boundaries

- Show users the resolved context before sending when the scope includes a submission or selected text.
- Keep unpublished course content restricted to authorized roles.
- Treat submission analysis as an educational record with an explicit retention policy.
- Provide thread deletion and explain whether deletion removes messages, derived summaries, artifacts, and telemetry.
- Redact prompts, student work, provider payloads, and source excerpts from routine logs.
- Do not expose model chain-of-thought or label protocol reasoning events as reasoning.
- Require teacher review before publishing grades, feedback, remediation gates, or course quality scores.
- Keep deterministic grading outside the generative model path.
- Record prompt, schema, model, and source versions for contested teacher-facing recommendations.

## 13. Deletion list

Deleting conflicting paths is part of the implementation.

- Remove the queued Q&A endpoint and hook after direct streaming ships.
- Remove the synchronous Q&A endpoint if no non-interactive caller remains.
- Remove unused TanStack AI packages if the selected client spike rejects them; otherwise remove the redundant direct AG-UI chat wrapper.
- Remove global AI modes that represent workflow actions.
- Remove hardcoded `MODE_LABELS`.
- Remove source counts derived from mode counts.
- Remove synthetic percentage progress for AI work.
- Remove backend display sentences from protocol events.
- Remove disabled switch visuals when settings remain environment-controlled.
- Remove stale controller branches and tests that mock the old SSE shape.
- Mark the four older plans as historical or add a short pointer to this plan after the team accepts it.

## 14. Recommended pull-request sequence

1. **Truth patch:** scoped thread lookup, validated input, exhaustive surface router, mode cleanup, honest capability/error states, i18n.
2. **Streaming Q&A backend:** idempotent turn contract, history adapter, canonical AG-UI stream, deterministic tests.
3. **Streaming Q&A frontend:** one chat client, partial text, stop/retry, thread reconciliation, protocol-valid E2E.
4. **Context slice:** activity context descriptor, preview, ribbon, source navigation, no duplicate context rendering.
5. **Run recovery:** report controller convergence, URL run reference, SSE replay, enqueue failure handling.
6. **Teacher workflows:** course findings actions, submission flow split, anchored lesson review.
7. **Panel redesign:** responsive shell, mobile composer, density and accessibility pass.
8. **Operations:** filtered metrics, run drill-through, stuck-run tooling, eval workflow.

Each pull request must include one user-observable acceptance test. Avoid a preparatory “AI platform refactor” that ships no improved journey.

## 15. Definition of done

The recovery is complete when:

- every visible AI entry point performs the job named on its control;
- course Q&A uses one streaming path and remembers prior turns;
- activity-scoped copy corresponds to activity-scoped backend context;
- sources are valid, navigable, and attached to the answer they support;
- users can stop, retry, refresh, navigate away, and reconnect without losing or duplicating work;
- report runs and report review/publication use separate states;
- teachers can turn findings into reviewed actions without copying text between disconnected cards;
- admins can diagnose failures and cost by feature and run;
- the panel has one clear hierarchy, one scrollable transcript, one live region, and a mobile-safe composer;
- all three locales work without hardcoded English or Russian protocol copy;
- tests exercise real current contracts and do not skip the core AI journeys;
- obsolete chat paths, fake modes, synthetic progress, and decorative controls are deleted.

The first milestone is narrower: one student can open the learning assistant on one lesson, see the exact context, receive a genuinely streamed cited answer, ask a coherent follow-up, stop or reconnect safely, and reopen the thread later. Ship that before expanding the platform again.
