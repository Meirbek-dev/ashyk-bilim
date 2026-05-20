# Assessment Studio Redesign & Rewrite Plan

**Author:** Antigravity AI & Senior UX Architect  
**Scope:** Teacher Studio authoring workspace for Exams and Tests (`TYPE_EXAM`)  
**Objective:** Rewrite the chaotic, incomplete, and inconvenient single-scroll page into a world-class, high-fidelity three-tab authoring workspace with rich micro-interactions and strict validation guardrails.

---

## Part 1 — Critical UX Audit

### 1.1 UI Screenshot Critique

Based on the developer studio screenshots, the current implementation suffers from severe user experience issues:

| Issue | Root Cause | Severity |
| :--- | :--- | :--- |
| **Monolithic Scrolling Page** | General settings (`Настройки`) and question content (`Содержание`) are rendered sequentially on a single scroll page. The user scrolls past settings to edit questions, causing extreme vertical fatigue. | 🔴 Critical |
| **Fake Workflow Steps** | The steps header ("Настройка", "Содержание", "Публикация") looks like a tab bar but is actually just a static progress tracker. Clicking them does not isolate views. | 🔴 Critical |
| **Cluttered & Overlapping Sidebar** | The right-side outline sidebar mixes question outline, a static summary of the exam policy (which is editable in the main body!), and global validation warnings. It is visually overwhelming. | 🟠 High |
| **Ugly Validation Warning Banners** | Validation errors are rendered as large amber boxes directly *inside* the editing forms (e.g. inside the question title and options editor), disrupting the form layout and shifting inputs around. | 🟠 High |
| **Flat & Dry Visual Aesthetics** | Zero micro-interactions. Dull color coding (flat gray and light green borders). Options inputs look like standard input fields with no clear visual distinction for "Correct" options (which should look like elevated cards with green accents). | 🟠 High |
| **No Interactive Canvas** | Question ordering is fixed in a list; no drag-and-drop reordering. Prompt is a basic text input field with no rich-text capabilities. | 🟠 High |

---

## Part 2 — The Redesign Vision (World-Class LMS)

We will redesign the Assessment Studio around a **3-Tab Workspace Paradigm** where each tab represents a distinct, isolated mental context. The top progress bar will be converted into a functional tab navigation bar.

```
┌──────────────────────────────────────────────────────────────────────────┐
│ [≡] Courses > Midterm Exam                                     [Preview] │ (Header)
├──────────────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐     ┌──────────────┐     ┌─────────────────────────┐   │
│  │ ⚙️ Setup &    │     │ 📝 Questions │     │ 🚀 Review &             │   │ (Tab Navigation)
│  │    Policies  │     │    Builder   │     │    Publish              │   │
│  └──────────────┘     └──────────────┘     └─────────────────────────┘   │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│                       TAB CONTENT WORKSPACE                              │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

### 2.1 Tab 1: Setup & Policies (Настройки и Безопасность)
Focuses on general exam rules, grading, and security.

- **Details & Description:** Standard details card with Rich Text description editing.
- **Access & Timing:** Attempt limit, due date/time, and timer configuration with clean sliders.
- **Integrity Suite (Anti-Cheat Control Center):** Redesigned as a visual matrix of proctoring features. Enabling them updates a dynamic **"Security Score Shield"** at the top right, giving immediate feedback on exam rigidity.

### 2.2 Tab 2: Questions Builder (Конструктор Вопросов)
A focused layout inspired by modern design tools (Figma/Webflow).

- **Left Outline Panel (320px):**
  - Searchable list of questions.
  - Drag-and-drop handles for reordering.
  - Inline points badge and question kind indicator.
  - Hover states show quick duplicate/delete buttons.
- **Middle Editing Canvas (Flex-1):**
  - Displays **only the selected question**.
  - **Rich-text Prompt Editor:** Allows formatting, LaTeX formulas, code snippets, and image uploading.
  - **Visual Choice Options Editor:** Options are represented as cards. Selecting the correct option turns the card green (`bg-emerald-50 border-emerald-500` in light mode) with a subtle checkmark transition.
- **Right Inspector Panel (280px, collapsible):**
  - Contextual parameters of the selected question (e.g. weight, rubric, custom feedbacks, tag attachments).

### 2.3 Tab 3: Review & Publish (Проверка и Публикация)
A dashboard summarizing the health of the exam and options for launch.

- **Pre-flight Checklist:** Categorized listing of validation issues. Clicking an issue (e.g. *"Option 3 in Question 2 is missing text"*) auto-redirects the user to Tab 2, selects Question 2, and focuses on Option 3.
- **Exam Dashboard Metrics:** Total questions by kind (pie chart or visual metrics), total points, and expected duration.
- **Scheduling Controls:** Interactive date-picker with timezone support and quick publication actions.

---

## Part 3 — Layout & Navigation Architecture

### 3.1 Workspace Layout Redesign

The layout wrapper in `AssessmentStudioWorkspace.tsx` will switch from grid columns to a flex container that mounts the active tab.

```typescript
type StudioTab = 'SETUP' | 'BUILDER' | 'PUBLISH';

// The workspace will store this state:
const [activeTab, setActiveTab] = useState<StudioTab>('BUILDER');
```

```
WORKSPACE LAYOUT ACCORDING TO TAB:

1. activeTab === 'SETUP':
┌──────────────────────────────────────────────────────────────────────────┐
│ Central Form Container (max-w-4xl mx-auto py-8 px-6)                     │
│ General Config · Timing & Restrict · Anti-Cheat Security Shield          │
└──────────────────────────────────────────────────────────────────────────┘

2. activeTab === 'BUILDER':
┌──────────────────────┬───────────────────────────────────────────────────┐
│ Left Sidebar (320px) │ Middle Edit Canvas (flex-1, p-6)                  │
│ Question List        │ Focused selected question editor                  │
│ Drag-and-Drop        │ Choice cards / Open Text / Matching Grid          │
└──────────────────────┴───────────────────────────────────────────────────┘

3. activeTab === 'PUBLISH':
┌──────────────────────────────────────────────────────────────────────────┐
│ Dashboard & Review Panel (max-w-5xl mx-auto grid grid-cols-3 gap-6)      │
│ ┌───────────────────────────┐ ┌────────────────────────────────────────┐ │
│ │ Metric Cards & Scheduling │ │ Validation Pre-flight Checklist        │ │
│ └───────────────────────────┘ └────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## Part 4 — Visual Standards & Aesthetics

We will use TailwindCSS utility styling along with Shadcn/Radix components to establish a premium UI feel:

1. **Active States with Smooth Gradients:** 
   - Tab toggles will use a smooth sliding capsule layout (`framer-motion` layout animation or CSS transition).
   - Selected items inside the outline sidebar will glow with a soft indigo/blue left border and matching subtle background tint.
2. **Glassmorphism for Settings Panels:**
   - Security toggles use translucent panels with 1px border highlights: `bg-card/50 backdrop-blur-md border border-border/80`.
3. **Interactive Correct-Answer Cards:**
   - Choices inside a question will animate when marked correct:
     ```css
     .choice-card-correct {
       @apply border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20 shadow-sm transition-all duration-300 scale-[1.01];
     }
     ```
4. **Soft Shake Animation for Form Errors:**
   - Shaking effect when saving invalid configurations or displaying inline errors next to input boundaries.
5. **Dnd Reordering Indicators:**
   - Active drag states will show drop zones with dashed purple borders and floating shadows.

---

## Part 5 — Detailed Implementation Phases

### Phase 1 — State Management & Tab Architecture (2 Days)
Refactor `AssessmentStudioWorkspace.tsx` to handle tab routing and state sync.

- **Deliverables:**
  - Create the `activeTab` state and replace the progress cards with interactive, beautiful tab selectors.
  - Implement dynamic rendering: only mount the relevant sub-component for the selected tab to clean up the DOM.
  - Integrate `react-hook-form` to split form contexts (General settings form, individual question edit form) to avoid validation conflicts.

### Phase 2 — Proctoring Security Suite (Tab 1) (2 Days)
Build the visual Proctoring Configuration grid and Security Shield component.

- **Deliverables:**
  - Create `IntegritySuiteGrid.tsx` to group proctoring toggles.
  - Implement a `SecurityShieldBadge.tsx` that computes a security score based on active anti-cheat configurations:
    - *0-1 features:* Low Security (Gray Shield)
    - *2-3 features:* Medium Security (Amber Shield)
    - *4+ features:* Secure Proctoring (Emerald Shield with checkmark)
  - Style with micro-animations on toggle.

### Phase 3 — Drag-and-Drop Question Outline (Tab 2 - Left) (2 Days)
Implement interactive outline panel inside `NativeItemStudio.tsx` (`NativeItemOutline`).

- **Deliverables:**
  - Integrate `@hello-pangea/dnd` for smooth vertical question sorting.
  - Create outline items that display question numbers, truncated prompts, and small points tags.
  - Show warning dots (using tooltips for full details) on questions with errors instead of breaking the layout with text.

### Phase 4 — High-Fidelity Canvas Editor (Tab 2 - Middle) (3 Days)
Rebuild the question editor components to support modern authoring inputs.

- **Deliverables:**
  - Refactor Choice question options layout. Options become clickable card components. Toggling correct/incorrect answers has a click animation.
  - Add markdown capabilities to the prompt textarea.
  - Create matching pair editor with connecting layout styles.

### Phase 5 — Pre-Flight Checklist & Metric Dashboard (Tab 3) (2 Days)
Build the final confirmation screen to assist the teacher before publishing.

- **Deliverables:**
  - Design a unified checklist that parses `validationIssues`. Group them by question name and error severity.
  - Implement "One-Click Fix" links that automatically direct the user's view (change tab, select question uuid, focus input).
  - Add simple data visualization for total scores and questions breakdown.
  - Integrate the datetime-picker with timezone support for scheduled launches.

---

## Part 6 — Component Inventory Updates

### 6.1 Components to Delete
- Old monolithic scrolling fields inside `NativeItemAuthor.tsx`.
- Redundant `PolicyInspector.tsx` that duplicates policies.
- Inline yellow block warning banners (`InlineIssueList` and `InlineIssueMessage`).

### 6.2 Components to Rewrite

| Component | Path | Changes |
| :--- | :--- | :--- |
| `AssessmentStudioWorkspace` | `studio/AssessmentStudioWorkspace.tsx` | Implement tab states, mount active tab views, restructure header layout. |
| `NativeItemOutline` | `studio/NativeItemStudio.tsx` | Rewrite as a drag-and-drop outline sidebar. Remove bottom policy summaries. |
| `NativeItemAuthor` | `studio/NativeItemStudio.tsx` | Split into sub-components per tab: `GeneralSettingsTab`, `BuilderCanvasTab`, `PublishDashboardTab`. |
| `ChoiceItemAuthor` | `items/choice/ChoiceItemAuthor.tsx` | Rewrite options inputs as interactive visual choice cards. |

### 6.3 Components to Create (New)

| Component | Path | Purpose |
| :--- | :--- | :--- |
| `GeneralSettingsTab` | `studio/tabs/GeneralSettingsTab.tsx` | Tab 1: General details & proctoring parameters. |
| `BuilderCanvasTab` | `studio/tabs/BuilderCanvasTab.tsx` | Tab 2: Split screen containing outline list & selected question canvas. |
| `PublishDashboardTab` | `studio/tabs/PublishDashboardTab.tsx` | Tab 3: Pre-flight checklist & scheduling options. |
| `SecurityShieldBadge` | `shared/SecurityShieldBadge.tsx` | Visual indicator tracking security levels. |
| `DragDropList` | `studio/components/DragDropList.tsx` | Reusable drag-and-drop list utilizing `@hello-pangea/dnd`. |
| `PreflightChecklist` | `studio/components/PreflightChecklist.tsx` | Interactive validation errors panel. |

---

## Part 7 — Acceptance Criteria

### Workspace Layout & Tabs
- [ ] Clicking on tabs successfully isolates views without loading delays.
- [ ] Active tab highlights move with fluid micro-interactions.
- [ ] Workspace adaptively resizes: Builder layout splits vertically on desktop, collapses to stacked views on tablet/mobile.

### Proctoring Suite
- [ ] Toggling anti-cheat features updates the Security Shield indicator.
- [ ] Clean tooltips explaining the function of each proctoring toggle (e.g. *DevTools detection*, *Tab switch tracking*).

### Question Builder
- [ ] Teachers can drag questions to change their sequential ordering. Reordering triggers a background `PATCH` request to sync layout indices.
- [ ] Choice options cards toggle visual "Correct" states with clear color transitions (Emerald check/bg).
- [ ] Prompts are editable via rich-text, preserving formatted snippets.

### Checklist & Publishing
- [ ] The pre-flight checklist updates dynamically as settings save in the background.
- [ ] Clicking a checklist warning navigates the workspace to the exact question canvas requiring fixes.
- [ ] Launching or scheduling triggers success modals detailing exam info (Points, timer limits, proctoring enabled).
