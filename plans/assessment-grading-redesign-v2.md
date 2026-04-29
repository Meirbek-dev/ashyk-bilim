# Assessment & Grading — Redesign Plan v2

A critical re-read of the current Studio / Attempt / Review surfaces, and a
concrete plan to finish a coherent redesign. The previous plan
(`plans/assessment-grading-redesign.md`) shipped Phase 1 (domain + registry)
and a partial Phase 3 (one Studio route), then stalled. This plan picks up
the actual state on disk, names what's broken, and proposes a focused
finish.

> Scope: frontend product surfaces. Backend changes are listed only when
> the field shape leaks into the UI and cannot be hidden behind a view
> model. Focus is **alignment, coherence, simplification** — not new
> features.

---

## 1. Where we actually are (April 2026 audit)

### 1.1 The "half-migrated" problem

The previous redesign shipped these pieces:

```
apps/web/features/assessments/
├── domain/        ✅ lifecycle, submission-status, release, progress,
│                     score, policy, view-models
├── registry/      ⚠️  Authors wired (3/4); Attempts are NULL stubs (3/4);
│                     Reviews share GradingReviewWorkspace (4/4)
├── shared/        ⚠️  Only SubmissionStatusBadge lives here; AntiCheatPanel,
│                     PolicyInspector, ScoreSummary, AttemptHistoryList
│                     do not exist yet
├── hooks/         ⚠️  useAssessment exists but only returns shells filled
│                     with placeholder values — `dueAt: null`, `score:
│                     {percent: null, source: 'none'}`, `description: null`.
│                     No kind ever populates the VM properly.
└── studio/AssessmentStudioWorkspace.tsx  ✅ Topbar + lifecycle pills + Author slot
```

The registry exists, the route shape exists, the domain types exist —
**but every kind still lives in its old code.** When you click "Open
Studio" for an exam, you arrive at the new shell, which renders an
`ExamAuthor` slot that turns out to be a two-tab `<Tabs>` panel mounting
the original 682-line `ExamSettings` and 398-line `QuestionManagement`
components verbatim. The chrome changed; the content did not.

### 1.2 Three concrete inconsistencies a real teacher hits today

**A. The author flow forks at the activity type, even though the URL doesn't.**

| Activity type | What `/dash/courses/[c]/activity/[a]/studio` actually shows |
|---|---|
| `TYPE_ASSIGNMENT` | Embeds the entire 908-line `AssignmentStudioShell`, which renders **its own topbar**, **its own breadcrumbs**, **its own publish/archive buttons** — duplicating the shared studio chrome. The page now has two breadcrumbs and two publish buttons. |
| `TYPE_EXAM` | Renders a tabs widget with "Questions" / "Settings" — flat, no outline rail, no save indicator, no reference to the shared chrome. |
| `TYPE_CODE_CHALLENGE` | A single 709-line monolith form (`CodeChallengeConfigEditor`) with no tabs, no outline, no inspector. Total fields visible at once: ~28. |
| `TYPE_QUIZ` | Not addressable at this URL (only valid as a block inside a Tiptap dynamic activity). |

**B. The student flow still goes through the 1108-line god component.**

`apps/web/app/_shared/withmenu/course/[courseuuid]/activity/[activityid]/activity.tsx`
is **unchanged**. It still:
- mounts a per-type renderer via `dynamic()` for Video / PDF / Assignment / Exam / CodeChallenge / AI / Canva
- owns the focus-mode `localStorage` event bus
- owns `useTrailCurrent` progress derivation
- contains its own `SubmitAssignmentDialog` confirmation modal
- renders its own `ActivityBreadcrumbs` (different from `BreadCrumbs` used by `/dash`)

The registry has `Attempt` slots, but they all return `null`. So the
`Attempt` surface unification has not started.

**C. The teacher reviewing an exam attempt is still routed through the legacy phase machine.**

`ExamActivity.tsx` (385 LOC, kept) still uses the `examFlowReducer`,
still has a `manage` phase, still gates on `contributorStatus === 'ACTIVE'`,
and the manage view shows two tabs: "Studio" (a stub linking out to the
new route) and "Results" (rendering `GradingReviewWorkspace` inline).
The "Studio" tab is dead weight — it just tells the teacher to leave.
The presence of a Studio tab inside the student-route component proves
the surface separation has not landed.

### 1.3 Vocabulary still fragmented

```
SubmissionStatus     — DRAFT, PENDING, GRADED, PUBLISHED, RETURNED   ← canonical (assessments domain)
ExamAttempt.status   — IN_PROGRESS, SUBMITTED, AUTO_SUBMITTED        ← still alive
CodeSubmission       — pending, processing, completed, failed, error ← lowercase, still alive
JUDGE0_LANGUAGES     — exists in code-challenges/, no domain mapping
AssignmentStatus     — DRAFT, SCHEDULED, PUBLISHED, ARCHIVED         ← matches lifecycle ✅
exam.published       — boolean                                       ← still alive
code_challenge       — no lifecycle field at all                     ← still alive
```

The `SubmissionStatusBadge` consolidation under
`features/assessments/shared/components/` succeeded, but
`CodeRunStatusBadge` (7.1 KB) is still its own thing using lowercase
strings and never speaks the domain enum.

### 1.4 Visual / UX inconsistencies (still present)

These are observed in code, not screenshots, but they will surface
identically in the UI:

1. **Two breadcrumb conventions.** `BreadCrumbs` (icon + label, dash-side)
   vs `ActivityBreadcrumbs` (Courses › Course name › Activity name,
   student-side). The new `AssessmentStudioWorkspace` invents a third
   one inline (`Curriculum / Exam / Studio` as plain spans).
2. **Three "submit" affordances.**
   - Assignment: borderless dialog button mounted in `ActivityActions` toolbar.
   - Exam: full-screen confirmation modal inside `ExamTakingInterface` with custom
     copy.
   - Code Challenge: inline pill with "Run" / "Submit" buttons inside
     `CodeChallengeEditor` — no confirmation.
3. **Three ways to enter an attempt.**
   - Assignment: silent — opening the activity is the attempt.
   - Exam: pre-screen card grid (`ExamPreScreen`) then Start.
   - Code Challenge: the editor is the activity. No pre-screen.
4. **Two save-state UIs.**
   - `EditorSaveIndicator` (Tiptap dynamic).
   - `SaveStateBadge` inline inside `AssignmentStudioShell` — different copy,
     different icons, different ms for "saving" → "saved" transitions.
5. **Score normalization is opaque to the user.**
   Exam scores are integer points, assignments use `pointsToPercent`
   (already in domain), code challenges use `grading_strategy` enum
   (`all_or_nothing`, `partial`, `weighted`) — the gradebook flattens
   them all to 0–100% with no hint that the underlying scale differs.
   `features/assessments/domain/score.ts` exists but no UI consumes
   `NormalizedScore.source` to disambiguate.
6. **Anti-cheat is configured twice and enforced twice.** Exam settings has
   `copy_paste_protection`, `tab_switch_detection`, `devtools_detection`,
   `right_click_disable`, `fullscreen_enforcement`, `violation_threshold`.
   Assignment quiz task settings has the same concepts under different
   names (`prevent_copy`, `track_violations`, `max_violations`,
   `block_on_violations`). `domain/policy.ts` provides a unified shape
   but **no UI panel reads from it** — both the exam and assignment
   settings panels still write the legacy fields directly.
7. **Empty/legacy folders survived.**
   - `apps/web/app/(platform)/dash/assignments/` — index page that lists
     courses + per-course assignment lists — duplicates the
     curriculum view; the redesign claims to delete this route, it is
     still live.
   - `app/_shared/dash/assignments/[a]/_components/Modals/` — empty.
   - `app/_shared/dash/assignments/[a]/_components/TaskEditor/Subs/TaskTypes/` — empty.
   - `app/(platform)/dash/courses/[c]/curriculum/[a]/editor/` — empty.

### 1.5 The "extra surface area" inventory

LOC of files that exist primarily because of the old per-kind paradigm
(measured 2026-04-29):

```
features/assignments/studio/AssignmentStudioShell.tsx          908   (god component, 4 screens in 1 file)
features/grading/review/GradingReviewWorkspace.tsx             809   (acceptable; one shared review surface)
components/Activities/ExamActivity/ExamTakingInterface.tsx     832
components/Activities/ExamActivity/ExamSettings.tsx            682
components/Activities/ExamActivity/ExamResults.tsx             ~500   (student exam result view)
components/Activities/ExamActivity/ExamPreScreen.tsx           ~387
components/Activities/ExamActivity/ExamQuestionNavigation.tsx  ~320
components/Activities/ExamActivity/QuestionEditor.tsx          453
components/Activities/ExamActivity/QuestionManagement.tsx      398
components/Activities/ExamActivity/ExamActivity.tsx            385   (reducer-driven phase machine)
components/Activities/ExamActivity/WhitelistManagement.tsx     218
components/Activities/ExamActivity/ExamSubmissionReview.tsx    212
components/features/courses/code-challenges/CodeChallengeForm.tsx          875
components/features/courses/code-challenges/CodeChallengeConfigEditor.tsx  709
components/features/courses/code-challenges/CodeChallengeEditor.tsx        472
components/features/courses/code-challenges/TestCaseCard.tsx               ~280
features/grading/gradebook/CourseGradebookCommandCenter.tsx    543
app/_shared/withmenu/course/[c]/activity/[a]/activity.tsx     1105   (god component)
─────────────────────────────────────────────────────────────────
Subtotal of the "redesign target" surface                    ≈10100
```

The Phase 1 domain layer is ~700 LOC. Even if everything in the table
above is replaced by a shared `~600 LOC` shell + four `~200 LOC` kind
contributions, the codebase nets **−7 to −8 KLOC** with a coherent UI.

---

## 2. Design principles for finishing the redesign

These supersede or sharpen the principles in v1:

1. **One shell, one slot, per surface.** Each of the three surfaces
   (Studio / Attempt / Review) has exactly one shell that owns chrome.
   Each kind contributes one slot: a `Content` component + a
   `toViewModel(data)` adapter that fills the surface VM. Kinds may not
   render their own topbar, breadcrumbs, save state, lifecycle controls,
   submit affordance, or anti-cheat banner.

2. **The shell owns transitions, the slot owns content.** Lifecycle
   buttons (Draft / Schedule / Publish / Archive), submit buttons,
   anti-cheat enforcement, and save-state are shell concerns. Question
   ordering, test-case authoring, file submission UI, and code
   execution are slot concerns. The contract between them is the VM,
   not React props.

3. **Vocabulary is enforced by types, not by prose.** The lifecycle,
   submission status, release state, and score normalization types in
   `features/assessments/domain` are the only types any UI touches.
   Backends that don't speak them are wrapped at the query layer; if
   the wrapping is awkward, the backend changes — not the UI.

4. **One route shape; no escape hatches.**
   ```
   /dash/courses/[course]/activity/[activity]/studio    — author
   /dash/courses/[course]/activity/[activity]/review    — grade
   /course/[course]/activity/[activity]                 — attempt
   /dash/courses/[course]/gradebook                     — cross-activity
   ```
   `/dash/assignments/...`, `/editor/course/.../edit`, the per-kind
   `?subpage=submissions`, the manage tab inside `ExamActivity`, the
   `?phase=manage` URL, and the `code-challenges/{a}/settings` PUT page
   are all deleted. The redirects in the previous plan are kept.

5. **The student attempt page has one component, with no kind branch
   in its file.** The 1108-line `activity.tsx` is replaced by a thin
   shell that:
   - Renders the page chrome (header, breadcrumbs, ActivityIndicators,
     focus mode toggle, navigation buttons).
   - Reads `useAssessment(activityUuid, { surface: 'ATTEMPT' })`.
   - For assessable kinds, renders `<AttemptShell vm={vm} />` which in
     turn looks up `kindModule.Attempt` and mounts it.
   - For content kinds (Video, PDF, Dynamic, AI, Canva), renders the
     existing per-type component directly. These are not assessments
     and never were; treating them as a separate concern simplifies the
     shell.

6. **Composition over configuration in slot internals.** Each kind's
   slot is itself decomposed: e.g. an exam's Studio slot is
   `QuestionList` + `QuestionEditor` + `AntiCheatPanel` (shared) +
   `AccessPanel`. No 600-line `*Settings` files; if a panel exceeds
   ~200 LOC it splits.

7. **Empty folders die in the same commit that lands the rewrite.** As a
   non-negotiable acceptance criterion. Same as v1.

---

## 3. Target information architecture (frontend)

### 3.1 The three product surfaces, drawn

```
┌─────────────────────────────────────────────────────────────────────────┐
│  STUDIO   /dash/courses/[c]/activity/[a]/studio                         │
│ ─────────────────────────────────────────────────────────────────────── │
│  ┌── chrome (StudioShell) ───────────────────────────────────────────┐  │
│  │ Curriculum › Activity name      [Lifecycle pill] [Saved 2s ago]   │  │
│  │                                  [Preview] [Schedule] [Publish]   │  │
│  │ [validation alert]                                                │  │
│  ├──────────────────────────────────────────────────────────────────┤  │
│  │ ┌── outline rail ─────┐  ┌── content slot ────┐  ┌── inspector ─┐│  │
│  │ │ Task / Question /   │  │ kindModule.Studio  │  │ Policy:      ││  │
│  │ │ TestCase list       │  │  .Content          │  │  Due, attempts││  │
│  │ │ + add button        │  │                    │  │  Late penalty ││  │
│  │ │ + per-item issues   │  │                    │  │  Anti-cheat   ││  │
│  │ │                     │  │                    │  │  Score scale  ││  │
│  │ └─────────────────────┘  └────────────────────┘  └──────────────┘│  │
│  └──────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│  ATTEMPT  /course/[c]/activity/[a]                                      │
│ ─────────────────────────────────────────────────────────────────────── │
│  ┌── chrome (AttemptShell) ──────────────────────────────────────────┐  │
│  │ Course › Activity name              [timer] [autosave indicator]  │  │
│  │ [returned-for-revision banner if applicable]                      │  │
│  │ [anti-cheat banner if applicable]                                 │  │
│  ├──────────────────────────────────────────────────────────────────┤  │
│  │ ┌── nav rail (optional) ──┐  ┌── content slot ──────────────────┐│  │
│  │ │ Question 1/N            │  │ kindModule.Attempt.Content       ││  │
│  │ │ Flag / Status / Time    │  │                                  ││  │
│  │ └─────────────────────────┘  └──────────────────────────────────┘│  │
│  ├──────────────────────────────────────────────────────────────────┤  │
│  │ [Save draft] [Submit]                          [Prev / Next]      │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│  REVIEW   /dash/courses/[c]/activity/[a]/review                         │
│ ─────────────────────────────────────────────────────────────────────── │
│  ┌── chrome (already present in GradingReviewWorkspace) ────────────┐  │
│  │ Submission Review for Activity name                               │  │
│  │ N need grading · M total · [bulk action bar]                      │  │
│  ├──────────────────────────────────────────────────────────────────┤  │
│  │ ┌── queue rail ────────┐ ┌── center pane ───┐ ┌── grade pane ──┐ │  │
│  │ │ filter / sort        │ │ kindModule.Review│ │ score + rubric ││  │
│  │ │ list of submissions  │ │   .Detail        │ │ feedback +     ││  │
│  │ │ status badges        │ │                  │ │ publish/return ││  │
│  │ └──────────────────────┘ └──────────────────┘ └────────────────┘ │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

The Review surface chrome already exists and works. The Studio shell
exists but is too thin (no inspector, no outline rail) and is still
hosting two full god components in its slot. The Attempt shell does not
exist at all — `app/_shared/.../activity.tsx` plays the role.

### 3.2 What the four kinds contribute

```
┌──────────────────┬──────────────────────┬──────────────────────┬──────────────────────┐
│                  │ Studio.Content       │ Attempt.Content      │ Review.Detail        │
├──────────────────┼──────────────────────┼──────────────────────┼──────────────────────┤
│ Assignment       │ TaskOutlineRail      │ TaskList +           │ rubric-aware item    │
│                  │ + UnifiedTaskEditor  │   per-task answer UI │   feedback panel     │
│                  │                      │   (file/quiz/form)   │                      │
├──────────────────┼──────────────────────┼──────────────────────┼──────────────────────┤
│ Exam             │ QuestionListEditor   │ ExamQuestionView     │ per-question view    │
│                  │   (shared with quiz) │   + ExamTimer        │   (already exists,   │
│                  │                      │                      │    keep)             │
├──────────────────┼──────────────────────┼──────────────────────┼──────────────────────┤
│ Code Challenge   │ TestCaseListEditor   │ CodeEditor           │ test results +       │
│                  │ + StarterCodeTabs    │   + RunTestPanel     │   submitted code     │
│                  │ + LanguagePolicy     │   + SubmitButton     │   diff               │
├──────────────────┼──────────────────────┼──────────────────────┼──────────────────────┤
│ Quiz (block)     │ QuestionListEditor   │ inline in dynamic    │ same as exam         │
│                  │   (shared with exam) │   block (not a       │                      │
│                  │                      │   surface)           │                      │
└──────────────────┴──────────────────────┴──────────────────────┴──────────────────────┘
```

Three things share a component: `QuestionListEditor` (exam ↔ quiz),
`AntiCheatPanel` (exam ↔ assignment quiz), and the timer / violation
runtime that today lives inside `ExamTakingInterface` becomes the
shell-level `AttemptGuard`.

### 3.3 The shared inspector — one place for "everything else"

Today an exam author edits anti-cheat in `ExamSettings.tsx` (682 LOC of
checkboxes), an assignment author edits the same concepts in a
different panel inside `AssignmentStudioShell`, and a code-challenge
author edits language/time/memory limits in tab 3 of
`CodeChallengeForm.tsx`. These are all "policy" — non-content settings
that gate the attempt experience.

Proposal: a single right-rail `PolicyInspector` with collapsible
sections, populated from the shared `PolicyView` shape:

```
PolicyInspector
├── Schedule        (due, scheduled_at, lifecycle)
├── Attempts        (max_attempts, late penalty)
├── Anti-cheat      (AntiCheatPanel — checkboxes + threshold slider)
├── Scoring         (NormalizedScore source: percent / points / weighted)
└── Access          (whitelist, prerequisites, kind-specific extras)
```

Each kind opts in to which sections render by setting fields on
`PolicyView`. A code challenge has no `dueAt` today; the section
collapses. An assignment has no `whitelist`; that section collapses.
The user sees the same panel always; only enabled subsections expand.

### 3.4 The breadcrumb / navigation concept

Eliminate `BreadCrumbs` and `ActivityBreadcrumbs`. Add a single
`Breadcrumbs` driven by the route segments and a small route-meta
registry:

```ts
// lib/route-meta.ts
const META = {
  '/dash/courses/[c]':            ['Dashboard', 'Courses', () => course.name],
  '/dash/courses/[c]/curriculum': [..., 'Curriculum'],
  '/dash/courses/[c]/activity/[a]/studio': [..., () => activity.name, 'Studio'],
  '/dash/courses/[c]/activity/[a]/review': [..., () => activity.name, 'Review'],
  '/course/[c]/activity/[a]':     ['Courses', () => course.name, () => activity.name],
};
```

The Studio shell stops embedding its own breadcrumb spans; the chrome
breadcrumb above the topbar is enough.

---

## 4. The redesign plan, sequenced

### Phase A — close the half-migrated state (no behaviour change)

These are all UI-only and should ship in one commit each.

- [ ] **A1. Decompose `AssignmentStudioShell.tsx` into kind contributions.**
  Split the 908-line file into:
  ```
  features/assessments/registry/assignment/
    AssignmentStudio.tsx          — slot-shaped (≤180 LOC), reads VM
    AssignmentTaskOutline.tsx     — outline rail
    AssignmentTaskEditor.tsx      — per-task editor router
    AssignmentInspector.tsx       — policy inspector contribution
    toAssignmentVM.ts             — adapter
  ```
  Move task-editors registry into the same folder. Delete the
  embedded topbar inside the file — the StudioShell already has one.
  Net: −600 LOC.

- [ ] **A2. Make `AssessmentStudioWorkspace` host the outline rail and inspector.**
  Today the workspace is just a topbar + Author slot. Add two named
  slots (`Outline`, `Inspector`) so each kind contributes three
  panels. Update kind modules to expose them.

- [ ] **A3. Drop the manage tab inside `ExamActivity.tsx`.**
  The manage phase is dead — its only useful child was Results, which
  is now `GradingReviewWorkspace`. Replace the entire `manage` branch
  with a redirect to `/dash/.../activity/[a]/review`. Remove
  `examActions.enterManagementMode` and the `manage` phase from the
  reducer. Net: −80 LOC, clearer state machine.

- [ ] **A4. Add `/dash/courses/[c]/activity/[a]/review` route.**
  Single page that calls `getActivity` server-side and renders
  `GradingReviewWorkspace` with the resolved kind module pre-loaded.
  Wire the gradebook navigation to point at this URL for any kind,
  not the legacy `?subpage=submissions`. Net: +1 file, removes a
  conditional in `CourseGradebookCommandCenter`.

- [ ] **A5. Delete the legacy `/dash/assignments/` index route.**
  Replace with a redirect to `/dash/courses` (the curriculum view
  already lists assignment activities per course). Delete the
  underlying `app/_shared/dash/assignments/` files except
  `ClientParts.tsx` if it has reusable bits — move those to
  `app/_shared/dash/courses/`.

- [ ] **A6. Delete empty leftover directories.**
  ```
  app/(platform)/dash/courses/[c]/curriculum/[a]/editor/
  app/_shared/dash/assignments/[a]/_components/Modals/
  app/_shared/dash/assignments/[a]/_components/TaskEditor/Subs/TaskTypes/
  ```
  Verify with `knip` after delete.

- [ ] **A7. Unify breadcrumbs.**
  Delete `BreadCrumbs.tsx` and `ActivityBreadcrumbs.tsx`. Build one
  `Breadcrumbs` driven by route meta. Both `dash` and `withmenu`
  layouts render it.

### Phase B — Attempt surface unification (the big one)

- [ ] **B1. Build `AttemptShell`.** Owns header, save indicator,
  anti-cheat banner, returned-for-revision banner, submit footer,
  navigation buttons, focus mode. Reads `AttemptViewModel`. Located at
  `features/assessments/shared/AttemptShell.tsx`.

- [ ] **B2. Build `AttemptGuard` runtime.** Extract the timer,
  fullscreen enforcement, tab-switch detection, and copy/paste
  blockers from `ExamTakingInterface` into a shared hook
  `useAttemptGuard(policy)`. The shell mounts the guard whenever
  `policy.antiCheat` has any flag set, regardless of kind.

- [ ] **B3. Wire kind Attempts in the registry to real components.**
  - `assignment` → `<AssignmentAttemptContent />` (move
    `StudentAssignmentShell.tsx` body into a slot file; delete its
    own header/footer).
  - `exam` → `<ExamAttemptContent />` (split `ExamTakingInterface`:
    keep question rendering, autosave, navigation; the timer +
    fullscreen + recovery prompt move to the shell). Target ~350
    LOC.
  - `code-challenge` → `<CodeChallengeAttemptContent />` (keep
    `CodeChallengeEditor.tsx` body; drop its own status pill and
    submit button; the shell footer submits).

- [ ] **B4. Replace `app/_shared/.../activity.tsx`.**
  The new file is a thin router (~250 LOC max):
  - server-fetched `activity` + `course` (already happens at the
    page level)
  - if `activity.activity_type` is assessable, mount
    `<AttemptShell activityUuid={...} />`; else mount the existing
    content renderer (Video / PDF / Dynamic / AI / Canva).
  - `SubmitAssignmentDialog`, `MarkStatus`, `ActivityActions`,
    `useTrailCurrent` all move to a small `ActivityToolbar`
    component shared by both branches.
  - Delete `ExamActivity.tsx` (385 LOC) — its logic moves to the
    exam Attempt content + the shell's guard. The reducer dies with
    it.

- [ ] **B5. Delete `useExamMutation.ts`.** TanStack covers all of it;
  the only callers left after B4 are the question save, which uses
  `useMutation` natively.

### Phase C — vocabulary & policy unification

- [ ] **C1. Backend projection: `ExamAttempt → Submission`.** Out of
  scope for this UI plan but **required** for B3 to ship cleanly,
  since the shell's "returned for revision" flow assumes
  `SubmissionStatus`. Until the projection lands, exam submissions
  are read-only in Review (current behaviour). Block C2 on this.

- [ ] **C2. Shared anti-cheat schema.** Backend adds
  `AssessmentPolicy.anti_cheat_json`. Frontend deletes the duplicated
  fields in `ExamSettings`'s settings panel and the
  `AssignmentQuizTaskSettings` legacy fields; both read from the
  unified shape via `policyFromAssessmentPolicy()`. Drop
  `policyFromExamSettings` adapter.

- [ ] **C3. Code challenge lifecycle.** Backend adds
  `lifecycle_status` to code challenges (default DRAFT; existing
  rows get DRAFT or PUBLISHED based on whether they have any
  submissions). The Studio shell now shows the same lifecycle pills
  for code challenges as for assignments and exams.

- [ ] **C4. Code submission status alignment.** `CodeSubmission`
  status enum is internal to Judge0 polling; it stops appearing in
  the UI. The user-facing badge is `SubmissionStatus`
  (DRAFT/PENDING/GRADED/PUBLISHED/RETURNED). `CodeRunStatusBadge`
  shrinks to a Judge0-only diagnostic shown in the run pane.

### Phase D — visual polish & reuse

- [ ] **D1. Build `PolicyInspector` (shared).** With the five
  collapsible sections from §3.3. Each kind contributes a `policyView`
  via its adapter; the inspector renders only enabled sections.

- [ ] **D2. Build `ScoreSummary` (shared).** Reads `NormalizedScore`,
  shows the percent, the source (e.g. "12/20 points · 60%"), and a
  tooltip explaining the scale.

- [ ] **D3. Build `AttemptHistoryList` (shared).** Replaces
  `ExamPreScreen`'s attempt grid and the assignment shell's attempt
  list with one component the registry can render in any kind's
  Attempt slot, above the content area.

- [ ] **D4. Re-skin gradebook with consistent badges and progress
  cells.** Currently uses `ACTIVITY_PROGRESS_STATE_CLASSES` directly.
  Move to `<ProgressCell state={...} />` component that wraps the
  same classes with proper a11y labels. The cell should use
  `SubmissionStatusBadge` when a submission exists.

- [ ] **D5. Code-challenge form decomposition.** Split
  `CodeChallengeForm.tsx` (875 LOC) and `CodeChallengeConfigEditor.tsx`
  (709 LOC) into:
  ```
  CodeChallengeStudio.tsx        — slot, ≤180 LOC, mounts the panels
  TestCaseListEditor.tsx         — replaces the inline list
  StarterCodeTabs.tsx            — language tabs + editor
  LanguagePolicyPanel.tsx        — allowed-languages multi-select
  HintsPanel.tsx                 — hints + penalties
  ```
  Total target: <1100 LOC across all five files (down from 1584).

### Phase E — cleanup gate

- [ ] **E1. Empty-folder zero-tolerance check.** The PR landing each
  phase deletes anything it leaves empty. CI grep:
  ```
  rg --files-without-match . apps/web/app/ apps/web/features/ |
    xargs -L1 dirname | sort -u | xargs -L1 \
    sh -c 'if [ -z "$(ls -A "$0")" ]; then echo EMPTY: $0; exit 1; fi'
  ```
  added to the lint step.

- [ ] **E2. Translation key migration.** A `messages/migrate.ts`
  script renames keys:
  - `Activities.ExamActivity.*`            → `Features.Assessments.Attempt.Exam.*`
  - `DashPage.Assignments.*`               → `Features.Assessments.Studio.Assignment.*`
  - `Activities.CodeChallenges.*`          → `Features.Assessments.Attempt.CodeChallenge.*`
  - `Features.Grading.*`                   → `Features.Assessments.Review.*`
  Run for each locale (`kk`, `ru`, `en`). One release of
  back-compat (the old keys also resolve via a translation alias);
  next release deletes the old keys.

- [ ] **E3. Documentation.** Update
  `docs/assignment-grading-product-model.md` to cover all four kinds
  with the same vocabulary; add `docs/ASSESSMENT_SHELL_CONTRACT.md`
  (the slot/VM contract); link both from this plan.

---

## 5. Concrete file diff (after Phase B + D)

| Path | Action | Notes |
|---|---|---|
| `features/assessments/shared/StudioShell.tsx` | **new** | Today's `AssessmentStudioWorkspace` renamed and extended with Outline + Inspector slots |
| `features/assessments/shared/AttemptShell.tsx` | **new** | Replaces inline shell logic in `activity.tsx` and `ExamTakingInterface` |
| `features/assessments/shared/PolicyInspector.tsx` | **new** | One inspector for all kinds |
| `features/assessments/shared/AntiCheatPanel.tsx` | **new** | Shared between Studio config + Attempt banner |
| `features/assessments/shared/ScoreSummary.tsx` | **new** | Reads NormalizedScore |
| `features/assessments/shared/AttemptHistoryList.tsx` | **new** | Replaces ExamPreScreen + assignment attempt list |
| `features/assessments/shared/SaveStateBadge.tsx` | **new** | One badge for the whole platform |
| `features/assessments/shared/Breadcrumbs.tsx` | **new** | Replaces 2 existing breadcrumb components |
| `features/assessments/shared/hooks/useAttemptGuard.ts` | **new** | Timer + tab switch + fullscreen runtime |
| `features/assessments/registry/assignment/` | **new dir** | Decomposed AssignmentStudioShell + Attempt slot |
| `features/assessments/registry/exam/` | **new dir** | ExamStudio + ExamAttempt slot |
| `features/assessments/registry/code-challenge/` | **new dir** | CodeChallengeStudio + CodeChallengeAttempt slot |
| `features/assessments/registry/quiz/` | **new dir** | Block-embedded quiz reuses exam QuestionListEditor |
| `features/assignments/studio/AssignmentStudioShell.tsx` | **delete** | Body moved into kind contribution |
| `components/Activities/ExamActivity/ExamActivity.tsx` | **delete** | Logic moves to AttemptShell + kind slot |
| `components/Activities/ExamActivity/ExamSettings.tsx` | **delete** | Replaced by PolicyInspector + ExamStudio |
| `components/Activities/ExamActivity/ExamTakingInterface.tsx` | **delete** | Body splits into AttemptShell + ExamAttemptContent |
| `components/Activities/ExamActivity/ExamPreScreen.tsx` | **delete** | Replaced by AttemptHistoryList |
| `components/Activities/ExamActivity/ExamResults.tsx` | **delete** | Replaced by AttemptShell result mode + Review |
| `components/Activities/ExamActivity/ExamSubmissionReview.tsx` | **delete** | Replaced by GradingReviewWorkspace |
| `components/Activities/ExamActivity/ExamHeader.tsx` | **delete** | Shell owns header |
| `components/Activities/ExamActivity/ExamLayout.tsx` | **delete** | Shell owns layout |
| `components/Activities/ExamActivity/ExamTimer.tsx` | **move** | → `useAttemptGuard` |
| `components/Activities/ExamActivity/QuestionEditor.tsx` | **rename + move** | → `features/assessments/registry/exam/QuestionEditor.tsx`, also reused by quiz |
| `components/Activities/ExamActivity/QuestionManagement.tsx` | **rename + move** | → `features/assessments/registry/exam/QuestionListEditor.tsx` |
| `components/Activities/ExamActivity/state/examFlowReducer.ts` | **delete** | Phase machine dies |
| `components/Activities/ExamActivity/state/examTakingReducer.ts` | **shrink** | Becomes a small autosave reducer; mounted by content slot |
| `hooks/useExamMutation.ts` | **delete** | TanStack covers it |
| `components/features/courses/code-challenges/CodeChallengeForm.tsx` | **split + delete** | → registry/code-challenge/* |
| `components/features/courses/code-challenges/CodeChallengeConfigEditor.tsx` | **split + delete** | → registry/code-challenge/* |
| `components/features/courses/code-challenges/CodeRunStatusBadge.tsx` | **shrink** | Becomes Judge0-only diagnostic |
| `components/features/courses/code-challenges/SubmissionStatusBadge.tsx` | **delete** | Already merged into shared badge |
| `components/Pages/Activity/ActivityBreadcrumbs.tsx` | **delete** | Use shared Breadcrumbs |
| `components/Dashboard/Misc/BreadCrumbs.tsx` | **delete** | Use shared Breadcrumbs |
| `app/(platform)/dash/assignments/page.tsx` | **delete** | Redirect to /dash/courses |
| `app/(platform)/dash/assignments/layout.tsx` | **delete** | — |
| `app/_shared/dash/assignments/ClientParts.tsx` | **move or delete** | Move CourseCard to /dash/courses if reused |
| `app/_shared/withmenu/.../activity.tsx` | **rewrite** | 1108 → ≤250 LOC thin router |
| `app/(platform)/dash/courses/[c]/activity/[a]/review/page.tsx` | **new** | Hosts GradingReviewWorkspace |
| `app/(platform)/dash/courses/[c]/curriculum/[a]/editor/` | **delete** | Empty |
| `app/_shared/dash/assignments/[a]/_components/Modals/` | **delete** | Empty |
| `app/_shared/dash/assignments/[a]/_components/TaskEditor/Subs/TaskTypes/` | **delete** | Empty |

---

## 6. Acceptance criteria (this redesign is "done" when…)

1. A teacher creating any kind of assessable activity sees the **same
   page chrome** — same topbar, same lifecycle pills, same breadcrumbs,
   same save indicator, same Preview / Schedule / Publish / Archive
   buttons. Only the centre slot, outline rail, and inspector sections
   change with kind.

2. A teacher grading any kind of submission uses the **same Review
   surface**. The center pane is kind-aware (exam shows per-question
   answers, code challenge shows test results + diff, assignment shows
   per-task answers); everything around it is shared.

3. A student attempting any kind of activity sees the **same header,
   timer slot, save indicator, return banner, submit footer, anti-cheat
   banner, focus mode toggle**. Returned-for-revision works the same
   way for an essay assignment and a code-challenge submission.

4. The codebase ships with:
   - **No empty directories** under `apps/web/app/` or `apps/web/features/`.
   - **No `useExamMutation`**, **no `examFlowReducer`**, **no
     `manage` phase**.
   - **No `ExamActivity.tsx`, `ExamSettings.tsx`, `ExamResults.tsx`,
     `ExamPreScreen.tsx`, `ExamSubmissionReview.tsx`,
     `ExamHeader.tsx`, `ExamLayout.tsx`** — all replaced by shells +
     slots.
   - **No `BreadCrumbs.tsx` and no `ActivityBreadcrumbs.tsx`** —
     unified.
   - **No `/dash/assignments/` route**.
   - **No god component over 350 LOC** in the assessment / activity
     tree.

5. Adding a new assessment kind (say, a peer-review activity) requires
   creating one folder under `registry/` with three files
   (`Studio.tsx`, `Attempt.tsx`, `Review.tsx`) and one adapter — no
   edits to the shells, the gradebook, the activity router, or the
   review surface.

6. The cumulative LOC delta of the assessment + grading subsystems is
   **negative by at least 5 KLOC** versus 2026-04-29 baseline.

7. Every i18n key under `Features.Assessments.{Studio,Attempt,Review}`
   resolves in `kk`, `ru`, `en`. Old keys are still resolvable for one
   release behind an alias.

8. `docs/assignment-grading-product-model.md` covers all four kinds
   with the unified vocabulary; `docs/ASSESSMENT_SHELL_CONTRACT.md`
   exists and is linked from this plan and from each kind module file.

---

## 7. Risks & open questions

- **The exam taking interface is the most behaviourally complex
  surface in the platform** (timer, fullscreen, autosubmit, recovery
  prompt, violation tracking, navigation, autosave). Splitting it
  across the shell + content slot must preserve every existing test.
  Mitigation: ship `useAttemptGuard` first behind a feature flag, run
  it in parallel with the existing `ExamTakingInterface` for a
  release, then cut over.

- **Backend timing.** Phases C1–C3 require schema migrations.
  Sequence: ship A1–A7 + B1 (shell scaffold) without backend deps;
  block B3 (exam Attempt slot) on the `ExamAttempt → Submission`
  projection; block C2 (anti-cheat unification) on the policy table.
  Each backend migration ships its own commit with the matching frontend
  cleanup.

- **The translation key migration is high-volume.** Treat it as a
  separate sub-commit with a dedicated reviewer; do not bundle it with the
  component refactors.

- **`AssignmentStudioShell.tsx` decomposition is the riskiest UI-only
  step** because it touches every assignment author. Mitigation: keep
  the existing component intact, build the new decomposed version
  side-by-side under `registry/assignment/`, switch the registry
  factory to point at the new one, run a release with both available
  via a query flag, then delete.

- **Quiz kind is partially out of scope.** Block-embedded quizzes
  inside Tiptap dynamic activities don't get the Studio surface — they
  get the `QuestionListEditor` from the exam kind. This is fine; the
  Quiz "kind" in the registry is mostly there for the gradebook
  + Review pathways, since quiz blocks do submit Submission rows.

- **Code-challenge "execution" UI doesn't fit the
  DRAFT/PENDING/GRADED model cleanly.** Every Judge0 run is not a
  Submission; only a "submit" should produce one. Run results show
  inline in the Attempt content via `RunTestPanel` with a Judge0-only
  diagnostic badge (`CodeRunStatusBadge`). The Submission Review
  always shows the final submit. This decision must be locked before
  starting Phase B3.

---

## 8. What we are explicitly **not** doing

- We are **not** redesigning the dynamic Tiptap editor surface. Dynamic
  activities are not assessments. They keep `/editor/course/.../edit`.

- We are **not** changing the gradebook's tabular design. The gradebook
  is fine; it just gains consistent badges and a single navigation
  target (the Review URL).

- We are **not** introducing a new component library, theme, or
  styling system. The existing `components/ui` (shadcn-derived) is
  sufficient. Visual changes are limited to (a) deleting duplicate
  components, (b) consolidating to one shell per surface, (c)
  collapsing the policy inspector into one place.

- We are **not** writing new analytics surfaces. The plan v1
  speculation about per-activity analytics is dropped — there is no
  user need surfaced today, and the gradebook covers cross-activity
  rollups.

- We are **not** designing for offline mode, real-time collaboration,
  or proctoring. Out of scope.

---

## 9. Definition of done — single screen test

A new TA opens the platform for the first time. Within five minutes
they:

1. Can locate the Studio, Attempt, and Review URLs for any activity by
   reading the URL bar — the pattern is obvious.
2. Can describe the page layout in one sentence: "Topbar with lifecycle
   buttons, an outline rail on the left, the content in the middle, a
   policy inspector on the right." That sentence is true for every
   kind.
3. Can describe the student attempt page in one sentence: "Header with
   timer, content in the middle, footer with save and submit." That
   sentence is true for every kind.
4. Can grade a submission of any kind without learning a new UI.

If any of those four take longer than the others or require a
caveat, the redesign is not done.
