# Assessments & Grading: Overhaul Plan

> **Status:** proposal · **Audience:** eng + product + design
> **Scope:** finish the half-done unification, ship the UX it was supposed to enable, and rip out the legacy code paths that are still load-bearing.
> **Companion to:** `plans/assessments-redesign.md` (the original plan; this doc supersedes it where the two disagree, because the original was written before the unified models landed).
> **Non-goals:** AI grading, realtime co-authoring, cross-course templating, a block-editor DSL.

---

## TL;DR

We have **two systems running side by side**. The unified `Assessment` / `AssessmentItem` / `Submission` model is in production, but every legacy per-kind router (`/assignments`, `/exams`, `/code-challenges`) and its service pipeline is still mounted, still receiving traffic from parts of the frontend, and still writing to the same DB rows through different code paths. The result is a system that is *internally* unified at the data layer and *externally* still four products glued together.

This plan does three things, in order:

1. **Critique the seams** that are visibly leaking today — they're the source of every UX inconsistency.
2. **Lock the data model** — ratify what's already in `apps/api/src/db/assessments.py`, close the last gaps, and forbid future drift via tests.
3. **Ship one UX** for create/attempt/grade across all four kinds and **delete** the legacy code paths in the same release. No "kept for compat" allowed past the cleanup PR.

Estimated cost: **2.5 sprints** of focused engineering, no scope expansion.

---

## 1. Current state critique

### 1.1 The unification is real but only at the data layer

What exists today (verified against current `main`):

- `apps/api/src/db/assessments.py` defines `Assessment`, `AssessmentItem`, `AssessmentLifecycle`, `ItemKind`, and discriminated-union Pydantic bodies for all six item kinds (`CHOICE`, `OPEN_TEXT`, `FILE_UPLOAD`, `FORM`, `CODE`, `MATCHING`).
- `apps/api/src/db/grading/submissions.py` defines a single `Submission` table with five lifecycle states (`DRAFT`, `PENDING`, `GRADED`, `PUBLISHED`, `RETURNED`), `version` for OCC, and `assessment_type` for type-aware grading.
- `apps/api/src/routers/assessments/unified.py` exposes all 14 expected verbs (create/read/patch/lifecycle, item CRUD + reorder, start/draft/submit/me, teacher list).
- `apps/web/features/assessments/items/{choice,open-text,file-upload,form,code}` exist and are wired through `items/registry.ts`.

What is **also** still on disk and **also** still mounted:

| Layer    | Legacy path                                                              | Status                                                   |
| -------- | ------------------------------------------------------------------------ | -------------------------------------------------------- |
| Backend  | `routers/courses/assignments.py`                                         | Mounted; full CRUD + submit pipeline                     |
| Backend  | `routers/courses/exams.py`                                               | Mounted; question CRUD + attempt pipeline                |
| Backend  | `routers/courses/code_challenges.py`                                     | Mounted; submissions + Judge0 callback                   |
| Backend  | `services/courses/activities/assignments/submissions.py`                 | `submit_assignment_draft_submission` still runs          |
| Backend  | `services/courses/activities/assignments/uploads.py`                     | Assignment-specific path; embeds `user_uuid` in filename |
| Backend  | `db/courses/assignments.py:131` `published: bool`                        | Still returned by `AssignmentRead` schema                |
| Backend  | `db/courses/exams.py:148` `settings: dict`                               | Compat mirror, still dual-written                        |
| Backend  | `db/courses/code_challenges.py:157` `lifecycle_status: str`              | Free-form string, no validator                           |
| Frontend | `features/assignments/`                                                  | Whole feature folder still imported from `assessments/`  |
| Frontend | `features/assessments/items/` missing `matching/`                        | Backend ships MATCHING; frontend has nowhere to render   |
| Frontend | `lib/api/generated/schema.ts` `src__db__courses__code_challenges__...`   | Python module paths leaking into TS imports              |

So the canonical claim in `docs/ASSESSMENTS.md` ("the assessment system is centered on two authoring tables and one submission table") is **true but incomplete** — those three tables are canonical, *and* three legacy routers can still reach them through different code paths that bypass the readiness check, the OCC, and the unified policy.

### 1.2 UX friction points that all trace back to §1.1

Things a teacher or student will hit today, with the root cause:

- **A teacher publishes an exam through the studio (calls `/assessments/{uuid}/lifecycle`), but the exam's older "Publish" button on the course outline still calls `/exams/{uuid}/publish`.** These two endpoints update *the same* `Assessment` row but only one runs the readiness gate. The teacher learns which button works by trial and error.
- **A student submitting a coding assignment hits `/code-challenges/{uuid}/submissions` (legacy) but a student submitting a form-based assignment hits `/assessments/{uuid}/submit` (unified).** The two paths produce different `Submission.metadata_json` shapes and differ in whether they emit a domain event for the grader. Result: the grader dashboard's "needs grading" filter is occasionally wrong.
- **Anti-cheat policy reads from `Assessment.policy_id → AssessmentPolicy.anti_cheat_json`.** But the legacy exam editor still writes flags into `Exam.settings`. If a teacher edits in the legacy editor, the change silently doesn't take effect on the student attempt screen, which reads from the canonical column.
- **The student attempt page lives at `/assessments/{uuid}` for new code, but legacy `/course/.../activity/{activity_id}` is still where most course-page links point.** The two render *different* attempt shells with different focus-mode behavior, different recovery dialogs, and different autosave cadences.
- **File upload UX:** the user must wait for the file to upload *before* the draft saves. If they close the tab during the upload, the file is orphaned in object storage and the email-bearing key (`{task_uuid}_sub_{user_uuid}_{ULID()}.{ext}`) sits there forever. There is no resumable upload, no idempotency key, and no orphan reaper.
- **No publish-readiness banner in the legacy editors.** The unified router returns 422 with structured `issues[]` on a bad publish; the legacy `/exams/{uuid}/publish` returns a generic 400. Teachers see a different error UX depending on which editor they happened to open.

### 1.3 State management issues

- **OCC is half-applied.** Teacher grade saves go through `If-Match: <version>` and return 412 on stale. Student draft saves on the unified router *do* honor it; student draft saves through legacy `/assignments/{uuid}/draft` *do not*, so two open tabs silently overwrite each other.
- **`useAssessmentSubmission` is unified for unified-router consumers**; legacy `AssignmentAttemptContent` and `ExamAttemptContent` still hand-roll their own draft/submit/autosave with subtly different debounce windows (1.5s vs 4s vs blur-only).
- **The frontend has two attempt shells.** `features/assessments/shell/AssessmentLayout.tsx` is the new one. The legacy `features/assignments/student/AssignmentAttemptShell` is what the activity route still mounts. They diverge on focus-mode, fullscreen guard, and recovery dialog.
- **Generated TS types leak Python module paths** (`components["schemas"]["src__db__courses__code_challenges__SubmissionStatus"]`). Renaming a Python file breaks frontend imports in unrelated PRs.

### 1.4 Backend bottlenecks and footguns

- **No size cap or content-type sniff on file upload.** The current extension whitelist is bypassable by renaming. There is also no antivirus pass, no per-user quota, no idempotency key on the upload request itself.
- **Code execution callback (Judge0) writes to `submission.metadata_json`** through the legacy code-challenge service, not through `submit_assessment`. The grade ledger (`GradingEntry`) is not appended for autograded code runs, so the audit trail is incomplete for that one kind.
- **The publish-readiness check service exists but is only called by the unified lifecycle endpoint.** Legacy `/exams/{uuid}/publish` skips it, so a half-configured exam can still be published if a teacher uses the older editor.
- **`AssignmentTaskAnswer`** (legacy) and `ItemAnswer` (unified) coexist. The legacy one uses an optional discriminator (`content_type: Literal[...] | None`) and four optional fields, every one of which the frontend has to cast. New code goes through the unified discriminated union; old code reads both shapes.

### 1.5 What is *not* broken (don't refactor it)

- The unified data model in `db/assessments.py` and `db/grading/submissions.py` is correct. It does not need a redesign. It needs **enforcement**.
- `GradingEntry` as an append-only audit ledger with `Submission.final_score` / `grading_json` as the read cache is the right pattern. Don't touch it.
- `AssessmentPolicy` is the right single source of truth for due dates, attempts, late behavior, and anti-cheat. The anti-cheat shape does not need to change.
- The lifecycle state machine (`DRAFT → SCHEDULED → PUBLISHED → ARCHIVED`) is correct.
- The 2026-Q1 readiness-check service (returns `422` with `issues[{code, message, item_uuid?}]`) is the right pattern; just call it from every entrypoint.

---

## 2. Unified data model

Ratify what's already in code; close the four small gaps. **No new tables.**

### 2.1 The shape (canonical, no compat)

```text
                       ┌─────────────────┐
                       │    activity     │
                       │ (course node)   │
                       └────────┬────────┘
                                │ 1:1 for assessable activities
                       ┌────────▼────────┐
                       │   assessment    │
                       │─────────────────│
                       │ assessment_uuid │
                       │ activity_id FK  │
                       │ kind            │  ← preset label only (ASSIGNMENT/EXAM/QUIZ/CODE_CHALLENGE)
                       │ title           │
                       │ description     │
                       │ lifecycle       │  ← single state column
                       │ scheduled_at    │
                       │ published_at    │
                       │ archived_at     │
                       │ weight          │
                       │ grading_type    │  ← NUMERIC | PERCENTAGE
                       │ policy_id FK    │
                       └────┬───────┬────┘
                            │1      │1
              ┌─────────────┘       └────────────────┐
              │                                      │
   ┌──────────▼─────────┐                ┌───────────▼────────┐
   │  assessment_item   │                │ assessment_policy  │
   │────────────────────│                │────────────────────│
   │ item_uuid          │                │ due_at             │
   │ assessment_id FK   │                │ available_from     │
   │ order              │                │ available_until    │
   │ kind (ItemKind)    │                │ max_attempts       │
   │ title              │                │ time_limit_minutes │
   │ body_json          │  ← validated   │ late_policy_json   │
   │ max_score          │    by ItemKind │ anti_cheat_json    │
   │                    │    discrim.    │ visibility_json    │
   └────────┬───────────┘                └────────────────────┘
            │ N (referenced by item_uuid in submission.answers_json)
            │
   ┌────────▼───────────┐                ┌────────────────────┐
   │    submission      │                │  grading_entry     │
   │────────────────────│  N:1 audit     │────────────────────│
   │ submission_uuid    │───────────────▶│ submission_id FK   │
   │ assessment_id FK   │                │ entry_uuid         │
   │ user_id FK         │                │ grader_id FK       │
   │ assessment_type    │                │ kind (SUBMIT/      │
   │ status             │                │       AUTO_GRADE/  │
   │ version (OCC)      │                │       MANUAL/      │
   │ answers_json       │                │       RELEASE/     │
   │ grading_json       │  ← read cache  │       RETURN)      │
   │ final_score        │                │ payload_json       │
   │ submitted_at       │                │ created_at         │
   │ ...timestamps      │                └────────────────────┘
   └────────┬───────────┘
            │ N
            │
   ┌────────▼───────────┐
   │   upload (NEW)     │  ← see §4.1
   │────────────────────│
   │ upload_uuid        │
   │ user_id FK         │
   │ status (PENDING/   │
   │   FINALIZED)       │
   │ size, sha256,      │
   │ mime, key, ...     │
   └────────────────────┘
```

### 2.2 Item bodies and answers — one discriminated union

The Pydantic side is already correct. To prevent drift, mirror it on the TS side as a hand-written wrapper (do **not** rely on generated types for discriminated bodies — the OpenAPI flattening loses the discriminator).

```ts
// apps/web/features/assessments/domain/items.ts (already exists; ensure it
// stays the only declaration and is generated from the Pydantic schema in CI)

export type ItemBody =
  | { kind: 'CHOICE';      prompt: string; options: ChoiceOption[]; multiple: boolean }
  | { kind: 'OPEN_TEXT';   prompt: string; min_words?: number; rubric?: string }
  | { kind: 'FILE_UPLOAD'; prompt: string; max_files: number; max_mb?: number; mimes: string[] }
  | { kind: 'FORM';        prompt: string; fields: FormField[] }
  | { kind: 'CODE';        prompt: string; languages: number[]; tests: CodeTestCase[]; starter_code: Record<string, string>; time_limit_seconds?: number; memory_limit_mb?: number }
  | { kind: 'MATCHING';    prompt: string; pairs: MatchPair[] };

export type ItemAnswer =
  | { kind: 'CHOICE';      selected: string[] }
  | { kind: 'OPEN_TEXT';   text: string }
  | { kind: 'FILE_UPLOAD'; uploads: { upload_uuid: string }[] }
  | { kind: 'FORM';        values: Record<string, string> }
  | { kind: 'CODE';        language: number; source: string; latest_run?: RunResult }
  | { kind: 'MATCHING';    matches: { left_id: string; right_id: string }[] };
```

### 2.3 The four small gaps to close

1. **`MATCHING` has a backend body but no frontend renderer.** Add `apps/web/features/assessments/items/matching/{Author,Attempt,Review}.tsx` and register in `items/registry.ts`. Reuses `MatchPair` from the union.
2. **`Upload` table is missing.** Create the table per §4.1 — currently `upload_id` is implicit and unaudited.
3. **`AssessmentPolicy.late_policy_json` is currently an unstructured JSON.** Promote to a discriminated union: `{ kind: 'NONE' } | { kind: 'PENALTY'; percent_per_day: number; max_days: number } | { kind: 'CUTOFF'; cutoff_at: datetime }`. This is the single most copied-around bit of validation in the codebase.
4. **`Submission.metadata_json` is a free-for-all** — the Judge0 callback dumps run results there, the anti-cheat violation log dumps events there. Carve out two named sub-shapes and validate them: `metadata_json: { runs?: CodeRunRecord[]; violations?: AntiCheatViolation[]; plagiarism?: PlagiarismScore }`.

### 2.4 What the data model is not

- **Not a block editor.** Items are structured leaf records. If a content team wants rich layout, that's a separate `content` activity type, not an assessment item.
- **Not multi-tenant cross-course.** `assessment_uuid` is owned by one activity in one course. Templates are out of scope.
- **Not group-graded.** `submission.user_id` stays a single FK. If group submissions become a real product ask, it's a separate `submission_member` table — not a refactor of this one.
- **Not version-history per-edit.** OCC is for concurrent-write protection, not a "track every author edit" log. If a redo/undo is needed, it's an editor-side feature, not a server schema change.

---

## 3. UX/UI redesign

**The product principle:** a teacher and a student each see one screen for "create" and one for "take." The kind label changes copy and which item types are offered; it does not change the chrome.

### 3.1 Teacher: create

**Single sheet, two fields.** Floating "+ New assessment" button in the course outline.

```
┌─────────────────────────────────────────────────────────────┐
│  New assessment                                          [×]│
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Kind     [ Assignment ▼ ]   ← Assignment / Exam / Quiz /   │
│                                Code challenge               │
│                                                             │
│  Title    [_________________________________________]       │
│                                                             │
│                                                             │
│                              [ Cancel ]    [ Create draft ] │
└─────────────────────────────────────────────────────────────┘
```

That's it. Submit creates `assessment` + `activity` rows with the preset's policy applied, then routes to `/dash/assessments/{uuid}/studio` in DRAFT state. No 4-section modal, no policy upfront, no scheduling — those happen in studio where the teacher can see what they're configuring.

### 3.2 Teacher: studio (author + configure + publish)

**Two-column default; collapsible inspector.** No "outline column" on small screens.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ ◀ Course / Chapter 3                            DRAFT  ●  Saved 4s ago       │
│ Algebra Mid-Term                                                              │
│ Exam · 20 questions · Weight 30%                          [ Inspector ▸ ]    │
├──────────────────────────────────────────────────────────────────────────────┤
│                                       │                                       │
│  Q3.  What is 2+2?                    │   ITEMS (20)                  [+ Add]│
│  ─────────────────────────────        │   ────────────────────────────────── │
│  ● 4              ✓  correct          │   ● 1.  Linear equations · Choice    │
│  ○ 5                                  │   ● 2.  Solve for x · Open text      │
│  ○ Not sure                           │   ▶ 3.  What is 2+2? · Choice  ⚠     │
│  [+ Add option]                       │     4.  Match terms · Matching       │
│                                       │     5.  Upload your work · File      │
│  Score    [ 1 ]  pts                  │     ...                              │
│                                       │                                       │
│  ┌─ Per-item settings ────────────┐   │   POLICY                             │
│  │ Multiple correct answers   [○] │   │   ────────────────────────────────── │
│  │ Shuffle options            [●] │   │   Due       Apr 15 · 23:59           │
│  └────────────────────────────────┘   │   Time      90 min                   │
│                                       │   Attempts  1                        │
│                                       │   Anti-cheat                         │
│                                       │     Fullscreen           [●]         │
│                                       │     Tab-switch limit     3           │
│                                       │     Disable copy-paste   [●]         │
│                                       │   Late policy  Cutoff at due time    │
│                                       │                                       │
│                                       │   LIFECYCLE                          │
│                                       │   ────────────────────────────────── │
│                                       │   ⚠ 1 issue blocks publishing:       │
│                                       │     · Q3 has no correct answer       │
│                                       │       [ Jump to question ]            │
│                                       │                                       │
│                                       │   [ Publish now ]   [ Schedule ▾ ]   │
│                                       │   [ Save as draft ]                  │
│                                       │                                       │
└──────────────────────────────────────────────────────────────────────────────┘
```

Behavior:

- **Autosave per item on blur**, with `If-Match: <version>` so concurrent edits in two tabs return 409 and reconcile.
- **One "Saved 4s ago" indicator** in the topbar; no per-section save buttons anywhere.
- **Inspector is collapsible** but **always shows the lifecycle preflight** when there are blocking issues — clicking an issue scrolls/highlights the offending item. This is what the empty `validationIssues` array was supposed to populate.
- **Schedule is a dropdown on the same button**, not a separate modal. "Publish now" / "Publish on Apr 15 · 09:00" / "Save as draft."
- **Archive is hidden in an overflow menu** on Lifecycle. It's rare; don't put it on the topbar.
- **Item authoring renders kindModule.Author** — one component per `ItemKind`, registered in `items/registry.ts`. Adding a new kind is one folder + one registry entry.

### 3.3 Student: attempt

**One screen, one shell, regardless of kind.** Routes to `/assessments/{uuid}` (legacy `/course/.../activity/{id}` redirects).

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ ◀ Algebra · Mid-Term                                                          │
│ Exam · 20 questions · Time remaining 47:12 · ⓘ Fullscreen required            │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                               │
│   1 ●  2 ●  3 ○  4 ●  5 ○  6 ○  7 ●  8 ○ ...    (sticky nav for paged kinds) │
│                                                                               │
│  Question 3 of 20                                                  [ Flag ⚐ ] │
│  ────────────────────────────────────────────────────────────────────────────│
│                                                                               │
│   What is 2 + 2?                                                              │
│                                                                               │
│   ○ 3                                                                         │
│   ● 4                                                                         │
│   ○ 5                                                                         │
│                                                                               │
│   ┌─ This file is too large (max 10 MB) ────────────────────────────────────┐│
│   │  inline error, NOT a toast — user can fix without losing context        ││
│   └─────────────────────────────────────────────────────────────────────────┘│
│                                                                               │
├──────────────────────────────────────────────────────────────────────────────┤
│ Saved 4s ago · 2 unanswered · ⚠ 1 violation       [ Previous ]  [ Next ▸ ]   │
│                                                   [ Submit ]                  │
└──────────────────────────────────────────────────────────────────────────────┘
```

Three rules that stay constant across kinds:

1. **The action bar is a single component** (`AttemptActionBar`) driven by `useAssessmentSubmission`. It owns: save indicator, unanswered count, violation count, primary/secondary action, timer.
2. **Errors are inline, not toast-only.** A toast vanishes; a student halfway through an exam needs the error attached to the field that produced it.
3. **Autosave is silent except for the timestamp.** No "Draft saved!" notifications fighting for attention.

Per-kind variation:

- **Assignment / Quiz** — items render in a single scroll, Submit is the only action.
- **Exam** — paginated one-question-at-a-time with the sticky nav grid above; fullscreen is enforced (via `AttemptGuard`, not per-kind code); violation pill in the action bar.
- **Code Challenge** — full-bleed code editor + tests panel; "Run" runs visible tests asynchronously (does **not** finalize a submission); "Submit" runs the full suite and finalizes.

### 3.4 Student: result and revision

After submission the same page swaps the items pane for a **result panel**:

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ ◀ Algebra · Mid-Term                                                          │
│ Submitted Apr 15 · 23:14 ·  Awaiting grade                                    │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                               │
│   ┌─ Awaiting grade ────────────────────────────────────────────────────────┐│
│   │  Your teacher will release the grade. You'll get a notification.         ││
│   └─────────────────────────────────────────────────────────────────────────┘│
│                                                                               │
│   ▼ Your answers                                                              │
│      Q1.  Linear equations         You answered: x = 4                        │
│      Q2.  Solve for x              You answered: 2 paragraphs                 │
│      Q3.  What is 2+2?             You answered: 4                            │
│      ...                                                                      │
│                                                                               │
└──────────────────────────────────────────────────────────────────────────────┘
```

Once released, the same page renders score + per-item feedback inline (no second navigation). If the teacher returns it for revision, the action bar re-appears with "Save" + "Resubmit"; previous feedback is shown above each affected item, not in a separate dialog.

### 3.5 Instructor: grading dashboard

Three-pane review screen at `/dash/assessments/{uuid}/review` (existing layout is good, fix the data plumbing):

```
┌────────────────────────────────────────────────────────────────────────────────┐
│ ◀ Algebra · Mid-Term · Grading                                                  │
├──────────────┬─────────────────────────────────────┬───────────────────────────┤
│ SUBMISSIONS  │ Aigerim K. · Awaiting grade          │ GRADE                    │
│              │ Submitted Apr 15 · 23:14             │                          │
│ Filter ▾     │ Time spent 1h 12m · 1 violation      │ Per-item                 │
│ ☑ Awaiting   │                                      │ ───────────────────────  │
│ ☐ Graded     │ ─────────────────────────────────── │ Q1  [   1 / 1 ] ✓ Auto   │
│ ☐ Released   │ Q1. Linear equations                 │ Q2  [ 4.5 / 5 ]          │
│ ☐ Returned   │  Student: x = 4                      │     Feedback ▾           │
│              │  Auto: ✓ correct (1/1)               │ Q3  [   1 / 1 ] ✓ Auto   │
│ Sort ▾       │                                      │ ...                      │
│ Newest       │ Q2. Solve for x  (manual review)     │                          │
│              │  Student: [paragraphs of work]       │ Total  18.5 / 20         │
│ ─────────    │  Rubric: ▼                           │                          │
│ ● Aigerim K. │                                      │ Overall feedback         │
│   Awaiting   │ Q3. What is 2+2?                     │ ┌─────────────────────┐  │
│ ○ Bekzat S.  │  Student: 4                          │ │                     │  │
│   Awaiting   │  Auto: ✓ correct (1/1)               │ └─────────────────────┘  │
│ ○ Daniyar M. │                                      │                          │
│   Graded     │ ─────────────────────────────────── │ [ Save draft grade ]     │
│ ...          │ Violations  ▼                        │ [ Release grade ]        │
│              │  · 23:08 Tab switch (1)              │ [ Return for revision ]  │
│ j next ↑↓    │                                      │                          │
│ k prev       │                                      │                          │
└──────────────┴─────────────────────────────────────┴───────────────────────────┘
```

Behavior:

- **Per-item review surface uses the same item registry** as studio + attempt. Today only assignments + exams have bespoke review detail; code and quiz fall back to a generic JSON dump. After unification, every kind contributes its `Review` component automatically.
- **`j` / `k` shortcuts** with a visible legend in the bottom-left (no hidden tooltip).
- **Filters survive a refresh** — store in URL search params, not just hook state.
- **Three actions, three meanings:**
  - *Save draft grade* — writes `grading_json` but leaves `status = PENDING`. Student doesn't see anything yet.
  - *Release grade* — transitions to `PUBLISHED` and notifies the student.
  - *Return for revision* — transitions to `RETURNED`, includes the per-item feedback as the previous-attempt context.
- **Violation log is a tab in the inspector**, not a hidden field. Timestamps and types only — no auto-zero without explanation.
- **OCC on grade save** returns 412; the UI merges the server's latest grade into the local draft and shows a "Another grader updated this — review the changes" banner.

### 3.6 The cohesion checklist

Five things that must be identical across every kind, every screen, every state:

1. **Lifecycle words.** `Draft / Scheduled / Published / Archived` for assessments. `In progress / Awaiting grade / Graded / Released / Returned` for submissions. Not `published: bool`. Not `IN_PROGRESS`. Not `auto_submitted`.
2. **Action bar component.** `AttemptActionBar` everywhere. Per-kind features (timer, violation pill, run-tests button) are slots in the same bar, not separate bars.
3. **Save indicator.** "Saved Ns ago" in one place, top-right of the studio/attempt header. No per-section indicators.
4. **Error UX.** Inline next to the field, not toast-only. Toasts are for cross-cutting events (publish succeeded, grade released).
5. **Permissions copy.** `assessment:author / publish / submit / grade / read` everywhere. The current per-kind permission map (where `code_challenge` reuses `assignment:submit`) goes.

---

## 4. Workflow architecture

### 4.1 Files: resumable uploads with explicit lifecycle

**New table** `upload`:

```python
class Upload(SQLModelStrictBaseModel, table=True):
    id: int | None = SQLField(primary_key=True)
    upload_uuid: str = SQLField(default_factory=lambda: f"ul_{ULID()}", unique=True)
    user_id: int = SQLField(foreign_key="user.id")
    status: UploadStatus  # PENDING | FINALIZED | CANCELLED
    storage_key: str       # uploads/{user_uuid}/{yyyy}/{mm}/{upload_uuid}/{sha256}.{ext}
    size_bytes: int | None
    sha256: str | None
    content_type: str | None
    created_at: datetime
    finalized_at: datetime | None
    referenced_count: int = 0  # incremented on submission save, drives orphan reaper
```

**New endpoints** under `/api/v1/uploads`:

| Verb                        | Body                          | Returns                                     |
| --------------------------- | ----------------------------- | ------------------------------------------- |
| `POST /uploads`             | `{ filename, size, mime }`    | `{ upload_uuid, put_url, expires_at }`      |
| `PUT  {put_url}`            | bytes (S3 presigned PUT, TUS) | 200                                         |
| `POST /uploads/{u}/finalize`| `{ sha256 }`                  | `{ upload_uuid, storage_key, size, mime }`  |
| `DELETE /uploads/{u}`       | —                             | 204 (only if not yet referenced)            |
| `GET  /uploads/{u}/url`     | —                             | `{ get_url, expires_at }` (signed read URL) |

Submission stores **only** the `upload_uuid` reference:

```json
{ "kind": "FILE_UPLOAD", "uploads": [{ "upload_uuid": "ul_01H..." }] }
```

The submission save validates each upload:

- belongs to the current user
- is `FINALIZED`
- `content_type` matches the item body's `mimes`
- `size_bytes` ≤ item body's `max_mb`
- not already referenced by a different submission (idempotency)

On successful save, `referenced_count++`. **Orphan reaper** (nightly cron): delete any `Upload` where `status = FINALIZED && referenced_count = 0 && finalized_at < now - 24h` — and any `PENDING` upload older than 1h.

**Storage path is generic, no PII:**

```
uploads/{user_uuid}/{yyyy}/{mm}/{upload_uuid}/{sha256}.{ext}
```

The user's email is **not** in the path, ever.

**Validation on upload creation (server-side, before bytes are sent):**

- size cap (per-item, per-user-quota)
- MIME allow-list per item
- antivirus scan hook (start as a no-op stub; wire ClamAV in phase 6)
- per-user rate limit on `POST /uploads`

### 4.2 Code execution: one path, audited

Today the Judge0 callback writes directly to `Submission.metadata_json.runs` through the legacy `code_challenges` service. Move it to the unified pipeline:

```
Student clicks Run         Student clicks Submit
      │                          │
      ▼                          ▼
POST /assessments/{u}/run    POST /assessments/{u}/submit
      │                          │
      │ enqueues a job           │
      ▼                          │
  Judge0 (sandboxed)             │
      │                          │
      ▼                          │
POST /internal/judge0/callback   │
      │                          │
      ▼                          ▼
    Update Submission.metadata_json.runs (latest_run only — runs are ephemeral)
                          │
                          ▼  (only on Submit)
                     submit_assessment()
                          │
                          ▼
              Auto-grade against test cases
                          │
                          ▼
              Append GradingEntry(kind=AUTO_GRADE)
                          │
                          ▼
              Update Submission.grading_json + final_score
```

Key properties:

- **Run is not a submission.** Run results live in `submission.metadata_json.latest_run` and are overwritten. They never produce a `GradingEntry`.
- **Submit always produces a `GradingEntry(kind=SUBMIT)`** before auto-grading runs. Auto-grade results go into a second `GradingEntry(kind=AUTO_GRADE)`. The audit trail is complete.
- **Judge0 callback is idempotent on a `run_id`.** Duplicate callbacks (network retry) update the same row, never produce a second `GradingEntry`.
- **Hidden tests run server-side, never sent to the client.** The student's `latest_run` only contains visible-test results.
- **Per-language sandbox limits** (memory, time, output bytes) come from the item body, not a global config.

### 4.3 Form data: validate at the boundary, not in templates

`FormItemBody.fields` declares the schema. The submission save validates each `FORM` answer against the item's fields:

- required fields present
- `field_type` parsed (`number → float`, `date → ISO string`)
- length caps per `text` / `textarea`

This happens once on the server, in `submit_assessment`. The frontend uses the **same** field schema (generated from Pydantic) to render and validate inline — no parallel TS validators.

### 4.4 Anti-cheat: one source, one writer, one reader

- **Read** from `AssessmentPolicy.anti_cheat_json` *only*. Delete every other read site (the legacy `Exam.settings.copy_paste_protection` etc.).
- **Write** through `PATCH /assessments/{uuid}` *only*. The legacy exam editor's "Settings" tab points at the same endpoint.
- **Enforce** via the single `AttemptGuard` component on the frontend. Per-kind copies go.
- **Log** violations to `Submission.metadata_json.violations: AntiCheatViolation[]`. The server validates the shape (`{ kind, occurred_at, count }`), not free-form events.
- **Default thresholds are a preset constant**, not a per-deploy config. The "violation auto-zero default" question from the prior plan: keep `3` as the default for EXAM, `null` (no auto-zero) for ASSIGNMENT and QUIZ; teacher can override per-assessment.

### 4.5 Lifecycle: one endpoint, every entrypoint

`POST /assessments/{uuid}/lifecycle` is the only verb that changes lifecycle. All legacy publish/archive routes return **308 redirect** to it for one release, then are deleted.

Readiness gate runs on `→ PUBLISHED` and `→ SCHEDULED` transitions:

- assessment has ≥ 1 item
- every item body validates against its `kind` discriminator
- `assessment_policy` exists and required fields are set
- if kind == CODE_CHALLENGE, every CODE item has ≥ 1 test case
- if kind == EXAM and `time_limit_minutes` is set, `available_until - available_from ≥ time_limit_minutes`

Failure returns `422` with:

```json
{
  "detail": "Cannot publish",
  "issues": [
    { "code": "CHOICE_NO_CORRECT_ANSWER", "message": "Q3 has no correct answer.", "item_uuid": "it_01H..." },
    { "code": "POLICY_DUE_AT_MISSING",     "message": "Due date is required.",      "item_uuid": null }
  ]
}
```

The studio inspector renders these inline with "Jump to" links.

---

## 5. Execution plan

Six phases. Each is shippable on its own and reversible behind a flag where applicable.

### Phase 1 — Lock the model (0.5 sprint)

- Backend: ratify `Assessment` / `AssessmentItem` / `Submission` / `AssessmentPolicy` as canonical. Add the four §2.3 gap-closes.
  - Add `Upload` table + endpoints (no client wired yet).
  - Promote `late_policy_json` to a discriminated union.
  - Carve out `metadata_json.{runs,violations,plagiarism}` validators.
- Frontend: add `items/matching/` with Author/Attempt/Review components; register in `items/registry.ts`.
- Tests: a new CI check that grep-fails on any new occurrence of `published: bool` on `Assignment*` / `Exam*`, and on any new write to `Exam.settings`.
- **Deliverable:** the model is officially closed; new code can't drift.

### Phase 2 — Single submission path (1 sprint)

- Backend: route every `POST /assignments/{uuid}/submit`, `POST /exams/{uuid}/attempts/{...}/submit`, `POST /code-challenges/{uuid}/submissions` through `submit_assessment`. The legacy endpoints stay mounted but become thin shims that call the canonical service.
- Apply OCC (`If-Match: <version>`) to every draft save endpoint, including the legacy ones during the shim period.
- Move the Judge0 callback into `submit_assessment` (per §4.2).
- Frontend: replace `AssignmentAttemptContent`, `ExamAttemptContent`, `CodeChallengeAttemptContent` with one `AssessmentAttempt` powered by `useAssessmentSubmission` and the items registry.
- **Deliverable:** one write path; one hook; old routes still respond but go through new code.

### Phase 3 — Single shell + route (0.5 sprint)

- Frontend: `/course/.../activity/{activity_id}` becomes a server-side redirect to `/assessments/{uuid}` for assessable activities.
- Delete `features/assessments/shell/AssessmentLayout.tsx` *or* `features/assignments/student/AssignmentAttemptShell` — keep one. The kept one handles fullscreen + violations + recovery for every kind.
- One `AttemptActionBar`, one `AttemptGuard`, one `AttemptRecoveryDialog` — all in `features/assessments/shell/components/`.
- **Deliverable:** one shell; one route; one guard; one recovery dialog.

### Phase 4 — Studio + grading polish (0.5 sprint)

- Implement the §3.2 two-column studio layout (collapsible inspector, lifecycle preflight banner populated from `validationIssues`).
- Implement the §3.5 grading screen polish: per-item review uses the items registry, filters in URL params, visible keyboard legend, violation log tab, OCC merge banner.
- Generate the form-field validators on the frontend from the Pydantic `FormField` schema (one source).
- **Deliverable:** the UX in §3 is shipped.

### Phase 5 — File pipeline cutover (0.5 sprint, parallel with 4)

- Frontend `FileUploadAttempt` switches to `upload_uuid` references.
- Legacy `upload_submission_file` becomes a thin shim that creates an `Upload`, finalizes it immediately, and returns a `upload_uuid` — for any client still on the old path during the transition.
- Orphan reaper job lands.
- The user's email is removed from object paths; old paths stay readable through a fallback resolver.
- **Deliverable:** one upload pipeline; resumable; PII-free keys.

### Phase 6 — Cleanup (0.5 sprint, see §6)

- Delete every legacy route, table, service, frontend folder, and shim listed in §6.
- Regenerate the OpenAPI / TS types — names should be clean (`SubmissionStatus`, not `src__db__courses__code_challenges__SubmissionStatus`). Land any rename codemod the same PR.
- **Deliverable:** zero compatibility code in the repo.

### Phase 7 (optional) — Quality of life

- Per-user upload quota (soft limit with banner; hard limit at 2× soft).
- Rate-limit `POST /uploads` per user.
- A real "needs grading" inbox view across courses (uses the same data, no schema changes).

### Sequencing notes

- Phases 1–3 are strictly ordered; 4 + 5 can run in parallel after 3.
- Each phase has a feature flag for the cutover step, defaulted off in prod, flipped after one sprint of CI shadow comparison.
- No phase introduces a new compatibility shim. If a transition needs a shim, it goes in the same PR as the deletion that retires it.

---

## 6. Full legacy / compatibility code cleanup

This is the deletion checklist. A PR completes Phase 6 only when **every** item below is gone. Each line lists the artifact and the file/symbol that must no longer exist after the cleanup.

### 6.1 Backend — DB layer

- `Assignment.published: bool` field on `apps/api/src/db/courses/assignments.py:131`. Drop column in migration; remove from `AssignmentRead`. Lifecycle reads from `assessment.lifecycle`.
- `Exam.settings: dict` field on `apps/api/src/db/courses/exams.py:148`. Drop the column; all reads go through `AssessmentPolicy`.
- `CodeChallengeSettings.lifecycle_status: str` on `apps/api/src/db/courses/code_challenges.py:157`. Delete the field; lifecycle reads from `assessment.lifecycle`.
- `Activity.published: bool` (if still present) — replace with a read-only computed view: `activity.is_published := exists(assessment WHERE activity_id = ? AND lifecycle = 'PUBLISHED')`.
- `code_submission` table — migrate any remaining rows into `submission` + `grading_entry`, then drop.
- `exam_attempt` table — same treatment; drop.
- `AssignmentTaskAnswer` schema (the loose `content_type: Literal[...] | None` shape) — delete; all reads/writes go through `ItemAnswer`.

### 6.2 Backend — routers

- `apps/api/src/routers/courses/assignments.py` — delete the file. `/api/v1/assignments/...` is gone.
- `apps/api/src/routers/courses/exams.py` — delete; `/api/v1/exams/...` gone.
- `apps/api/src/routers/courses/code_challenges.py` — delete; `/api/v1/code-challenges/...` gone.
- All per-kind lifecycle subroutes (`/assignments/{uuid}/publish`, `/exams/{uuid}/publish`, `/exams/{uuid}/archive`, etc.) — gone. The unified `POST /assessments/{uuid}/lifecycle` is the only verb.
- For one release, the deleted routes return `308` to their unified equivalent. After one release with telemetry showing zero hits, the redirect itself is deleted.

### 6.3 Backend — services

- `apps/api/src/services/courses/activities/assignments/submissions.py:submit_assignment_draft_submission` — delete. `submit_assessment` is the only function that creates non-DRAFT `submission` rows.
- `apps/api/src/services/courses/activities/exams/...` exam-attempt pipeline — delete.
- `apps/api/src/services/courses/activities/code_challenges/...` code-submission pipeline — delete; logic absorbed into `submit_assessment` + auto-grader.
- `apps/api/src/services/courses/activities/assignments/uploads.py` — delete. `apps/api/src/services/uploads/` is the new home.
- Any `_project_legacy_*` projector functions — delete. `legacy`, `compat`, `_old`, `mirror` should grep-fail in `apps/api/src/services/`.
- `apps/api/src/services/assessments/settings.py` — if it still contains "deprecated compatibility mirror" comments, the file body is rewritten without them; settings live on `AssessmentPolicy` only.

### 6.4 Backend — auto-grader

- Per-kind auto-graders that bypass `submit_assessment` — gone. Auto-grade is invoked from inside `submit_assessment` via the items registry (`itemModule.autoGrade(body, answer)`).
- The duplicate multiple-choice graders (currently ≥ 4 implementations) — collapse to the one in `items/choice/grader.py`.

### 6.5 Frontend — features

- `apps/web/features/assignments/` — entire directory gone. Anything still useful (a particular task editor, a particular error message) is moved into `apps/web/features/assessments/items/{kind}/` first.
- `apps/web/features/assessments/registry/assignment/` — gone. Studio context is the same for every kind; per-kind variation comes from the items registry, not a kind-specific shell.
- `apps/web/features/assessments/shell/AssessmentLayout.tsx` and the legacy `AttemptShell` — exactly one survives. The other file is deleted.
- `lifecycleFromActivity`, `lifecycleFromExamPublished`, `submissionStatusFromAttemptStatus`, `useAssessmentLifecycleFallback`, and friends — delete. `assessment.lifecycle` is read directly.
- Per-kind `useAssignmentDraft`, `useExamAttempt`, `useCodeSubmissionPolling` — delete. `useAssessmentSubmission` is the only hook.
- Per-kind quiz multiple-choice components (the ≥ 4 parallel implementations) — delete. `items/choice/Attempt.tsx` is the only one.

### 6.6 Frontend — types & generation

- Re-run OpenAPI codegen after the routers/schemas are renamed. Schema names like `src__db__courses__code_challenges__SubmissionStatus` become `SubmissionStatus`. Land the codemod in the same PR.
- Hand-written `domain/items.ts` discriminated union stays (per §2.2); generated types provide the field-level shapes only.
- Delete any `as { content_type?: ... }` casts — they become unrepresentable once `AssignmentTaskAnswer` is gone.

### 6.7 Frontend — routing

- `/course/{courseUuid}/activity/{activityId}` — becomes a thin server-side redirect to `/assessments/{assessmentUuid}` for assessable activities. After one release, the original route is deleted.
- All `/dash/courses/.../assignments/[uuid]` editor routes — redirect to `/dash/assessments/[uuid]/studio`, then delete.

### 6.8 Storage

- `courses/{course_uuid}/activities/{activity_uuid}/assignments/{assignment_uuid}/tasks/{task_uuid}/subs/...` paths — read-only. New uploads land under `uploads/{user_uuid}/{yyyy}/{mm}/{upload_uuid}/...`. After 90 days of zero new writes to the legacy paths, run a one-shot migration that copies referenced files to the new layout, updates references, and deletes the originals.
- The user's email is removed from any object key. Audit the bucket and rename in place if any are found.

### 6.9 Permissions

- Per-kind permission names (`assignment:submit`, `exam:grade`, `code_challenge:read`, etc.) — delete. Only `assessment:author / publish / submit / grade / read` survive in the resolver.
- Any role mapping that gives a teacher `assignment:*` but not `assessment:*` — audit and replace.

### 6.10 Documentation

- `docs/ASSESSMENTS.md` already describes the unified model. After cleanup, it must be the *only* assessment doc. Delete or fold:
  - `plans/assessments-redesign.md` (this doc supersedes it; archive into `plans/archive/`).
  - Any per-kind README references that still describe the old model.
- New section in `docs/ASSESSMENTS.md`: "Adding a new ItemKind" — five concrete steps (Pydantic body, ItemKind enum, items folder, registry entry, optional auto-grader).
- `docs/ASSESSMENTS.md` must contain zero occurrences of "deprecated", "compat", "mirror", "legacy".

### 6.11 Definition of done — grep contract

The cleanup is complete when, on `main`, all of the following return zero hits:

```
grep -r "submit_assignment_draft_submission" apps/api/src
grep -r "_project_legacy_" apps/api/src
grep -r "lifecycleFromExamPublished" apps/web
grep -r "submissionStatusFromAttemptStatus" apps/web
grep -r "deprecated compatibility mirror" apps/
grep -rE "published\s*:\s*bool" apps/api/src/db/courses
grep -r "features/assignments" apps/web
grep -r "src__db__courses__" apps/web/lib/api/generated
ls apps/api/src/routers/courses/assignments.py 2>/dev/null
ls apps/api/src/routers/courses/exams.py 2>/dev/null
ls apps/api/src/routers/courses/code_challenges.py 2>/dev/null
ls apps/api/src/db/courses/assignments.py 2>/dev/null
ls apps/api/src/db/courses/exams.py 2>/dev/null
ls apps/api/src/db/courses/code_challenges.py 2>/dev/null
```

When that contract holds, the system has **one** assessment model, **one** submission pipeline, **one** lifecycle endpoint, **one** attempt shell, **one** items registry, **one** upload pipeline, and **one** way for a teacher or a student to talk about an assessment. The redesign is done.
