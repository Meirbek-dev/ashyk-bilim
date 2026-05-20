# Activity UX v2 — Complete Modernization Plan

**Author:** Senior Architect Review  
**Date:** 2026-05-19  
**Scope:** Student activity consumption workflow — zero legacy, zero debt.  
**Out of scope:** Teacher Studio, Review queue (separate plan).

---

## Part 1 — Critical Audit

### 1.1 Screenshot Analysis

#### Screenshot A — TYPE_DYNAMIC (Page Content)

| Problem | Root Cause | Severity |
|---------|-----------|----------|
| Prose text uses ≈44% of available screen width | `OutlineRail` takes 56px (`w-14`); `main` padding adds 64px; `max-width: 92ch` caps text at ~736px | 🔴 Critical |
| Images inside content are tiny | Images are constrained to the 92ch prose column even though the CSS says `max-width: 100%` — the *container* is already narrow | 🔴 Critical |
| Two numbered chapter rings (1, 2) visible on far left | `ChapterRing` SVG circles inside `OutlineRail` always visible at 56px — dead chrome with zero interaction affordance | 🟠 High |
| `showDesktopTableOfContents={false}` kills the right-side ToC | Caller disables ToC but the mobile "On this page" Sheet button still renders unnecessarily | 🟡 Medium |
| "AI Assistant" link buried in bottom bar | Not contextual, not discoverable, not useful in the bottom nav spot | 🟡 Medium |
| No visual hierarchy between activity type, title, and content | Activity type identity is invisible; title and content bleed together | 🟡 Medium |

#### Screenshot B — TYPE_CODE_CHALLENGE (Submitted / Result State)

| Problem | Root Cause | Severity |
|---------|-----------|----------|
| Editor is ≈300px tall, unusable | Code challenge is rendered inside the standard content zone which is scroll-based, not viewport-filling | 🔴 Critical |
| Status strip too information-dense on one line | All metadata (`60% · Unlimited · 0 min`) crammed with dot separators | 🟠 High |
| "AI Assistant" in bottom bar nav, left-aligned as if it were prev-nav | Treated as a nav item, looks accidental | 🟠 High |
| "Ответ принят" card + editor + test panel are three separate visual containers | No visual coherence; the submitted state should collapse the editor | 🟡 Medium |
| The breadcrumb path `Демонстрация... / Продолжить` puts the *action label* in the breadcrumb | Breadcrumb is used as a status label — semantic misuse | 🟡 Medium |
| 56px OutlineRail chapter rings visible | Same as above | 🟠 High |

### 1.2 Architectural Debt

```
CURRENT layout on desktop (1366px wide):
┌──────────────────────────────────────────────────────────────────────────┐
│ GlobalNavBar (56px tall)                                                 │
├────┬─────────────────────────────────────────────────────────────────────┤
│ 56 │ ActivityHeader (44px)                                               │
│ px │─────────────────────────────────────────────────────────────────────│
│    │ InlineStatusStrip                                                   │
│ (2 │─────────────────────────────────────────────────────────────────────│
│ ch │        CONTENT                                                      │
│ ap │        constrained to ~736px                                        │
│ te │        inside a 1246px container                                    │
│ r  │        ← 255px dead space → content ← 255px dead space →           │
│ ri │                                                                     │
│ ng │                                                                     │
│ s) │                                                                     │
├────┴─────────────────────────────────────────────────────────────────────┤
│ BottomActionBar (64px)                                                   │
└──────────────────────────────────────────────────────────────────────────┘

Wasted horizontal pixels: 56 (rail) + 2×255 (prose margin) = 566px of 1366px = 41%
```

The **56px always-visible OutlineRail** is the primary offender. It takes permanent horizontal real estate but its chapter progress rings are nearly invisible and provide no actionable information at a glance.

---

## Part 2 — Design Principles

1. **Content-first, chrome-last.** UI shell elements must earn their space. If a component has no immediate function, it is invisible by default.

2. **Activity-type aware.** Each of the 6 activity types has a fundamentally different optimal viewport allocation. One shared layout shell cannot serve all of them equally well. The shell adapts.

3. **Zero always-visible left chrome.** Sidebar/rail width when closed = **0px**. Always. The outline opens as a fixed overlay, not a shrinking content column.

4. **Reading width is not total width.** Prose text should be capped at ~72ch for readability. But that constraint must *not* apply to images, embeds, code blocks, or full-width elements. The content column should be the full available width; only the text nodes inside are constrained.

5. **Keyboard-first with mouse parity.** Every primary action must be reachable without a mouse. Tab order is logical. The `O` shortcut opens the outline; `Escape` closes overlays; `F` toggles focus mode.

6. **Viewport height is sacred for interactive activities.** Code challenges and assessments must be able to fill 100% of `100dvh`. No scroll-based layouts for IDE-like surfaces.

7. **AI Assistant is a first-class surface, not a footer link.** It lives in a dismissable panel triggered from the header.

8. **No grade_release_mode, no internal system state shown to students.** Students see outcomes, not pipeline stages.

9. **Zero dead state.** Every loading, empty, locked, and error state has intentional design. No raw spinners or blank white boxes.

---

## Part 3 — Layout Shell Redesign

### 3.1 The New Grid

```
┌───────────────────────────────────────────────────────────────────────────┐
│ ActivityHeader (h-11 = 44px, sticky)                                      │
│ [≡] Course › Chapter › Title    ·    3 of 32    [focus] [AI]             │
│ ████░░░░░░░░ progress fill (3px absolute bottom)                          │
├───────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│   CONTENT ZONE   (flex-1, 100% width, type-specific layout inside)        │
│                                                                           │
└───────────────────────────────────────────────────────────────────────────┘
│ BottomActionBar (h-14 = 56px, fixed)                                      │
│ ← Previous: Title     [Primary CTA]     Next: Title →                    │
└───────────────────────────────────────────────────────────────────────────┘

OutlineRail (position:fixed, z-20, 0px when closed, 300px overlay when open)
AI Panel (position:fixed, z-20, slides from right)
```

**Delta from current:**
- `OutlineRail` collapsed width: `56px → 0px`. The aside is removed from the DOM flow entirely when closed.
- The `main` element becomes `w-full` with no horizontal sibling.
- Activity-type specific layout is applied *inside* `main`, not by the outer shell.

### 3.2 ActivityHeader — Changes Required

Current issues:
- The "status badge" (Complete / In Progress) in the breadcrumb row is noisy on every page load
- No AI Assistant trigger button

New header layout:
```
LEFT:   [≡ outline] ·  BreadcrumbTrail (truncated)
CENTER: (empty — content area is not a "page title" header)
RIGHT:  [AI ✨] · {position counter N of M} · [focus ⊞]
```

**Remove:** Status badge from header. It belongs in the `InlineStatusStrip` only.

**Add:** AI panel trigger button (right group).

**The progress bar:** Keep the 3px absolute-bottom fill (`w-[{pct}%]`). This is the correct minimal progress indicator.

### 3.3 OutlineRail — Zero-Width Collapsed State

**Current:** `w-14` (56px) aside always in the DOM flow.

**New:** Outline rail is `position: fixed` in BOTH states. The `<aside>` element is removed from the DOM layout flow entirely — it does not participate in the flex row. When closed, `pointer-events-none; opacity-0; translate-x-[-300px]`. When open, `translate-x-0; opacity-100`.

The toggle button lives in `ActivityHeader` — clicking `≡` sets `outlineOpen = true`. This is the only entry point.

No collapsed-state chapter rings. Delete `ChapterRing` and `ChapterDots` sub-components.

```tsx
// New OutlineRail: always position:fixed, never in DOM flow
<div
  className={cn(
    'fixed left-0 top-[6.25rem] z-20 h-[calc(100dvh-6.25rem)] w-[300px]',
    'flex flex-col border-r bg-background shadow-xl',
    'transition-[transform,opacity] duration-200 ease-out will-change-transform',
    open ? 'translate-x-0 opacity-100' : '-translate-x-full opacity-0 pointer-events-none',
  )}
>
```

### 3.4 BottomActionBar — Visual Improvements

Current issues: The three-slot layout (prev, CTA, next) is fine architecturally. Visual improvements needed:
- The CTA button should be `size="lg"` with minimum `w-44` — currently it can be very narrow
- Prev/Next nav text should be visible at `sm` (≥640px), not just `lg`
- When `mode === 'ACTIVE_ATTEMPT'` the bar disappears — good, keep this
- When the `bottomBarAction` override is set (assessment start) — good, keep this

**Add:** A 1px `border-t` on the bar to separate it from content above it. The current shadowless bar blends with content when scrolled to bottom.

### 3.5 InlineStatusStrip — Redesign

**Current:** Dot-separated single line: `Code challenge · Проходной балл: 60% · Неограниченное количество попыток · 0 min`

**New:** Pill-based tag layout. Each datum is a `<Badge variant="secondary">` or `<Badge variant="outline">` pill:

```
[Code challenge]  [Pass: 60%]  [Unlimited]  [Due: Jun 3]
```

Pills are smaller (text-xs), have horizontal gap, and wrap on narrow screens. The activity type pill uses the same color coding as activity type icons in the course outline.

---

## Part 4 — Activity-Type Specific Layouts

### 4.1 TYPE_DYNAMIC — Reading Layout

**Problem:** Prose is 736px wide (92ch) but the content zone could be 1310px. The 92ch cap is correct for *reading*, but the visual experience of massive dead margins makes the page feel broken.

**Solution:** Change the visual treatment of the space, not the text width.

1. **Increase max-width from 92ch to 72ch (≈ 720px) for body text** — actually *decrease* to optimal reading width. The issue isn't the cap, it's that the empty margins aren't being used for anything.

2. **Use the margin for a floating Table of Contents** — on screens ≥1280px, render the ToC in the right margin (240px) using `position: sticky`. The text column stays at 72ch. The ToC uses the previously-dead space.

3. **Remove `showDesktopTableOfContents={false}` from `ActivityContentRenderer.tsx`**. Currently the caller disables it. Re-enable it and let the `InteractiveViewer` handle ToC presence detection (`hasToc && headings.length >= 2`).

4. **Images break out to full container width** — the CSS already has `max-width: 100%` for images, but the container is already narrow. Fix: the prose column should be `max-w-[72ch]` via CSS, but the *outer container* should be `w-full`. Images rendered at node level (block-level `<img>`, embeds) should use `width: 100%` of the outer container via CSS negative margin technique:

```css
/* Text nodes: 72ch max */
.prosemirror-interactive-layout-content .ProseMirror > * {
  max-width: min(72ch, 100%);
}

/* Block-level media: full container width */
.prosemirror-interactive-layout-content .ProseMirror > img,
.prosemirror-interactive-layout-content .ProseMirror > .embed-block,
.prosemirror-interactive-layout-content .ProseMirror > .lesson-wide,
.prosemirror-interactive-layout-content .ProseMirror > .lesson-full,
.prosemirror-interactive-layout-content .ProseMirror > .tableWrapper,
.prosemirror-interactive-layout-content .ProseMirror > pre {
  max-width: 100%;
  width: 100%;
}
```

5. **Wider desktop layout with ToC:**

```
@media (min-width: 1280px) {
  .prosemirror-interactive--with-toc .prosemirror-interactive-layout {
    grid-template-columns: minmax(0, 1fr) 240px;
    gap: 3rem;
  }
  .prosemirror-interactive--with-toc .prosemirror-interactive-layout-toc {
    display: block;
  }
}
```

**Final desktop reading layout (1366px screen):**
```
├── main (w-full, px-8) ──────────────────────────────────────────────────┤
│   ├── prose column (72ch ≈ 720px) ─────── ┤  ToC (240px) │ gap (48px) │
│   │    "Курсы - это фундаментальная..."    │  • Section 1 │            │
│   │    [image: full-width, 928px]          │  • Section 2 │            │
│   │    "Курсы могут быть объединены..."    │              │            │
```

**What this eliminates:** The 255px dead margins on each side of the text. The right dead space becomes the ToC. The left dead space is reclaimed by removing the 56px OutlineRail.

### 4.2 TYPE_VIDEO — Cinematic Layout

No structural issues in the current implementation. Two targeted fixes:

1. **Remove the `<section className="w-full">` wrapper** — let `VideoActivity` control its own width and aspect ratio. Ensure it can go full-container-width.

2. **On mobile:** Video should be 16:9 at full device width, no horizontal padding.

Teacher YouTube embeds and hosted videos should be `aspect-video w-full`.

### 4.3 TYPE_DOCUMENT — PDF Viewer

Current: `min-h-[70vh]`. Too short on tall screens.

Fix: Change to `h-[calc(100dvh-3.5rem-2.75rem-3.5rem)]` — full available viewport minus header, status strip, and bottom bar height. The PDF viewer fills the remaining space exactly.

On mobile: Same calculation using CSS custom property `--content-height` set by the shell.

### 4.4 TYPE_CODE_CHALLENGE — Split-Pane IDE (ACTIVE_ATTEMPT Only)

This is the most critical type-specific layout. The current implementation renders the code challenge component inside a standard scrollable content zone. This is architecturally wrong for an IDE-like surface.

#### State Machine

```
PREFLIGHT  → Standard card layout (AttemptEntryCard) — same as TYPE_EXAM
ACTIVE     → Full viewport split-pane IDE (see below)
RESULT     → Standard card layout (AttemptResultCard) — same as TYPE_EXAM
```

#### ACTIVE_ATTEMPT — Full Viewport Split Pane

When `mode === 'ACTIVE_ATTEMPT'` AND `activity.activity_type === 'TYPE_CODE_CHALLENGE'`:

1. **`StudentActivityWorkspace` mounts in `ACTIVE_ATTEMPT` mode** — header hidden, bottom bar hidden.

2. **`AssessmentLayout`** (the component that handles the active attempt for code challenges) takes `position: fixed; inset: 0; top: 3.5rem` (below global nav only). It fills the entire remaining viewport.

3. **Inside `AssessmentLayout`:** A resizable horizontal split pane:

```
┌─────────────────────────────────────────────────────────────────────────┐
│ [← Back]  Демонстрация онлайн компилятора платформы   ⏱ 42:00  [Submit]│  40px bar
├──────────────────────────┬──────────────────────────────────────────────┤
│                          │                                              │
│  PROBLEM STATEMENT       │  CODE EDITOR (Monaco, flex-1)               │
│  (left pane, resizable)  │                                              │
│                          │  [Language selector ▼]                      │
│  Задание: напишите       │  ─────────────────────────────────────────  │
│  функцию...              │  function solution(n) {                     │
│                          │    // ваш код здесь                         │
│  ─────────────────       │  }                                          │
│  ТЕСТЫ                   │                                              │
│  [Test 1 ▼]              │  ─────────────────────────────────────────  │
│  Input: (нет ввода)      │  [▶ Run]  [🧪 Test]  [Console output]      │
│  Expected: Hello ToU!    │  > Test 1: ✓  "Hello ToU!"                  │
│                          │  > Test 2: ✗  Expected "World" got "world"  │
│  [Test 2 ▼]              │                                              │
│  ...                     │                                              │
│                          │                                              │
└──────────────────────────┴──────────────────────────────────────────────┘
```

4. **Left pane default width:** `min(35%, 480px)`. Drag handle in center. Minimum pane width: `280px`. State saved to `sessionStorage` per activity.

5. **Monaco editor height:** `calc(100% - 44px - [results pane height])`. Results pane starts at 160px, resizable vertically.

6. **Mobile:** No split pane — stacked layout with tabs: `[Problem] [Code] [Tests]`. The active tab fills viewport height.

#### Implementation Components to Create

| Component | Path | Purpose |
|-----------|------|---------|
| `CodeChallengeAttemptLayout` | `features/assessments/code/CodeChallengeAttemptLayout.tsx` | Full-viewport wrapper with split pane |
| `ProblemStatementPanel` | `features/assessments/code/ProblemStatementPanel.tsx` | Left pane: problem + test cases |
| `CodeEditorPanel` | `features/assessments/code/CodeEditorPanel.tsx` | Right pane: Monaco + run button + results |
| `ResizeDivider` | `features/assessments/code/ResizeDivider.tsx` | Mouse/touch drag handle |
| `CodeTestResultsPane` | `features/assessments/code/CodeTestResultsPane.tsx` | Bottom of editor: run output |

**The `AssessmentLayout` component** (which already handles ACTIVE_ATTEMPT for all assessment types) needs to detect `kind === 'TYPE_CODE_CHALLENGE'` and route to `CodeChallengeAttemptLayout` instead of the generic `AssessmentLayout` shell.

### 4.5 TYPE_EXAM — Focused Assessment

No viewport issues (assessment takes over via `ACTIVE_ATTEMPT` mode and `AssessmentLayout`). Improvements:

1. **One-question-at-a-time mode** — for exams with `>5` questions, offer a focused mode that shows one question per screen with keyboard navigation (← →). The question navigator is a compact dot row at the bottom.

2. **Progress bar** in the assessment header: `Q {n} of {total}` with fill.

3. **Timer** — if time-limited, show a live countdown in the header (not hidden behind a modal). Color changes: white → amber at 20%, red at 10%.

These improvements are inside `AssessmentLayout` and the existing question rendering — no new outer shell needed.

### 4.6 TYPE_FILE_SUBMISSION — Upload Zone

No critical layout issues. One fix: ensure the upload zone uses `min-h-[400px]` not `min-h-[28rem]` — consistent unit usage.

---

## Part 5 — AI Assistant Redesign

### 5.1 Current State

The AI Assistant ("ИИ Ассистент") appears as a left-navigation item in `BottomActionBar`. This is:
- Not contextual (appears on every activity type)
- Not accessible (buried in navigation)
- Not useful in nav position (users click nav expecting navigation, not AI)

### 5.2 New Design — Contextual AI Panel

**Trigger:** A dedicated `[✨ AI]` button in the `ActivityHeader` right group.

**Panel:** `position: fixed; right: 0; top: 3.5rem; height: calc(100dvh - 3.5rem); width: min(400px, 100vw)` — slides from the right, `z-30`.

**Context-aware:** The panel receives `activity` and `runtime` as props, enabling:
- Content activities (`TYPE_DYNAMIC`): "Explain this section", "Summarize", "Ask a question about this content"
- Code challenges (`TYPE_CODE_CHALLENGE`): "Hint" (does NOT give the answer), "Explain the test case", "Explain the error"
- Assessments (`TYPE_EXAM`): "Explain this question" (does NOT reveal the answer), "Give me a hint"

**Remove:** `AICanvaToolkit` inline overlay inside `InteractiveViewer`. The toolkit's functionality moves into the AI panel.

**Implementation:** `AiAssistantPanel` component — `features/ai-assistant/AiAssistantPanel.tsx`. The panel is rendered inside `StudentActivityWorkspace` at the root level (alongside the OutlineRail). State managed by a new `AiPanelContext` or simple local state lifted to `StudentActivityWorkspace`.

### 5.3 Bottom Bar Change

Remove the "AI Assistant" nav slot from `BottomActionBar` entirely. The three-slot layout becomes strictly:

```
← Previous: [title]     [Primary CTA]     Next: [title] →
```

---

## Part 6 — Database Migration: Drop Assignment Tables

### 6.1 Scope

The `assignment` and `assignmenttask` tables are legacy — all data has been migrated to the unified assessment system. The `ActivityTypeEnum` does not contain `TYPE_ASSIGNMENT`. No application code queries these tables.

### 6.2 Pre-Migration Checks

Before running the migration, verify:
```sql
-- Should return 0 rows for both
SELECT COUNT(*) FROM assignment;
SELECT COUNT(*) FROM assignmenttask;
```

If rows exist, they are orphaned legacy data — they are safe to discard (all live data has been migrated).

### 6.3 Migration File

**File:** `apps/api/migrations/versions/aa1bb2cc3dd4_drop_assignment_tables.py`

```python
"""Drop legacy assignment and assignmenttask tables.

All data has been migrated to the unified assessment/submission system.
ActivityTypeEnum has never contained TYPE_ASSIGNMENT since the rewrite.
These tables are safe to drop.

Revision ID: aa1bb2cc3dd4
Revises: <current_head>
Create Date: 2026-05-19
"""

from collections.abc import Sequence
import sqlalchemy as sa
from alembic import op

revision: str = "aa1bb2cc3dd4"
down_revision: str | None = "<insert_current_head>"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    existing = set(inspector.get_table_names())

    # Drop in dependency order (FK from assignmenttask → assignment)
    if "assignmenttask" in existing:
        op.drop_table("assignmenttask")
    if "assignment" in existing:
        op.drop_table("assignment")


def downgrade() -> None:
    # Intentionally not implemented — data loss is expected and accepted.
    # If rollback is needed, restore from the backup taken before upgrade.
    raise NotImplementedError(
        "Downgrade of drop_assignment_tables is not supported. "
        "Restore from backup if required."
    )
```

### 6.4 Codebase Cleanup

After migration:
- Delete test assertions that reference `assignment` / `assignmenttask` table existence (`test_student_activity_runtime.py` lines 100–106)
- Remove any remaining Alembic `downgrade()` functions that recreate `assignmentusersubmission` or `assignmenttasksubmission` (already partially done in previous migrations — audit all versions)

---

## Part 7 — Implementation Phases

### Phase 0 — DB Cleanup (1 day)
**Goal:** Drop legacy tables, clean test assertions.

Deliverables:
- [ ] `aa1bb2cc3dd4_drop_assignment_tables.py` migration (see §6.3)
- [ ] Remove `assignment` table references from Python tests
- [ ] `alembic upgrade head` on dev + staging

No frontend changes.

---

### Phase 1 — Shell & Rail Redesign (2 days)
**Goal:** Zero-width OutlineRail, AI panel button in header, bottom bar cleanup.

Deliverables:
- [ ] `OutlineRail.tsx` — remove `ChapterRing`/`ChapterDots`, make rail `position:fixed` always, `w-[300px]` always, `translate-x-[-300px]` when closed. Remove `w-14` from DOM flow.
- [ ] `StudentActivityWorkspace.tsx` — remove `OutlineRail` from the flex row's sibling. Render it as a portal or at root. `main` becomes `w-full`.
- [ ] `ActivityHeader.tsx` — remove status badge, add `[AI]` button that fires `onToggleAi` prop.
- [ ] `BottomActionBar.tsx` — remove "AI Assistant" nav slot. Three-slot strictly: prev | CTA | next. Add `border-t border-border`.
- [ ] `InlineStatusStrip.tsx` — replace dot-separated string with `<Badge>` pills.
- [ ] `StudentActivityWorkspace.tsx` — add `AiAssistantPanel` placeholder (renders `null` until Phase 3).

---

### Phase 2 — Content Zone Redesign (2 days)
**Goal:** Proper reading layout for `TYPE_DYNAMIC`, fix PDF height, fix video width.

Deliverables:
- [ ] `prosemirror.css` — change `max-width: min(100%, 92ch)` → `min(72ch, 100%)` for prose, keep `max-width: 100%` for media breakout elements (see §4.1).
- [ ] `InteractiveViewer.tsx` — remove hardcoded `showDesktopTableOfContents={false}`. Let the component decide based on `hasToc`.
- [ ] `ActivityContentRenderer.tsx` — remove `showDesktopTableOfContents` prop entirely.
- [ ] `prosemirror.css` — update `@media (min-width: 1280px)` ToC grid to `1fr 240px` (see §4.1).
- [ ] `DocumentPdfActivity` wrapper in `ActivityContentRenderer` — fix height to `calc(100dvh - 6.25rem - 3.5rem)`.
- [ ] `VideoActivity` wrapper — ensure `w-full` without artificial padding.
- [ ] `AICanvaToolkit` — audit whether it conflicts with new layout. If it renders any absolute-positioned numbered elements, fix.

---

### Phase 3 — Code Challenge IDE Layout (3 days)
**Goal:** Full-viewport split-pane IDE for `TYPE_CODE_CHALLENGE` `ACTIVE_ATTEMPT`.

Deliverables:
- [ ] `CodeChallengeAttemptLayout.tsx` — main split pane wrapper, `position: fixed; inset: 0; top: 3.5rem`
- [ ] `ProblemStatementPanel.tsx` — left pane (problem description + test cases)
- [ ] `CodeEditorPanel.tsx` — right pane (Monaco + toolbar + results)
- [ ] `CodeTestResultsPane.tsx` — resizable bottom section inside right pane
- [ ] `ResizeDivider.tsx` — drag handle, `sessionStorage` persistence
- [ ] `AssessmentLayout.tsx` update — detect `kind === 'TYPE_CODE_CHALLENGE'` and route to `CodeChallengeAttemptLayout`
- [ ] Mobile fallback — tabbed layout `[Problem | Code | Tests]` for `< md` screens

---

### Phase 4 — AI Assistant Panel (2 days)
**Goal:** Contextual AI panel in a fixed right drawer.

Deliverables:
- [ ] `AiAssistantPanel.tsx` — `features/ai-assistant/AiAssistantPanel.tsx`; slide-in drawer
- [ ] `AiAssistantContext.tsx` — open/close state, context provided by `StudentActivityWorkspace`
- [ ] `StudentActivityWorkspace.tsx` — wire up panel, pass context
- [ ] Remove `AICanvaToolkit` from `InteractiveViewer` (functionality migrated to panel)
- [ ] Context-aware suggestions per activity type

---

### Phase 5 — Visual Polish & Typography (1 day)
**Goal:** Typography consistency, activity type identity, status strip redesign.

Deliverables:
- [ ] Activity type color palette: each type gets a hue-consistent `bg-[type]/10 text-[type]` token (defined in Tailwind theme)
- [ ] `AttemptEntryCard` and `AttemptResultCard` — use activity type color for the icon background
- [ ] `InlineStatusStrip` — pill redesign (see §3.5)
- [ ] Bottom bar CTA: minimum `w-44`
- [ ] Keyboard shortcut documentation: `?` key opens a shortcuts modal (shared across all pages)
- [ ] Ensure all new components pass accessibility audit (aria-labels, focus rings, keyboard nav)

---

## Part 8 — Component Inventory

### Delete (no wrapping, no porting)

| Component | Location | Reason |
|-----------|----------|--------|
| `ChapterRing` | `OutlineRail.tsx` (internal) | Replaced by zero-width rail |
| `ChapterDots` | `OutlineRail.tsx` (internal) | Replaced by zero-width rail |
| `ActivityActionPanel` | Already deleted ✓ | Old right-sidebar CTA |
| `ActivityMobileActionBar` | Already deleted ✓ | Old mobile CTA |
| `AICanvaToolkit` (inline) | `InteractiveViewer.tsx` | Moved to `AiAssistantPanel` |
| "AI Assistant" nav slot in `BottomActionBar` | `BottomActionBar.tsx` | Replaced by header button |
| `showDesktopTableOfContents` prop | `InteractiveViewer.tsx` | No longer needed |

### Rewrite

| Component | Location | What Changes |
|-----------|----------|-------------|
| `OutlineRail.tsx` | `features/student-activity/shell/` | Remove DOM-flow width, remove ChapterRing |
| `ActivityHeader.tsx` | `features/student-activity/shell/` | Remove status badge, add AI button |
| `BottomActionBar.tsx` | `features/student-activity/shell/` | Remove AI slot, add border-t |
| `InlineStatusStrip.tsx` | `features/student-activity/shell/` | Pill badges |
| `prosemirror.css` | `components/Objects/Editor/styles/` | 72ch max, media breakout, ToC grid |
| `InteractiveViewer.tsx` | `components/Objects/Editor/views/` | Remove `showDesktopTableOfContents` prop |
| `ActivityContentRenderer.tsx` | `app/_shared/.../activity/` | Remove ToC prop, fix PDF height |

### Create (new)

| Component | Location | Purpose |
|-----------|----------|---------|
| `CodeChallengeAttemptLayout.tsx` | `features/assessments/code/` | Full-viewport IDE shell |
| `ProblemStatementPanel.tsx` | `features/assessments/code/` | Left pane |
| `CodeEditorPanel.tsx` | `features/assessments/code/` | Right pane |
| `CodeTestResultsPane.tsx` | `features/assessments/code/` | Resizable results |
| `ResizeDivider.tsx` | `features/assessments/code/` | Drag handle |
| `AiAssistantPanel.tsx` | `features/ai-assistant/` | Right-slide AI panel |
| `AiAssistantContext.tsx` | `features/ai-assistant/` | Open/close state |
| `aa1bb2cc3dd4_drop_assignment_tables.py` | `api/migrations/versions/` | DB migration |

### Keep (no changes)

| Component | Reason |
|-----------|--------|
| `StudentActivityWorkspace.tsx` | Shell structure is correct after Phase 1 delta |
| `ActivityOutlineContent.tsx` | Tree content is fine |
| `AttemptEntryCard.tsx` | Already rewritten in v1 |
| `AttemptResultCard.tsx` | Already rewritten in v1 |
| `InlineAssessmentWorkspace.tsx` | State machine is correct |
| `LockStateCard.tsx` | Already created in v1 |
| `FileSubmissionWorkspace.tsx` | Already implemented |
| `BottomActionBar.tsx` routing logic | Architectural pattern is correct |
| `ActivityLayoutContext.tsx` | `bottomBarAction` override pattern is correct |

---

## Part 9 — Technical Specifications

### 9.1 CSS Custom Properties (add to `:root`)

```css
:root {
  --activity-header-height: 2.75rem;    /* 44px */
  --global-nav-height: 3.5rem;          /* 56px */
  --bottom-bar-height: 3.5rem;          /* 56px */
  --outline-rail-width: 300px;
  --content-height: calc(
    100dvh 
    - var(--global-nav-height) 
    - var(--activity-header-height) 
    - var(--bottom-bar-height)
  );
}
```

### 9.2 Layout Mode Data Attributes

The `data-layout-mode` attribute on `<html>` drives CSS-level hiding:

```css
/* Hide bottom bar and outline in focus mode */
[data-layout-mode="focus"] .bottom-action-bar,
[data-layout-mode="focus"] .outline-rail {
  display: none;
}

/* Full-viewport in active attempt */
[data-layout-mode="active-attempt"] .bottom-action-bar {
  display: none;
}
```

### 9.3 Responsive Breakpoints for Activities

| Breakpoint | OutlineRail | ToC | Split Pane (Code) |
|------------|-------------|-----|-------------------|
| `< md` (< 768px) | Button → Sheet | Hidden | Tabs |
| `md–lg` (768–1024px) | Button → Fixed overlay | Hidden | Split pane (narrow) |
| `≥ lg` (≥ 1024px) | Button → Fixed overlay | Show if hasToc | Split pane (full) |

### 9.4 Split Pane Drag Implementation

```tsx
// ResizeDivider.tsx
// Uses pointer events (works for both mouse and touch)
// Constraints: min 280px per pane, max 70% per pane
// Persistence: sessionStorage key = `split-pane-${activityUuid}`
```

### 9.5 Migration Safety Check Script

```python
# Run this BEFORE the Alembic upgrade in production
# apps/api/scripts/check_assignment_tables_empty.py

from sqlalchemy import create_engine, text
import os

engine = create_engine(os.environ["DATABASE_URL"])
with engine.connect() as conn:
    for table in ("assignment", "assignmenttask"):
        result = conn.execute(text(f"SELECT COUNT(*) FROM {table}"))  # noqa: S608
        count = result.scalar()
        if count > 0:
            raise RuntimeError(
                f"Table '{table}' has {count} rows. "
                "Run data migration before dropping."
            )
    print("✓ Both tables are empty. Safe to run migration.")
```

---

## Part 10 — Acceptance Criteria

### Shell & Rail
- [ ] OutlineRail takes **0px** horizontal space when closed on all viewport sizes
- [ ] `main` content zone is `w-full` with no left sibling
- [ ] Outline opens/closes via header button and `O` keyboard shortcut
- [ ] `Escape` closes the outline, closes the AI panel
- [ ] Focus mode hides bottom bar and prevents outline from opening

### Content Quality
- [ ] `TYPE_DYNAMIC` text is readable (72ch), images break out to full container width
- [ ] ToC appears in right margin on `≥xl` screens when page has `≥2` headings
- [ ] `TYPE_DOCUMENT` PDF viewer fills full remaining viewport height
- [ ] `TYPE_VIDEO` player is full container width, aspect-preserved

### Code Challenge
- [ ] `ACTIVE_ATTEMPT` takes over full viewport (below global nav only)
- [ ] Monaco editor fills right pane (no fixed pixel height)
- [ ] Drag handle resizes panes with min/max constraints
- [ ] Pane width persists via `sessionStorage` between page navigations
- [ ] Mobile shows three tabs: Problem / Code / Tests

### AI Assistant
- [ ] `[✨ AI]` button in header opens right-slide panel
- [ ] Panel is 400px wide on desktop, full-screen on mobile
- [ ] Panel shows context-relevant prompt suggestions
- [ ] "AI Assistant" is NOT a nav item in `BottomActionBar`

### Database
- [ ] `assignment` table does not exist in production DB after migration
- [ ] `assignmenttask` table does not exist in production DB after migration
- [ ] All API tests pass after cleanup
- [ ] TypeScript: `grep -r "TYPE_ASSIGNMENT" apps/web/src` returns 0

### Visual Polish
- [ ] `BottomActionBar` has `border-t border-border`
- [ ] CTA button in bottom bar: minimum `w-44`
- [ ] `InlineStatusStrip` uses `<Badge>` pills, no dot separators
- [ ] Status badge removed from `ActivityHeader`

---

## Appendix — Decision Log

| Decision | Rationale |
|----------|-----------|
| Zero-width collapsed rail (0px, not 56px) | 56px is stolen from content with no return value for the user. Chapter progress rings are not actionable and not readable. |
| 72ch prose max-width (not 92ch) | 65–75 chars per line is the typographic optimum for reading comprehension. 92ch is too wide for prose. Media elements still break out to full width. |
| Split pane only in ACTIVE_ATTEMPT | PREFLIGHT and RESULT are static info cards, not IDE surfaces. Adding split pane there adds complexity with no benefit. |
| AI panel from header, not bottom bar | Bottom bar is navigation chrome. AI is a tool/surface. Conflating them violates information architecture. |
| Hard DROP for assignment tables | No live data, no dependencies. Keeping dead tables adds confusion and migration risk long-term. |
| No `downgrade()` for table drop migration | Downgrading a DROP TABLE means recreating an empty table with no data. This is meaningless as a recovery strategy. Backups are the correct rollback mechanism. |
