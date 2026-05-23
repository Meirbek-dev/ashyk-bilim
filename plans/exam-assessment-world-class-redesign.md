# World-Class Exam & Assessment Redesign Plan

**Authored:** 2026-05-23  
**Scope:** Full-stack redesign of the TYPE_EXAM assessment system — authoring studio, student attempt runtime, teacher grading/review, and the supporting backend — targeting production quality that surpasses Coursera, Moodle, Stepik, and contemporary LMSes.

---

## Part 1 — Critical Audit of the Current Implementation

### 1.1 Studio (Teacher Authoring) — What Is Actually There

The studio has been partially built from a prior plan. The tab architecture exists (`GeneralSettingsTab`, `BuilderCanvasTab`, `PublishDashboardTab`, `AccessManagementTab`, `ResultsReviewTab`). However, deep inspection reveals that **the bones were laid but the flesh was never added**. Specific deficiencies:

| Layer | Component | Actual State | Critical Deficiency |
|---|---|---|---|
| **Studio Shell** | `AssessmentStudioWorkspace.tsx` | Thin wrapper that lazy-loads a kind module and renders a header | Header is functional but the tab bar lives entirely in `NativeItemStudio.tsx`; the workspace itself has no awareness of tab state, so deep-linking to a specific tab is impossible |
| **Studio Provider** | `NativeItemStudioProvider` | Provides basic data context | `validationIssues` are fetched but the mapping between issues and specific UI locations (which tab, which field, which option index) is incomplete — fixing an issue does not navigate the user anywhere |
| **Setup & Policies Tab** | `GeneralSettingsTab.tsx` | Has cards for Details, Timing, Result Review, Integrity Suite | (a) Title/description are plain `<Input>` / `<Textarea>` — zero rich text. (b) Time limit is a plain number input in minutes with no unit toggle and no visual sense of duration. (c) The Integrity Suite lists five toggles linearly but gives no composite score or "what does this mean for students?" preview. (d) No pass/fail threshold setting. (e) No grace period or late-submission window. (f) No "randomize question order" or "randomize option order" per-question toggles. (g) No grading scheme configuration (partial credit, penalty for wrong answer, bonus). |
| **Questions Builder Tab** | `BuilderCanvasTab.tsx` | Has DnD outline + selected-item editor + title/points fields | (a) The item body editor (`renderItemBodyEditor`) is a thin shell — the actual CHOICE editor in `items/choice/index.tsx` renders options as plain labeled inputs with a checkbox/radio, no visual card hierarchy or correct-answer celebration state. (b) The prompt is a plain `<Textarea>` — no Markdown, no LaTeX, no code block, no image embed. (c) No per-question settings inspector panel (explain-feedback text, tags, difficulty label, topic). (d) The right side of the canvas is empty; there is no inspector panel at all. (e) No "question bank" or "import from bank" mechanism. (f) OPEN_TEXT and FORM item kinds exist in the domain but have placeholder editors. (g) MATCHING items have no visual pairing UI — they are connected by plain `<Input>` fields. (h) No bulk operations on questions (select all, bulk delete, bulk move to another section). (i) No section/grouping concept within an exam. |
| **Access Management Tab** | `AccessManagementTab.tsx` | Tri-column layout, ALL_COURSE_LEARNERS vs RESTRICTED, user/group search | (a) The selected-users panel has no visual diff vs. eligible learners — no clear "added" vs "eligible" separation. (b) Student overrides (`StudentOverridesPanel.tsx`) for individual time extensions or extra attempts are buried in a separate panel with no direct connection from the user list. (c) No "copy access from another assessment" convenience action. (d) No bulk CSV import of student identifiers. |
| **Results Review Tab** | `ResultsReviewTab.tsx` | Shows four metric cards (submissions, needs review, avg score, pass rate) + 3 insight panels + link to review queue | (a) All metric cards show static numbers — no sparkline trend, no comparison to previous cohort. (b) The three insight panels are completely static text — no real data. Question quality analytics, pass rate by question, discrimination index — none of it is wired up. (c) "Open review queue" is just an external link — the tab is effectively a dead end. (d) No item-level analytics inline: which questions have highest error rate, which have near-zero variance. |
| **Publish Dashboard Tab** | `PublishDashboardTab.tsx` | Status banner, metrics, pre-flight checklist | (a) The checklist items link to the builder tab with `onSwitchToBuilder(itemUuid)` but the builder tab only selects the item — it does not focus the specific invalid field. (b) The schedule picker is a plain `datetime-local` input — no timezone display, no "publish in X hours" quick-pick. (c) No "preview as student" gate before publishing. (d) No change log / revision history. |

### 1.2 Student Attempt Runtime — What Is Actually There

| Component | Actual State | Critical Deficiency |
|---|---|---|
| `ExamAttemptContent.tsx` | One question at a time, progress bar, question grid nav, auto-save, timer, submit dialog | (a) **One-at-a-time rendering with no "scroll all" mode.** Many students prefer to scroll and flag questions for later — this is the industry-standard UX. (b) The progress bar shows `(currentIndex+1)/total` — it counts navigation position, not answered count. (c) Question navigation panel is a tiny 5-column grid — on a 50-question exam this is a wall of uniform buttons. (d) No question "flagging/bookmark" capability. (e) The recovery dialog is functional but visually alarming — it looks like an error rather than a helpful prompt. (f) The anti-cheat notice is a full-width alert banner that permanently takes screen real estate. (g) The submit confirmation dialog shows unanswered count but has no list of which specific questions are unanswered — student must hunt. (h) Timer is only visible in `AssessmentChrome` header and only as a `<Badge>` — no prominent countdown visual. |
| `ExamQuestionCard.tsx` | Card + question text + ChoiceItemAttempt | (a) Question text rendered as plain text — no Markdown, no LaTeX. This is a hard blocker for STEM exams. (b) No question-level flag/bookmark button. (c) No previous answer indicator when navigating back. |
| `ExamQuestionNavigation` (desktop/mobile) | Grid buttons (5-col) and prev/next mobile strip | No status differentiation: flagged ≠ answered ≠ current. Only two states: answered (blue tint) and current (filled). |
| `AssessmentChrome.tsx` | Header with kind label, title, description, timer badge, due-date badge, anti-cheat alert | Timer badge is tiny and non-animated; no urgency escalation beyond `destructive` variant at ≤60s. |
| `AssessmentActionBar.tsx` | Footer bar with save state, nav controls, submit button | The footer bar nav buttons (← →) duplicate the question grid — students press both interchangeably, creating confusion about which is canonical. |

### 1.3 Teacher Grading / Review Workspace

`GradingReviewWorkspace.tsx` has a solid tri-panel layout (submission list + inspector + grade form). The main weaknesses:

- No keyboard shortcut navigation between submissions (J/K for next/previous is table stakes in review UIs like GitHub PR reviews).
- No inline annotation on student answers (annotate a specific option choice, highlight a sentence in open-text response).
- No rubric builder for CHOICE questions (although auto-graded, teacher may want to award partial credit or override).
- The "Release control" concept exists in the UI but the implementation is a stub — you can't bulk-release a filtered set.
- No plagiarism / similarity detection even as a flag.
- No cohort comparison: "Student A scored 40 — here is where that ranks in the class."

### 1.4 Backend API — What Is Missing vs. What's There

The backend is well-structured (unified router, core service, policy/settings normalization). Gaps relevant to the redesign:

- **No item-bank / question pool endpoint** — items live exclusively inside one assessment, cannot be shared.
- **No per-item analytics endpoint** — there is a `GET /{uuid}/submissions/stats` aggregate but no per-item difficulty/discrimination index.
- **No exam sections endpoint** — the schema has no concept of grouped sections within an exam.
- **No exam duplication with item deep-copy** — `POST /{uuid}/duplicate` exists but its behavior for item bodies is unclear.
- **No AI-generation endpoint** — no way to generate questions from a topic prompt.
- **No image attachment endpoint for item body** — the file-upload infra exists (`file_submissions.py`) but is not plumbed into item bodies.
- **No student override bulk-create** — overrides exist for individual users but no bulk CSV import.

---

## Part 2 — Vision: What "World-Class" Actually Means

Competitive benchmark analysis:

| Platform | Authoring UX | Student UX | Analytics | Missing |
|---|---|---|---|---|
| **Coursera** | Good tab structure, quiz builder, video timestamps | One-at-a-time with flag; good timer; review screen | Basic pass rate | Rich text, question bank |
| **Canvas LMS** | Excellent question bank, groups, rich text prompt | "Scroll all" and one-at-a-time toggle; flag; prominent timer | SpeedGrader is industry-best | Modern aesthetics, real-time collab |
| **Moodle** | Powerful but visually overwhelming; all config on one page | Functional but dated; too many form elements | Good quiz analysis (Facility Index, Discrimination) | UX modernity |
| **Stepik** | Step editor with Markdown+LaTeX; tight integration with lessons | Clean one-at-a-time, good progress | Basic | Question bank, proctoring |
| **ProctorU/Examsoft** | Mediocre authoring | Focus on lockdown | Good violation logs | Authoring tools |

**Target:** Canvas-quality analytics + Coursera-quality clean UX + Stepik-quality content authoring + exceed all of them in:
1. Real-time collaborative authoring
2. Question bank with semantic search
3. AI-assisted question generation and review
4. Accessibility and keyboard-first workflows
5. Mobile-native attempt experience

---

## Part 3 — Redesigned Information Architecture

### 3.1 Studio Tab Bar (Revised)

The existing 5-tab structure is correct in concept but needs two more tabs and better internal layouts:

```
┌────────────────────────────────────────────────────────────────────────────────────┐
│ [←] Courses > Course Name > Midterm Exam          [Draft ▾]  [Preview] [⋯]        │
├────────────────────────────────────────────────────────────────────────────────────┤
│  ⚙ Setup   │  📝 Builder  │  👥 Access   │  📊 Results   │  🚀 Publish            │
├────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                    │
│                     [TAB CONTENT — see per-tab layouts below]                      │
│                                                                                    │
└────────────────────────────────────────────────────────────────────────────────────┘
```

The tab bar must be **URL-addressable** (e.g. `?tab=builder&item=<uuid>`) so that:
- Preflight checklist "Fix" links deep-link to the correct tab + item + field.
- Browser back/forward preserves tab state.
- Teachers can share direct links to specific question issues with a co-author.

### 3.2 Builder Tab — 3-Column Canvas Layout

```
┌──────────────┬─────────────────────────────────────────────┬───────────────────┐
│ LEFT PANEL   │             CENTER CANVAS                   │  RIGHT INSPECTOR  │
│ 280px        │             flex-1 (min 480px)              │  300px            │
│              │                                             │                   │
│ [+ New ▾]    │  ┌─ Question 3/12  ──────────────────────┐ │  Question Props   │
│              │  │  [Rich text prompt editor]            │ │  ─────────────    │
│ ▷ 1. Q title │  │                                       │ │  Points: [  1  ]  │
│ ▷ 2. Q title │  │  ○ Option A                           │ │  Type: [Choice ▾] │
│ ● 3. Q title │  │  ● Option B  ✓ CORRECT                │ │  Difficulty: [▾]  │
│   (selected) │  │  ○ Option C                           │ │  Topic tag: [▾]   │
│ ⚠ 4. Q title │  │  ○ Option D                           │ │  Feedback:        │
│ ▷ 5. Q title │  │                                       │ │  [Correct msg]    │
│   ...        │  │  [+ Add option]                       │ │  [Incorrect msg]  │
│              │  └─────────────────────────────────────┘ │                   │
│ ─── Sections │   [← Prev]            [Next →] [🚩 Flag] │  [Bank link ▾]    │
│ [+ Section]  │                                           │                   │
└──────────────┴─────────────────────────────────────────────┴───────────────────┘
```

### 3.3 Student Attempt Layout — Two Modes

**Mode A: Focused (one at a time)** — existing behavior, polished.

```
┌────────────────────────────────────────────────────────────┐
│  EXAM TITLE                        ⏱ 23:41  [🚩 Flag]      │
│  Progress: ███████░░░░░ 7/15 answered                       │
├────────────────────────────────────────────────────────────┤
│  Q7  [Flagged 🚩]                                2 pts      │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Rendered Markdown / LaTeX question text here...     │  │
│  └──────────────────────────────────────────────────────┘  │
│  ○  Option A — full card with hover                         │
│  ●  Option B — selected, tinted                            │
│  ○  Option C                                               │
│  ○  Option D                                               │
├────────────────────────────────────────────────────────────┤
│  [← Question 6]                      [Question 8 →]        │
└────────────────────────────────────────────────────────────┘
```

**Mode B: Scroll All** — student scrolls through all questions in sequence. Sidebar tracks position and completion.

### 3.4 Grading Review Layout — Keyboard-Optimized

```
┌────────────────┬────────────────────────────┬───────────────────────┐
│ SUBMISSION LIST│  STUDENT ANSWER INSPECTOR  │  GRADE FORM           │
│ (filterable,   │                            │                        │
│  sortable,     │  Question 1 of 12          │  Auto-graded: 8/10    │
│  paginated)    │  [Correct indicator]       │  Manual override: [ ] │
│                │                            │  Comment: [________]  │
│  ▷ Student A   │  Question 2 of 12          │  Rubric line 1: [  ] │
│  ▷ Student B   │  [Wrong — red tint]        │  Rubric line 2: [  ] │
│  ● Student C   │                            │  [Release grade ▾]   │
│  (selected)    │  [Annotation tools]        │                        │
│                │                            │  [← Prev] [Next →]   │
└────────────────┴────────────────────────────┴───────────────────────┘
```

---

## Part 4 — Feature Gap Roadmap

### 4.1 Content & Authoring Gaps (P0 — Blockers)

#### F-01: Rich Text / Markdown Prompt Editor
- **Current:** Plain `<Textarea>` for question prompts.
- **Target:** Markdown editor with live preview, syntax highlighting for code blocks, LaTeX equation rendering (KaTeX), inline image embed.
- **Implementation:** Integrate `@uiw/react-md-editor` or a custom Tiptap configuration with KaTeX extension. Store as raw Markdown string in `body.prompt` — no schema change needed. Render with `react-markdown` + `rehype-katex` + `rehype-highlight` on the student side.
- **Blocked by:** Nothing — frontend only.

#### F-02: Choice Option Visual Cards (Authoring)
- **Current:** Options are plain `<Input>` rows in a list. Correct flag is a checkbox with no visual hierarchy.
- **Target:** Each option is a card. Clicking "Mark Correct" animates the card background to `emerald-50/border-emerald-500`. Drag handle on left. Delete on right. Options support inline Markdown (bold, code, LaTeX).
- **Files:** `apps/web/src/features/assessments/items/choice/index.tsx` — rewrite `ChoiceItemAuthor`.

#### F-03: Matching Question Visual Pair Editor
- **Current:** Pairs are rendered as two inputs side-by-side with no connecting visual.
- **Target:** Left column of "prompt cards" and right column of "match inputs" connected by a styled dashed line SVG connector. On the student attempt side, pairs connect via drag-and-drop matching (not a `<select>` dropdown).
- **Files:** `apps/web/src/features/assessments/items/matching/index.tsx` (create), update `items/registry.ts`.

#### F-04: Question Inspector Right Panel
- **Current:** No right panel — center canvas is full width.
- **Target:** Collapsible 300px right panel in `BuilderCanvasTab`. Contains: points input (duplicate from title bar for visibility), question type dropdown, difficulty label (Easy/Medium/Hard/Expert), topic tags (multi-select from course taxonomy), per-answer feedback text (shown after submission if `allowResultReview=true`), explanation text (shown as a "Why?" hint after grading).
- **Backend needed:** Add `difficulty`, `tags`, `per_option_feedback`, `explanation` to `AssessmentItem.body` schema. All optional; no migration required if stored in existing `body_json`.

#### F-05: Exam Sections
- **Current:** Flat list of questions. No grouping.
- **Target:** Teacher can create named sections (e.g. "Part A: Grammar", "Part B: Writing"). Section headers appear between questions in both the builder outline and the student attempt. Sections can have their own point weight or fixed-count random sampling from a pool.
- **Backend needed:** New `ExamSection` model or encode sections in `settings_json`. Frontend: section rows in `BuilderCanvasTab` left panel with collapsible sections.

#### F-06: Question Bank Integration
- **Current:** Items exist only inside one assessment. No reuse.
- **Target:** "Add from Bank" button in the builder. Opens a sheet/dialog showing a searchable, filterable bank of previously authored questions across the teacher's courses (filtered by topic, kind, difficulty). Selecting one creates a copy linked to the originating bank item ID for analytics correlation.
- **Backend needed:** `GET /assessments/item-bank` endpoint returning teacher's items across assessments with filter params; `POST /assessments/{uuid}/items/from-bank` to copy a bank item.

#### F-07: AI Question Generation
- **Current:** None.
- **Target:** "Generate with AI" button per-section. Teacher provides a topic + count + difficulty. Returns a preview of generated CHOICE or OPEN_TEXT questions (in Markdown). Teacher reviews, edits, accepts all or individual ones.
- **Backend needed:** `POST /assessments/{uuid}/generate-items` that calls the existing `apps/api/src/routers/ai/` infrastructure.

---

### 4.2 Setup & Policy Gaps (P0)

#### F-08: Pass/Fail Threshold
- **Current:** No pass threshold. Teachers cannot specify "60% to pass."
- **Target:** Setting in Setup tab: "Passing score: ___%" that records to `assessment_policy.settings_json.pass_threshold`. Displayed to students on the entry panel and reflected in result badges.

#### F-09: Randomization Settings
- **Current:** Questions always presented in authoring order.
- **Target:** Two toggles: "Randomize question order" + "Randomize option order per question." Both stored in `settings_json`. Applied server-side at draft creation time so all students get the same randomized seed per-attempt but can't correlate answers by option letter.
- **Backend needed:** `POST /assessments/{uuid}/start` applies randomization; seed stored in submission `settings_json`.

#### F-10: Grading Scheme (Partial Credit / Penalty)
- **Current:** CHOICE questions are binary: full points or zero.
- **Target:** Per-question or global settings for: partial credit on MULTIPLE_CHOICE (proportional to correct options selected), negative marking penalty for wrong answers.
- **Backend needed:** Grading service changes in `apps/api/src/services/grading/`.

#### F-11: Grace Period / Late Submission Window
- **Current:** `due_at` cuts off access; no grace.
- **Target:** Optional "Grace period: ___ minutes" after due date where submission is accepted but flagged as late. Late penalty configurable (none / fixed deduction / percentage deduction).

#### F-12: Availability Window (Open Date)
- **Current:** Only `due_at`. No open date.
- **Target:** `available_from` / `available_until` window. Before `available_from`, students see a countdown. After `available_until`, the exam is locked regardless of lifecycle.

---

### 4.3 Student Attempt Runtime Gaps (P0)

#### F-13: Question Flag/Bookmark
- **Current:** No flag capability.
- **Target:** Per-question 🚩 flag button. Flagged questions shown with a distinct color (amber) in the navigation grid. "Review flagged" quick-filter in the submit confirmation dialog.

#### F-14: Answered-Count Progress Bar (not position-based)
- **Current:** Progress bar = `(currentIndex+1)/total` — measures navigation, not completion.
- **Target:** Progress bar = `answeredCount/total`. Distinct "N of M answered" stat displayed prominently.

#### F-15: Unanswered Question List in Submit Dialog
- **Current:** `ExamSubmitDialog` shows a count of unanswered questions.
- **Target:** Expands to show the specific question numbers and their titles (truncated). Clicking a question number closes the dialog and navigates to that question.

#### F-16: Scroll-All Mode
- **Current:** Only one-at-a-time mode.
- **Target:** Toggle in the exam header. In scroll-all mode, all questions render vertically. The sticky sidebar shows a compact vertical nav with answered/flagged indicators. The student can jump to any question by clicking the nav.

#### F-17: Prominent Timer with Visual Escalation
- **Current:** Timer is a tiny `<Badge>` in the header.  
- **Target:**  
  - Normal: circular countdown ring in top-right of the question area.  
  - ≤5 minutes: amber background pulsing.  
  - ≤60 seconds: red pulsing, audible beep if browser allows.  
  - "5 minutes remaining" toast notification.

#### F-18: LaTeX / Markdown Question Rendering on Attempt
- **Current:** Question text is rendered as plain text — newlines and formatting are stripped.
- **Target:** Render `question_text` (and option text) as Markdown + KaTeX. This is required for any STEM or language course.

#### F-19: Answer Draft Recovery — Friendly UX
- **Current:** Recovery dialog uses an `AlertDialog` with warning styling — looks like an error.
- **Target:** Redesign as a non-alarming "Resume your answers?" banner with a preview of how many answers were recovered and when they were saved.

---

### 4.4 Teacher Grading / Review Gaps (P1)

#### F-20: Keyboard Navigation in Review Queue
- **Current:** Entirely mouse-driven.
- **Target:** `J`/`K` to navigate submissions. `G` to focus grade input. `Ctrl+Enter` to save and advance. Keyboard shortcut reference tooltip in the header.

#### F-21: Inline Annotation on Student Answers
- **Current:** Grade form has a free-text comment field.
- **Target:** Teacher can click on a specific answer option to leave a per-option comment that the student sees during result review. For OPEN_TEXT, teacher can highlight a substring and attach a comment (similar to Google Docs).

#### F-22: Bulk Grade Release
- **Current:** Release control exists in UI as a stub.
- **Target:** "Release all graded" button that publishes all `GRADED` submissions atomically. Filter to release by group or score range.

#### F-23: Per-Item Analytics in Results Tab
- **Current:** Four aggregate metrics + three static insight panels.
- **Target:** Expandable table of per-question analytics: correct response rate, average time-on-question (if tracked), discrimination index (correlation with total score), and flag to mark items for revision.
- **Backend needed:** `GET /assessments/{uuid}/items/analytics` — aggregate from submissions.

#### F-24: Student Score Distribution Chart
- **Current:** None.
- **Target:** Histogram of final scores in the Results tab. Pass/fail cutoff line overlay. Rendered with Recharts (already a project dependency if present, or lightweight `react-chartjs-2`).

---

### 4.5 Infrastructure / Data Gaps (P1)

#### F-25: Deep-Link Tab + Item Navigation via URL
- **Current:** Tab state is local `useState` — not URL-reflected.
- **Target:** `?tab=builder&item=<item_uuid>&field=prompt` reflected in URL. `NativeItemStudio` reads from `useSearchParams` to initialize. `PublishDashboardTab` "Fix" links write these params before `onSwitchToBuilder()`.

#### F-26: Optimistic Updates in Builder
- **Current:** Every save triggers a full `refresh()` (3 query invalidations). Creating an item re-fetches the entire assessment.
- **Target:** Use `queryClient.setQueryData` to apply optimistic updates to the items list before the server confirms. Roll back on error.

#### F-27: Auto-Save in Studio (Debounced PATCH)
- **Current:** `GeneralSettingsTab` changes are debounced and saved, but there is no explicit "saving…" indicator while the debounce is pending — `SaveStateBadge` only shows `saved`/`saving`/`unsaved`. The debounce timeout is not visible to the user.
- **Target:** "Saving…" badge with spinner appears 500ms after last keypress. Saved confirmation badge fades after 3s. No full-page flash during save.

#### F-28: Collaborative Authoring (Presence)
- **Current:** No concurrency awareness — two teachers can silently overwrite each other.
- **Target:** WebSocket presence indicator in the studio header: "2 others are editing this exam." Last-write-wins with a conflict toast ("Your changes conflict with a recent save by Teacher B — view diff").

#### F-29: Exam Versioning / Change History
- **Current:** No history.
- **Target:** `GET /assessments/{uuid}/versions` returns an audit log of snapshots (title, item count, who changed, when). Teacher can preview a previous version and optionally restore it.

#### F-30: Accessibility (WCAG 2.1 AA)
- **Current:** DnD in the builder uses `@dnd-kit` with keyboard sensor — good. But choice options have no `aria-label` linking to the question. Timer badge has no live region. Progress bar has `aria-label` — good.
- **Target:**  
  - All question cards: `role="group"` with `aria-labelledby` referencing the question title.  
  - Timer: `aria-live="polite"` region that announces "5 minutes remaining."  
  - Answer options: `aria-describedby` linking to the question prompt.  
  - Focus management: when navigating to a new question, focus moves to the question heading.  
  - Builder DnD: full keyboard reorder with `aria-roledescription` and status announcements.

---

## Part 5 — Redesigned Component Inventory

### 5.1 New Components (to Create)

| Component | Location | Purpose |
|---|---|---|
| `RichTextPromptEditor` | `features/assessments/shared/` | Tiptap/Markdown editor with KaTeX, code, image embed |
| `MarkdownRenderer` | `features/assessments/shared/` | Renders Markdown + KaTeX for student-facing question text |
| `QuestionInspectorPanel` | `features/assessments/studio/tabs/` | Collapsible right panel with points, difficulty, tags, feedback |
| `SectionBlock` | `features/assessments/studio/tabs/` | Builder left panel section header with add/rename/delete |
| `QuestionBankSheet` | `features/assessments/studio/` | Slide-out sheet for browsing and adding from item bank |
| `AIGenerationDialog` | `features/assessments/studio/` | Dialog for AI question generation preview + acceptance |
| `FlagButton` | `features/assessments/registry/exam/` | Per-question bookmark toggle for student attempt |
| `TimerRing` | `features/assessments/shell/` | Circular SVG countdown with escalation colors |
| `ScoreDistributionChart` | `features/assessments/studio/tabs/` | Recharts histogram of submission scores |
| `ItemAnalyticsTable` | `features/assessments/studio/tabs/` | Per-question analytics (difficulty, discrimination) |
| `InlineAnnotation` | `features/grading/review/components/` | Highlight + comment on student answer text |
| `BulkReleaseBar` | `features/grading/review/components/` | Sticky action bar for bulk grade release |
| `PresenceIndicator` | `features/assessments/studio/` | WebSocket-driven avatar cluster for co-authors |
| `ExamScrollAllView` | `features/assessments/registry/exam/` | Full-scroll exam layout mode |
| `SubmitConfirmSheet` | `features/assessments/registry/exam/` | Redesigned submit confirmation with unanswered question list |

### 5.2 Components to Substantially Rewrite

| Component | Key Changes |
|---|---|
| `ChoiceItemAuthor` (`items/choice/index.tsx`) | Replace plain inputs with card layout; animate correct selection; support Markdown in option text |
| `ExamQuestionCard.tsx` | Add Markdown rendering, flag button, answered-state badge |
| `ExamQuestionNavigation.tsx` | Three states: current, answered, flagged; tooltip on hover showing question title |
| `ExamSubmitDialog.tsx` → `SubmitConfirmSheet` | List unanswered + flagged questions; allow jumping back |
| `AssessmentChrome.tsx` | Replace timer badge with `TimerRing`; shrink to compact mode during scroll-all |
| `PublishDashboardTab.tsx` | Add URL deep-link on "Fix" buttons; schedule picker with timezone display; preview gate |
| `ResultsReviewTab.tsx` | Wire up real data: per-item analytics table + score distribution chart |
| `AccessManagementTab.tsx` | Visual diff added/removed; inline student override management from user row |
| `GradingReviewWorkspace.tsx` | Keyboard navigation; inline annotations; bulk release bar |

### 5.3 URL State Architecture

```typescript
// URL params managed by a shared studio hook:
// /dash/courses/:courseUuid/activity/:activityUuid?tab=builder&item=<uuid>&field=prompt

type StudioSearchParams = {
  tab?: 'setup' | 'builder' | 'access' | 'results' | 'publish';
  item?: string;   // item_uuid — selects question in builder
  field?: string;  // field name — scrolls to and focuses the input
};
```

---

## Part 6 — Implementation Phases

### Phase 0 — Foundation (URL state, rich text infra) [3 days]

1. Install `tiptap` (core + extensions: `StarterKit`, `Placeholder`, `Image`, `CodeBlock`) + `@tiptap/extension-mathematics` (KaTeX).
2. Create `RichTextPromptEditor` and `MarkdownRenderer` shared components with unified Markdown-to-JSX pipeline.
3. Refactor `NativeItemStudio` tab switching to read/write `?tab=` URL param via `useRouter`/`useSearchParams`. Remove local `useState` for active tab.
4. Update all `onSwitchToBuilder(itemUuid)` calls to also write `?tab=builder&item=<uuid>` to the URL.

### Phase 1 — Builder Canvas Overhaul [5 days]

1. **F-01, F-02:** Rewrite `ChoiceItemAuthor` — option cards with correct-answer animation, Markdown in option text, drag reorder within the card.
2. **F-03:** Create visual matching pair editor.
3. **F-04:** Add `QuestionInspectorPanel` right panel to `BuilderCanvasTab` — points, type, difficulty, tags, per-answer feedback, explanation.
4. **F-05:** Add section concept to left outline: `SectionBlock` drag handle, add/remove items to section, section-level point weight.
5. **F-25:** Wire URL deep-links throughout — preflight "Fix" links write `?tab=builder&item=X&field=Y`.

### Phase 2 — Setup Tab Completeness [3 days]

1. **F-08:** Pass threshold input in Access & Timing card.
2. **F-09:** Randomization toggles (question order, option order) — write to `settings_json`.
3. **F-10:** Grading scheme card — partial credit and penalty toggles (frontend + backend service changes).
4. **F-11, F-12:** Grace period and open-date inputs.

### Phase 3 — Student Attempt Runtime [5 days]

1. **F-13:** Flag/bookmark button on each question; amber state in nav grid.
2. **F-14:** Fix progress bar to count answered questions, not current index.
3. **F-15:** Rewrite submit confirm as `SubmitConfirmSheet` with unanswered + flagged list.
4. **F-16:** Scroll-all mode toggle; `ExamScrollAllView` component; sticky sidebar in scroll-all.
5. **F-17:** Replace timer `<Badge>` with `TimerRing`; escalation logic and urgency toasts.
6. **F-18:** Render question text and option text through `MarkdownRenderer` (requires F-01 Phase 0).
7. **F-19:** Redesign answer recovery banner to non-alarming UI.

### Phase 4 — Grading & Review [4 days]

1. **F-20:** Keyboard navigation in `GradingReviewWorkspace` (J/K/G/Enter shortcuts).
2. **F-21:** Inline annotation layer on student answers — store in `submission.annotations_json`.
3. **F-22:** Bulk release bar with filter + confirm dialog.
4. **F-23, F-24:** Wire up per-item analytics and score distribution chart in `ResultsReviewTab`.
5. **Backend:** `GET /assessments/{uuid}/items/analytics` endpoint.

### Phase 5 — Question Bank & AI Generation [4 days]

1. **F-06:** `QuestionBankSheet` — search/filter/preview bank items; `POST from-bank`.
2. **F-07:** `AIGenerationDialog` — topic prompt → preview generated questions → accept/edit/reject.
3. **Backend:** `GET /assessments/item-bank` and `POST /assessments/{uuid}/generate-items`.

### Phase 6 — Infrastructure Quality [3 days]

1. **F-25:** Full URL state audit — ensure all navigation is URL-reflected and shareable.
2. **F-26:** Optimistic updates in `NativeItemStudioProvider` for create/delete/reorder.
3. **F-27:** Improve save-state UX in studio (pending indicator, fade-out after save).
4. **F-28:** WebSocket presence `PresenceIndicator` using existing Redis infra.
5. **F-29:** `GET /assessments/{uuid}/versions` audit log + restore UI.
6. **F-30:** Comprehensive WCAG 2.1 AA audit and remediation.

---

## Part 7 — Visual Design Standards

### 7.1 Question Option States (Builder)

```
Default:
  bg-background border-border rounded-lg p-3 flex items-center gap-3

Hover:
  bg-muted/40 transition-colors duration-150

Marked Correct (Single):
  bg-emerald-50/60 border-emerald-500 dark:bg-emerald-950/30 dark:border-emerald-700
  shadow-sm ring-1 ring-emerald-500/20 scale-[1.005] transition-all duration-200

Marked Correct (Multiple — accumulated):
  same as above but multiple cards can be green simultaneously
```

### 7.2 Question Navigation Grid (Student Attempt)

```
Default (unanswered):
  bg-muted text-muted-foreground rounded size-8

Answered:
  bg-primary/20 text-primary rounded size-8

Flagged (not answered):
  bg-amber-100 text-amber-700 border border-amber-300 rounded size-8

Flagged + Answered:
  bg-amber-50 text-amber-700 ring-1 ring-amber-400 rounded size-8

Current:
  bg-primary text-primary-foreground rounded size-8 ring-2 ring-primary/40
```

### 7.3 Timer Ring Colors

```
> 5 minutes:   stroke-primary
1–5 minutes:   stroke-orange-500  (warn)
< 1 minute:    stroke-destructive (pulsing animation)
```

### 7.4 Studio Tab Active Indicator

Replace the current plain underline tab with a **pill capsule** that slides on transition:
```css
.studio-tab-active {
  @apply bg-primary text-primary-foreground rounded-full px-4 py-1.5 text-sm font-medium;
  /* framer-motion layoutId="studio-tab-pill" for smooth slide */
}
```

---

## Part 8 — Backend Changes Required

### 8.1 Schema Changes (Non-Breaking)

All changes use the existing `body_json` / `settings_json` JSONB columns — no migrations needed for optional fields.

| Field | Location | Purpose |
|---|---|---|
| `body.difficulty` | `AssessmentItem.body_json` | "EASY" \| "MEDIUM" \| "HARD" \| "EXPERT" |
| `body.tags` | `AssessmentItem.body_json` | `string[]` — topic tags |
| `body.per_option_feedback` | `AssessmentItem.body_json` | `Record<optionId, string>` |
| `body.explanation` | `AssessmentItem.body_json` | `string` — shown post-grading |
| `settings_json.pass_threshold` | `AssessmentPolicy` | `float 0.0–1.0` |
| `settings_json.randomize_questions` | `AssessmentPolicy` | `bool` |
| `settings_json.randomize_options` | `AssessmentPolicy` | `bool` |
| `settings_json.partial_credit` | `AssessmentPolicy` | `bool` |
| `settings_json.negative_marking_penalty` | `AssessmentPolicy` | `float` — fraction deducted per wrong answer |
| `settings_json.grace_period_seconds` | `AssessmentPolicy` | `int` |
| `settings_json.available_from` | `AssessmentPolicy` | `ISO datetime string` |
| `sections` | `AssessmentRead` | New optional field — list of `{uuid, title, item_uuids[]}` |

### 8.2 New Endpoints Required

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/assessments/item-bank` | List teacher's items across assessments with `?q=&kind=&difficulty=&tag=` |
| `POST` | `/assessments/{uuid}/items/from-bank` | Copy item from bank into assessment |
| `POST` | `/assessments/{uuid}/generate-items` | AI generation; returns `{items: AssessmentItemPreview[]}` |
| `GET` | `/assessments/{uuid}/items/analytics` | Per-item analytics: correct rate, avg time, discrimination |
| `GET` | `/assessments/{uuid}/versions` | Audit log of assessment snapshots |
| `POST` | `/assessments/{uuid}/versions/{version_id}/restore` | Restore a previous version |
| `PATCH` | `/assessments/{uuid}/submissions/{sub_uuid}/annotations` | Save inline annotations |
| `POST` | `/assessments/{uuid}/submissions/bulk-release` | Bulk release with filter |

### 8.3 Grading Service Changes

`apps/api/src/services/grading/` needs:
- Read `partial_credit` and `negative_marking_penalty` from `assessment_policy.settings_json`.
- For CHOICE_MULTIPLE with `partial_credit=True`: award `(correct_selected / total_correct) * max_score - penalty * wrong_selected`.
- Expose computed `pass` boolean on `StudentSubmissionRead` based on `pass_threshold`.

---

## Part 9 — Accessibility & Internationalization

### 9.1 Accessibility Checklist

- [ ] All interactive elements reachable by Tab key with visible focus ring.
- [ ] DnD question reorder has keyboard alternative (Up/Down arrow with Enter to grab/release).
- [ ] Timer countdown has `<output aria-live="polite">` region that announces at 10m, 5m, 1m.
- [ ] Radio group options have `aria-describedby` pointing to question prompt ID.
- [ ] Correct/incorrect indicators do not rely on color alone (add checkmark/cross icons).
- [ ] Error messages are associated with their fields via `aria-describedby`.
- [ ] Submit confirmation sheet has `role="dialog"` with proper `aria-labelledby` / `aria-modal`.
- [ ] All images in question prompts have `alt` text (enforced by editor).

### 9.2 Internationalization

- All new i18n strings go in existing namespace files under `apps/web/src/messages/`.
- No hardcoded English strings in JSX — everything via `useTranslations`.
- Difficulty labels, tag names, and section names are user-provided (not translated key lookups).
- Timer "5 minutes remaining" toast uses ICU plural forms.

---

## Part 10 — Testing Strategy

### 10.1 Unit Tests (Vitest)

- `RichTextPromptEditor` — renders Markdown, renders KaTeX, does not render when disabled.
- `ChoiceItemAuthor` — adding option, marking correct, removing option, single-select enforces one correct.
- Timer escalation logic — correct color at each threshold.
- `readiness.ts` classifier — all issue codes map to correct field/tab/severity.
- Grading service changes — partial credit calculation accuracy.

### 10.2 Integration / E2E Tests (Playwright)

- **Studio:** Create exam → add CHOICE question → mark correct → publish → verify student can see it.
- **Student Attempt:** Start exam → answer questions → flag Q3 → navigate via grid → verify flag persists → submit → verify score page.
- **Grading:** Teacher opens review queue → grades submission → releases → student sees result.
- **Anti-cheat:** Open devtools during attempt → verify violation count increments → verify auto-submit at threshold.

---

## Part 11 — Prioritization Matrix

| Feature | Impact | Effort | Priority |
|---|---|---|---|
| F-01 Rich Text Prompt Editor | 🔴 Critical | M | **P0** |
| F-02 Choice Option Cards | 🔴 Critical | S | **P0** |
| F-13 Question Flag | 🔴 Critical | S | **P0** |
| F-14 Answered Progress Bar | 🟠 High | XS | **P0** |
| F-18 LaTeX Rendering (Student) | 🔴 Critical | M | **P0** |
| F-25 URL-reflected Tab State | 🟠 High | M | **P0** |
| F-15 Unanswered List in Submit | 🟠 High | S | **P0** |
| F-08 Pass/Fail Threshold | 🟠 High | S | **P1** |
| F-09 Randomization | 🟠 High | M | **P1** |
| F-04 Inspector Right Panel | 🟠 High | M | **P1** |
| F-17 Timer Ring | 🟠 High | M | **P1** |
| F-16 Scroll-All Mode | 🟡 Medium | L | **P1** |
| F-20 Keyboard Nav in Review | 🟠 High | S | **P1** |
| F-22 Bulk Release | 🟠 High | M | **P1** |
| F-23 Per-Item Analytics | 🟠 High | L | **P1** |
| F-05 Exam Sections | 🟡 Medium | L | **P2** |
| F-06 Question Bank | 🟡 Medium | XL | **P2** |
| F-07 AI Generation | 🟡 Medium | XL | **P2** |
| F-10 Partial Credit / Penalty | 🟡 Medium | L | **P2** |
| F-28 Collaborative Presence | 🟢 Nice-to-have | XL | **P3** |
| F-29 Version History | 🟢 Nice-to-have | XL | **P3** |

---

## Part 12 — What NOT to Do (Anti-Patterns)

1. **Do not add more toggles to `GeneralSettingsTab` without grouping.** Every new setting must belong to a named card with a clear semantic group. Unbounded toggle lists are the Moodle anti-pattern.
2. **Do not store rich text as HTML.** Store as Markdown string. Rendering is the frontend's job. HTML in the DB is an XSS surface and a migration nightmare.
3. **Do not make the exam attempt a single-page form.** One-at-a-time navigation exists for a reason (anti-cheating, focus, mobile). The scroll-all mode is an opt-in toggle, not the default.
4. **Do not over-engineer the question bank in phase 1.** Start with "copy from another exam in my courses." A full shared bank with versioning is P2.
5. **Do not use `react-query` `invalidateQueries` for every studio mutation.** Switch to optimistic updates for list operations; full invalidation only after batch/lifecycle changes.
6. **Do not skip accessibility for "later."** WCAG AA is a legal requirement in many education contexts (government contracts, university procurement). Build it in from Phase 0.
7. **Do not add AI generation without a human review gate.** All AI-generated content must be previewed and accepted by the teacher before being saved to the assessment.
