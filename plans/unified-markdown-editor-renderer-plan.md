# Unified Markdown Editor and Renderer Plan

**Date:** 2026-05-24  
**Scope:** Shared Markdown authoring, rendering, persistence, and migration for assessment task descriptions, file submission instructions, coding challenge problem statements, exam question prompts, explanations, rubrics, and teacher-managed course descriptions.  
**Target:** A world-class, next-generation, production-ready LMS authoring and reading experience that feels consistent across every content surface.

---

## 1. Executive Summary

Ashyq Bilim already has the core ingredients for rich Markdown content:

- `apps/web/src/features/assessments/shared/RichTextPromptEditor.tsx` provides a lightweight TipTap editor that stores Markdown.
- `apps/web/src/features/assessments/shared/MarkdownRenderer.tsx` renders GFM and KaTeX with `react-markdown`.
- `apps/web/src/components/Objects/Editor/*` contains a larger TipTap-based course content editor with Markdown support through `tiptap-markdown`.
- `apps/web/src/features/code-arena/authoring/ProblemStatementEditor.tsx` has a Markdown preview flow for coding problems.
- Assessment, file submission, and course description fields already persist plain strings, which can become Markdown-compatible without a breaking storage rewrite.

The issue is fragmentation. Different assessment types and course editing flows use different textareas, lightweight editors, preview behavior, and renderers. This creates inconsistent teacher UX, uneven Markdown support, duplicated validation, and student-facing rendering drift.

The plan is to introduce a shared **Content Authoring Platform** inside the web app:

```text
apps/web/src/features/content-markdown/
  editor/
    MarkdownEditor.tsx
    MarkdownEditorToolbar.tsx
    MarkdownEditorShell.tsx
    MarkdownEditorPreview.tsx
    MarkdownEditorCommandMenu.tsx
    markdown-editor-types.ts
  renderer/
    MarkdownContent.tsx
    MarkdownCodeBlock.tsx
    MarkdownMath.tsx
    markdown-sanitize.ts
    markdown-renderer-types.ts
  presets/
    presets.ts
    assessment.ts
    course.ts
    code-challenge.ts
  hooks/
    useMarkdownAutosave.ts
    useMarkdownEditorPreferences.ts
    useMarkdownValidation.ts
  utils/
    markdown-normalize.ts
    markdown-extract.ts
    markdown-limits.ts
    markdown-fixtures.ts
```

All gradeable task descriptions and course descriptions should use this shared package. Assessment-specific and course-specific screens should pass a preset and content context, not implement their own Markdown authoring logic.

---

## 2. Current State Audit

### 2.1 Existing Markdown Renderer

File: `apps/web/src/features/assessments/shared/MarkdownRenderer.tsx`

Current strengths:

- Supports GitHub Flavored Markdown through `remark-gfm`.
- Supports inline and block math through `remark-math` and `rehype-katex`.
- Uses contained prose classes for assessment prompts and options.
- Is simple and reusable today.

Current gaps:

- It is located under `features/assessments`, so course surfaces and file submission surfaces have no obvious canonical renderer.
- It does not define a supported Markdown policy by context.
- It has no explicit sanitization boundary beyond React Markdown defaults and the current plugin choices.
- It does not include code block copy controls, Shiki highlighting, heading anchors, table wrapping, image/link policy, attachment policy, or accessibility enhancements.
- It does not expose render modes for compact prompt, full task statement, course description, review feedback, or print/export.

### 2.2 Existing Lightweight Prompt Editor

File: `apps/web/src/features/assessments/shared/RichTextPromptEditor.tsx`

Current strengths:

- Uses TipTap with `tiptap-markdown`.
- Stores Markdown, which is the right persistence model for prompts and descriptions.
- Has basic toolbar actions for bold, italic, inline code, heading, and lists.
- Can be embedded into item editors.

Current gaps:

- It is assessment-specific by location and name.
- It is too small for production LMS authoring across courses and task statements.
- It has no split preview, full preview, source mode, command menu, image/file insert policy, table support, code block language controls, Markdown shortcuts help, autosave integration, content limits, or validation.
- It uses a dynamic Tailwind class for `minHeight` that may not compile reliably: ``min-h-[${minHeight}]``.
- It contains mojibake in comments/rendered helper text, indicating encoding or copy issues.

### 2.3 Assessment Studio

Files:

- `apps/web/src/features/assessments/studio/tabs/GeneralSettingsTab.tsx`
- `apps/web/src/features/assessments/studio/tabs/QuestionInspectorPanel.tsx`
- `apps/web/src/features/assessments/studio/NativeItemStudio.tsx`
- `apps/web/src/features/assessments/items/*`

Current state:

- Assessment metadata description uses a plain `Textarea`.
- Question explanations use a plain `Textarea`.
- Item prompts are partially covered through shared assessment Markdown components, but not uniformly across every item kind.
- Coding, choice, open-text, matching, and form prompts risk diverging in authoring quality.

Required direction:

- Every teacher-authored student-facing prompt, explanation, rubric note, and description must use the same editor and the same renderer.
- The studio should treat Markdown content as a first-class object with preview, validation, autosave, and student-view parity.

### 2.4 File Submission Studio

File: `apps/web/src/features/file-submissions/studio/FileSubmissionStudio.tsx`

Current state:

- `instructions` are edited with a plain `Textarea`.
- Instructions are a core task description surface and should support headings, lists, links, examples, rubrics, file naming rules, tables, and math.
- Publishing currently only checks `title.trim()` and `instructions.trim()`.

Required direction:

- Replace the instructions textarea with the unified Markdown editor.
- Render instructions through the unified renderer in student submission and review screens.
- Add file-submission-specific snippets and validation, such as accepted file checklist, naming convention, grading rubric, and late policy block.

### 2.5 Code Challenge Authoring

Files:

- `apps/web/src/features/code-arena/authoring/ProblemStatementEditor.tsx`
- `apps/web/src/features/assessments/registry/code-challenge/CodeChallengeStudio.tsx`
- `apps/web/src/features/assessments/registry/code-challenge/CodeChallengeAttemptContent.tsx`
- `apps/web/src/features/code-arena/attempt/ProblemPane.tsx`

Current state:

- The newer code arena problem statement editor supports Markdown preview but uses raw textareas for `prompt`, `input_spec`, `output_spec`, and constraints.
- The older code challenge studio is a stacked settings form without a world-class problem authoring surface.
- Student problem rendering already depends on Markdown rendering patterns.

Required direction:

- Use unified Markdown editor for problem statement, input spec, output spec, example explanations, editorial, hints, and solution notes.
- Use a code-challenge preset that includes code block language controls, example blocks, constraint snippets, and copyable input/output.
- Render the problem statement through the exact same renderer that preview uses.

### 2.6 Course General Editing

File: `apps/web/src/components/Dashboard/Pages/Course/EditCourseGeneral/EditCourseGeneral.tsx`

Current state:

- Course `description` uses a plain `Textarea` with a 1000-character max length.
- Course pages display the description as plain text in several places.
- Backend course schema already stores `description: str | None`.

Required direction:

- Course description should become Markdown-compatible while preserving list-card summaries.
- Course cards and search results should show extracted plain-text summaries.
- Course detail pages should render the full Markdown description.
- The teacher edit screen should offer a focused course-description preset, not the full assessment toolset.

---

## 3. Product Vision

Build one editor and one renderer that make teachers feel they are authoring polished learning content, not filling text boxes.

The experience should be:

1. **Consistent:** A teacher learns one editor and uses it everywhere.
2. **Fast:** Common LMS task structures are one click away.
3. **Trustworthy:** Preview matches student rendering exactly.
4. **Structured where needed:** Code challenges, exams, file submissions, and course descriptions get tailored presets without separate editors.
5. **Accessible:** Keyboard, screen readers, focus states, contrast, and semantic output are production-grade.
6. **Safe:** Markdown is sanitized, links are policy-controlled, raw HTML is disabled by default, and dangerous embeds are excluded.
7. **Localized:** UI strings support Kazakh, Russian, and English through `next-intl`; content remains teacher-authored Markdown.
8. **Reviewable:** Generated Markdown is clean enough to diff, version, audit, and migrate.

Target teacher workflow:

```text
Open task -> write with toolbar or Markdown shortcuts -> insert LMS block -> preview student view -> fix validation warnings -> publish with confidence
```

Target student workflow:

```text
Open task -> read a polished, scannable description -> copy code/input when needed -> understand requirements without layout noise
```

---

## 4. Supported Content Surfaces

### 4.1 Assessment-Level Description

Use for:

- Exam intro and instructions.
- Assignment overview.
- Assessment policy notes.
- Pre-task context.

Fields:

- `Assessment.description`
- `AssessmentCreate.description`
- `AssessmentUpdate.description`

Editor preset:

- `assessmentDescription`

Renderer mode:

- `taskDescription`

### 4.2 Assessment Item Prompts

Use for:

- Choice question prompt.
- Open-text prompt.
- Form prompt.
- Matching prompt.
- Code challenge prompt.

Fields:

- `ChoiceItemBody.prompt`
- `OpenTextItemBody.prompt`
- `FormItemBody.prompt`
- `MatchingItemBody.prompt`
- `CodeItemBody.prompt`

Editor preset:

- `questionPrompt`

Renderer mode:

- `prompt`

### 4.3 Assessment Explanations and Rubrics

Use for:

- Choice explanation.
- Matching explanation.
- Open text rubric.
- Teacher solution notes.
- Student feedback templates.

Fields:

- `ChoiceItemBody.explanation`
- `MatchingItemBody.explanation`
- `OpenTextItemBody.rubric`
- Future feedback template fields.

Editor preset:

- `explanation`

Renderer mode:

- `compactRichText`

### 4.4 File Submission Instructions

Use for:

- Submission task description.
- Required files.
- Naming rules.
- Academic integrity notes.
- Grading rubric.

Fields:

- `FileSubmissionConfig.instructions`
- `FileSubmissionUpdate.instructions`
- `FileSubmissionRead.instructions`

Editor preset:

- `fileSubmissionInstructions`

Renderer mode:

- `taskDescription`

### 4.5 Coding Challenge Problem Statement

Use for:

- Problem prompt.
- Input format.
- Output format.
- Example explanation.
- Hints.
- Editorial.

Fields:

- `CodeItemBody.prompt`
- `CodeItemBody.input_spec`
- `CodeItemBody.output_spec`
- `CodeTestCase.description`
- Code challenge hints and future editorial fields.

Editor presets:

- `codeProblemStatement`
- `codeInputSpec`
- `codeOutputSpec`
- `codeExampleExplanation`
- `codeHint`
- `codeEditorial`

Renderer modes:

- `codeProblem`
- `codeSpec`
- `compactRichText`

### 4.6 Course Description

Use for:

- Public course detail description.
- Course catalog rich description.
- Teacher-maintained course summary.

Fields:

- `Course.description`
- `CourseCreate.description`
- `CourseUpdate.description`
- `CourseMetadataUpdate.description`
- `CourseRead.description`
- `FullCourseRead.description`

Editor preset:

- `courseDescription`

Renderer modes:

- `courseDescription`
- `plainSummary`

---

## 5. Markdown Capability Matrix

| Capability | Assessment Prompt | File Submission | Code Challenge | Course Description | Feedback/Rubric |
| :--- | :---: | :---: | :---: | :---: | :---: |
| Bold, italic, strikethrough | Yes | Yes | Yes | Yes | Yes |
| Headings | H2-H4 | H2-H4 | H2-H4 | H2-H4 | H3-H4 |
| Bullet and numbered lists | Yes | Yes | Yes | Yes | Yes |
| Task lists | Optional | Yes | Optional | Optional | Yes |
| Tables | Yes | Yes | Yes | Yes | Yes |
| Inline code | Yes | Yes | Yes | Optional | Yes |
| Code blocks | Yes | Yes | Required | Optional | Yes |
| Syntax highlighting | Yes | Yes | Required | Yes | Yes |
| KaTeX math | Yes | Yes | Yes | Optional | Yes |
| Links | Yes, safe protocols | Yes, safe protocols | Yes, safe protocols | Yes, safe protocols | Yes |
| Images | Phase 2 controlled uploads | Phase 2 controlled uploads | Phase 2 controlled uploads | Phase 2 controlled uploads | No by default |
| Raw HTML | No | No | No | No | No |
| Embeds | No in first rollout | No in first rollout | No in first rollout | No in first rollout | No |
| Mermaid | Future | Future | Future | Future | No |

Default Markdown should be expressive enough for serious LMS content without becoming a general website builder.

---

## 6. Architecture

### 6.1 Shared Package Boundary

Create:

```text
apps/web/src/features/content-markdown/
```

This package owns:

- Authoring components.
- Rendering components.
- Markdown policy definitions.
- Sanitization and URL policy.
- Character and content validation.
- Plain text extraction for summaries, search, metadata, and cards.
- Editor preference persistence.
- Shared tests and fixtures.

This package must not import assessment-specific, course-specific, or file-submission-specific services. Product surfaces pass values, callbacks, labels, presets, and save state.

### 6.2 Public API

Recommended exports:

```typescript
export type MarkdownEditorPreset =
  | 'assessmentDescription'
  | 'questionPrompt'
  | 'explanation'
  | 'fileSubmissionInstructions'
  | 'codeProblemStatement'
  | 'codeInputSpec'
  | 'codeOutputSpec'
  | 'codeExampleExplanation'
  | 'codeHint'
  | 'codeEditorial'
  | 'courseDescription';

export type MarkdownRenderMode =
  | 'prompt'
  | 'taskDescription'
  | 'compactRichText'
  | 'codeProblem'
  | 'codeSpec'
  | 'courseDescription'
  | 'plainSummary';

export interface MarkdownEditorProps {
  value: string;
  onChange: (markdown: string) => void;
  preset: MarkdownEditorPreset;
  disabled?: boolean;
  placeholder?: string;
  minHeight?: number;
  maxHeight?: number;
  autoFocus?: boolean;
  saveState?: 'idle' | 'dirty' | 'saving' | 'saved' | 'error';
  validationContext?: MarkdownValidationContext;
  onBlur?: () => void;
}

export interface MarkdownContentProps {
  content: string;
  mode: MarkdownRenderMode;
  className?: string;
  emptyFallback?: React.ReactNode;
}
```

### 6.3 Component Composition

```text
MarkdownEditor
  MarkdownEditorShell
    MarkdownEditorToolbar
    MarkdownEditorCommandMenu
    MarkdownEditorBody
    MarkdownEditorStatusBar
    MarkdownEditorPreview

MarkdownContent
  MarkdownCodeBlock
  MarkdownTableWrapper
  MarkdownLink
  MarkdownMath
  MarkdownCopyButton
```

The editor should support three view modes:

- **Write:** TipTap rich editing surface.
- **Split:** editor and exact renderer preview side by side.
- **Preview:** renderer-only student view.

For compact contexts, such as question inspector explanation, the default can remain Write mode with a small preview toggle.

### 6.4 Editor Engine

Continue with TipTap because the repo already depends on:

- `@tiptap/react`
- `@tiptap/starter-kit`
- `@tiptap/extension-placeholder`
- `@tiptap/extension-link`
- `@tiptap/extension-table`
- `tiptap-markdown`
- local editor infrastructure under `apps/web/src/components/Objects/Editor/core`

Do not introduce another rich text editor unless TipTap cannot satisfy a hard requirement.

Recommended first implementation:

- Reuse `RichTextPromptEditor` behavior as the seed.
- Lift it into `features/content-markdown/editor/MarkdownEditor.tsx`.
- Add presets, toolbar slots, preview, validation, and renderer parity.
- Use the larger course editor components only where they are stable and reusable without dragging in course-canvas-specific behavior.

### 6.5 Renderer Engine

Continue with:

- `react-markdown`
- `remark-gfm`
- `remark-math`
- `rehype-katex`

Add:

- `MarkdownCodeBlock` using Shiki or the existing Shiki utility where practical.
- Copy buttons for code blocks and code challenge examples.
- Link component with safe protocol handling.
- Table wrapper for horizontal scrolling.
- Optional heading IDs for long course descriptions and coding challenge statements.

Raw HTML should remain disabled.

---

## 7. Data Model and API Strategy

### 7.1 Storage Format

Persist Markdown as UTF-8 strings in existing fields. This avoids a disruptive database migration for the first rollout.

The platform should define that these fields are Markdown-compatible:

- `Assessment.description`
- `AssessmentItem.body_json.prompt`
- `ChoiceItemBody.explanation`
- `OpenTextItemBody.rubric`
- `MatchingItemBody.explanation`
- `CodeItemBody.prompt`
- `CodeItemBody.input_spec`
- `CodeItemBody.output_spec`
- `CodeTestCase.description`
- `FileSubmission.instructions`
- `Course.description`

### 7.2 Naming Policy

Do not rename existing backend fields in the first rollout. Renaming `description` to `description_md` everywhere would create unnecessary contract churn.

Instead, document field semantics:

```text
description: Markdown-compatible teacher-authored content.
prompt: Markdown-compatible teacher-authored content.
instructions: Markdown-compatible teacher-authored content.
```

If a future API version needs explicitness, add read-only metadata:

```json
{
  "description": "## Course intro",
  "content_format": "markdown"
}
```

### 7.3 Plain Text Summaries

Many surfaces need plain summaries:

- Course cards.
- Search results.
- Open Graph metadata.
- Activity lists.
- Analytics tables.
- Breadcrumb tooltips.

Add a frontend utility:

```typescript
extractMarkdownSummary(markdown: string, options: {
  maxLength: number;
  preserveCode?: boolean;
}): string
```

Backend search can continue indexing raw strings initially, but long-term search should strip Markdown syntax and index normalized content.

### 7.4 Content Limits

Suggested initial limits:

| Field | Max Markdown Length | Notes |
| :--- | ---: | :--- |
| Course description | 8,000 chars | Current UI has 1,000; raise deliberately for rich course pages. |
| Assessment description | 10,000 chars | Exams can include instructions and policies. |
| Item prompt | 12,000 chars | Supports complex problem statements. |
| File submission instructions | 12,000 chars | Supports rubric and file requirements. |
| Code input/output spec | 4,000 chars each | Usually concise. |
| Explanation/rubric | 8,000 chars | Teacher feedback and grading logic. |
| Hint | 2,000 chars | Keep hints focused. |

Backend validation should eventually mirror frontend limits.

---

## 8. UX Design Requirements

### 8.1 Editor Shell

The shared editor should feel like a compact production writing tool, not a decorative card.

Required structure:

- Top toolbar with icon buttons and accessible tooltips.
- Segmented control for Write, Split, Preview.
- Optional context label, such as "Student instructions" or "Problem statement".
- Main editor area with stable min/max height.
- Bottom status bar with word count, character count, save state, validation state, and Markdown mode indicator.

Toolbar actions:

- Bold.
- Italic.
- Inline code.
- Code block.
- Heading.
- Bullet list.
- Numbered list.
- Task list where allowed.
- Link.
- Table where allowed.
- Math where allowed.
- Undo.
- Redo.
- Clear formatting.
- More menu for snippets and advanced actions.

Use `lucide-react` icons and the existing shadcn/base UI components.

### 8.2 Context Presets

Each preset controls:

- Enabled toolbar actions.
- Placeholder text.
- Initial snippets.
- Validation rules.
- Min and max height.
- Preview mode default.
- Renderer mode.

Example:

```typescript
const MARKDOWN_EDITOR_PRESETS = {
  fileSubmissionInstructions: {
    labelKey: 'fileSubmissionInstructions',
    enabledBlocks: ['heading', 'list', 'taskList', 'table', 'codeBlock', 'link', 'math'],
    snippets: ['submissionChecklist', 'fileNamingRules', 'rubricTable'],
    minHeight: 280,
    maxLength: 12000,
  },
  codeProblemStatement: {
    labelKey: 'problemStatement',
    enabledBlocks: ['heading', 'list', 'table', 'codeBlock', 'link', 'math'],
    snippets: ['problemTemplate', 'exampleBlock', 'constraints'],
    minHeight: 360,
    maxLength: 12000,
  },
};
```

### 8.3 LMS Snippets

Teachers should be able to insert structured blocks without memorizing Markdown.

Initial snippets:

- Task objective.
- Submission checklist.
- File naming rules.
- Grading rubric table.
- Academic integrity note.
- Coding problem template.
- Input/output format template.
- Example input/output block.
- Exam instructions.
- Short answer rubric.
- Course overview.
- Prerequisites.
- Learning outcomes.

Snippets are inserted as Markdown, not proprietary blocks, so output remains portable.

### 8.4 Preview Parity

The preview inside the editor must use `MarkdownContent`, the same renderer used in student and public views.

No separate preview renderer.
No "close enough" preview.

### 8.5 Mobile and Narrow Layout

On mobile:

- Use Write and Preview tabs, not split view.
- Toolbar scrolls horizontally with stable icon buttons.
- Sticky bottom status is optional; avoid covering content.
- Large course descriptions and task statements should render with readable line length and table overflow.

### 8.6 Accessibility

Requirements:

- Toolbar buttons have labels and keyboard focus states.
- Editor supports tab navigation without trapping the user.
- Preview headings are semantic.
- Code block copy buttons have accessible names.
- Link dialogs announce validation errors.
- Color is never the only indicator for validation.
- KaTeX output remains screen-reader tolerable; include source text fallback where needed.

---

## 9. Rendering Requirements

### 9.1 MarkdownContent Modes

`prompt`:

- Compact spacing.
- Good inside question cards.
- Last paragraph margin removed.
- Tables scroll if needed.

`taskDescription`:

- Full statement spacing.
- Strong heading hierarchy.
- Code copy buttons.
- Table wrappers.

`codeProblem`:

- Optimized for programming tasks.
- Copy buttons on code blocks.
- Stable typography inside split panes.
- Example input/output blocks should be easy to copy.

`courseDescription`:

- Public-facing prose quality.
- Optional heading anchors.
- Good catalog/detail page layout.

`compactRichText`:

- Used inside inspector panels, explanations, feedback, and option text.
- Low vertical density.

`plainSummary`:

- No React Markdown rendering.
- Extracts readable text and truncates.

### 9.2 Code Blocks

Code blocks should support:

- Language labels.
- Copy button.
- Shiki syntax highlighting.
- Horizontal scroll.
- Line wrapping toggle later.

For coding challenge statements, code and input/output examples should be visibly distinct from surrounding prose.

### 9.3 Math

Continue supporting KaTeX:

- Inline math: `$...$`
- Block math: `$$...$$`

Add validation warnings for unbalanced math delimiters.

### 9.4 Links

Allowed protocols:

- `http:`
- `https:`
- `mailto:`

Blocked:

- `javascript:`
- `data:`
- `vbscript:`
- protocol-relative URLs unless normalized safely.

External links should use safe `target` and `rel` behavior.

### 9.5 Images

Phase 1:

- Do not expose image insert in the unified Markdown editor unless existing upload policy is already wired for that surface.
- Renderer can ignore or safely render images only if URL policy allows them.

Phase 2:

- Add controlled uploads using existing upload infrastructure.
- Store Markdown image references only after upload succeeds.
- Add alt text requirement.

---

## 10. Integration Plan by Surface

### 10.1 Assessments: General Settings

File:

- `apps/web/src/features/assessments/studio/tabs/GeneralSettingsTab.tsx`

Change:

- Replace the plain `Textarea` for `state.description` with:

```tsx
<MarkdownEditor
  value={state.description}
  onChange={(description) => onChange({ ...state, description })}
  preset="assessmentDescription"
  disabled={disabled}
/>
```

Student rendering:

- Use `MarkdownContent mode="taskDescription"` wherever assessment descriptions are shown.

Readiness:

- Treat Markdown-only whitespace as empty.
- Warn on broken links and unclosed code fences.

### 10.2 Assessments: Item Prompts

Files:

- `apps/web/src/features/assessments/items/choice/index.tsx`
- `apps/web/src/features/assessments/items/open-text/index.tsx`
- `apps/web/src/features/assessments/items/form/index.tsx`
- `apps/web/src/features/assessments/items/matching/index.tsx`
- `apps/web/src/features/assessments/items/code/index.tsx`
- `apps/web/src/features/assessments/shared/RichTextPromptEditor.tsx`

Change:

- Replace direct usage of `RichTextPromptEditor` with the new `MarkdownEditor`.
- Replace direct usage of `MarkdownRenderer` with `MarkdownContent`.
- Keep compatibility exports during migration:

```typescript
export { MarkdownContent as MarkdownRenderer } from '@/features/content-markdown';
export { MarkdownEditor as RichTextPromptEditor } from '@/features/content-markdown';
```

This allows incremental adoption without a large one-shot refactor.

### 10.3 Assessments: Inspector Explanations

File:

- `apps/web/src/features/assessments/studio/tabs/QuestionInspectorPanel.tsx`

Change:

- Replace explanation `Textarea` with compact `MarkdownEditor`.
- Use preset `explanation`.
- Default to a smaller toolbar and no split view unless expanded.

### 10.4 File Submission Studio

Files:

- `apps/web/src/features/file-submissions/studio/FileSubmissionStudio.tsx`
- `apps/web/src/features/file-submissions/student/FileSubmissionWorkspace.tsx`
- `apps/web/src/features/file-submissions/review/FileSubmissionReviewWorkspace.tsx`

Change:

- Replace `instructions` textarea with `MarkdownEditor preset="fileSubmissionInstructions"`.
- Render instructions with `MarkdownContent mode="taskDescription"`.
- Add snippet menu entries:
  - Accepted file types.
  - Required naming format.
  - Submission checklist.
  - Rubric table.
  - Late work policy.

Publish validation:

- Continue requiring non-empty instructions.
- Add Markdown validation warnings, but only block on unsafe links, too-long content, or structurally empty content.

### 10.5 Coding Challenge Authoring

Files:

- `apps/web/src/features/code-arena/authoring/ProblemStatementEditor.tsx`
- `apps/web/src/features/assessments/registry/code-challenge/CodeChallengeStudio.tsx`
- `apps/web/src/features/code-arena/attempt/ProblemPane.tsx`

Change:

- Replace raw Markdown textareas with `MarkdownEditor`.
- Use presets:
  - `codeProblemStatement` for `prompt`.
  - `codeInputSpec` for `input_spec`.
  - `codeOutputSpec` for `output_spec`.
  - `codeExampleExplanation` for test/example descriptions.
- Render preview and student problem pane through `MarkdownContent mode="codeProblem"` or `mode="codeSpec"`.

Authoring UX:

- Keep the "Live Student Preview" concept, but make it render the exact production Markdown components.
- Add code problem snippets:
  - Problem statement skeleton.
  - Example block.
  - Constraints block.
  - Function signature note.

### 10.6 Course Description Editing

Files:

- `apps/web/src/components/Dashboard/Pages/Course/EditCourseGeneral/EditCourseGeneral.tsx`
- `apps/web/src/app/_shared/withmenu/course/[courseuuid]/course.tsx`
- `apps/web/src/app/_shared/withmenu/course/[courseuuid]/page.tsx`
- `apps/web/src/app/_shared/dash/courses/client.tsx`
- `apps/web/src/app/_shared/withmenu/search/search.tsx`

Change:

- Replace course description `Textarea` with `MarkdownEditor preset="courseDescription"`.
- Raise frontend schema max length to the agreed Markdown limit.
- Render full course descriptions using `MarkdownContent mode="courseDescription"`.
- Render cards and search rows using `extractMarkdownSummary`.

SEO:

- Use extracted plain text for metadata descriptions.
- Cap metadata summaries to standard search/social lengths.

---

## 11. Migration Strategy

### 11.1 Backward Compatibility

Existing plain text remains valid Markdown. No immediate data migration is required.

Examples:

```text
Upload your report as PDF.
```

renders identically as Markdown.

### 11.2 Incremental Code Migration

Phase in a compatibility bridge:

```text
features/assessments/shared/MarkdownRenderer.tsx -> re-export MarkdownContent
features/assessments/shared/RichTextPromptEditor.tsx -> re-export MarkdownEditor
```

Then gradually replace imports at call sites.

### 11.3 Data Cleanup

Optional later migration:

- Normalize CRLF to LF in Markdown fields.
- Trim trailing whitespace.
- Preserve intentional line breaks.
- Fix known mojibake in existing seed/sample content if present.

### 11.4 Rollout Controls

Add a temporary feature flag:

```typescript
NEXT_PUBLIC_UNIFIED_MARKDOWN_EDITOR=true
```

Use it only during the first rollout. Remove it once every target surface has migrated.

---

## 12. Validation and Safety

### 12.1 Markdown Validation

Implement `validateMarkdownContent(content, preset)` returning:

- `errors`: blocks save or publish.
- `warnings`: visible but non-blocking.
- `info`: quality suggestions.

Blockers:

- Unsafe link protocol.
- Content over max length.
- Raw HTML if detected and not allowed.
- Structurally empty content where required.

Warnings:

- Unclosed code fence.
- Unbalanced math delimiter.
- Very large table.
- Missing alt text for images once image support lands.
- More than one H1 in task contexts.
- Link text like "click here".

### 12.2 Security

Security rules:

- Raw HTML disabled.
- Renderer component overrides all `a`, `img`, `code`, `pre`, and `table` output.
- URL sanitizer is shared by editor link insertion and renderer.
- No arbitrary embeds in phase 1.
- No `dangerouslySetInnerHTML` in Markdown renderer.
- Hidden code challenge tests must never appear through prompt snippets or preview state.

### 12.3 Content Policy by Role

Teachers and authorized contributors can edit.
Students can render only.

No student-authored Markdown should be rendered through the same rich renderer without checking the trust model. If student submissions later support Markdown, use a stricter preset.

---

## 13. Production UX Details

### 13.1 Save State

Every authoring surface should show:

- Unsaved changes.
- Saving.
- Saved.
- Save failed.
- Offline or retrying if supported.

The editor itself should accept `saveState`, but actual persistence stays owned by the screen.

### 13.2 Keyboard Shortcuts

Initial:

- `Ctrl/Cmd+B`: bold.
- `Ctrl/Cmd+I`: italic.
- `Ctrl/Cmd+K`: link.
- `Ctrl/Cmd+Shift+7`: ordered list.
- `Ctrl/Cmd+Shift+8`: bullet list.
- `Ctrl/Cmd+Shift+C`: code block if not conflicting locally.
- `Ctrl/Cmd+/`: editor shortcuts/help.

Shortcuts should be visible in tooltips and command menu, not as permanent instructional text.

### 13.3 Command Menu

Add a lightweight command menu inside the editor for:

- Insert table.
- Insert code block.
- Insert math block.
- Insert LMS snippet.
- Switch preview mode.
- Clear formatting.

This should use existing command/menu primitives where possible.

### 13.4 Empty States

Empty editor:

- Context-specific placeholder.
- No large instructional panels inside the editor.
- Snippet menu available from toolbar.

Empty renderer:

- Return `emptyFallback` or null.
- Student task pages should show a clear "No instructions yet" state only for draft/teacher contexts.

### 13.5 Visual Direction

Keep LMS authoring calm and utilitarian:

- Dense, readable toolbars.
- 6-8px radii.
- Neutral backgrounds.
- Clear focus rings.
- Avoid nested cards around editor surfaces.
- Avoid oversized marketing typography inside authoring panels.
- Use icons for editor actions.

---

## 14. Implementation Milestones

### Milestone 0: Contract and Audit

Deliverables:

- Add this plan.
- Inventory every Markdown-like field and rendering location.
- Define `MarkdownEditorPreset`, `MarkdownRenderMode`, limits, and capability matrix.
- Add fixtures for common LMS Markdown examples.

Acceptance criteria:

- The team can answer which fields are Markdown-compatible.
- No editor implementation begins without agreed presets and limits.

### Milestone 1: Shared Renderer

Deliverables:

- Create `features/content-markdown/renderer/MarkdownContent.tsx`.
- Move current renderer behavior from `features/assessments/shared/MarkdownRenderer.tsx`.
- Add mode-based prose classes.
- Add safe link component.
- Add table wrapper.
- Add code block component with copy button.
- Add tests for rendering GFM, math, links, tables, and code blocks.

Acceptance criteria:

- Existing assessment prompt rendering still passes.
- Unsafe links do not render as clickable links.
- Tables do not overflow page layouts.
- Code blocks are copyable and readable in light/dark themes.

### Milestone 2: Shared Editor Foundation

Deliverables:

- Create `features/content-markdown/editor/MarkdownEditor.tsx`.
- Port the lightweight TipTap Markdown editor.
- Add toolbar, preview toggle, split mode, status bar, and presets.
- Add validation hook.
- Add compatibility re-exports for current assessment imports.

Acceptance criteria:

- Editor stores Markdown strings.
- Preview uses `MarkdownContent`.
- Existing prompt editor call sites can migrate with minimal prop changes.
- Editor works with keyboard-only input.

### Milestone 3: Assessment Migration

Deliverables:

- Migrate assessment general description.
- Migrate item prompts.
- Migrate choice/matching explanations and open-text rubrics.
- Replace assessment renderer imports with shared renderer.
- Add focused tests around authoring and rendering.

Acceptance criteria:

- Choice, open text, form, matching, exam, and code assessment prompts use unified editor/renderer.
- Teacher preview and student rendering match.
- Readiness checks treat Markdown-empty content correctly.

### Milestone 4: File Submission Migration

Deliverables:

- Migrate `FileSubmissionStudio.instructions`.
- Render instructions in student and review surfaces with shared renderer.
- Add file submission snippets.
- Add validation around links and content length.

Acceptance criteria:

- Teachers can create rich file submission instructions.
- Students see the same rendered content as preview.
- Existing plain instructions render unchanged.

### Milestone 5: Code Challenge Problem Authoring

Deliverables:

- Migrate code problem prompt, input spec, output spec, and example descriptions.
- Add code problem snippets.
- Use `MarkdownContent` in attempt problem pane.
- Add code-focused renderer mode.

Acceptance criteria:

- Code challenge statements support polished examples, code blocks, math, tables, and specs.
- Copyable code/input blocks work.
- Preview and attempt view use the same renderer.

### Milestone 6: Course Description Migration

Deliverables:

- Migrate course description editor.
- Update course schema frontend limit.
- Render course detail descriptions with shared renderer.
- Use extracted summaries on cards, search, metadata, and dashboards.

Acceptance criteria:

- Teachers can write rich course descriptions.
- Course cards remain concise and do not show Markdown syntax.
- Public course metadata uses plain extracted summaries.

### Milestone 7: Polish and Hardening

Deliverables:

- Playwright screenshots for major surfaces.
- Mobile layout QA.
- Dark/light theme QA.
- Accessibility pass.
- Remove temporary feature flag.
- Remove old assessment-specific editor and renderer wrappers after all imports migrate.

Acceptance criteria:

- No target surface uses a raw textarea for rich student-facing teacher-authored descriptions.
- No target surface imports Markdown editor/renderer from `features/assessments/shared`.
- Markdown rendering is visually consistent across assessment, file submission, code challenge, and course pages.

---

## 15. Testing Strategy

### 15.1 Unit Tests

Add tests for:

- Markdown normalization.
- Empty Markdown detection.
- Summary extraction.
- Unsafe link sanitization.
- Preset capability rules.
- Content length validation.
- Unbalanced math warning.
- Unclosed code fence warning.
- Code block rendering.
- Table wrapper rendering.

Suggested test folder:

```text
apps/web/src/tests/content-markdown/
```

### 15.2 Component Tests

Use Testing Library/Vitest for:

- Toolbar buttons update Markdown output.
- Preview renders current content.
- Disabled editor blocks editing.
- Validation messages appear.
- Copy button is present on code blocks.
- Compact mode does not produce oversized spacing.

### 15.3 Integration Tests

Cover:

- Assessment studio creates Markdown prompt and student attempt renders it.
- File submission studio saves Markdown instructions and student upload page renders them.
- Code challenge authoring saves Markdown problem statement and attempt pane renders it.
- Course general edit saves Markdown description and course page renders it.

### 15.4 Playwright

Add screenshots for:

- Assessment prompt authoring.
- Exam description rendering.
- File submission instructions.
- Code challenge problem statement with code blocks and math.
- Course description public page.
- Mobile editor write/preview flow.
- Dark mode rendering.

### 15.5 Security Tests

Cases:

- `[x](javascript:alert(1))`
- `<script>alert(1)</script>`
- `<img src=x onerror=alert(1)>`
- `[x](data:text/html;base64,...)`
- protocol-relative URLs.

Expected:

- No script execution.
- Unsafe links are stripped, disabled, or rendered as plain text.
- Raw HTML is not interpreted.

---

## 16. Observability and Quality Gates

Track:

- Markdown validation errors on save/publish.
- Editor mount errors.
- Renderer errors caught by boundaries.
- Save failure rate per surface.
- Average content length by field.
- Feature flag adoption during rollout.

Quality gates:

- `bun run --cwd apps/web test`
- `bun run --cwd apps/web check-types`
- Targeted Playwright flows before removing feature flag.
- Visual QA on desktop and mobile.

---

## 17. Risks and Mitigations

| Risk | Impact | Mitigation |
| :--- | :--- | :--- |
| Renderer changes alter existing prompts | Medium | Add compatibility mode and snapshot fixtures from existing assessment content. |
| Rich editor introduces hydration issues | High | Use client-only editor boundaries and `immediatelyRender: false`, matching current TipTap pattern. |
| Markdown tables break mobile layouts | Medium | Always wrap tables in horizontal scroll containers. |
| Unsafe links slip through | High | Share URL sanitizer between editor and renderer; add security tests. |
| Course cards show Markdown syntax | Medium | Use `extractMarkdownSummary`, never raw `description` for summaries. |
| Teachers overuse large formatting | Low | Preset-limited toolbar and content validation. |
| Existing backend limits reject richer descriptions | Medium | Update frontend and backend limits together for course/file/assessment fields. |
| Editor package grows into another full course canvas | Medium | Keep package scoped to Markdown text fields; no arbitrary embedded LMS blocks in phase 1. |

---

## 18. Success Metrics

Product metrics:

- 100% of target teacher-authored student-facing description fields use the unified editor.
- 100% of target student/public rendering uses the unified renderer.
- Teachers can preview exactly what students see.
- Course cards and search results never display Markdown syntax.
- File submission and code challenge descriptions support tables, code blocks, links, lists, and math.

Engineering metrics:

- No new assessment-specific Markdown editor implementation.
- No raw `Textarea` for target rich description surfaces.
- Shared Markdown tests cover all supported syntax.
- Unsafe Markdown security tests pass.
- Feature-specific components pass content via presets, not custom renderers.

UX metrics:

- A teacher can create a formatted file submission task in under two minutes.
- A teacher can create a code challenge problem with examples and constraints without writing raw Markdown from scratch.
- Students can read long task descriptions on mobile without horizontal page overflow.
- Keyboard-only editor authoring works for common formatting actions.

---

## 19. Non-Goals for First Rollout

- Replacing the full course activity/canvas editor.
- Supporting arbitrary HTML.
- Supporting arbitrary embeds.
- Building collaborative editing.
- Building a Notion-style block database.
- Migrating storage from Markdown strings to rich JSON documents.
- Enabling student-authored Markdown everywhere.
- Adding image uploads before upload policy, alt text, and storage references are fully designed.

---

## 20. Recommended First Pull Request

The first implementation PR should be small and infrastructure-focused:

1. Add `features/content-markdown/renderer/MarkdownContent.tsx`.
2. Move current `MarkdownRenderer` behavior into it.
3. Add link sanitizer, table wrapper, and code block copy support.
4. Re-export from `features/assessments/shared/MarkdownRenderer.tsx` for compatibility.
5. Add unit tests and fixtures.

This creates the canonical renderer without forcing every editor migration at once.

The second PR should introduce the shared `MarkdownEditor` and migrate one low-risk surface, ideally assessment item prompts or file submission instructions. After that, migrate the remaining surfaces surface-by-surface with tests.

---

## 21. Final Recommendation

Treat Markdown as a platform capability, not an assessment utility. The right design is a shared `content-markdown` feature with one editor, one renderer, preset-driven behavior, safe rendering, and exact preview parity.

This lets Ashyq Bilim deliver a polished LMS authoring experience across file submissions, coding challenges, exams, and course descriptions while keeping the backend storage simple and preserving existing content compatibility.
