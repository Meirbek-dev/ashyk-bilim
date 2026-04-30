# Assessment System Redesign Plan

**Scope.** Exams, coding assignments, regular assignments, file submissions, grading, gradebook, and the shared "attempt + studio + review" UX. Both halves of the stack — backend (`apps/api`) and frontend (`apps/web`) — but the bulk of the work and value is on the frontend.

**Goal.** Collapse three half-overlapping systems (assignments, exams, code challenges) into one coherent assessment platform with a single attempt UX, a single studio UX, a single review UX, and one terminology, where the *type* of assessment changes only the inner content slot — never the chrome around it.

**Non‑goal.** Changing the pedagogical model. We are not adding new question types, new grading strategies, or new deadlines semantics. This is a consolidation, not a feature push.

---

## 1. Why this needs to happen

Today the system has a half-finished migration from a per-feature architecture (`features/assignments/*`, `features/exams/*`, `components/Activities/ExamActivity/*`) to a unified registry architecture (`features/assessments/registry/*`). Both layers are live, both are being edited, and they disagree about almost everything that matters to the user.

Concrete evidence of the drift:

| Concern | Assignment (student) | Exam (student) | Code challenge (student) | Grading (teacher) |
|---|---|---|---|---|
| Shell file | `StudentAssignmentShell.tsx` (238 LOC) | `ExamAttemptContent.tsx` (381 LOC, useReducer) | `CodeChallengeAttemptContent.tsx` (96 LOC, hides submit) | `GradingReviewWorkspace.tsx` (810 LOC) |
| State mgmt | React Query + `useState` | `useReducer` + manual `localStorage` + `useState` | Delegated to child editor | `useState` + `useTransition` + `useQuery` |
| Save indicator | Footer text | Header inline label, 600 ms hidden timeout | None visible | None |
| Submit verb (i18n) | "Submit Assignment" / "Submit for grading" | "Confirm & Submit" / "Re‑submit" | (button hidden) | "Save grade" |
| Timer | None | Header badge | None | n/a |
| Anti‑cheat hooks | Ignored | Wired through `AttemptShell` | Ignored | n/a |
| Navigation between items | Linear list | Sidebar + bottom sheet + keyboard | Single editor | `j`/`k` keyboard only, undocumented |
| Recovery / unsaved work | Modal | Modal | None | n/a |
| Save state badge | Footer | Header **and** footer (duplicate) | None | n/a |

On the backend the situation is better — there is a real `Submission` table, a `GraderRegistry`, and a `KindModule` slot pattern — but it still carries:

- `/grading/start/` (v1) and `/grading/start/v2/` both registered, with different attempt-limit enforcement.
- `QuizAttempt` legacy table coexisting with `Submission`.
- Code-challenge attempts initially recorded in `CodeSubmission`, not `Submission` — re-mapped later, so the registry's invariants are weaker than they look.
- `Exam` settings split between an `Exam` row and `activity.details["settings"]` JSON.
- "Activity" / "Assignment" / "Assessment" used interchangeably in router and service names.

The user-visible cost of this split is that *every* assessment flow looks like a slightly different product. Students learn three different submission rituals. Teachers grade in a different layout per kind. Translators maintain three sets of near-identical strings. The shadcn migration (`docs/ShadCN UI Design System Guide.md`, `plans/theming-refactor.md`) doesn't repair this — it only repaints it.

---

## 2. Target architecture

One word of vocabulary up front: **assessment** is the umbrella, **kind** is its discriminator (`TYPE_ASSIGNMENT`, `TYPE_EXAM`, `TYPE_CODE_CHALLENGE`, `TYPE_QUIZ`), and an **item** is a single thing the student answers (a question, a task, a coding problem). This is the only naming convention; everywhere else we adopt it.

### 2.1 Frontend mental model

```
AssessmentRoute
├── AssessmentChrome              (header, breadcrumb, title, status, timer slot, save slot)
├── AssessmentBody                (kind-provided content)
│    └── <KindModule.Attempt | Studio | Review />
└── AssessmentActionBar           (footer: primary submit, secondary save, tertiary actions)
```

There is exactly one `AssessmentChrome`, one `AssessmentActionBar`, one `useAssessmentAttempt()` hook that owns persistence/save-state/recovery, and one `useAssessmentPolicy()` hook that owns timer/anti-cheat/deadline. Kind modules become smaller and dumber: they render *items*, not chrome.

The current `KindModule` registry stays — it's the right pattern. We tighten its contract and migrate the legacy `features/assignments/student/*` and `components/Activities/ExamActivity/*` code into it.

### 2.2 Backend mental model

```
Activity (parent)
  ├── kind = TYPE_ASSIGNMENT | TYPE_EXAM | TYPE_CODE_CHALLENGE | TYPE_QUIZ
  ├── settings (one JSON column, schema'd per-kind via Pydantic discriminated union)
  └── items (Item table, one row per question/task/problem, polymorphic config column)

Submission (one row per attempt, all kinds)
  └── GradingEntry (append-only ledger)
```

Every kind writes to `Submission` from the first attempt — including code challenges. `QuizAttempt` is dropped. `Exam.settings` and `activity.details["settings"]` are merged into a single discriminated `AssessmentSettings`. v1 grading endpoints are deleted. "Assignment" and "Activity" stop being used as synonyms in code (we keep DB column names for migration safety, but route prefixes and service names use only "assessment" + the kind).

---

## 3. Phased plan

Five phases. Each ships independently and leaves the system in a working state. No "big bang" — the registry pattern is already in place, we're filling it in and removing the parallel system underneath.

### Phase 0 — Inventory & lock-in (1 week)

Concrete deliverables, no UX impact:

- [ ] Freeze new feature work in `features/assignments/student/*`, `features/assignments/studio/*`, and `components/Activities/ExamActivity/*`. Add a `// LEGACY: see plans/assessment-system-redesign.md` banner at the top of each barrel file.
- Remove all legacy code, redundant, compatibility code.
- [ ] Tag every legacy file with a TODO referencing the phase that removes it (grep target for the cleanup phase).
- [ ] Snapshot the current i18n keys for assessment flows into `apps/web/messages/_audit.json` so we can diff after consolidation.

### Phase 1 — Unify the attempt shell (2 weeks)

The single highest-leverage change. Today every kind reimplements the chrome around its content; we collapse that into one shell.

**Files to create**

- `apps/web/features/assessments/shell/AssessmentChrome.tsx` — header (title, status badge, timer slot, save slot, focus-mode toggle).
- `apps/web/features/assessments/shell/AssessmentActionBar.tsx` — footer (primary submit, secondary save, overflow menu). One source of truth for the save badge — remove the duplicate header rendering in today's `AttemptShell.tsx` (lines 228–231 and 298–301).
- `apps/web/features/assessments/shell/AssessmentLayout.tsx` — the only file that lays out chrome + body + action bar.
- `apps/web/features/assessments/shell/hooks/useAssessmentAttempt.ts` — owns: draft answer state, save state, debounced save, recovery prompt, submission. Wraps React Query. Replaces the `examTakingReducer`'s persistence concerns and `StudentAssignmentShell`'s ad-hoc save logic.
- `apps/web/features/assessments/shell/hooks/useAssessmentPolicy.ts` — owns: time limit, deadline, attempt limits, fullscreen / tab-switch / paste guards. Today's `AttemptShell` already has the wiring; we lift it into a hook so kinds without a shell (code challenge today) can opt in.

**Files to delete after migration**

- `apps/web/features/assessments/shared/AttemptShell.tsx` (replaced by `AssessmentLayout`).
- `apps/web/components/Activities/ExamActivity/state/examTakingReducer.ts` (logic moves into `useAssessmentAttempt`).
- `apps/web/hooks/useExamPersistence.ts` (subsumed).
- `apps/web/features/assignments/student/StudentAssignmentShell.tsx`'s footer code (replaced by `AssessmentActionBar`).

**Acceptance criteria**

- All four kinds (`TYPE_ASSIGNMENT`, `TYPE_EXAM`, `TYPE_CODE_CHALLENGE`, `TYPE_QUIZ`) render the same header chrome and the same footer.
- Save badge appears in exactly one place (footer).
- Code challenge submit button is visible (today it's hidden via `hideSubmitButton`, line 91 of `CodeChallengeAttemptContent.tsx`).
- Recovery prompts use a single component, not three.
- Visual regression tests (Playwright screenshots) added for each kind's attempt page.

### Phase 2 — Unify the item model on the frontend (2 weeks)

Today each kind invents its own item type:

- Assignment has `AssignmentTaskType` (FILE_SUBMISSION / QUIZ / FORM / OTHER) with per-type editors and per-type attempts.
- Exam has `QuestionTypeEnum` (SINGLE_CHOICE / MULTIPLE_CHOICE / TRUE_FALSE / MATCHING) with monolithic editor and monolithic attempt.
- Code challenge is implicitly a single item.
- Quiz overlaps with assignment's QUIZ task and exam's choice questions but renders neither.

We define one frontend `ItemKind` registry that any kind can use. Choice items (single/multiple/true-false) become reusable across exam and quiz. File submission becomes one component reused by assignment and any future kind. Code challenge stays a special item type.

**Files to create**

- `apps/web/features/assessments/items/registry.ts` — `ItemKindModule` with slots `Author`, `Attempt`, `ReviewDetail`. Keys: `CHOICE_SINGLE`, `CHOICE_MULTIPLE`, `TRUE_FALSE`, `MATCHING`, `OPEN_TEXT`, `FILE_UPLOAD`, `FORM`, `CODE`.
- `apps/web/features/assessments/items/choice/*` — single component handles single/multiple/true-false via discriminated props. Replaces both `ExamQuestionCard.tsx` and any choice rendering in assignment QUIZ tasks.
- `apps/web/features/assessments/items/file-upload/*` — replaces both `FileAttempt.tsx` and the relevant half of `FileTaskEditor.tsx`. Single component for the attempt, single component for the constraints editor.
- `apps/web/features/assessments/items/code/*` — wraps the existing Monaco editor wiring; takes its starter code, language list, test cases as props. The `CodeChallengeEditor` and `CodeEditor` files in `components/features/courses/code-challenges/` are reduced to leaf primitives.

**Files to delete after migration**

- `apps/web/features/assignments/student/attempts/{FileAttempt,FormAttempt,QuizAttempt}.tsx`.
- `apps/web/features/assignments/studio/task-editors/{FileTaskEditor,FormTaskEditor,QuizTaskEditor,TextTaskEditor}.tsx`.
- `apps/web/components/Activities/ExamActivity/{QuestionEditor,QuestionManagement,ExamQuestionNavigation}.tsx`.

**Acceptance criteria**

- One choice-item component is rendered by both exam and assignment-quiz attempts.
- One file-upload component is rendered by any kind that wants file submission.
- Adding a new item type is a single new directory under `items/`, no other file changes.

### Phase 3 — Unify studio and review workspaces (1.5 weeks)

`AssessmentStudioWorkspace` and `AssessmentReviewWorkspace` already exist as routing entry points (per the registry-pattern audit). The work here is to make them *thin* — they should be a layout with three slots that the kind module fills:

- **Outline slot** — list of items, drag-to-reorder, kind-supplied label.
- **Editor slot** — currently selected item's author UI, sourced from the `ItemKindModule.Author`.
- **Inspector slot** — kind-level settings (deadline, attempts, anti-cheat, grading strategy). This becomes the single home for the discriminated `AssessmentSettings` schema.

`GradingReviewWorkspace.tsx` (810 LOC, three-pane, hard-coded keyboard nav) gets the same treatment for the teacher review side: list pane / center pane / form pane, with kind-supplied review-detail rendering coming from `ItemKindModule.ReviewDetail`. j/k keyboard nav stays but becomes discoverable: a tooltip on first visit, plus visible Previous/Next buttons (which the mobile path needs anyway).

**Files to delete or shrink**

- `apps/web/features/grading/review/GradingReviewWorkspace.tsx` — split into `ReviewLayout`, `SubmissionList`, `SubmissionInspector`, `GradeForm`. Each ≤ 250 LOC.
- `apps/web/features/grading/gradebook/CourseGradebookCommandCenter.tsx` — keep but extract toolbar (`GradebookToolbar`) and cell renderers; persist filter state to URL search params so a teacher can deep-link a filtered view.
- `apps/web/components/Grading/{GradingStats,InlineFeedback}.tsx` — fold into the new `GradeForm` and `SubmissionInspector`. Delete `components/Grading/Student/SubmissionResult.tsx` once the student-facing review path uses the same `ReviewDetail` slot.

**Acceptance criteria**

- Teacher grading layout is identical for assignment, exam, and code challenge — only the center pane content differs.
- Saved filters in the gradebook URL.
- Visible keyboard hints, exposed Previous/Next buttons.

### Phase 4 — Backend consolidation (1.5 weeks, can run in parallel with Phase 3)

Smaller scope than the frontend, but the parts that survive will be load-bearing for years.

**Settings**

- Define a Pydantic discriminated union `AssessmentSettings` keyed by `kind` covering all four kinds. Persist it as a single JSON column on `Activity`. Migrate `Exam` table's settings columns into it; keep the `Exam` table only for FK-shape compatibility, mark its settings columns deprecated.
- Single read/write path: `services/assessments/settings.py` with `get_settings(activity_id) -> AssessmentSettings` and `put_settings(activity_id, AssessmentSettings)`.

**Submissions**

- Code challenges write a `Submission` row at `start`, not at `complete`. `CodeSubmission` becomes the per-run ledger that `Submission.metadata` references, not a parallel attempt table.
- Drop the `QuizAttempt` table. Migration: copy any rows that aren't already in `Submission`, then drop the table in a follow-up migration two releases later (data-safe two-step).
- Delete `/grading/start/` (v1). Update any client still calling it (grep `apps/web/services/grading/`); if there are none, remove immediately.

**Naming hygiene**

- Rename router prefixes: `routers/courses/assignments.py` → `routers/assessments/assignments.py`, ditto exams and code-challenges, all under `/assessments/{kind}/...` rather than mixing `/courses/assignments/` and `/exams/`. Keep old prefixes as 308 redirects for one release.
- Rename services: `services/courses/activities/assignments/` → `services/assessments/assignments/`. The "activity" name stays only on the DB model.

**Acceptance criteria**

- One JSON shape for settings per kind, validated by the discriminated union.
- Every attempted-by-a-student state is in `Submission`.
- `openapi.json` diff shows no v1 grading routes.
- No service/router file uses both "assessment" and "activity" as synonyms.

### Phase 5 — Cleanup, terminology, polish (1 week)

**i18n.** Pick one verb per action and apply globally. Concrete decisions:

| Action | Old (any of) | New (only) |
|---|---|---|
| Submit final answer | "Submit", "Submit Assignment", "Submit for grading", "Confirm & Submit", "Hand in" | **Submit** |
| Save draft | "Save", "Save draft", "Save progress" | **Save draft** |
| Re-submit allowed | "Re-submit", "Resubmit" | **Submit again** |
| Status: pending grade | "Pending", "Submitted" (header), "Awaiting" | **Awaiting grade** |
| Status: graded, unreleased | "Graded", "Marked" | **Graded** |
| Status: released to student | "Published", "Released" | **Released** |

Migration: write a one-shot script `apps/web/scripts/i18n-consolidate.ts` that rewrites `en-US.json`, `kk-KZ.json`, `ru-RU.json` per the table above and deletes orphaned keys. Translators review the kk-KZ and ru-RU diffs before merge.

**Status surface.** `SubmissionStatusBadge` is the only place a status string is rendered. Anywhere else (e.g. `StudentAssignmentShell`'s `getStatusBanner`) imports the badge or its label helper; no string literals.

**Theming.** Already in motion via `plans/theming-refactor.md` and `docs/ShadCN UI Design System Guide.md` — no separate work item, but every file we touch in phases 1–4 must already conform (semantic tokens, no hardcoded colors). Treat that as a merge gate.

**Legacy purge.** Delete every file marked LEGACY in Phase 0 that's no longer imported. Run `knip` (already configured at `apps/web/knip.json`) to verify.

---

## 4. Risk register

| Risk | Mitigation |
|---|---|
| In-flight student attempts during a deploy | All persistence keys are scoped by `submissionId`, not by feature. The Phase-1 hook keeps the same localStorage key shape today's `useExamPersistence` writes, so resumed attempts find their drafts. |
| Translators block on i18n consolidation | Phase-0 audit snapshot lets us hand them a finite, finished diff. Don't merge phase 5 until kk-KZ and ru-RU are signed off. |
| Backend rename breaks an external integration | The 308 redirects in Phase 4 cover one release. Announce in `apps/api/CHANGELOG` (create if absent) and at the same release, log a deprecation warning when the old prefix is hit. |
| GradingReviewWorkspace split regresses keyboard nav | Add Playwright e2e covering j/k flow before splitting; run it after each split commit. |
| Hidden behaviour in `examTakingReducer` lost in the rewrite | Phase 1 starts by writing a property test against `useAssessmentAttempt` that replays a recorded reducer trace. Only delete the reducer once the hook passes the trace. |

---

## 5. What does "done" look like

For a student, every kind of assessment opens with the same header, the same status pill, the same save indicator, and the same submit button in the same place. The body of the page changes — questions vs. tasks vs. an editor — but nothing else does.

For a teacher, the studio is the same three-pane layout for every kind. Adding a question type is one folder, not a new feature directory. Grading any kind looks the same: list on the left, submission in the middle, score and feedback on the right, with visible keyboard shortcuts.

For a developer, "where do I add X?" has one answer per X. Tasks are items. Items live in a registry. Settings live in a single discriminated union. Submissions live in one table. Routes live under `/assessments/{kind}`. Strings live in one i18n key per concept.

For a translator, there is one verb for "submit," one label per status, and one set of keys. The 346 KB / 490 KB / 499 KB locale files shrink — that's a measurable success metric on its own.

---

## 6. Sequencing summary

| Phase | Calendar | Frontend impact | Backend impact | Ship-blocking? |
|---|---|---|---|---|
| 0 — Inventory & lock-in | 1 wk | None (banners, lint rule) | None | No |
| 1 — Unified shell | 2 wks | High (visible UX harmonization) | None | Yes (releases between sub-PRs are safe; final PR flips defaults) |
| 2 — Unified items | 2 wks | High | None | Per-kind PRs |
| 3 — Studio + review unification | 1.5 wks | High (teacher-visible) | None | Per-pane PRs |
| 4 — Backend consolidation | 1.5 wks | Low | High | Settings + submissions migrations are 2-step |
| 5 — Cleanup & i18n | 1 wk | Visible (terminology) | Low (router rename redirects retired) | No |

Total: ~9 weeks of focused work, parallelizable between frontend and backend after Phase 1 lands.
