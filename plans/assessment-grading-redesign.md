# Assessment & Grading Redesign Plan

A critical analysis of the current exam, assignment, code-challenge, and grading
surfaces, plus a concrete plan to rewrite them into a single coherent system.

> Scope: this document covers the **frontend product surfaces** plus the
> **backend boundaries that bleed into the UI**. It does not propose a database
> migration unless the field shape forces a UI inconsistency that cannot be
> hidden behind a view model.

---

## 1. What we have today (audit)

### 1.1 Three parallel mental models for the same problem

The platform offers four assessable activity types — `TYPE_QUIZ` (block-based),
`TYPE_ASSIGNMENT`, `TYPE_EXAM`, `TYPE_CODE_CHALLENGE` — and they each picked a
different paradigm:

| Concern | Assignment | Exam | Code Challenge | Quiz (block) |
|---|---|---|---|---|
| Author entry route | `/dash/assignments/[uuid]` (Studio) | `/course/[c]/activity/[a]` (phase=manage) | `/course/[c]/activity/[a]` + `/code-challenges/{a}/settings` PUT | inside Tiptap dynamic editor at `/editor/...` |
| Student entry route | `/course/[c]/activity/[a]` (renders `StudentAssignmentActivity`) | same path, phase=`pre-exam`/`taking`/`results` | same path, single `CodeChallengeActivity` | inline block in dynamic content |
| Teacher/student boundary | separate components (`AssignmentStudio` vs `StudentAssignmentShell`) | **same component, branched by `contributorStatus`** | same component, settings hidden | block render |
| State management | TanStack Query + React state | `useReducer(examFlowReducer)` + custom `useExamMutation` | TanStack Query | inline |
| Submissions API | unified `Submission` table | unified `Submission` *and* legacy `ExamAttempt` table | unified `Submission` *and* `CodeSubmission` table | unified `Submission` |
| Submission viewer | `GradingReviewWorkspace` | `ExamResultsDashboard` (separate UI) | per-submission detail page | gradebook only |
| Status vocabulary | `DRAFT/SCHEDULED/PUBLISHED/ARCHIVED` (assignment) + `DRAFT/PENDING/GRADED/PUBLISHED/RETURNED` (submission) | `IN_PROGRESS/SUBMITTED/AUTO_SUBMITTED` (attempt) | `PENDING/PROCESSING/COMPLETED/FAILED/PENDING_JUDGE0` (judge) | submission only |

The result: **a teacher who learns the assignment workflow learns nothing
transferable for exams or code challenges**. A student, similarly, sees three
unrelated UIs — pre-screen card grid for exams, plain task list for
assignments, code editor with hidden test pane for challenges.

### 1.2 Fragmented routes

```
apps/web/app/(platform)/
├── dash/
│   ├── assignments/[assignmentuuid]/page.tsx         # Studio + ?subpage=submissions
│   ├── courses/[courseuuid]/
│   │   ├── curriculum/[activityid]/editor/           # EMPTY DIRECTORY (dead)
│   │   ├── gradebook/page.tsx                        # CourseGradebookCommandCenter
│   │   └── review/page.tsx                           # ?
├── (withmenu)/course/[courseuuid]/activity/[activityid]/
│   ├── page.tsx                                      # Student & teacher (exam/code/quiz)
│   └── editor/page.tsx                               # ?
└── editor/course/[courseid]/activity/[activityuuid]/edit/page.tsx  # Dynamic only

apps/web/app/_shared/dash/assignments/[assignmentuuid]/_components/
├── Modals/                                           # EMPTY
└── TaskEditor/Subs/TaskTypes/                        # EMPTY (legacy, replaced by features/)
```

Three observations:

1. The `curriculum/[activityid]/editor/` and `_shared/.../Modals/` and
   `_shared/.../TaskEditor/` directories are **empty leftovers** from a previous
   refactor.
2. Authoring lives in **three different URL spaces**: `/dash/assignments/...`
   (Assignment Studio), `/editor/course/...` (Tiptap dynamic), and
   `/course/.../activity/...` itself (exam manage tab, code challenge settings).
   A teacher cannot predict which URL to bookmark.
3. The Submission Review surface lives behind `?subpage=submissions` on the
   assignment URL, but **exam graders use a different surface entirely
   (`ExamResultsDashboard`) inside the activity manage tab.** The gradebook
   command center can only navigate into `GradingReviewWorkspace`, so
   exam-attempt review is unreachable from there.

### 1.3 Component bloat and duplication

Component LOC after recent rewrites:

```
ExamActivity/
  ExamActivity.tsx                 394
  ExamPreScreen.tsx                387
  ExamQuestionNavigation.tsx       320
  ExamResults.tsx                  500
  ExamResultsDashboard.tsx         757   ← parallels GradingReviewWorkspace
  ExamSettings.tsx                 682
  ExamSubmissionReview.tsx         212
  ExamTakingInterface.tsx          832
  QuestionEditor.tsx               453
  QuestionManagement.tsx           398
  WhitelistManagement.tsx          218
  ─────────────────────────────────────
  total                          5346
features/assignments/
  studio/AssignmentStudioShell.tsx 868   ← top-bar, outline, editor, inspector
  studio/task-editors/             ~774
  student/StudentAssignmentShell   232
  student/attempts/*               286
  ─────────────────────────────────────
  total                          ~2993
features/grading/
  review/GradingReviewWorkspace    748
  gradebook/CourseGradebookCC      471
  domain/                          343
  ─────────────────────────────────────
  total                           1671
components/features/courses/code-challenges/
  CodeChallengeForm.tsx            875
  CodeChallengeConfigEditor.tsx    709
  CodeChallengeEditor.tsx          472
  ─────────────────────────────────────
  total                           2890
app/_shared/withmenu/.../activity/[activityid]/
  activity.tsx                    1108   ← single switch on activity_type
```

Specific problems:

- **`AssignmentStudioShell.tsx` (868 lines) holds 4 screen-level components**
  (`AssignmentStudioRoute`, `AssignmentStudioShell`, `AssignmentStudioTopBar`,
  `TaskOutlineRail`, `UnifiedTaskEditor`, `AssignmentPolicyInspector`,
  `ScoreSummary`, `SaveStateBadge`) plus three serializers in one file.
- **Two parallel viewers for exam results**: `ExamResults.tsx` (student-facing,
  500 lines) and `ExamResultsDashboard.tsx` (teacher-facing, 757 lines). Neither
  reuses `GradingReviewWorkspace`. The teacher dashboard re-implements
  filtering, search, status badges, and per-submission detail.
- **`activity.tsx` (1108 lines)** is a god component. It mounts a
  per-activity-type renderer via `dynamic()`, re-implements the focus-mode
  global state with `localStorage` events, owns `useTrailCurrent` progress
  computation, and contains an `AlertDialog` to submit assignments — concerns
  that should live in the assignment surface itself.
- **`useExamMutation`** is a 263-line reimplementation of TanStack Query's
  `useMutation` (retry, backoff, abort, isLoading) that was added before
  TanStack was adopted across the codebase. TanStack is now the standard, but
  this hook still services every exam operation.
- **`AssignmentContext`** exists to fetch four parallel queries (assignment +
  tasks + course + activity) and gate render until all four resolve. There is
  no equivalent context for exams or code challenges; they each handle the
  same "hydrate parents" problem in their own way.

### 1.4 Vocabulary fragmentation

The `docs/assignment-grading-product-model.md` defines a clear vocabulary —
**Assignment Lifecycle**, **Submission Status**, **Activity Progress**,
**Release State** — but only the assignment+grading subsystem follows it. The
rest of the system uses overlapping terms:

- A multiple-choice **Question** is `Question` in exam DB, embedded as
  `AssignmentQuizQuestionConfig` JSON in assignment task content, and a third
  shape inside a quiz block. **Three representations, three editors, three
  graders.**
- **Anti-cheat settings** are duplicated in `ExamSettings`
  (`copy_paste_protection`, `tab_switch_detection`, `devtools_detection`,
  `right_click_disable`, `fullscreen_enforcement`, `violation_threshold`) and
  in `AssignmentQuizTaskSettings` (`prevent_copy`, `track_violations`,
  `max_violations`, `block_on_violations`). Different field names, different
  semantics, no shared enforcement.
- **A "task"** in the assignment domain ≈ **a "question"** in the exam domain
  ≈ **a "test case"** in the code challenge domain ≈ **an "item"** in the
  grading domain (`GradedItem`). The same conceptual unit has four labels.
- **"Attempt"** means an exam attempt row (DB-backed) but for assignments it
  means "the latest draft submission, possibly returned for revision," and for
  code challenges it means "one Judge0 submission of many."

### 1.5 Backend boundaries that hurt the UI

- `Submission` is the unified table, but **`ExamAttempt` and `CodeSubmission`
  shadow it.** The grading service writes `Submission` rows for code
  challenges (`code_challenges.py:375`) but exams keep their own `ExamAttempt`.
  The gradebook only queries `Submission`, so exam progress in the gradebook
  comes from a separate join path — this is why teachers cannot review an exam
  attempt from the gradebook.
- The assignment lifecycle (`DRAFT/SCHEDULED/PUBLISHED/ARCHIVED`) only exists
  for assignments. Exams have a single boolean `published`. Code challenges
  have no lifecycle at all — a teacher edits configuration in place and
  students see whatever is current. Scheduled release and archive are
  assignment-only concepts that belong on every assessment.
- `start/v2` and `start` legacy endpoints both exist (`grading/submit.py:38,
  61`); the legacy is still wired into `useExamPersistence`. New code uses v2.
- The assignment task `sub_file` and `ref_file` upload endpoints are duplicates
  of what an `Activity Block` should own — every other activity uses the block
  attachment service.

### 1.6 UX inconsistencies that surface in screenshots

- **Two breadcrumb systems** (`BreadCrumbs` and `ActivityBreadcrumbs`). They
  produce different chains for the same place.
- **Two save-state indicators**. `EditorSaveIndicator` for the dynamic editor;
  ad-hoc `SaveStateBadge` inside `AssignmentStudioShell`. Different icons,
  different copy.
- **Two "Submit" button conventions**. `SubmitAssignmentDialog` in the activity
  god component triggers a confirm modal, but the assignment student shell has
  its own `SubmissionFooter` with a non-confirming submit. Exams submit with no
  modal at all but show a custom finish screen. Code challenges submit per-run
  with an inline status pill.
- **Three ways to start an attempt**. Assignment: silent — drafting just works.
  Exam: button → server attempt creation → redirect to taking interface. Code
  challenge: open the editor and click "Run" or "Submit." None share copy or
  affordance.
- **Status badges are not a shared component**. `SubmissionStatusBadge` exists
  in two places (`components/Grading/SubmissionStatusBadge.tsx` and
  `components/features/courses/code-challenges/SubmissionStatusBadge.tsx`) with
  different colour scales.
- **Score normalization is inconsistent**. Exam scores are integer points,
  assignments use percentage normalization (`pointsToPercent`), code challenges
  use a `grading_strategy` enum (`ALL_OR_NOTHING`, `PARTIAL_CREDIT`, …). The
  gradebook has to fold them all into a 0–100 number, with no UI hint when the
  underlying scale differs.

---

## 2. Design principles for the rewrite

1. **One vocabulary across all assessment types.** Adopt the
   `assignment-grading-product-model.md` terms (Lifecycle, Submission Status,
   Activity Progress, Release State) and apply them to every assessable
   activity. Drop `published: bool` for exams, drop "ALL_OR_NOTHING" as a
   user-visible label, drop `IN_PROGRESS/SUBMITTED/AUTO_SUBMITTED`.
2. **Three product surfaces, no exceptions.** Studio (author), Submission
   Review (grade), Student Attempt (do). Exams, assignments, code challenges,
   and quizzes all map to the same three surfaces. Anti-cheat policies, score
   summary, and release controls live on the same panels for each type.
3. **One route shape.**
   `/dash/courses/[course]/activity/[activity]/[surface]` where
   `[surface]` ∈ `studio | review | analytics`. Student attempts stay at
   `/course/[course]/activity/[activity]`. No more
   `/dash/assignments/[uuid]` distinction; assignments become a sub-shape of
   activities.
4. **One state container.** Replace `AssignmentContext`, the exam reducer,
   the activity god component branches, and `useExamMutation` with a single
   `useAssessment(activityUuid)` hook returning a typed view model per
   surface. TanStack Query owns transport; reducers vanish.
5. **Composition over branching.** The activity-type switch in `activity.tsx`
   becomes a registry — like `task-editors/registry.ts` — that maps
   `activity_type` to `{ Author, Attempt, Review, Analytics }` modules. Adding
   a new type means registering one module, not editing the god component.
6. **Backend submissions converge on `Submission`.** `ExamAttempt` becomes a
   read-only projection over `Submission` for analytics; new attempts write
   `Submission` rows. `CodeSubmission` becomes a Judge0 detail child of a
   `Submission`. The gradebook can navigate into any submission, regardless of
   type, with the same `GradingReviewWorkspace` shell.
7. **Empty leftover folders are deleted in the same PR that lands the rewrite.**
   No "we'll clean up later." The directories listed in §1.2 must not survive.

---

## 3. Target architecture

### 3.1 Domain layer (new)

```
apps/web/features/assessments/
├── domain/
│   ├── lifecycle.ts          # AssessmentLifecycle (replaces 4 status enums)
│   ├── submission-status.ts  # SubmissionStatus + transition table
│   ├── release.ts            # ReleaseState mapping
│   ├── progress.ts           # ActivityProgress states
│   ├── score.ts              # canonical score normalization (0–100)
│   ├── policy.ts             # PolicyView: due, attempts, anti-cheat, late
│   └── view-models.ts        # surface-specific VMs (studio, review, attempt)
├── registry/
│   ├── index.ts              # AssessmentKindRegistry
│   ├── assignment.tsx        # registers Author, Attempt, Review, Analytics
│   ├── exam.tsx
│   ├── code-challenge.tsx
│   └── quiz.tsx              # (block-embedded, lighter shell)
└── shared/
    ├── components/           # SubmissionStatusBadge, SaveStateBadge,
    │                         #   AntiCheatPanel, AttemptHistoryList,
    │                         #   ScoreSummary, PolicyInspector
    └── hooks/
        ├── useAssessment.ts          # one hook, per-surface VM
        ├── useAssessmentDraft.ts
        └── useAssessmentSubmission.ts
```

The `assignments`, `exams`, `code-challenges`, `grading` directories remain
**only as service/transport layers** (`queries/`, `mutations/`); they no
longer own UI.

### 3.2 Three product surfaces, four content kinds

```
                          ┌────────────────────────┐
                          │   AssessmentRegistry    │
                          └────────────┬───────────┘
                                       │
            ┌─────────────────────────┼─────────────────────────┐
            │                          │                          │
     ┌──────▼──────┐           ┌──────▼──────┐           ┌──────▼──────┐
     │  Author     │           │  Attempt    │           │   Review    │
     │  (Studio)   │           │  (Student)  │           │   (Grader)  │
     └──────┬──────┘           └──────┬──────┘           └──────┬──────┘
            │                          │                          │
   ┌────────┼────────┐         ┌──────┼─────┐                ┌───┴───┐
   │        │        │         │      │     │                │       │
 Asgmt   Exam   CodeCh.       Asgmt  Exam  CodeCh.        per-Submission
 Author  Author Author       Attempt Attempt Attempt       (kind-aware
                                                            detail panel)
```

Author/Attempt/Review are **shells** — they own the topbar, breadcrumbs, save
state, anti-cheat indicator, score summary, lifecycle controls. Each kind only
contributes a content panel:

- Assignment: TaskOutlineRail + UnifiedTaskEditor + ScoreSummary
- Exam: QuestionList + QuestionEditor + AntiCheatPolicy
- Code Challenge: TestCaseList + StarterCode + LanguagePolicy
- Quiz block: lightweight QuestionEditor reused from exam kind

### 3.3 Route plan

```
/dash/courses/[course]/                 # Course shell
├── curriculum/                         # existing structure editor
├── activity/[activity]/
│   ├── studio                          # Author surface (kind-aware)
│   ├── review                          # Submission Review surface
│   └── analytics                       # per-activity analytics
└── gradebook                           # cross-activity command center

/course/[course]/activity/[activity]    # Student Attempt surface (kind-aware)
```

Routes to delete:

- `apps/web/app/(platform)/dash/assignments/`              (replaced by `dash/courses/.../activity/.../studio`)
- `apps/web/app/(platform)/dash/courses/[c]/curriculum/[a]/editor/` (empty)
- `apps/web/app/(platform)/(withmenu)/course/[c]/activity/[a]/editor/` (replaced)
- `apps/web/app/_shared/dash/assignments/[a]/_components/`  (empty leftovers)
- `apps/web/app/_shared/dash/assignments/[a]/subpages/`     (folded into review surface)

`/editor/course/[c]/activity/[a]/edit` stays for **Tiptap dynamic content
authoring only**, since dynamic activities are not assessments. It moves under
`/dash/courses/[c]/activity/[a]/studio` when the activity is `TYPE_DYNAMIC` so
even the dynamic editor lives at one URL shape.

### 3.4 Status & vocabulary unification

Single source of truth, applied everywhere:

```ts
// features/assessments/domain/lifecycle.ts
export type AssessmentLifecycle = 'DRAFT' | 'SCHEDULED' | 'PUBLISHED' | 'ARCHIVED';

// Replaces:
//   exams.published: bool
//   code_challenge.* (no lifecycle today)
//   assignment.status (already this shape)

// features/assessments/domain/submission-status.ts
export type SubmissionStatus = 'DRAFT' | 'PENDING' | 'GRADED' | 'PUBLISHED' | 'RETURNED';

// Replaces:
//   ExamAttempt.status: IN_PROGRESS/SUBMITTED/AUTO_SUBMITTED  → DRAFT/PENDING
//   CodeSubmission.status: PENDING/PROCESSING/COMPLETED/FAILED → DRAFT/PENDING/GRADED
//   AssignmentSubmission already this shape
```

`AUTO_SUBMITTED` becomes a flag on the submission (`submitted_by: 'student' |
'auto_violation' | 'auto_deadline'`), not a status. `Judge0Status` becomes an
internal detail on the code-challenge submission projection, never a UI status.

### 3.5 Backend cleanup matched to UI cleanup

- `ExamAttempt` is repurposed as a **read-only view** over `Submission` joined
  with exam-specific JSON. New attempts write a `Submission` row directly
  (assessment_type=`EXAM`). Migration: backfill `Submission` from
  `ExamAttempt` once; thereafter the legacy table becomes a denormalized cache
  refreshed by trigger or background job. (The migration is out of scope for
  this UI plan, but the UI work *requires* the projection to exist.)
- Anti-cheat settings move to a shared `AssessmentPolicy.anti_cheat_json`
  block. `ExamSettings` and `AssignmentQuizTaskSettings` both read from this
  block. The UI panel (`AntiCheatPanel`) is rendered for any assessment whose
  policy enables it.
- `start/v1` legacy endpoint is deleted along with `useExamPersistence`'s
  fallback code path.
- Assignment `sub_file` / `ref_file` upload routes are replaced by the generic
  block-attachment service. The student's file submission becomes a normal
  attachment on the `Submission`.

---

## 4. Concrete component map: what stays, what dies, what is created

| Today | Action | Replacement |
|---|---|---|
| `features/assignments/studio/AssignmentStudioShell.tsx` (868 LOC) | Split | `features/assessments/registry/assignment.tsx` (Author module ≤200 LOC) + shared shell |
| `features/assignments/student/StudentAssignmentShell.tsx` | Refactor | Becomes the assignment-kind contribution to the shared `Attempt` shell |
| `components/Activities/ExamActivity/ExamActivity.tsx` (394) | Delete | Phase reducer dies; surface routing handles it |
| `components/Activities/ExamActivity/ExamPreScreen.tsx` | Merge | Becomes the exam-kind `Attempt.PreStart` slot (≤100 LOC) |
| `components/Activities/ExamActivity/ExamResults.tsx` (500) | Delete | Replaced by shared `Review` surface using `GradingReviewWorkspace` for the teacher view and `Attempt.ResultPanel` for the student view |
| `components/Activities/ExamActivity/ExamResultsDashboard.tsx` (757) | Delete | Replaced by `GradingReviewWorkspace` with kind-aware queue filters |
| `components/Activities/ExamActivity/ExamSettings.tsx` (682) | Split | Anti-cheat → shared `AntiCheatPanel`; access mode → `AccessPanel`; question flow → `ExamPolicyPanel` (≤200 LOC) |
| `components/Activities/ExamActivity/QuestionEditor.tsx` (453) + `QuestionManagement.tsx` (398) | Refactor | One shared `QuestionListEditor` reused by exam kind and by quiz blocks |
| `components/Activities/ExamActivity/ExamTakingInterface.tsx` (832) | Refactor | Stays large but loses anti-cheat, timer, navigation orchestration to shared hooks |
| `components/features/courses/code-challenges/CodeChallengeForm.tsx` (875) | Split | Becomes `code-challenge.tsx` registry contribution; form fields belong to shared `PolicyInspector` |
| `components/features/courses/code-challenges/CodeChallengeConfigEditor.tsx` (709) | Split | TestCase list → shared `TestCaseListEditor`; language selection → `LanguagePolicy` slot |
| `components/Grading/SubmissionStatusBadge.tsx` & `components/features/courses/code-challenges/SubmissionStatusBadge.tsx` | Merge | One badge under `features/assessments/shared/components/SubmissionStatusBadge.tsx` |
| `components/Pages/Activity/ActivityBreadcrumbs.tsx` & `components/Dashboard/Misc/BreadCrumbs.tsx` | Merge | Single `Breadcrumbs` component driven by route segments |
| `components/Contexts/Assignments/AssignmentContext.tsx` | Delete | Replaced by `useAssessment(activityUuid, surface)` |
| `hooks/useExamMutation.ts` (263) | Delete | Use `useMutation` from TanStack |
| `hooks/useExamPersistence.ts` | Refactor | Drop `start/v1` fallback; use `useAssessmentDraft` |
| `app/_shared/withmenu/.../activity.tsx` (1108) | Split | Shell ≤200 LOC + per-kind Attempt module via registry |
| `app/_shared/dash/assignments/[a]/subpages/AssignmentSubmissionsSubPage.tsx` | Delete | Folded into `/dash/courses/[c]/activity/[a]/review` |
| `app/(platform)/dash/courses/[c]/curriculum/[a]/editor/` (empty) | Delete | — |
| `app/_shared/dash/assignments/[a]/_components/Modals/`, `_components/TaskEditor/Subs/TaskTypes/` (empty) | Delete | — |

Net effect (rough): **~5300 LOC of exam UI + ~3000 LOC of code-challenge UI +
~1100 LOC of activity god component + ~870 LOC of assignment studio shell**
get refactored down to **one shared shell (~600 LOC) + four registry contributions
(~200 LOC each)**. Roughly **−7000 net LOC**, with all four kinds gaining
features they don't have today (lifecycle scheduling for exams, returned-for-
revision for code challenges, anti-cheat for assignments, etc.).

---

## 5. Migration plan (sequenced)

### Phase 0 — preconditions

- [ ] Audit every route in `apps/web/app/` for empty directories, document the
      list, delete in one go (no behaviour change).
- [ ] Move `SubmissionStatusBadge` to a single canonical location and have all
      callers import from it.
- [ ] Add `assessment-grading-redesign.md` to `docs/` and link it from
      `docs/assignment-grading-product-model.md`.

### Phase 1 — domain layer

- [ ] Create `features/assessments/domain/` with `lifecycle.ts`,
      `submission-status.ts`, `release.ts`, `progress.ts`, `score.ts`,
      `policy.ts`, `view-models.ts`.
- [ ] Add `useAssessment(activityUuid)` hook + `AssessmentKindRegistry`.
- [ ] Implement registry contributions for each kind (Author/Attempt/Review
      slots return existing components for now — pure passthrough).
- [ ] Verify types compile end-to-end.

### Phase 2 — Submission Review unification

- [ ] Make `GradingReviewWorkspace` accept any `assessment_type`. Add
      kind-aware detail panel via registry.
- [ ] Project `ExamAttempt` into `Submission` (backend work). Frontend treats
      every exam attempt as a `Submission`.
- [ ] Wire the gradebook command center to navigate into review for any kind.
- [ ] Delete `ExamResultsDashboard.tsx` once gradebook + review cover its
      surface.

### Phase 3 — Author surface unification

- [ ] Move Assignment Studio to `/dash/courses/[c]/activity/[a]/studio` and
      delete the `/dash/assignments/[uuid]` route.
- [ ] Build the shared `Author` shell (topbar, breadcrumbs, save state,
      lifecycle controls, validation alert). Each kind plugs in its content
      panel via the registry.
- [ ] Migrate exam authoring (`QuestionEditor`, `QuestionManagement`,
      `ExamSettings`) into the exam-kind contribution.
- [ ] Migrate code-challenge authoring (`CodeChallengeForm`,
      `CodeChallengeConfigEditor`) into the code-challenge contribution.
- [ ] Add lifecycle (DRAFT/SCHEDULED/PUBLISHED/ARCHIVED) to exam and
      code-challenge backends.

### Phase 4 — Student Attempt surface unification

- [ ] Build the shared `Attempt` shell (header, banner, anti-cheat indicator,
      timer slot, footer with save/submit, returned-for-revision flow).
- [ ] Migrate `StudentAssignmentShell` and `ExamTakingInterface` into kind
      contributions.
- [ ] Decompose `app/_shared/withmenu/.../activity.tsx`. The activity-page god
      component becomes a thin shell that delegates to `Attempt` for assessable
      kinds and to existing renderers (Video, PDF, Dynamic) for content kinds.
- [ ] Remove `useExamMutation`; replace with `useMutation`.
- [ ] Remove `AssignmentContext`; replace with `useAssessment`.

### Phase 5 — anti-cheat consolidation

- [ ] Move anti-cheat fields to `AssessmentPolicy.anti_cheat_json`.
- [ ] Render via shared `AntiCheatPanel` in Author and shared
      `AntiCheatGuard` in Attempt.
- [ ] Drop duplicated `AssignmentQuizTaskSettings.prevent_copy` etc.

### Phase 6 — vocabulary cleanup

- [ ] Rename `assignment_type` enum on tasks to `task_kind`. Rename
      `AssessmentType` cleanly. Public API endpoints stay
      backwards-compatible until a major version bump.
- [ ] Translation keys are unified: one
      `Features.Assessments.{Studio,Attempt,Review}.*` key tree replaces
      `Activities.ExamActivity.*`, `DashPage.Assignments.*`, etc.

### Phase 7 — empty-folder cleanup and dead code removal

- [ ] Delete every directory and file marked DELETE in §4.
- [ ] Verify no imports remain via `knip` and TS strict.

---

## 6. Acceptance criteria

A teacher creating a course does **all** authoring at
`/dash/courses/[c]/activity/[a]/studio` regardless of activity kind. The page
chrome is identical; only the centre panel changes.

A teacher grading work uses the **same** Submission Review surface for
assignments, exams, and code challenges. Filtering by "needs grading" returns
work of every kind.

A student taking work sees the **same** header, save indicator, anti-cheat
banner, and submit affordance for every assessable activity. Returned-for-
revision works the same way for an essay assignment, a written exam answer
that needs human review, or a code-challenge submission flagged by the
teacher.

The codebase ships with **no empty directories under `app/`**, **no parallel
status enums**, **no `useExamMutation`**, **no two-implementations of
`SubmissionStatusBadge`**, and **no `AssignmentContext`**.

The presentation deck claim — "weekly cycle of assessment passes through one
platform without copying between tools" — is reflected by the UI: one
vocabulary, one route shape, one set of components.

---

## 7. Risks & open questions

- **Backend migration timing.** Several frontend simplifications depend on
  `ExamAttempt → Submission` projection and `AssessmentPolicy.anti_cheat_json`.
  These are non-trivial schema changes; the UI plan should be sequenced behind
  a feature flag so we can land Phase 1–2 (read-only unification) before the
  schema work, then Phase 3+ as the backend lands.
- **Exam taking interface complexity.** `ExamTakingInterface.tsx` (832 LOC)
  is the most behaviourally complex surface in the platform (timer, violation
  tracking, autosubmit, navigation). Refactoring it into a registry
  contribution while preserving its tests is the highest-risk step.
- **Translation key churn.** Any UI consolidation will rename hundreds of i18n
  keys. We need a key-migration script and a one-release deprecation window
  per locale (`kk`, `ru`, `en`).
- **Dynamic editor not yet covered.** The plan unifies *assessable* activity
  surfaces; `TYPE_DYNAMIC` Tiptap content stays at `/editor/...`. A future
  pass should bring it into the same studio shell, but it is out of scope
  here.
- **Code challenge "execution" UI.** The Judge0 run/test/submit ladder does
  not map cleanly onto `DRAFT/PENDING/GRADED`. We need a discussion on whether
  every Judge0 run produces a `Submission` row (cheap, parallels exam
  attempts) or whether only the final submit does (status compatible but
  loses run history). The Submission-as-event model is the recommendation.

---

## 8. Definition of done

- All four assessable kinds are reachable via the same three URL surfaces.
- A new assessment kind can be added by registering one module against
  `AssessmentKindRegistry` — no edits to the shared shells, the gradebook, or
  the activity page.
- Documentation: `docs/assignment-grading-product-model.md` extended to cover
  every kind. The current model doc's "Active Routes" section is rewritten to
  match §3.3.
- Tests: existing assignment and exam test suites pass against the new
  shells; new tests cover the registry contract and lifecycle parity across
  kinds.
- No empty directories, no `useExamMutation`, no parallel status enums in the
  shipped artefact.
