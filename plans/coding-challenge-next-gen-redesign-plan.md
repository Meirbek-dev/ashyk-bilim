# Coding Challenge Next-Gen Redesign Plan

**Date:** 2026-05-24  
**Scope:** Student coding challenge attempt UI, teacher authoring studio, code execution feedback loop, and review surface.  
**Benchmark:** LeetCode, HackerRank, Codeforces, CodeSignal, AtCoder practice rooms, and modern IDE-grade learning products.  
**Primary files audited:**
- `apps/web/src/features/assessments/registry/code-challenge/CodeChallengeAttemptContent.tsx`
- `apps/web/src/components/features/courses/code-challenges/CodeChallengeEditor.tsx`
- `apps/web/src/components/features/courses/code-challenges/CodeEditor.tsx`
- `apps/web/src/components/features/courses/code-challenges/TestCaseCard.tsx`
- `apps/web/src/features/assessments/registry/code-challenge/CodeChallengeStudio.tsx`
- `apps/web/src/features/assessments/registry/code-challenge/LanguagePolicyPanel.tsx`
- `apps/web/src/features/assessments/registry/code-challenge/TestCaseListEditor.tsx`
- `apps/web/src/services/courses/code-challenges.ts`
- `apps/api/src/services/assessments/attempt_service.py`
- `apps/api/src/services/code_execution/service.py`
- `apps/api/src/services/grading/pipeline/orchestrator.py`
- `apps/api/src/db/assessments.py`

---

## 1. Executive Diagnosis

The current coding challenge implementation has a functional foundation: it supports Monaco, language selection, visible tests, hidden tests, custom input, server-side Judge0 execution, draft autosave, final grading, and submission history. That is enough to prove the product capability.

It is not yet a world-class coding platform experience. It feels like an LMS assessment with a code editor embedded into it, not a focused competitive-programming or interview-practice environment. The current screenshot shows the main issue clearly: the interface has the raw pieces, but the left pane is mostly test cards and custom input rather than a rich problem statement; the editor is visually plain; feedback is shallow; navigation and calls to action are split between the challenge surface and the global LMS action bar; and the design lacks the dense, confident, keyboard-first feel of LeetCode/HackerRank/Codeforces.

The rewrite should treat coding challenges as their own product surface, not a minor subtype of assessment.

---

## 2. Critical UX Audit

### 2.1 Student Attempt Surface

| Issue | Evidence | Severity |
| :--- | :--- | :--- |
| Problem statement is underpowered | `CodeChallengeEditor` receives only `challengeTitle` and `challengeDescription`; the richer `CodeItemBody` fields `input_spec`, `output_spec`, `constraints`, and structured examples are not surfaced in the UI. | Critical |
| Left pane is not a real problem tab system | It renders description, visible tests, and custom input in one scroll column. LeetCode/HackerRank split Description, Editorial, Solutions, Submissions, Discussion, and custom testcase contexts. | Critical |
| Editor lacks IDE-grade controls | `CodeEditor.tsx` has Monaco but no command palette, reset code, font/line wrapping controls, vim/emacs toggle, format action, editor settings menu, split console keyboard shortcuts, or persisted layout preferences. | High |
| Result feedback is too thin | Results show pass/fail, time, memory, stdout/stderr. They do not provide diff views, first failing test focus, hidden test grouping, percentile/runtime comparison, final verdict timeline, or compile/runtime diagnostics with line anchors. | High |
| Action model is confusing | `CodeChallengeEditor` has Run, Run Tests, Submit, while `CodeChallengeAttemptContent` also wires submit into `AssessmentActionBar`. This creates two submit concepts depending on mode. | High |
| Fullscreen challenge surface is too bare | `AssessmentLayout.tsx` special-cases code challenges into a fixed viewport, but the header is only type + title + timer. It lacks problem navigation, attempt metadata, score status, layout controls, keyboard shortcut access, and focus mode. | High |
| Custom input placement is wrong | Custom input lives permanently in the left problem pane, taking reading space even when unused. HackerRank/LeetCode place custom testcase controls near result/output tabs. | Medium |
| History is present but not useful enough | `AttemptHistoryList` is compact and score-oriented. It does not let students diff attempts, restore code from an attempt, compare language/runtime, or inspect failed cases. | Medium |
| Empty and loading states are generic | `CodeItemLoading` uses skeletons; unconfigured state is a dashed box. World-class challenge UX needs explicit unavailable-runner, no-language, locked, submitted, returned, and read-only states. | Medium |

### 2.2 Teacher Authoring Studio

| Issue | Evidence | Severity |
| :--- | :--- | :--- |
| Authoring is a long form, not a challenge builder | `CodeChallengeStudio` stacks `LanguagePolicyPanel`, `StarterCodeTabs`, test editors, hints, and save button in one scroll. There is no workflow: problem design, harness, tests, validation, publish. | Critical |
| No rich problem statement model in UI | API schema has `prompt`, `input_spec`, `output_spec`, `constraints`, `reference_solutions`, `match_mode`, but the studio primarily edits settings, starter code, and tests. | Critical |
| No test authoring validation loop | Teachers cannot run reference solutions against all tests, detect duplicate tests, verify sample visibility, preview hidden-test leakage, or see expected score distribution. | Critical |
| Test editor is low-fidelity | `TestCaseListEditor` uses accordion + two textareas. It lacks import/export, table mode, generator mode, sample explanation, stdin/stdout diff preview, grouping, weights overview, and bulk operations. | High |
| Language configuration is too broad | `select all` Judge0 languages is dangerous. There are no curated language sets, recommended runtimes, starter/solution completeness checks, or per-language compatibility warnings. | High |
| Hints are disconnected from solving | Hints exist in `HintsPanel`, but the attempt surface does not expose a polished hint economy, reveal state, XP penalty confirmation, or hint progression. | High |
| Review surface is raw | `CodeItemReviewDetail` renders JSON. Teachers need code review with syntax highlighting, run details, failing cases, plagiarism indicators, timeline, and inline comments. | Critical |

### 2.3 Architecture and Data Contract

| Issue | Evidence | Severity |
| :--- | :--- | :--- |
| Duplicate/adapter-heavy model | Frontend has local `CodeChallengeSettings`, backend has `CodeItemBody`, service maps policy settings into item body and back. This increases drift risk. | High |
| Client idempotency key is weak | `codeRunIdempotencyKey` uses a simple JS integer hash over source/input. Backend validates source hash, but the client key can collide and is not stable across all edge cases. | Medium |
| Run response hides too much structure | `CodeRunResponse.visible_results` omits status IDs/descriptions, stderr/compile output per case, message, and hidden aggregate groups. The frontend reconstructs status codes with `runStatusCode`. | High |
| Final grading is synchronous in submit path | `_run_final_code_answers` runs Judge0 during final submit. That is simple but risks slow submit UX and makes queued execution/progress harder. | High |
| Match mode is underspecified | `CodeTestCase.match_mode` only supports `EXACT`. Competitive platforms need whitespace-insensitive, numeric tolerance, unordered lines, custom checker, and special judge support. | Medium |
| Runtime telemetry is not productized | Backend logs metrics and stores runs, but the UI does not expose queue/run phases, compile time, per-case time/memory distribution, or runner degraded recovery. | Medium |

---

## 3. Product Vision

Build a dedicated **Code Arena**: a fullscreen, resizable, keyboard-first challenge environment that feels like a competitive coding platform inside Ashyq Bilim.

The target experience:

```text
+------------------------------------------------------------------------------+
| Course > Topic > Two Sum                 Easy | 100 pts | Python 3.11 | 12:34 |
+------------------------------+-----------------------------------------------+
| Description  Editorial  Subs | Code                         [settings] [CmdK] |
|                              | +-------------------------------------------+ |
| Problem statement            | | Monaco editor                             | |
| Examples                     | | with language-aware starter code           | |
| Constraints                  | | lint/diagnostic gutter                     | |
| Hints                        | | persisted layout + theme                   | |
| Discussion / Notes           | +-------------------------------------------+ |
+------------------------------+-----------------------------------------------+
| Testcase  Test Result  Console  Submissions                                  |
| Case tabs | custom input | diff | first failing case | runtime/memory charts  |
+------------------------------------------------------------------------------+
```

Design principles:

1. **Problem-solving first:** All chrome supports reading, coding, testing, or learning.
2. **Fast feedback loop:** Run a sample in under one click; failed output shows a diff immediately.
3. **Trustworthy grading:** Students clearly understand visible vs hidden tests, compile errors, retries, and final verdicts.
4. **Teacher confidence:** A teacher cannot publish a broken challenge without seeing it fail validation.
5. **Keyboard-first:** Primary actions work through shortcuts and command palette.
6. **Localizable but code-native:** Russian/Kazakh UI remains polished while code, stdin/stdout, constraints, and verdict labels remain technical and precise.
7. **No generic LMS form feeling:** Coding challenges get a dedicated authoring and solving shell.

---

## 4. Rewrite Architecture

### 4.1 New Frontend Module Boundaries

Create a dedicated feature package:

```text
apps/web/src/features/code-arena/
  attempt/
    CodeArenaWorkspace.tsx
    CodeArenaHeader.tsx
    ProblemPane.tsx
    EditorPane.tsx
    ResultsDock.tsx
    SubmissionTimeline.tsx
    HintDrawer.tsx
    ShortcutsDialog.tsx
  authoring/
    CodeChallengeBuilder.tsx
    ProblemStatementEditor.tsx
    TestSuiteBuilder.tsx
    LanguageHarnessEditor.tsx
    ReferenceSolutionRunner.tsx
    PublishReadinessPanel.tsx
  review/
    CodeSubmissionReview.tsx
    CodeDiffViewer.tsx
    RunDiagnosticsPanel.tsx
  domain/
    codeChallenge.types.ts
    codeRun.types.ts
    codeChallenge.mappers.ts
    verdicts.ts
    languages.ts
  hooks/
    useCodeRun.ts
    useCodeSubmissionHistory.ts
    useCodeArenaLayout.ts
    useEditorPreferences.ts
```

Keep `features/assessments/registry/code-challenge` as the registry adapter only. It should mount `CodeArenaWorkspace`, not contain product logic.

### 4.2 Backend Contract Direction

Move toward a first-class code challenge contract instead of squeezing everything through generic assessment settings:

```text
GET    /code-challenges/activity/{activity_uuid}
PATCH  /code-challenges/{challenge_uuid}
POST   /code-challenges/{challenge_uuid}/validate
POST   /code-challenges/{challenge_uuid}/runs
GET    /code-challenges/{challenge_uuid}/runs/{run_uuid}
POST   /code-challenges/{challenge_uuid}/submit
GET    /code-challenges/{challenge_uuid}/me/submissions
GET    /code-challenges/{challenge_uuid}/leaderboard
```

This can initially wrap existing `assessments/*` endpoints, but the frontend should no longer need to reconstruct code-specific semantics from generic assessment reads.

### 4.3 Canonical Data Model

Extend `CodeItemBody` and align frontend types to it:

```typescript
type CodeChallengeProblem = {
  title: string;
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
  promptMd: string;
  inputSpecMd: string;
  outputSpecMd: string;
  constraints: string[];
  examples: Array<{
    id: string;
    input: string;
    output: string;
    explanationMd?: string;
  }>;
  tags: string[];
};

type CodeTestCase = {
  id: string;
  name: string;
  group: 'sample' | 'visible' | 'hidden' | 'stress';
  input: string;
  expectedOutput: string;
  weight: number;
  matchMode: 'EXACT' | 'TRIMMED' | 'IGNORE_WHITESPACE' | 'NUMERIC_TOLERANCE' | 'CUSTOM_CHECKER';
  explanationMd?: string;
};
```

The model must distinguish **sample examples** from **visible tests**. Today they are effectively the same thing in the attempt UI.

---

## 5. Student UX Redesign

### 5.1 Code Arena Header

Replace the compact assessment header with a coding-specific header:

- Left: course breadcrumb, problem list button, previous/next challenge.
- Center: title, difficulty, points, solved/submitted state.
- Right: timer, language, layout preset, shortcuts, settings, AI/hint button.
- Status strip: autosaved, running, queued, accepted, wrong answer, compile error, runner unavailable.

### 5.2 Problem Pane

Tabs:

- **Description:** prompt, examples, input/output specs, constraints, tags.
- **Hints:** locked/revealed hints with penalty confirmation.
- **Submissions:** attempt history, verdicts, restore code, compare code.
- **Editorial:** teacher-authored explanation, locked until accepted or released by policy.
- **Discussion/Notes:** optional per-course discussion or private notes.

Requirements:

- Markdown/rich text rendering with code blocks, tables, math, and copy buttons.
- Examples are structured cards with "Run this case" actions.
- Constraints are scannable chips/lists, not prose blobs.
- On mobile, problem/editor/results become top-level tabs with sticky action bar.

### 5.3 Editor Pane

Monaco should become a real coding environment:

- Per-language starter code, reset-to-starter, restore-last-submission.
- Editor preferences: theme, font size, tab size, minimap, word wrap, vim mode later.
- Command palette: Run, Submit, Reset, Format, Change language, Toggle focus, Open shortcuts.
- Keyboard shortcuts:
  - `Ctrl/Cmd + Enter`: run visible/sample tests.
  - `Ctrl/Cmd + Shift + Enter`: submit.
  - `Ctrl/Cmd + K`: command palette.
  - `Ctrl/Cmd + /`: shortcuts.
- Persist split sizes and editor preferences by user.
- Show read-only overlay for submitted/locked states without blocking code selection/copy.

### 5.4 Results Dock

Replace the current tab strip with a diagnostics-grade dock:

- **Testcase:** sample/visible cases and custom input.
- **Result:** latest run verdict, first failing case, diff viewer, stdout/stderr/compile output.
- **Console:** raw output for custom runs.
- **Submissions:** final attempts with verdict, language, score, runtime, memory, submitted date.

Result UX:

- Verdict banner: Accepted, Wrong Answer, Compile Error, Runtime Error, Time Limit, Runner Unavailable.
- Diff modes: side-by-side and inline.
- Hidden tests: show group counts and failure category without leaking input/output.
- Runtime/memory row per test plus aggregate max/avg.
- Queue state: queued -> compiling -> running tests -> judging -> done.
- Retry state for `DEGRADED` runs.

### 5.5 Learning Layer

Add platform-grade learning affordances:

- Progressive hints with XP/score penalty.
- "Explain failing case" AI action that only uses visible data.
- "Complexity target" display from teacher metadata.
- Tags/topics and related problems.
- Solved animation kept restrained: accepted verdict, score, next challenge CTA.

---

## 6. Teacher Authoring Redesign

### 6.1 Builder Workspace

Replace the stacked form with a four-tab builder:

1. **Problem**
   - Title, difficulty, tags.
   - Rich markdown prompt editor.
   - Input/output spec editors.
   - Constraint builder.
   - Example cards with input/output/explanation.

2. **Languages**
   - Curated presets: Python + JS, Python-only, Competitive set, Systems set.
   - Per-language starter code.
   - Per-language reference solution.
   - Completeness matrix: starter present, reference solution present, compiles, passes samples, passes hidden.

3. **Tests**
   - Test table with group, name, weight, match mode, visibility.
   - Bulk import/export JSON/CSV.
   - Generate stress tests later.
   - Run reference solution against selected/all tests.
   - Detect duplicate inputs, empty expected output, invalid weights, no hidden tests, no sample tests.

4. **Review & Publish**
   - Readiness checklist.
   - Student preview.
   - Estimated grading cost/time.
   - Security and access policy.
   - Publish button disabled until blocking issues are resolved.

### 6.2 Test Suite Builder

The test suite builder is the heart of teacher confidence:

- Spreadsheet-like dense table for many cases.
- Side panel for selected test detail.
- Drag/drop reordering and grouping.
- Weight distribution visualization.
- "Promote to sample", "Make hidden", "Duplicate", "Run only this test".
- Validation warnings inline, not giant banners.

### 6.3 Reference Solution Validation

Before publish:

- Every enabled language reference solution must compile.
- At least one sample and one hidden test must pass.
- Time/memory should be captured for baseline.
- A slow reference solution should warn teachers about limits.
- Store validation snapshot so later edits can invalidate readiness.

---

## 7. Review and Analytics Redesign

Replace JSON review with an IDE-grade review workspace:

- Student code with syntax highlighting.
- Latest run verdict and per-test diagnostics.
- Attempt timeline with language, score, runtime, memory.
- Restore/diff attempts.
- Teacher feedback and inline comments.
- Plagiarism/similarity panel when available.
- Cohort analytics: pass rate, common failing tests, language distribution, avg attempts to accepted.

This should integrate with existing `GradingReviewWorkspace`, but code submissions need a specialized detail pane instead of `JSON.stringify`.

---

## 8. API and Execution Improvements

### Phase 1 API Shape Without Breaking Existing Flow

- Extend `CodeRunTestResult` with:
  - `status_id`
  - `status_description`
  - `stderr`
  - `compile_output`
  - `message`
  - `description`
  - `weight`
  - `group`
- Return `hidden_summary`: total, passed, failed, status buckets.
- Return a stable `run_phase`: queued, compiling, running, judging, completed.
- Replace frontend hash idempotency with `crypto.subtle.digest('SHA-256')` or server-generated run keys.

### Phase 2 Async Final Submission

Move final code grading toward an async run model:

1. Student submits.
2. Submission becomes `PENDING_JUDGE`.
3. Backend queues final run.
4. UI subscribes/polls run status.
5. Final result updates submission and progress.

This avoids long blocking submit requests and enables real-time judging UX.

### Phase 3 Advanced Judging

- Match modes beyond exact matching.
- Numeric tolerance.
- Whitespace-insensitive mode.
- Custom checker support for advanced problems.
- Multi-file/project submissions later.
- Language-specific boilerplate/harnesses for function-style problems.

---

## 9. Visual Design Direction

The UI should be calm, dense, and technical. Avoid a marketing look.

Design tokens:

- Dark mode first for code arena, light mode supported.
- Pane backgrounds: editor-neutral, problem-readable, dock-compact.
- Radius: 6-8px, not pill-heavy.
- Status colors:
  - Accepted: emerald.
  - Wrong answer: rose/red.
  - Compile/runtime: amber/orange.
  - Running/queued: blue.
  - Hidden/locked: muted gray.
- Use icons for actions: run, submit, reset, settings, layout, copy, expand.
- Avoid large cards inside panes; use panels, tabs, rows, and compact toolbars.

Current screenshot target improvements:

- Replace huge blank editor feel with line-height-balanced Monaco, dark option, top utility toolbar.
- Move custom input to bottom testcase dock.
- Promote problem statement and examples above raw tests.
- Collapse global bottom LMS navigation while in coding focus mode, or make it visually secondary to Run/Submit.
- Show accepted result as a verdict banner with score and next action, not only a row in results.

---

## 10. Implementation Plan

### Milestone 0: Stabilize and Document

- Add typed domain models in `features/code-arena/domain`.
- Add mapper tests from current assessment payloads to new UI models.
- Inventory all translations under `Activities.CodeChallenges`.
- Add Playwright baseline screenshots for current attempt, accepted result, compile error, authoring, and review.

### Milestone 1: Student Code Arena Shell

- Build `CodeArenaWorkspace` using existing run/submit services.
- Move problem, editor, and results into dedicated panes.
- Persist resizable layout in local storage with schema version.
- Add keyboard shortcuts and command palette.
- Move custom input into results dock.
- Keep existing assessment registry adapter.

### Milestone 2: Diagnostics-Grade Results

- Redesign `TestResultsList` into verdict + cases + diff.
- Add first failing case autofocus.
- Show compile/runtime diagnostics consistently.
- Add hidden-test summary support from existing data where possible.
- Improve runner unavailable and retry states.

### Milestone 3: Authoring Builder

- Replace `CodeChallengeStudio` stacked page with tabbed builder.
- Add rich problem statement sections.
- Add example builder separate from test cases.
- Add test suite table and selected-test inspector.
- Add language/reference solution completeness matrix.

### Milestone 4: Backend Contract Upgrade

- Extend `CodeRunResponse` and `CodeRunTestResult`.
- Add validation endpoint for reference solutions and publish readiness.
- Add stronger idempotency.
- Add async final judging path behind a feature flag.

### Milestone 5: Review and Analytics

- Replace `CodeItemReviewDetail` JSON with `CodeSubmissionReview`.
- Add code diff, attempt timeline, run diagnostics, and feedback panel.
- Add teacher analytics for common failing tests and pass rates.

### Milestone 6: Competitive Platform Polish

- Add problem list drawer and related problems.
- Add leaderboard mode for competitive subtype.
- Add editorial release.
- Add solution notes.
- Add AI explain-failing-visible-case action.

---

## 11. Testing Strategy

Unit tests:

- Payload mappers: assessment item -> code arena model.
- Verdict mapping from backend statuses.
- Diff generation.
- Layout preference versioning.
- Idempotency key generation.

Integration tests:

- Run visible tests.
- Run custom input.
- Compile error.
- Wrong answer with diff.
- Accepted final submit.
- Runner degraded retry.
- Draft autosave and restore.
- Language switching preserves per-language code.

Playwright:

- Desktop arena at 1920, 1440, 1366.
- Tablet and mobile tabbed arena.
- Dark and light theme.
- Keyboard-only flow: open problem, edit code, run, inspect result, submit.
- Authoring readiness flow: broken challenge cannot publish; fixed challenge can publish.

Backend tests:

- Hidden tests never leak input/output.
- Visible/custom runs do not affect final grade.
- Final run records latest code result.
- Match modes.
- Async final judging state transitions.

---

## 12. Success Metrics

Product metrics:

- Time from opening challenge to first run under 30 seconds for new users.
- At least 80% of failed runs show a useful first-failing-case diagnostic.
- Teacher publish readiness catches broken reference/test setups before publication.
- Students can restore any previous attempt in one click.
- Mobile users can complete a simple challenge without layout overlap.

Engineering metrics:

- Code challenge UI logic lives under `features/code-arena`, with registry adapters only in `features/assessments`.
- No frontend reconstruction of Judge0 numeric status from generic strings.
- No JSON review detail for code submissions.
- No duplicated settings source between policy JSON and item body without a mapper test.
- Playwright screenshots for attempt/author/review stay stable.

---

## 13. Non-Goals for the First Rewrite

- Building a public global competitive programming platform.
- Multi-file projects.
- Real-time collaborative coding.
- Full custom checker sandbox until the basic match modes are stable.
- AI code generation. The first AI feature should explain visible failures, not solve the challenge.

---

## 14. Final Recommendation

Do not incrementally decorate the current `CodeChallengeEditor` until it resembles LeetCode. The current component already mixes problem rendering, Monaco, execution mutations, result rendering, history, custom input, and submission control. That shape will fight every serious UX upgrade.

Rewrite around a dedicated Code Arena feature with clean panes, a richer problem model, a diagnostics-first results dock, and a teacher builder that validates challenge quality before publishing. Keep the existing assessment and Judge0 services as the initial backend foundation, then upgrade the API contract where the UI needs platform-grade feedback.
