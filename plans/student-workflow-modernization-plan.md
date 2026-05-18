# Student Workflow Modernization Plan
**Role**: Senior Software Architect — Zero-Debt Production Rewrite  
**Date**: 2026-05-18  
**Status**: Authoritative — supersedes `activity-page-redesign-plan.md` and `file-submission-activity-reimplementation.md`

---

## Table of Contents

1. [Architecture Diagnosis](#1-architecture-diagnosis)
2. [Product North Star](#2-product-north-star)
3. [Architecture Decision Records](#3-architecture-decision-records)
4. [Target Student Workflow](#4-target-student-workflow)
5. [Target Teacher Workflow](#5-target-teacher-workflow)
6. [Frontend Rewrite Specification](#6-frontend-rewrite-specification)
7. [Backend Changes](#7-backend-changes)
8. [Legacy Removal](#8-legacy-removal)
9. [Execution Phases](#9-execution-phases)

---

## 1. Architecture Diagnosis

### 1.1 Critical Structural Defects

#### DEF-001 — Split-Brain Assessment Navigation (Severity: Critical)

**Evidence**: `ActivityContentRenderer.tsx:AssessmentHandoff` + `activity-view-model.ts:assessmentUrl`

For every `TYPE_EXAM`, `TYPE_CODE_CHALLENGE`, and `TYPE_CUSTOM` activity, the activity page renders an `AssessmentHandoff` component: a card with a clipboard icon and a button reading "Open Assessment" that navigates the student to `/assessments/{uuid}`. The destination page — `apps/web/src/app/[locale]/(platform)/(withmenu)/assessments/[assessmentUuid]/` — loads `AttemptShell` with no course outline, no breadcrumb chain, no progress bar, and no navigation to adjacent activities.

**Impact**:
- Student leaves the course learning context entirely.
- Course outline progress cannot update because the trail invalidation (`queryClient.invalidateQueries` in `ExamAttemptContent.handleComplete`) fires in the assessment page while the course activity page is unmounted and stale.
- After completing an exam, the student has no clear path back to the next activity. They must use browser back navigation into a potentially stale course page.
- The "Open Assessment" card displays zero contextual information (no time limit, no attempt count, no due date) before the student commits to the navigation.

#### DEF-002 — Activity Completion Signal Gaps (Severity: Critical)

**Evidence**: `useActivityCompletion.ts:canMarkComplete`

```typescript
const canMarkComplete = useMemo(() => Boolean(
  vm.activity &&
  vm.permissions.isAuthenticated &&
  vm.permissions.canView &&
  !vm.state.isCourseEnd &&
  !vm.state.isAssessmentHandoff &&            // excludes exam/code/custom
  vm.activity.type !== 'TYPE_FILE_SUBMISSION', // excludes file submission
), [vm]);
```

Two of the six activity types with grading semantics (`TYPE_FILE_SUBMISSION` and every assessment-handoff type) are excluded from manual mark-complete. For assessment types, completion is supposed to come from the assessment service pipeline, but the pipeline fires trail invalidation from the assessment page while the activity page is unmounted. For file submissions, no completion trigger exists at all.

#### DEF-003 — Hollow Assessment Pre-flight (Severity: High)

**Evidence**: `ActivityContentRenderer.tsx:AssessmentHandoff`

The handoff screen shows only an icon, a generic title, and a button. The student has no knowledge of:
- Time limit
- Attempt limit and remaining attempts
- Due date and late penalty
- Required passing score
- Number of questions
- Whether they have a draft in progress

All of this data exists in the `AttemptViewModel` that `AssessmentLayout` fetches *after* the student navigates to the assessment page. The pre-flight information must be available *before* the navigation decision.

#### DEF-004 — File Submission UX Incomplete (Severity: High)

**Evidence**: `FileSubmissionActivity.tsx` (300 lines)

The file submission component is rendered inline (the correct approach) but is missing:
- Per-file upload progress tracking (no `XMLHttpRequest`/fetch progress events; fires a single mutation and shows a spinner on the whole card)
- Drag-and-drop with visual drop-zone highlight
- File preview and download for submitted files
- Submission receipt (timestamp, attempt number, immutable receipt ID)
- "Start revision" / "Replace files" actions for `RETURNED` submissions that are clearly distinct from the original upload flow
- Rubric display (the service returns `feedback.rubric` but the component never renders it)
- Graded result display (shows `is_late` badge but not `final_score` or `feedback` in a meaningful result card)

#### DEF-005 — Focus Mode as Fragile Side Channel (Severity: Medium)

**Evidence**: `activity.tsx` localStorage read/write + `FOCUS_MODE_CHANGE_EVENT` dispatch

Focus mode state is persisted in localStorage under `COURSE_ACTIVITY_FOCUS_MODE_STORAGE_KEY` and propagated via `window.dispatchEvent(new CustomEvent(FOCUS_MODE_CHANGE_EVENT, ...))`. This is consumed by the global navigation shell to collapse itself. If the nav component mounts after the event fires, or if the activity page unmounts before cleanup, the nav may be stuck in the wrong state. There is no SSR-safe initial state, causing a layout shift on hydration.

#### DEF-006 — Three-Column Layout Always On (Severity: Medium)

**Evidence**: `activity.tsx:StudentActivityPageShell` grid layout

The `lg:grid-cols-[16rem_minmax(0,1fr)] xl:grid-cols-[18rem_minmax(0,1fr)_19rem]` layout is applied unconditionally for non-reading-mode views. For assessment activities that currently redirect, the right action panel shows nothing useful (it only has a "Focus Mode" button and no primary action). This wastes 19rem of horizontal space.

#### DEF-007 — Mobile Workflow Underspecified (Severity: Medium)

**Evidence**: `ActivityMobileActionBar` exists but has no assessment-type-aware actions.

On mobile, assessment activities show only Previous/Next navigation buttons and a generic status label. The mobile bar has no "Start Exam", "Continue Draft", or "View Results" actions for graded activities.

#### DEF-008 — Design Token Inconsistency (Severity: Low)

**Evidence**: scattered across `FileSubmissionActivity.tsx`, `ExamAttemptContent.tsx`

Hardcoded `bg-gray-50`, `text-neutral-600`, `rounded-full`, inline `className="text-emerald-600"` appear throughout graded activity components. These must use semantic design tokens (`bg-muted`, `text-muted-foreground`, `text-success`) for light/dark theme consistency.

---

### 1.2 Legacy Artifacts Confirmed Present

| Artifact | Location | Status |
|---|---|---|
| `TYPE_ASSIGNMENT` DB rows | `activity` table | Migration `f1c2d3e4a5b6` converts to `TYPE_FILE_SUBMISSION` — **must be applied** |
| Legacy assignment tables | `assignment`, `assignmenttask`, etc. | Migration `f1c2d3e4a5b6` drops them — **must be applied** |
| `assignment_uuid`/`assignment_id` metadata keys | `submission.metadata_json` | Migration `f1c2d3e4a5b6` strips them — **must be applied** |
| `AssessmentHandoff` component | `ActivityContentRenderer.tsx` | **Delete** |
| `isAssessmentHandoff` state field | `activity-view-model.ts` | **Delete** |
| `assessmentUrl` state field | `activity-view-model.ts` | **Delete** |
| `canMarkComplete` assessment exclusions | `useActivityCompletion.ts` | **Rewrite** |

---

## 2. Product North Star

A world-class LMS activity page answers four questions **without the student searching**:

1. **Where am I?** — Course title, chapter, activity position, progress percentage.
2. **What is this?** — Activity type, instructions, requirements, constraints (time, attempts, due).
3. **What is my status?** — Not started / In progress / Submitted / Graded / Passed.
4. **What do I do next?** — A single, unambiguous primary action at all times.

**Principles:**
- **One URL, one context.** The student never loses the course context during an activity. Exams take over the viewport, not the URL.
- **Status is the source of truth.** The right-panel action card always derives from server state; never from client-fabricated logic.
- **Completion is automatic for graded work.** Students should not manually mark graded activities complete. The pipeline handles it.
- **Every activity type owns its own surface.** No shared "assessment handoff" indirection.

---

## 3. Architecture Decision Records

### ADR-001 — Assessment Inline with Focus Takeover (Replaces DEF-001)

**Decision**: Assessments (`TYPE_EXAM`, `TYPE_CODE_CHALLENGE`, `TYPE_CUSTOM`) render inline on the canonical activity page URL. The activity page has three visual states:

| State | Layout |
|---|---|
| `ENTRY` | Standard 3-column activity layout. Right panel shows `AttemptEntryCard`. Left outline visible. |
| `ACTIVE_ATTEMPT` | Content area expands full-width. Left outline is replaced by question/task navigator (exam) or task tree (code). Right panel becomes save/submit controls. Header collapses to breadcrumb + timer. |
| `RESULT` | Standard 3-column activity layout. Content shows scored result card. Right panel shows next-activity CTA. |

The `/assessments/[uuid]` standalone route becomes a **server-side redirect** to `/course/{courseUuid}/activity/{activityUuid}`. If `course_uuid` or `activity_uuid` is unavailable on the assessment record, the standalone shell is preserved as a graceful fallback with a course-context breadcrumb.

**Rationale**: This mirrors Coursera's modal-in-place exam model. The student never loses breadcrumb or progress context. URL canonicality enables sharing, back-navigation, and server-side metadata. Focus takeover is a layout transition, not a navigation event.

### ADR-002 — Auto-Grade → Immediate PUBLISHED (Confirms User Answer)

**Decision**: When `grading_mode = AUTO` and the auto-grader produces a complete score (no `needs_manual_review`), the submission pipeline sets `status = PUBLISHED` directly. The `recommendedAction` becomes `viewResult` immediately after submit.

For `grading_mode = AUTO_THEN_MANUAL` (partially auto-gradeable, open-text items present), the submission is set to `GRADED` and the teacher queue is notified. Student sees "Awaiting teacher review" state.

**Backend change**: In `apps/api/src/services/grading/pipeline/persist.py`, the persist stage must check `grading_result.needs_manual_review` and `effective_policy.grading_mode`:
- `AUTO` + `!needs_manual_review` → `status = PUBLISHED`, `released_at = now()`
- All other cases → existing GRADED/PENDING logic

### ADR-003 — Code Challenge → Immediate Result (Confirms User Answer)

**Decision**: Judge0 scoring result is immediately visible to the student. The submission pipeline for `AssessmentType.CODE_CHALLENGE` always sets `status = PUBLISHED` after grading, regardless of `grading_mode` setting. Teachers can still leave feedback and override scores, but the initial result is always student-visible.

**Backend change**: In `submit_assessment_pipeline`, `CODE_CHALLENGE` type forces `status = PUBLISHED` after the grade stage.

### ADR-004 — File Submission Completion on Published Grade (Confirms User Answer)

**Decision**: The trail activity for `TYPE_FILE_SUBMISSION` advances to `COMPLETED` when the file submission attempt reaches `status = PUBLISHED` (teacher has graded and published). This is enforced in `apps/api/src/services/file_submissions.py:grade_file_submission_attempt` — when setting `PUBLISHED`, the service calls `progress_submissions.mark_activity_complete`.

**Completion rule**: `AssessmentCompletionRule.TEACHER_VERIFIED` semantics — teacher publish triggers completion. The `useActivityCompletion` hook does not expose a manual mark-complete button for file submission activities.

### ADR-005 — Standalone `/assessments/[uuid]` Route Becomes a Redirect

**Decision**: `apps/web/src/app/[locale]/(platform)/(withmenu)/assessments/[assessmentUuid]/page.tsx` becomes a redirect-only server component. It fetches the assessment record's `activity_uuid` + `course_uuid` and issues a Next.js `redirect()` to the canonical activity URL. If either field is null (orphaned assessment), it renders a minimal assessment shell with a course title header.

**Benefit**: All inbound links (teacher-shared, deep-links, email notifications) transparently resolve to the canonical course context.

---

## 4. Target Student Workflow

### 4.1 Activity Page — Single Canonical Shell

**Route**: `/[locale]/course/[courseuuid]/activity/[activityid]`  
**File**: `apps/web/src/app/_shared/withmenu/course/[courseuuid]/activity/[activityid]/activity.tsx` (full rewrite)

#### Layout Architecture

```
┌─ ActivityPageShell ──────────────────────────────────────────────────────────┐
│ ┌─ ActivityHeader (sticky, top-14, z-30) ──────────────────────────────────┐ │
│ │  Breadcrumb: Course / Chapter  ·  Activity Title  ·  StatusBadge         │ │
│ │  Progress: [━━━━━━━━━░░] 12/20  ·  [Focus ▣]  ·  [Outline ≡ mobile]     │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
│                                                                               │
│ [STANDARD MODE]                 [ACTIVE_ATTEMPT MODE]                        │
│ ┌ OutlineNav ─┐ ┌─ Content ──┐ ┌─────────────────────┐ ┌─ ActionPanel ─┐   │
│ │ Chapter 1   │ │            │ │                       │ │               │   │
│ │  ✓ Act 1    │ │  Type-     │ │   Assessment          │ │  Save/Submit  │   │
│ │  ● Act 2    │ │  specific  │ │   Attempt             │ │  Controls     │   │
│ │  ○ Act 3    │ │  content   │ │   Content             │ │               │   │
│ └─────────────┘ └────────────┘ └─────────────────────┘ └───────────────┘   │
│                                                                               │
│ ┌─ MobileActionBar (fixed bottom, visible on mobile) ─────────────────────┐ │
│ │  [← Prev]  [Primary Action CTA]  [Next →]                               │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────┘
```

#### Layout Mode Transitions

| `ActivityLayoutMode` | Trigger | Outline | Content | Right Panel |
|---|---|---|---|---|
| `CONTENT` | activity loaded, non-assessment | Visible (lg+) | Full-width content | Status + nav |
| `PREFLIGHT` | assessment loaded, not started | Visible (lg+) | `AttemptEntryCard` | Attempt CTA |
| `ACTIVE_ATTEMPT` | student clicks Start | Collapsed → Question nav | Full-width attempt shell | Save/Submit bar |
| `RESULT` | submission becomes PUBLISHED | Visible (lg+) | `AttemptResultCard` | Next activity CTA |

Mode is owned by `ActivityLayoutContext` (a new React context), not by localStorage. It is derived from the `recommendedAction` value in the `AttemptViewModel`.

#### Content Router

`ActivityContentRenderer` replaces `AssessmentHandoff` with proper per-type renderers:

```typescript
switch (activity.activity_type) {
  case 'TYPE_DYNAMIC':      return <DynamicPageContent />;
  case 'TYPE_VIDEO':         return <VideoContent />;
  case 'TYPE_DOCUMENT':      return <DocumentContent />;
  case 'TYPE_FILE_SUBMISSION': return <FileSubmissionContent />;
  case 'TYPE_EXAM':          return <AssessmentContent kind="TYPE_EXAM" />;
  case 'TYPE_CODE_CHALLENGE': return <AssessmentContent kind="TYPE_CODE_CHALLENGE" />;
  case 'TYPE_CUSTOM':        return <AssessmentContent kind="TYPE_CUSTOM" />;
}
// No "AssessmentHandoff". No redirects. No orphaned routes.
```

### 4.2 Per Activity Type — Target Experience

#### TYPE_DYNAMIC (Tiptap interactive page)

- Renders `InteractiveViewer` in `max-w-4xl` centered column.
- Right panel: status ("reading"), mark-complete button, AI ask, focus mode.
- Completion: manual mark-complete, or auto on scroll-to-end for short pages (configurable).

#### TYPE_VIDEO

- Renders `VideoActivity` with proper 16:9 aspect container (`aspect-video w-full`).
- Sidebar outline collapses to a narrower width (`14rem`) to give video more space.
- Right panel: progress tracking (watched percentage), mark-complete at 80% watched, notes.
- Completion: auto at 80% watch time OR manual.

#### TYPE_DOCUMENT

- Renders `DocumentPdfActivity` in `min-h-[75vh]` container.
- PDF fills available width. No border/card wrapper (the PDF reader IS the content).
- Right panel: page counter, mark-complete, download.
- Completion: manual.

#### TYPE_FILE_SUBMISSION

Renders `FileSubmissionWorkspace` (rewritten — see §4.3).

#### TYPE_EXAM / TYPE_CODE_CHALLENGE / TYPE_CUSTOM

Renders `InlineAssessmentWorkspace` (new component — see §4.4).

---

### 4.3 File Submission Workspace (Full Rewrite)

**Component**: `apps/web/src/features/file-submissions/student/FileSubmissionWorkspace.tsx`

#### States and their UI

**`PREFLIGHT`** (no attempt, or first load):
```
┌─ Instructions Card ─────────────────────────────────────────────┐
│  [Lifecycle badge]  [Status badge]                               │
│  Full teacher instructions (prose formatted)                     │
│  Supporting attachments (teacher-uploaded)                       │
└──────────────────────────────────────────────────────────────────┘
┌─ Requirements Strip ────────────────────────────────────────────┐
│  📎 Max 3 files  ·  📄 PDF, DOCX  ·  💾 Max 10 MB  ·  📅 Due May 25 │
└──────────────────────────────────────────────────────────────────┘
┌─ Dropzone ──────────────────────────────────────────────────────┐
│  [  ↓ Drop files here or browse  ]                              │
│  Drag active: border highlights in primary color                 │
└──────────────────────────────────────────────────────────────────┘
```

**`DRAFT`** (attempt started, files being managed):
```
┌─ File List ─────────────────────────────────────────────────────┐
│  📄 report.pdf     2.1 MB   [████████░░] 80%  [✕]              │
│  📄 appendix.docx  1.4 MB   [██████████] ✓ Uploaded  [✕]      │
│  [+ Add more]                                                    │
└──────────────────────────────────────────────────────────────────┘
┌─ Actions ───────────────────────────────────────────────────────┐
│  [Save draft]  [Submit for grading →]                           │
└──────────────────────────────────────────────────────────────────┘
```

**`SUBMITTED`** (attempt.status = SUBMITTED or PENDING):
```
┌─ Submission Receipt ────────────────────────────────────────────┐
│  ✅ Submitted · Attempt 1 · May 18 2026, 14:22                  │
│  Receipt ID: fsub_01HX...                                        │
│  Files: report.pdf, appendix.docx                               │
│  [Late badge if applicable]                                      │
└──────────────────────────────────────────────────────────────────┘
┌─ Status ───────────────────────────────────────────────────────-┐
│  ⏳ Awaiting teacher review                                      │
└──────────────────────────────────────────────────────────────────┘
```

**`GRADED`** (attempt.status = PUBLISHED):
```
┌─ Result Card ───────────────────────────────────────────────────┐
│  Score: 87/100   [Late deduction: -5]   Final: 82/100           │
│  ─────────────────────────────────────────────────────────      │
│  Rubric breakdown (if rubric was set)                           │
│  Teacher feedback: "Good analysis, improve conclusion..."        │
└──────────────────────────────────────────────────────────────────┘
```

**`RETURNED`** (attempt.status = RETURNED):
```
┌─ Returned for Revision ─────────────────────────────────────────┐
│  🔁 Teacher returned this submission                             │
│  Feedback: "Please attach the source code as well."             │
│  [Start revision →]  (opens new draft, carries over old files)  │
└──────────────────────────────────────────────────────────────────┘
```

#### Upload Implementation Requirements

- Use `XMLHttpRequest` with `upload.onprogress` for per-file progress tracking. Do **not** use `fetch` (no progress API).
- Maintain `UploadSlot[]` state: `{ id, file, status: 'queued'|'uploading'|'done'|'error', progress: 0..100, upload_uuid? }`.
- Chunked upload flow: `POST /uploads/chunked/init` → `PUT /uploads/chunked/{uuid}/chunks/{n}` → `POST /uploads/chunked/{uuid}/finalize`.
- File validation runs client-side before queuing: mime type, file size, slot count.
- Drag-and-drop: `onDragOver` sets `isDragOver` state for visual highlight; `onDrop` runs validation and adds to queue.
- Accessibility: hidden `<input type="file">` triggered by visible button and drag zone; keyboard-reachable dropzone via `tabIndex=0` + `onKeyDown`.

#### Completion Wiring

After `gradeFileSubmissionAttempt` sets `status = PUBLISHED` on the backend, the service calls `progress_submissions.mark_activity_complete`. The frontend `FileSubmissionWorkspace` listens for `status = PUBLISHED` in the query response and calls `queryClient.invalidateQueries(queryKeys.trail.current())` to update the course progress bar.

---

### 4.4 Inline Assessment Workspace

**Component**: `apps/web/src/features/assessments/shell/InlineAssessmentWorkspace.tsx`

This component replaces `AssessmentHandoff` and wraps `AssessmentLayout` within the activity page. It receives the `activityUuid` and `courseUuid` from the activity page and does **not** need the standalone `/assessments/[uuid]` route.

#### State Machine

```
PREFLIGHT → ACTIVE_ATTEMPT → (submit) → RESULT
                                      → (return) → ACTIVE_ATTEMPT
```

The active state is derived from `AttemptViewModel.recommendedAction`:

| `recommendedAction` | Rendered state |
|---|---|
| `start` | `PREFLIGHT` |
| `continueDraft` | `ACTIVE_ATTEMPT` |
| `submit` | `ACTIVE_ATTEMPT` |
| `waitForRelease` | `RESULT` (pending state) |
| `viewResult` | `RESULT` |
| `startRevision` | `PREFLIGHT` (with revision context) |
| `noAction` / `blocked` | `PREFLIGHT` (blocked state) |

#### PREFLIGHT — AttemptEntryCard

A pre-flight card rendered inside the activity's content area. Shows:

```
┌─ Assessment Entry Card ─────────────────────────────────────────┐
│  [Kind label]  [Lifecycle badge]  [Due badge]                   │
│  ─────────────────────────────────────────────────────────────  │
│  📋 15 questions   ⏱ 45 min time limit   🔄 2 attempts left    │
│  ─────────────────────────────────────────────────────────────  │
│  [Returned notice if applicable]                                 │
│  [Anti-cheat notice if applicable]                               │
│  ─────────────────────────────────────────────────────────────  │
│         [ Begin Assessment → ]  (primary, full-width)           │
│         or [ Continue Draft → ] if draft exists                 │
└──────────────────────────────────────────────────────────────────┘
```

Previous attempts list appears below the entry card (collapsible).

#### ACTIVE_ATTEMPT — Layout Takeover

When the student clicks "Begin", the `ActivityLayoutContext` transitions to `ACTIVE_ATTEMPT`:

1. Left outline (`OutlineNav`) is replaced by the kind's `QuestionNav` (exam question navigator) or `TaskTree` (code challenge).
2. Content area expands to fill the remaining space (`minmax(0, 1fr)` without right sidebar).
3. Right panel becomes the kind's save/submit controls bar.
4. `AssessmentChrome` renders a collapsed breadcrumb header with timer.
5. The global page header (`top-14` nav) is signalled to hide or collapse via `ActivityLayoutContext` (no localStorage, no window events).

This is a **CSS layout transition only**, not a page navigation. The URL stays at `/course/{uuid}/activity/{activityid}`.

#### RESULT — AttemptResultCard

After submission, `recommendedAction = viewResult`:

```
┌─ Result Card ───────────────────────────────────────────────────┐
│  Score: 78%  [Passed ✓]  Submitted May 18 · Attempt 1 of 3     │
│  ─────────────────────────────────────────────────────────────  │
│  Review answers breakdown (per-item for auto-graded)            │
│  Teacher feedback (if any)                                       │
│  ─────────────────────────────────────────────────────────────  │
│  [ Retry (1 attempt remaining) ]  [ Next Activity → ]           │
└──────────────────────────────────────────────────────────────────┘
```

The right panel shows the `NextActivityPanel` (course context restored).

---

### 4.5 Activity Right Panel (ActionPanel) — Rewrite

**Component**: `apps/web/src/app/_shared/withmenu/course/[courseuuid]/activity/[activityid]/ActivityActionPanel.tsx`

The right panel is always **status-first**. It knows the activity type and renders appropriate actions:

| Activity Type | PREFLIGHT | ACTIVE | SUBMITTED | GRADED |
|---|---|---|---|---|
| DYNAMIC / VIDEO / DOCUMENT | Mark complete | — | — | — |
| FILE_SUBMISSION | — | Save draft / Submit | Awaiting review | View result / Next |
| EXAM / CODE / CUSTOM | Start / Continue | — (save controls in content area) | Awaiting / View result | View result / Retry / Next |

The panel always includes:
- Status section: badge, timestamp, score (when available)
- Primary action: one clearly primary `Button size="lg"` 
- Navigation: Prev / Next with activity titles
- Support: AI Ask (contextual to type)

---

### 4.6 Activity Header — Rewrite

The sticky header must be minimal during `ACTIVE_ATTEMPT` and informative otherwise:

**Standard mode**:
```
[Course Title / Chapter]  |  Activity Name  [Status badge]
[━━━━━━━━━━━░░░░░] 12/20 completed
```

**Active attempt mode**:
```
[← Back to Course]  |  Exam: Title  |  [⏱ 42:15]  [Save state ●]
```

The header uses `ActivityLayoutContext.mode` to conditionally render the progress bar and show the timer when in `ACTIVE_ATTEMPT`.

---

### 4.7 Mobile Workflow

**Mobile breakpoint**: below `lg` (1024px).

| Element | Mobile implementation |
|---|---|
| OutlineNav | Removed from layout; accessible via Sheet (drawer) triggered by `≡` button in header |
| ActionPanel | Removed from layout; primary actions exposed in bottom bar |
| MobileActionBar | Full redesign: `[← Prev] [PRIMARY CTA] [Next →]`, with status badge above |
| ACTIVE_ATTEMPT | Full-screen takeover; timer in header; question nav as a bottom sheet |
| File Dropzone | Full-width, touch-friendly; file picker triggered by large tap target |

The mobile bottom bar shows:
- `TYPE_DYNAMIC/VIDEO/DOCUMENT`: `[Mark Complete]` or `[Completed ✓]`
- `TYPE_FILE_SUBMISSION`: dynamic based on state: `[Upload Files]` → `[Submit]` → `[Awaiting]` → `[View Grade]`
- Assessment types: `[Start Exam]` → `[Q 3/15 Save]` → `[View Score]`

---

## 5. Target Teacher Workflow

### 5.1 Review Entry Points

Teachers access the review workspace via:

1. **Course Editor → Activity → Review tab**: `/editor/course/[id]/activity/[uuid]?tab=review`  
   Same URL as authoring, tab-switched to the `GradingReviewWorkspace`.

2. **Gradebook → Click student cell**: `/editor/course/[id]/gradebook?submission=[uuid]`  
   Deep-links into `GradingReviewWorkspace` with the submission pre-selected.

3. **Notification / email link**: `/assessments/[uuid]?review=[submissionUuid]`  
   Server-side redirect resolves to the editor activity review tab with submission pre-selected (ADR-005 extension for teacher links).

### 5.2 GradingReviewWorkspace — Completion Requirements

The workspace currently lacks:
- **Keyboard navigation**: Tab through submission list, `Enter` to open, `G` to focus grade input, `Enter` to save — must be added.
- **Bulk publish**: `ReviewBulkActionBar` exists; ensure it handles partial failure gracefully (shows per-submission error, not a toast then silent data loss).
- **File preview**: For `TYPE_FILE_SUBMISSION` reviews, files must open in an inline viewer (PDF.js iframe, image lightbox) without a new tab.
- **Rubric grading**: Rubric criteria from `FileSubmissionActivity.instructions` must render as a scoring grid in `GradeForm`.

### 5.3 File Submission Review (Dedicated Workspace)

The `FileSubmissionReviewWorkspace` (already started) must be completed:

- Submission list: shows attempt number, submitted_at, is_late, file count, score (if graded).
- Detail panel: all files with download and inline preview. Score input, feedback textarea, rubric criteria grid.
- Actions: `GRADED` (save, not visible), `PUBLISHED` (visible to student), `RETURNED` (send back for revision).
- Bulk download: ZIP of all files for selected submissions.
- CSV export: one row per submission with score, late status, feedback.

---

## 6. Frontend Rewrite Specification

### 6.1 Files to Delete (No Wrapping, No Porting)

| File | Reason |
|---|---|
| `ActivityContentRenderer.tsx:AssessmentHandoff` function | Replaced by `InlineAssessmentWorkspace` |
| `activity-view-model.ts:state.isAssessmentHandoff` | Dead after inline assessment |
| `activity-view-model.ts:state.assessmentUrl` | Dead after inline assessment |
| `apps/web/src/app/[locale]/(platform)/(withmenu)/assessments/[assessmentUuid]/AssessmentAttemptClient.tsx` | Route becomes redirect |

### 6.2 Files to Create

| File | Purpose |
|---|---|
| `features/assessments/shell/InlineAssessmentWorkspace.tsx` | Inline assessment shell (PREFLIGHT / ACTIVE / RESULT) |
| `features/assessments/shell/AttemptEntryCard.tsx` | Pre-flight card with metrics and start action |
| `features/assessments/shell/AttemptResultCard.tsx` | Post-submit result card |
| `features/assessments/shell/ActivityLayoutContext.tsx` | Layout mode context (`CONTENT`/`PREFLIGHT`/`ACTIVE_ATTEMPT`/`RESULT`) |
| `features/file-submissions/student/FileSubmissionWorkspace.tsx` | Full rewrite of file submission UX |
| `features/file-submissions/student/FileUploadSlot.tsx` | Per-file upload progress row |
| `features/file-submissions/student/FileSubmissionReceipt.tsx` | Submission receipt card |
| `features/file-submissions/student/FileSubmissionResult.tsx` | Graded result + rubric card |
| `app/_shared/withmenu/course/[courseuuid]/activity/[activityid]/ActivityActionPanel.tsx` | Rewritten status-first right panel |

### 6.3 Files to Rewrite

| File | What changes |
|---|---|
| `activity.tsx` | Remove focus mode side channel; adopt `ActivityLayoutContext`; new grid layout |
| `ActivityContentRenderer.tsx` | Delete `AssessmentHandoff`; add `InlineAssessmentWorkspace` branches |
| `activity-view-model.ts` | Remove `isAssessmentHandoff` + `assessmentUrl`; add `layoutMode` derivation |
| `useActivityCompletion.ts` | Remove exclusions; completion for file submission wired via query status |
| `apps/web/src/app/[locale]/(platform)/(withmenu)/assessments/[assessmentUuid]/page.tsx` | Server-side redirect only |

### 6.4 `ActivityLayoutContext`

```typescript
// features/assessments/shell/ActivityLayoutContext.tsx
export type ActivityLayoutMode = 'CONTENT' | 'PREFLIGHT' | 'ACTIVE_ATTEMPT' | 'RESULT';

interface ActivityLayoutContextValue {
  mode: ActivityLayoutMode;
  setMode: (mode: ActivityLayoutMode) => void;
}

export const ActivityLayoutContext = createContext<ActivityLayoutContextValue>({
  mode: 'CONTENT',
  setMode: () => {},
});
```

The `StudentActivityPageShell` wraps children in `ActivityLayoutContext.Provider`. The grid classes on `<main>` derive from `mode`:

```typescript
const gridClass = {
  CONTENT:       'lg:grid-cols-[16rem_minmax(0,1fr)] xl:grid-cols-[16rem_minmax(0,1fr)_20rem]',
  PREFLIGHT:     'lg:grid-cols-[16rem_minmax(0,1fr)] xl:grid-cols-[16rem_minmax(0,1fr)_20rem]',
  ACTIVE_ATTEMPT:'grid-cols-1',                  // full-width, outline replaced by kind nav
  RESULT:        'lg:grid-cols-[16rem_minmax(0,1fr)] xl:grid-cols-[16rem_minmax(0,1fr)_20rem]',
}[mode];
```

`InlineAssessmentWorkspace` calls `setMode('ACTIVE_ATTEMPT')` when the attempt starts and `setMode('RESULT')` when `recommendedAction === 'viewResult'`.

### 6.5 `InlineAssessmentWorkspace` Implementation

```typescript
// features/assessments/shell/InlineAssessmentWorkspace.tsx
interface InlineAssessmentWorkspaceProps {
  activityUuid: string;
  courseUuid: string;
  kind: AssessmentKind;
}

export function InlineAssessmentWorkspace({ activityUuid, courseUuid, kind }: InlineAssessmentWorkspaceProps) {
  const { setMode } = useContext(ActivityLayoutContext);
  const assessment = useAssessmentAttemptData(activityUuid);
  const vm = assessment.vm?.surface === 'ATTEMPT' ? assessment.vm : null;

  // Derive layout mode from recommendedAction
  useEffect(() => {
    if (!vm) return;
    const action = vm.recommendedAction;
    if (action === 'continueDraft' || action === 'submit') {
      setMode('ACTIVE_ATTEMPT');
    } else if (action === 'viewResult' || action === 'waitForRelease') {
      setMode('RESULT');
    } else {
      setMode('PREFLIGHT');
    }
  }, [vm?.recommendedAction, setMode]);

  if (!vm) return <AssessmentLoadingSkeleton />;

  switch (vm.recommendedAction) {
    case 'start':
    case 'startRevision':
    case 'blocked':
    case 'noAction':
      return <AttemptEntryCard vm={vm} courseUuid={courseUuid} />;

    case 'continueDraft':
    case 'submit':
      return <AssessmentLayout activityUuid={activityUuid} courseUuid={courseUuid} vm={vm} />;

    case 'viewResult':
    case 'waitForRelease':
      return <AttemptResultCard vm={vm} courseUuid={courseUuid} />;
  }
}
```

### 6.6 Design Token Audit

All graded activity components must use only semantic tokens. Replace:

| Hardcoded | Semantic token |
|---|---|
| `bg-gray-50` | `bg-muted` |
| `bg-gray-100` | `bg-muted/60` |
| `text-neutral-600` | `text-muted-foreground` |
| `text-neutral-500` | `text-muted-foreground` |
| `text-emerald-600` | `text-success` (add to design system if missing) or `text-green-600` scoped to `[.dark_&]:text-green-400` |
| `border-gray-200` | `border-border` |
| `rounded-full` pill | `rounded-md` (use `Badge` component instead of ad-hoc pills) |

### 6.7 i18n Requirements

New components must source all user-visible strings from the `next-intl` message catalog. No inline English strings. New namespace: `Features.ActivityWorkspace.*`.

---

## 7. Backend Changes

### 7.1 Grading Pipeline — AUTO mode immediate PUBLISHED (ADR-002)

**File**: `apps/api/src/services/grading/pipeline/persist.py`

After `grade_attempt()` returns a `GradingResult`, the persist stage must:

```python
from src.db.grading.submissions import SubmissionStatus
from src.db.grading.progress import AssessmentGradingMode

def _resolve_post_grade_status(
    grading_mode: AssessmentGradingMode,
    needs_manual_review: bool,
    assessment_type: AssessmentType,
) -> SubmissionStatus:
    if assessment_type == AssessmentType.CODE_CHALLENGE:
        return SubmissionStatus.PUBLISHED  # ADR-003: always immediate
    if grading_mode == AssessmentGradingMode.AUTO and not needs_manual_review:
        return SubmissionStatus.PUBLISHED  # ADR-002: immediate for pure auto
    return SubmissionStatus.GRADED         # teacher publish required
```

When `status = PUBLISHED`, also set:
- `submission.released_at = datetime.now(UTC)`
- Call `progress_submissions.mark_activity_complete(db_session, activity_id, user_id)` within the same transaction.

### 7.2 File Submission Service — Completion on Publish (ADR-004)

**File**: `apps/api/src/services/file_submissions.py:grade_file_submission_attempt`

```python
if payload.status == "PUBLISHED":
    attempt.status = "PUBLISHED"
    attempt.graded_at = datetime.now(UTC)
    # Mark the course trail activity complete
    from src.services.progress import submissions as progress_submissions
    progress_submissions.mark_activity_complete(
        db_session, file_submission.activity_id, attempt.user_id
    )
```

### 7.3 Assessment Route — Redirect (ADR-005)

The existing assessment API endpoint `GET /assessments/{uuid}` already returns `activity_uuid` and `course_uuid`. No backend change needed. The frontend server page handles the redirect.

The `AssessmentAttemptPage` at `/assessments/[assessmentUuid]/page.tsx`:

```typescript
export default async function AssessmentAttemptPage(props: Props) {
  const { assessmentUuid } = await props.params;
  const assessment = await fetchAssessment(assessmentUuid);

  if (!assessment) notFound();

  // Redirect to canonical course activity URL
  if (assessment.activity_uuid && assessment.course_uuid) {
    const activityClean = assessment.activity_uuid.replace(/^activity_/, '');
    const courseClean = assessment.course_uuid.replace(/^course_/, '');
    redirect(`/course/${courseClean}/activity/${activityClean}`);
  }

  // Fallback: orphaned assessment with no course context
  const initialSession = await getSession();
  if (!initialSession) redirect(`/auth/login?callbackUrl=/assessments/${assessmentUuid}`);
  return <StandaloneAssessmentFallback activityUuid={assessment.activity_uuid} courseUuid="" />;
}
```

### 7.4 Anti-Cheat: Remove localStorage Side Channel

The global nav collapse currently listens for `FOCUS_MODE_CHANGE_EVENT` from localStorage. Replace with server-rendered layout context. The `ACTIVE_ATTEMPT` mode instructs the root layout to apply `data-layout-mode="attempt"` which CSS targets to hide the nav:

```css
[data-layout-mode="attempt"] #global-nav { display: none; }
```

`ActivityLayoutContext` propagates `mode` upward to the root layout via `useLayoutEffect` + `document.documentElement.dataset.layoutMode`. No custom events. No localStorage.

---

## 8. Legacy Removal

### 8.1 Database Migrations (Required Before Deployment)

The following migration must be applied and verified before frontend deployment:

**Migration `f1c2d3e4a5b6_purge_legacy_assignment_artifacts`** (already written):
- Converts all `TYPE_ASSIGNMENT` activities to `TYPE_FILE_SUBMISSION` 
- Strips legacy metadata keys from `submission.metadata_json`
- Drops tables: `assignmenttasksubmission`, `assignmentusersubmission`, `assignmenttask`, `assignment_task`, `assignment`

**Verification query post-migration**:
```sql
SELECT COUNT(*) FROM activity WHERE activity_type = 'TYPE_ASSIGNMENT';
-- Must return 0

SELECT table_name FROM information_schema.tables 
WHERE table_name IN ('assignment', 'assignmenttask', 'assignmenttasksubmission');
-- Must return 0 rows
```

### 8.2 Backend Code to Remove

| Location | What to remove |
|---|---|
| `apps/api/src/db/assessments.py` | `ItemKind.FILE_UPLOAD`, `FileUploadItemBody`, `FileUploadItemAnswer` (if still present) |
| `apps/api/src/services/grading/registry.py` | `AssessmentType.ASSIGNMENT` grader entry (if present) |
| `apps/api/migrations/versions/x4y5z6a7b8c9_backfill_assignment_submissions.py` | Do not delete (historical record), but ensure `down_revision` chain is correct |

### 8.3 Frontend Code to Remove

| Component / Module | Action |
|---|---|
| `ActivityContentRenderer.tsx:AssessmentHandoff` | **Delete function and its return site** |
| `activity-view-model.ts:state.isAssessmentHandoff` | **Delete field** |
| `activity-view-model.ts:state.assessmentUrl` | **Delete field** |
| `useActivityCompletion.ts` exclusion conditions | **Delete the two exclusion guards** |
| `apps/web/src/app/[locale]/(platform)/(withmenu)/assessments/[assessmentUuid]/AssessmentAttemptClient.tsx` | **Delete file** |
| `COURSE_ACTIVITY_FOCUS_MODE_STORAGE_KEY` localStorage usage | **Delete from `activity.tsx`**; replace with `ActivityLayoutContext` |
| `FOCUS_MODE_CHANGE_EVENT` dispatch/listener | **Delete from `activity.tsx`** and wherever consumed in the global layout |

### 8.4 Frontend Code to Verify (No Silent Ports)

Search for these patterns and confirm no surviving references post-rewrite:

```
grep -r "AssessmentHandoff" apps/web/src
grep -r "isAssessmentHandoff" apps/web/src
grep -r "assessmentUrl" apps/web/src
grep -r "/assessments/" apps/web/src/features  # should only appear in redirect page
grep -r "FOCUS_MODE_CHANGE_EVENT" apps/web/src
grep -r "TYPE_ASSIGNMENT" apps/web/src
```

---

## 9. Execution Phases

### Phase 0 — Foundation (No User-Visible Change)

**Goal**: Clean slate. Apply DB migration, remove dead code, establish new contexts.

1. Apply migration `f1c2d3e4a5b6` to production DB. Verify post-migration queries.
2. Create `ActivityLayoutContext` with `mode` and `setMode`.
3. Delete `AssessmentHandoff` from `ActivityContentRenderer` — replace the branch with `<InlineAssessmentWorkspace>` that renders a `<LoadingFallback>` stub until Phase 1.
4. Delete `isAssessmentHandoff` and `assessmentUrl` from `activity-view-model.ts`.
5. Delete `useActivityCompletion` exclusion guards; rewrite completion hook (file submission completion via query watch, assessment completion via trail invalidation from the inline component).
6. Replace `FOCUS_MODE_CHANGE_EVENT` / localStorage mechanism with `ActivityLayoutContext.mode` → `data-layout-mode` on `document.documentElement`.

**Tests**: All existing unit and integration tests must pass. No new features yet.

### Phase 1 — Inline Assessment Shell

**Goal**: Exams, code challenges, and custom assessments render inline on the activity page.

1. Build `AttemptEntryCard` — derives all metrics from `AttemptViewModel`.
2. Build `AttemptResultCard` — shows score, breakdown, retry/next actions.
3. Build `InlineAssessmentWorkspace` — wires `recommendedAction` → layout mode.
4. Wire `ActivityLayoutContext.mode = ACTIVE_ATTEMPT` → CSS full-width grid + nav hide.
5. Convert `/assessments/[assessmentUuid]/page.tsx` to redirect-only.
6. E2E test: student opens exam activity → sees entry card → starts → completes → sees result → clicks next.
7. Delete `apps/web/src/app/[locale]/(platform)/(withmenu)/assessments/[assessmentUuid]/AssessmentAttemptClient.tsx`.

### Phase 2 — Grading Pipeline AUTO-PUBLISHED

**Goal**: Auto-graded exams and code challenges show results immediately.

1. Implement `_resolve_post_grade_status` in `persist.py`.
2. Add `progress_submissions.mark_activity_complete` call on PUBLISHED within transaction.
3. Update `submit_assessment_pipeline` for `CODE_CHALLENGE` to always resolve to PUBLISHED.
4. Integration test: submit all-CHOICE exam → `submission.status = PUBLISHED` → `AttemptResultCard` renders without page reload.

### Phase 3 — File Submission Workspace Rewrite

**Goal**: File submission is a first-class assignment dropbox.

1. Build `FileUploadSlot` with XHR progress.
2. Build `FileSubmissionWorkspace` with all five states (PREFLIGHT/DRAFT/SUBMITTED/GRADED/RETURNED).
3. Build `FileSubmissionReceipt` and `FileSubmissionResult`.
4. Wire backend `grade_file_submission_attempt` → `mark_activity_complete` on PUBLISHED.
5. Wire frontend query watch → trail invalidation on `status = PUBLISHED`.
6. E2E test: student uploads files → submits → teacher grades & publishes → student sees score → course progress advances.

### Phase 4 — Teacher Review Completion

**Goal**: Review workspace is production-quality.

1. Add keyboard navigation to `GradingReviewWorkspace` (submission list `↑↓`, grade input `G`, save `Enter`).
2. Add inline file preview to `FileSubmissionReviewWorkspace` (PDF.js iframe, image lightbox).
3. Add rubric grid to `GradeForm` for file submissions.
4. Verify bulk publish handles partial failures with per-submission error display.
5. Add teacher notification link resolution (ADR-005 extension: `/assessments/[uuid]?review=[submissionUuid]` redirects to editor review tab).

### Phase 5 — Mobile Workflow

**Goal**: All activity types are fully operable on mobile.

1. Rewrite `ActivityMobileActionBar` with state-aware primary CTA per activity type.
2. Implement question/task navigator as a bottom sheet for assessment `ACTIVE_ATTEMPT` on mobile.
3. File dropzone: make tap target full-width, ensure file picker opens correctly on iOS/Android.
4. Playwright mobile viewport tests for each activity type.

### Phase 6 — Design Token Audit and i18n

**Goal**: Zero hardcoded colors, zero inline English strings in rewritten components.

1. Audit all new and rewritten components for hardcoded color classes (see §6.6).
2. Add `text-success`/`text-warning` semantic tokens to the design system if missing.
3. Extract all user-visible strings to `messages/*.json` under `Features.ActivityWorkspace.*`.
4. Run `knip` to confirm no orphaned exports.

---

## Appendix A — Grading State Machine

```
DRAFT ──[student submit]──► PENDING ──[manual grading]──► GRADED ──[teacher publish]──► PUBLISHED
                                     └─[auto grading]────────────────────────────────►
PUBLISHED ──[teacher return]──► RETURNED ──[student resubmit]──► PENDING
```

AUTO mode with no `needs_manual_review`: `DRAFT → PUBLISHED` (single transition, same transaction).
CODE_CHALLENGE: always `DRAFT → PUBLISHED`.

---

## Appendix B — Activity Type → Completion Rule Matrix

| Activity Type | Who Triggers Completion | Mechanism |
|---|---|---|
| TYPE_DYNAMIC | Student (manual) | `markActivityAsComplete` API call |
| TYPE_VIDEO | Auto at 80% watch OR student (manual) | `markActivityAsComplete` |
| TYPE_DOCUMENT | Student (manual) | `markActivityAsComplete` |
| TYPE_FILE_SUBMISSION | Teacher (grade publish) | Pipeline: `mark_activity_complete` in `grade_file_submission_attempt` |
| TYPE_EXAM (AUTO grade) | Auto on submit | Pipeline: `mark_activity_complete` in `persist.py` when `PUBLISHED` |
| TYPE_EXAM (MANUAL grade) | Teacher (grade publish) | Pipeline: `mark_activity_complete` when teacher publishes |
| TYPE_CODE_CHALLENGE | Auto on submit | Pipeline: `mark_activity_complete` in `persist.py` always PUBLISHED |
| TYPE_CUSTOM | Configurable via `completion_rule` | Policy-driven in pipeline |

---

## Appendix C — Route Map After Rewrite

| Route | Purpose |
|---|---|
| `/course/[uuid]/activity/[activityid]` | **All** activity types, all states |
| `/assessments/[uuid]` | Server redirect → canonical activity URL |
| `/editor/course/[id]/activity/[uuid]` | Teacher authoring |
| `/editor/course/[id]/activity/[uuid]?tab=review` | Teacher review queue |
| `/editor/course/[id]/gradebook` | Course gradebook |

No student-facing routes exist under `/assessments/*` after Phase 1.
