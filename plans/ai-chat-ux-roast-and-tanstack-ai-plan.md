# AI experience roast (round two) and TanStack AI adoption plan

## Read this first

Two prior plans (`plans/ai-implementation-improvement-plan.md`, `plans/ai-ui-ux-redesign-plan.md`, `plans/ai-ux-roast-and-redesign-plan.md`) already shipped real work on 2026-07-03 through 2026-07-05: authorization policy, queued runs via Taskiq, a docked activity panel replacing the old blurring sheet, a real Q&A thread list, a reviewable course-analysis report shell, citation validation, and course-aware citation links. That work is real and it is credited below. This plan does not repeat "the panel covers the lesson" — that specific complaint is fixed.

What is not fixed is more embarrassing than a layout bug: **the product already imports a purpose-built AI SDK and doesn't use it.** `@tanstack/ai-client`, `@tanstack/ai-react`, and `@ag-ui/core` are sitting in [package.json](../apps/web/package.json) as dependencies with zero call sites anywhere in `apps/web/src`. Meanwhile the app hand-rolls a raw `TextDecoder`/`split('\n\n')` SSE parser, a bespoke 10-state enum, three separate copies of the same state-label strings, and a "streaming" hook that never streams a single token of model output. That's not a "we haven't gotten to it yet" gap. That's paying for a library, walking past it, and building a worse version of it from scratch.

## Executive roast, current state

1. **"Streaming" is fake.** [use-ai-run-stream.ts](../apps/web/src/features/ai-experience/api/use-ai-run-stream.ts) opens an SSE connection and calls it a stream, but the events it carries are lifecycle transitions — `queued` → `collecting_context` → `running` → `checking_evidence` → `complete` — sourced from [operations.py](../apps/api/src/services/ai/operations.py)'s `_emit_run_event` calls. There is no `assistant.delta` equivalent. The user watches a five-stage [Progress](../apps/web/src/features/ai-experience/workspace/ai-run-progress.tsx) bar for however long the model takes (the code comments elsewhere note course analysis can take up to ~85 seconds), then the full answer appears all at once in [qa-message.tsx](../apps/web/src/features/course-qa/components/qa-message.tsx) via `AIStreamingText`, which — despite the name — just renders a static string. Every real chat product trained users to expect word-by-word output. This trains them to expect a spinner and a wall of text at the end. It reads as slower and less alive than it actually is.
2. **A real AI SDK is installed and ignored.** `@tanstack/ai-client@^0.19.2`, `@tanstack/ai-react@^0.16.3`, and `@ag-ui/core@^0.0.57` exist in the lockfile and `package.json` and are referenced by exactly nothing. The team is already paying the dependency-audit and install-size cost of this SDK without getting any of `useChat`, token-delta rendering, typed tool calls, tool-approval UI, or devtools out of it.
3. **Mode soup, still.** `ActivityAIMode` has eight values (`ask`, `explain`, `practice`, `sources`, `review`, `analyze`, `draft-feedback`, `remediation`). They're rendered as a `ToggleGroup` inside a horizontally scrolling `ScrollArea` in [activity-ai-panel.tsx](../apps/web/src/features/ai-experience/activity-panel/activity-ai-panel.tsx). The prior roast plan's complaint — "tabs, not workflows" — is still true; there are just more tabs now, and some of them (`explain`, `practice`, `sources`) don't obviously map to any distinct panel body in the code, which means they may be dead capability entries or silently share a body with `ask`.
4. **The thread list disappears exactly when it matters most.** `QAThreadList` only renders in the `xl` two-column grid, which [getAIModeLayout](../apps/web/src/features/ai-experience/activity-panel/activity-ai-panel.tsx) only grants to `review`/`analyze`/`draft-feedback`/`remediation`/admin surfaces. `ask` — the actual conversational mode, the one with a thread history — gets the `compact` layout, `min(26rem, calc(100vw - 2rem))` wide, with no thread column at all. The one feature explicitly rebuilt on 2026-07-04 ("real thread list... instead of raw message dumps") is invisible in the mode students use it in.
5. **Layout by inline style arithmetic.** `useActivityAIDockStyle` computes `paddingInlineEnd: calc(${dockWidth} + 1rem)` and every host page (`StudentActivityWorkspace`, assessment studio, submission studio, authoring editor) has to opt into applying that style object to itself. This is coupling by convention, not by type — nothing stops a fifth host page from forgetting to spread the style, and the panel will silently cover content again, which is the exact regression this whole redesign was supposed to kill permanently.
6. **The "Publish score" gate is decorative.** In [course-analysis-result-shell.tsx](../apps/web/src/features/course-analysis/components/course-analysis-result-shell.tsx) the publish button is disabled only by `publishing || citations.length === 0`. A teacher can open the panel, see one citation exists, and publish a 45/100 course score without ever opening `AIEvidencePanel` or reading a single finding. Existence of a citation is not the same thing as a human having reviewed it. There is no "I reviewed the evidence" acknowledgment step — just a confirm dialog that restates the same two sentences the header already said.
7. **State labels have three sources of truth.** The `AIWorkState` string union lives in [ai-run-state.ts](../apps/web/src/features/ai-experience/lib/ai-run-state.ts); English labels/help text are hardcoded a second time in [ai-copy.ts](../apps/web/src/features/ai-experience/lib/ai-copy.ts) (`AI_STATE_LABELS`, `AI_STATE_HELP`) and are unused by anything that renders through `next-intl`; and a third copy exists in the `AiExperience.states.labels` translation namespace that `AIRunProgress`/`AIResultShell` actually call via `useTranslations`. `ai-copy.ts` is either dead code or a landmine waiting for someone to import the wrong one.
8. **i18n is inconsistent exactly where it's most visible.** [ai-command-list.tsx](../apps/web/src/features/ai-experience/components/ai-command-list.tsx) hardcodes command labels and prompts as English string literals ("Explain this activity", "Draft intervention", "Map the course"...) with no `useTranslations` call at all, in an app that ships `en-US`, `ru-RU`, and `kk-KZ` locales and translates almost everything around these commands. A Kazakh- or Russian-locale student sees a fully localized panel chrome with a row of English suggestion chips glued in the middle. On the backend, [operations.py](../apps/api/src/services/ai/operations.py) hardcodes Russian-only event messages ("Запуск ИИ поставлен в очередь", "Контекст собран") into `AIEvent.payload_json` regardless of the requesting user's locale — the frontend currently ignores `payload.message` and re-derives its own label from `state`, which avoids a visible bug today, but the backend is silently producing locale-wrong data that will surface the moment anyone reads `run_metadata`/events directly (support tooling, admin eval dashboard, logs).
9. **No tool/evidence transparency during the run.** The backend already does real work mid-run — context assembly, citation validation, token budget checks — visible today only as coarse `state` strings. None of that is exposed as an inspectable event stream to admins/support, and there's no devtools-style trace despite the backend already modeling `AIEvent`/`AIArtifactRecord`/`AIEvidence` in a shape that maps cleanly onto typed tool calls.
10. **Cancel kills a black box.** `AIRunProgress`'s cancel button aborts the run with no partial output preserved — appropriate for a coarse job, wrong for anything that should feel conversational, where "stop generating, keep what you have" is the baseline expectation set by every mainstream chat UI.

## What's genuinely good and should not be touched

- The authorization model (`policy.py`, `require_ai_run_access`) and fail-closed feature flags.
- The queued run / event / artifact data model in `ai_runtime.py` — it's the right shape for report-style AI work (course analysis, submission analysis, remediation, lecture critique) and should stay exactly as-is for those flows.
- The docked panel replacing the old blurring sheet, `Escape`-to-close, focus restore, mobile `Drawer` fallback.
- Citation validation on the backend and course-aware citation navigation on the frontend (`AIEvidencePanel`).
- The reviewable course-analysis report shell (score header, findings table, evidence panel) — it needs a stronger publish gate, not a rebuild.
- Feature-area rollout discipline from the prior plans. Keep it. Don't do this as one PR.

## Where TanStack AI actually fits (and where it deliberately does not)

TanStack AI (`@tanstack/ai-client`, `@tanstack/ai-react`, AG-UI protocol via `@ag-ui/core`) is a beta, protocol-first SDK: a headless client plus framework hooks (`useChat`) that speak AG-UI request/event streams to any server, with typed client/server/isomorphic tools, tool-approval flows, and built-in devtools. It is not a hosted gateway and does not replace FastAPI, Pydantic AI, or the provider layer — it replaces the plumbing between "server emits events" and "React renders them," which is precisely the plumbing this codebase reinvented by hand in `use-ai-run-stream.ts` and `use-ai-run-controller.ts`.

**Adopt it for:** the genuinely conversational, turn-based surfaces — Course Q&A (`ask` mode), the study companion, and any future "explain"/"practice" chat-shaped mode. These have a message list, a composer, and a back-and-forth shape that `useChat` is built for.

**Do not adopt it for:** course analysis, submission analysis, remediation drafting, and lecture critique. These are single-shot report generations with structured Pydantic output, not conversations. Forcing them into a chat message model would be the exact "chat-box-for-everything" anti-pattern TanStack AI's own positioning argues against ("AI features are distributed systems wearing a chat box"). Keep these on the existing queued-run/artifact/report model. Optionally align their event _shape_ with AG-UI event naming for consistency, but don't rewrite their UI as a transcript.

## Plan

### 0. Guardrails

- `@tanstack/ai-client`/`@tanstack/ai-react`/`@ag-ui/core` are pre-1.0 (beta). Pin exact versions, add a short compatibility note to repo memory, and scope the initial rollout to Course Q&A only before touching the study companion.
- Do not remove the queued-run/artifact backend model. This plan changes the transport and rendering for chat surfaces, not the authorization, persistence, or report-generation architecture.
- Ship by feature area: Course Q&A first, verify, then study companion, then the shared command-chip/i18n/publish-gate fixes that apply everywhere.

### 1. Give Course Q&A a real AG-UI event stream (backend)

- Add a chat-shaped streaming endpoint for course Q&A (e.g. `POST /ai/course-qa/chat` or extend the existing run stream for this feature only) that emits AG-UI-compatible events: `text-message-start`, `text-message-content` (token deltas from the Pydantic AI agent's streaming response), `text-message-end`, plus a `tool-call`/`tool-result` pair for citation/evidence lookup instead of bundling citations only into the final payload.
- Reuse the existing context assembly, citation validation, and authorization (`require_ai_run_access`/course QA policy) unchanged — only the transport/event shape for this one endpoint changes.
- Localize any user-facing text still embedded in event payloads (or better: stop sending human-readable `message` strings from the backend entirely now that the frontend already derives labels from `state` via `next-intl` — pick one source of truth and delete the other, see step 5).

### 2. Wire `useChat` into `QAPanel` (frontend)

- Replace `useAIRunController` + `useAIRunStream` + local `localMessages` reconciliation in [qa-panel.tsx](../apps/web/src/features/course-qa/components/qa-panel.tsx) with `@tanstack/ai-react`'s `useChat`, pointed at the new endpoint via its SSE/fetch connection helper.
- Render assistant messages incrementally as `messages` update — this is the actual fix for problem #1. `AIStreamingText` becomes a thin wrapper that renders whatever partial content `useChat` currently has, with a cursor/typing indicator while `streaming` is true, instead of only rendering after the run is terminal.
- Model citation lookup as a typed tool (client or server tool per TanStack AI's tool model) so `AIEvidencePanel` renders from a structured tool result instead of a manually-parsed `citations_json` blob — same visual component, cleaner data path.
- Keep `useQAThreads`/`useQAThread` for thread persistence and the thread list sidebar (that's application state, not chat transport) — `useChat` handles the live turn, TanStack Query still owns thread history.
- Enable `devtools: { name: 'Course Q&A' }` behind a flag visible only to admin/support roles, so a support engineer debugging "the AI gave a wrong answer" can actually see the tool calls and provider events instead of reading raw `AIEvent` rows in the database.

### 3. Fix the thread list visibility bug

- Stop deriving the thread-list column from `getAIModeLayout`'s wide/compact split. The Q&A surface should always show its thread list when there is more than a trivial amount of vertical room, independent of which modes happen to be flagged `wide`. Concretely: give `QAPanel` its own two-column breakpoint (e.g. render the thread column whenever the panel's own container width allows it via a container query or `useIsMobile`-style hook scoped to the panel), not one borrowed from unrelated report modes.

### 4. Replace the inline-style docking hack with a real layout primitive

- Convert the activity/assessment/submission/authoring hosts from "apply this computed `paddingInlineEnd` style" to a shared layout component (e.g. `<ActivityAIDockLayout>` using CSS grid columns: `[content][dock]`) that every host renders through, so a new host page gets correct spacing by construction, not by remembering to call `useActivityAIDockStyle`. Add a lint/grep check (small script, matching the existing `check-empty-folders.mjs` style) that flags any route rendering `ActivityAIPanel` without going through the shared layout component.

### 5. Kill the triplicated state labels

- Delete `AI_STATE_LABELS`/`AI_STATE_HELP` from [ai-copy.ts](../apps/web/src/features/ai-experience/lib/ai-copy.ts) (or confirm zero imports and remove the file). `next-intl`'s `AiExperience.states.labels` namespace is the single source of truth; anything needing help text should add it to that same namespace, not a parallel TS object.
- Stop sending hardcoded Russian `message` strings from `operations.py`'s `_emit_run_event` calls. Send only the machine-readable `state`/`event_type` and structured payload fields (`source_count`, `input_tokens`, `error_code`); let the frontend keep deriving display text from `state` via `next-intl`, which it already does correctly. This removes a locale bug that hasn't bitten yet only by accident.

### 6. Localize the command chips

- Move every string in [ai-command-list.tsx](../apps/web/src/features/ai-experience/components/ai-command-list.tsx) (`COMMANDS` labels and prompts) into the `en-US`/`ru-RU`/`kk-KZ` message catalogs and consume them via `useTranslations`, matching every other AI surface in the app. Prompts sent to the model can stay in the request locale or be translated server-side; the visible chip label must never be hardcoded English again.

### 7. Make "Publish score" mean something

- Require the teacher to expand/open `AIEvidencePanel` (or each flagged finding) before `onPublish` becomes enabled — track a local "reviewed" state keyed by finding ids, not just "a citations array is non-empty." Pair this with a short, specific confirm-dialog description that names what will become visible to students (not a restatement of the header).
- For course analysis/submission analysis specifically, consider modeling "publish" as a tool-approval step if/when step 1's AG-UI plumbing is extended there — but only after Q&A ships and is stable; this is explicitly out of scope for the first iteration.

### 8. Extend to the study companion

- Once Course Q&A is shipped and verified (real streaming, working thread list, working devtools), repeat steps 1–2 for `apps/web/src/features/student-study` using the same endpoint pattern and the same `useChat` wiring. Do not start this before Q&A is stable in production.

### 9. Tests

- Update `apps/web/e2e/specs/07-ai-experience.spec.ai.spec.ts` (or the current equivalent) to mock an AG-UI token-delta stream and assert the UI renders partial text incrementally, not just a terminal state.
- Add a locale-switch test asserting `AICommandList` chip labels change with the active locale (guards regression of step 6).
- Add a test asserting the publish button stays disabled until the reviewed-state condition from step 7 is met.

## Definition of done

- Course Q&A answers render token-by-token through `useChat`/AG-UI, not as a single block after a lifecycle progress bar.
- `@tanstack/ai-client`/`@tanstack/ai-react`/`@ag-ui/core` have real call sites, or they're removed from `package.json` — no dependency sits unused.
- The Q&A thread list is visible whenever the Q&A panel is open, regardless of mode-to-layout mapping.
- No route can render `ActivityAIPanel` without correct content spacing by construction.
- State labels exist in exactly one place (`next-intl` messages).
- No AI-adjacent UI ships a hardcoded English (or hardcoded Russian, on the backend) string in a trilingual app.
- "Publish score" requires evidence to have been opened, not merely to exist.
- Report-style AI flows (course/submission analysis, remediation, lecture critique) are explicitly untouched by the chat migration.
