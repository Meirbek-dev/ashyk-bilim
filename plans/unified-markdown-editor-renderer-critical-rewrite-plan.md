# Unified Markdown Editor and Renderer Critical Rewrite Plan

**Date:** 2026-05-24  
**Area:** `apps/web/src/features/content-markdown`, assessment authoring, file submission authoring, code challenge authoring, course descriptions, and all student-facing Markdown rendering.  
**Goal:** Refactor the current unified Markdown implementation into a production-grade LMS content authoring and viewing platform with strong correctness, safety, accessibility, performance, localization, and student-view parity.

---

## 1. Executive Verdict

The current implementation is a useful first pass, but it is not production-ready. It has the right top-level idea: a shared `features/content-markdown` package with a `MarkdownEditor`, `MarkdownContent`, presets, validation, extraction utilities, and compatibility wrappers for older assessment surfaces. However, the current package is still closer to a prototype than a world-class LMS content system.

The most serious issue is that the editor advertises capabilities that are either broken, incomplete, or not enforced. Code block authoring is shown in the toolbar, but the TipTap extension builder disables `codeBlock` and does not register a replacement. Validation finds issues, but save and publish flows do not consistently block unsafe or invalid Markdown. Rendering tests currently fail. Several target surfaces still use old wrappers or raw textareas. Course image support allows arbitrary external URLs instead of a controlled upload/proxy policy. The editor UI is also hardcoded in English in several places despite the app using `next-intl`.

The right path is not a cosmetic patch. The platform needs a deliberate refactor around explicit contracts:

- One canonical Markdown policy model.
- One canonical renderer with safe, tested output.
- One editor shell with true Markdown source, WYSIWYG, split preview, and exact student-view parity.
- Preset-driven behavior enforced by the editor, renderer, validation, and persistence boundaries.
- Surface adapters that integrate this shared capability into assessments, file submissions, code challenges, and courses without duplicating editor logic.

---

## 2. Current Implementation Map

### Shared Package

Current package:

```text
apps/web/src/features/content-markdown/
  editor/
    MarkdownEditor.tsx
    EditorToolbar.tsx
    EditorStatusBar.tsx
    EditorLinkDialog.tsx
    EditorImageDialog.tsx
    EditorSnippetPicker.tsx
  renderer/
    MarkdownContent.tsx
    MarkdownCodeBlock.tsx
    MarkdownHeading.tsx
    MarkdownImage.tsx
    MarkdownStreaming.tsx
  presets/
    presets.ts
  hooks/
    useMarkdownValidation.ts
  lib/
    tiptap-extensions.ts
    shiki.ts
  utils/
    markdown-sanitize.ts
    markdown-extract.ts
  index.ts
```

### Current Consumers

Already using the shared package:

- `apps/web/src/features/assessments/studio/tabs/GeneralSettingsTab.tsx`
- `apps/web/src/features/assessments/studio/tabs/QuestionInspectorPanel.tsx`
- `apps/web/src/features/assessments/items/open-text/index.tsx`
- `apps/web/src/features/assessments/items/form/index.tsx`
- `apps/web/src/features/assessments/items/matching/index.tsx`
- `apps/web/src/features/assessments/shared/canonical-item-rendering.tsx`
- `apps/web/src/features/file-submissions/studio/FileSubmissionStudio.tsx`
- `apps/web/src/features/file-submissions/student/FileSubmissionWorkspace.tsx`
- `apps/web/src/features/file-submissions/student/FileSubmissionResult.tsx`
- `apps/web/src/features/code-arena/authoring/ProblemStatementEditor.tsx`
- `apps/web/src/features/code-arena/attempt/ProblemPane.tsx`
- `apps/web/src/features/code-arena/attempt/HintDrawer.tsx`
- `apps/web/src/components/Dashboard/Pages/Course/EditCourseGeneral/EditCourseGeneral.tsx`
- `apps/web/src/app/_shared/withmenu/course/[courseuuid]/course.tsx`
- course/search/card summary surfaces through `extractMarkdownSummary`

Still using compatibility wrappers or older paths:

- `apps/web/src/features/assessments/items/choice/index.tsx`
- `apps/web/src/features/assessments/studio/NativeItemStudio.tsx`
- `apps/web/src/features/assessments/registry/exam/ExamQuestionCard.tsx`
- `apps/web/src/features/assessments/shared/RichTextPromptEditor.tsx`
- `apps/web/src/features/assessments/shared/MarkdownRenderer.tsx`

Still using raw textareas in relevant authoring contexts:

- `apps/web/src/features/assessments/studio/NativeItemStudio.tsx` for open-text rubric.
- `apps/web/src/features/code-arena/authoring/ProblemStatementEditor.tsx` for constraints.
- `apps/web/src/features/assessments/registry/code-challenge/HintsPanel.tsx`.
- `apps/web/src/features/assessments/registry/code-challenge/TestCaseListEditor.tsx`.
- `apps/web/src/features/file-submissions/review/FileSubmissionReviewWorkspace.tsx` for grading/review notes.
- `apps/web/src/components/Dashboard/Courses/CourseCreationWizard.tsx` still creates course descriptions with a short plain input model and a 500 character schema limit.

Some of these textareas are legitimate student input fields, but several are teacher-authored student-facing content fields and should be migrated.

---

## 3. Verification Snapshot

Focused tests were run with:

```bash
bun run --cwd apps/web test src/tests/content-markdown
```

Result:

```text
3 test files failed
4 tests failed
59 tests passed
```

Failures:

| Test file | Failure | Product impact |
| --- | --- | --- |
| `markdown-utils.test.ts` | Balanced inline math is incorrectly reported as unbalanced. | Teachers can see false warnings for valid math. |
| `markdown-content.test.tsx` | Whitespace-only content does not render `emptyFallback`. | Empty student-facing instructions can render blank paragraphs instead of expected empty states. |
| `markdown-code-block.test.tsx` | Clipboard tests fail because `navigator.clipboard` cannot be redefined by `user-event`. | Copy behavior is not reliably covered by tests. |

This means the current safety net does not support a confident production rollout. The plan below treats tests as part of the product surface, not an afterthought.

---

## 4. Critical Findings

### 4.1 Code Block Authoring Is Broken

Evidence:

- `apps/web/src/features/content-markdown/lib/tiptap-extensions.ts` disables `StarterKit` code blocks with `codeBlock: false`.
- `apps/web/src/features/content-markdown/editor/EditorToolbar.tsx` still calls `toggleCodeBlock()`.
- No replacement code block extension is registered in `buildEditorExtensions`.

Impact:

- Teachers see a code block button that may do nothing or behave inconsistently.
- Code challenge authoring depends heavily on code blocks, so this is not a minor bug.
- Renderer support for fenced code blocks does not imply editor support for authoring them.

Refactor requirement:

- Register a real TipTap code block extension for every preset where `allowCodeBlock` is true.
- Add language selection and Markdown serialization tests.
- Add an integration test that clicks the code block button, types code, saves Markdown, and renders it in `MarkdownContent`.

### 4.2 The Editor Is Not a Complete Markdown Authoring Experience

Current editor modes are `write`, `split`, and `preview`, but there is no source Markdown mode. Teachers cannot directly inspect or repair the persisted Markdown. The current WYSIWYG surface depends on TipTap and `tiptap-markdown` serialization behavior, but the platform has no canonical Markdown round-trip contract.

Missing:

- Source mode.
- Markdown shortcuts help.
- Command menu.
- Code block language control.
- Table row/column editing controls.
- Clear formatting.
- Structured LMS snippets beyond a few generic inserts.
- Error navigation from status bar to offending content.
- Draft comparison or "student view" snapshot for publish review.

Refactor requirement:

- Treat Markdown source as a first-class mode.
- Keep WYSIWYG as a convenience, not the only editing path.
- Define an explicit round-trip contract: Markdown string -> editor document -> Markdown string must be stable for supported syntax.

### 4.3 Renderer Correctness Is Not Yet Reliable

The renderer is a good direction, but current failures and gaps matter:

- Whitespace-only content can render as a blank paragraph instead of `emptyFallback`.
- Inline math delimiter validation is wrong for a valid `$E=mc^2$` case.
- Heading slug generation can collide for repeated headings and does not include a deterministic de-dupe strategy.
- The renderer is a client component, so even purely static course descriptions and assessment prompts pay client rendering cost.
- `MarkdownCodeBlock` uses `dangerouslySetInnerHTML` for highlighted Shiki output. This may be acceptable if the highlighter is treated as trusted, but the trust boundary must be documented and tested.

Refactor requirement:

- Split renderer into a server-safe core and small client enhancements for copy buttons, anchors, streaming cursor, and interactive affordances.
- Normalize empty content before rendering.
- Replace regex-heavy validation with an AST-aware validator where practical.
- Add deterministic heading ID de-duping.
- Keep raw HTML disabled.

### 4.4 Validation Is Advisory, Not a System Contract

`validateMarkdownContent` returns issues and the editor shows them, but target screens do not consistently use those issues to block save or publish. For example, file submission publishing only checks title and structural emptiness. Unsafe links, over-limit content, and raw HTML warnings can still rely on downstream behavior rather than a unified contract.

Refactor requirement:

- Export a single `getMarkdownSaveGate(markdown, preset, intent)` helper.
- Enforce errors consistently for save, publish, import, and API submission boundaries.
- Keep warnings non-blocking but visible.
- Mirror critical limits and safety checks in backend validation where the data crosses API boundaries.

### 4.5 Presets Are Useful But Too Static

`presets.ts` currently mixes product policy, toolbar composition, snippets, labels, descriptions, icons, limits, and render modes in one file. This works for a prototype, but it will become brittle as the LMS grows.

Problems:

- Hardcoded English labels and snippet text conflict with the app's localization architecture.
- Snippets are not contextual enough for next-generation LMS workflows.
- Presets are not versioned, so content generated by old presets cannot be audited against later policy changes.
- Presets do not define save/publish rules, upload policy, trusted author role, or rendering trust level.

Refactor requirement:

- Split presets into `policy`, `ui`, `snippets`, and `limits`.
- Localize all UI strings and snippets through `next-intl`.
- Add preset versions for auditability.
- Add role/trust and workflow intent to validation.

### 4.6 Migration Is Partial And Creates UX Drift

The unification is incomplete. Some assessment item types use the new components directly, some use compatibility wrappers, and some use raw textareas for adjacent rich content. Course edit uses `MarkdownEditor`, but course creation still uses a short 500-character plain description schema.

Impact:

- Teachers still learn multiple authoring patterns.
- Student preview parity is inconsistent across surfaces.
- New fields can accidentally use raw textareas because there is no lint rule or architectural guardrail.

Refactor requirement:

- Create a migration inventory with ownership and target preset for every teacher-authored student-facing text field.
- Add a lint/check script that flags forbidden `Textarea` usage for known Markdown fields.
- Remove compatibility wrappers after all imports are migrated.

### 4.7 Image Support Is Unsafe For LMS Production

The `courseDescription` preset sets `allowImages: true`, and `EditorImageDialog` accepts external URLs. `MarkdownImage` renders a raw `<img>` with `loading="lazy"`.

Problems:

- No controlled upload flow.
- No image proxy or domain allowlist.
- Alt text is optional.
- No dimensions or layout stabilization.
- No malware/content moderation policy.
- No privacy policy for learner browsers loading external image hosts.

Refactor requirement:

- Disable arbitrary external image insertion in the editor until upload policy exists.
- Allow only platform-managed uploaded images, or a tightly configured allowlist with proxying.
- Require alt text for author-inserted images.
- Use stable dimensions and `next/image` where compatible with configured domains.

### 4.8 Accessibility Is Not Production Grade Yet

The editor uses icons and aria labels, but there are still gaps:

- Dialogs are custom overlays without a robust focus trap.
- Toolbar keyboard navigation is basic button tabbing, not a well-managed toolbar pattern.
- Status bar issue popover is not a full accessible disclosure/listbox/dialog.
- Snippet picker approximates a combobox/listbox but does not fully implement expected keyboard and screen reader semantics.
- Fullscreen mode uses global F11 and Escape handling without scoping to editor focus.

Refactor requirement:

- Use existing accessible UI primitives where possible.
- Add keyboard-only tests for toolbar, dialogs, snippet picker, and view mode switching.
- Run axe-style checks for major surfaces.
- Keep focus visible and return focus after dialogs close.

### 4.9 Performance And Bundling Need A Stronger Strategy

The current renderer and editor are client-heavy. Course descriptions, task statements, and prompt rendering often do not need full client-side rendering.

Risks:

- `react-markdown`, KaTeX, Shiki, TipTap, and toolbar dependencies can increase client bundles.
- `MarkdownCodeBlock` highlights on the client after mount.
- The extension builder uses `require()` inside client-targeted code for task list extensions.
- Re-render behavior is not deeply profiled for long problem statements or split preview.

Refactor requirement:

- Make read-only Markdown rendering server-first where possible.
- Lazy-load the editor only on authoring surfaces.
- Lazy-load heavy features by preset and user action.
- Memoize parsed/highlighted output or shift highlighting to server/static work where feasible.
- Avoid runtime `require()` in client code.

### 4.10 LMS UX Is Still Too Generic

The current editor is a toolbar plus text surface. A next-generation LMS authoring experience needs more learning-design intelligence:

- Assignment instructions should offer rubric, checklist, accepted file, grading criteria, and academic integrity blocks.
- Code problems need examples, constraints, input/output, hidden/visible test explanation boundaries, and editorial/hint release policies.
- Exams need policy-aware instructions, accessibility accommodations, time-limit warnings, and review settings.
- Course descriptions need outcomes, prerequisites, audience, workload, certificate value, and module summary patterns.
- Teachers need confidence that preview equals what students see.

Refactor requirement:

- Build preset-specific authoring assistants as snippets/templates, not as separate editors.
- Add a "Student view" preview that uses the same renderer and surrounding shell as the target learner surface.
- Add publish readiness checks that understand Markdown quality, not just empty strings.

---

## 5. Target Architecture

### 5.1 Package Boundary

Refactor toward:

```text
apps/web/src/features/content-markdown/
  contracts/
    markdown-types.ts
    markdown-presets.ts
    markdown-limits.ts
    markdown-capabilities.ts
  policy/
    link-policy.ts
    image-policy.ts
    render-policy.ts
    save-gate.ts
  parser/
    parse-markdown.ts
    inspect-markdown.ts
    normalize-markdown.ts
    summarize-markdown.ts
  renderer/
    MarkdownContent.server.tsx
    MarkdownContent.client.tsx
    MarkdownCodeBlock.tsx
    MarkdownTable.tsx
    MarkdownLink.tsx
    MarkdownImage.tsx
    MarkdownHeading.tsx
  editor/
    MarkdownEditor.tsx
    MarkdownSourceEditor.tsx
    MarkdownWysiwygEditor.tsx
    MarkdownEditorToolbar.tsx
    MarkdownEditorStatusBar.tsx
    MarkdownCommandMenu.tsx
    dialogs/
      LinkDialog.tsx
      ImageDialog.tsx
      TableDialog.tsx
  adapters/
    assessment.tsx
    file-submission.tsx
    code-challenge.tsx
    course.tsx
  testing/
    fixtures.ts
    assertions.ts
```

### 5.2 Public API

The package should export a small, stable API:

```ts
export type MarkdownPresetId =
  | 'assessment.description'
  | 'assessment.prompt'
  | 'assessment.explanation'
  | 'fileSubmission.instructions'
  | 'code.problem'
  | 'code.inputSpec'
  | 'code.outputSpec'
  | 'code.exampleExplanation'
  | 'code.hint'
  | 'code.editorial'
  | 'course.description';

export type MarkdownRenderMode =
  | 'prompt'
  | 'task'
  | 'compact'
  | 'codeProblem'
  | 'codeSpec'
  | 'course'
  | 'summary';

export interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  preset: MarkdownPresetId;
  disabled?: boolean;
  required?: boolean;
  saveState?: 'idle' | 'dirty' | 'saving' | 'saved' | 'error';
  onValidationChange?: (result: MarkdownValidationResult) => void;
  onBlur?: () => void;
}

export interface MarkdownContentProps {
  content: string;
  mode: MarkdownRenderMode;
  trustLevel?: 'teacher' | 'student' | 'system' | 'ai';
  emptyFallback?: React.ReactNode;
}
```

### 5.3 Rendering Model

The renderer should have three layers:

1. **Parse and inspect:** Normalize Markdown, parse with supported plugins, collect issues, derive headings, links, images, tables, code blocks, and summary text.
2. **Safe render:** Render only allowed Markdown constructs for the selected mode and trust level.
3. **Enhance:** Add copy buttons, heading anchors, streaming cursor, and other client-only behavior without making every renderer client-only.

### 5.4 Authoring Model

The editor should support:

- `Write`: TipTap WYSIWYG editing.
- `Source`: plain Markdown source editing with monospace layout and syntax assistance.
- `Split`: write/source plus exact renderer preview.
- `Preview`: renderer-only student view.

The editor must keep one canonical Markdown string. TipTap state is an editing projection, not the source of truth.

---

## 6. Product UX Requirements

### 6.1 Teacher Authoring

The editor should feel like a serious learning content tool:

- Compact toolbar with familiar icons and localized tooltips.
- View mode segmented control.
- Context-specific snippets.
- Character, word, and validation status.
- Clear save state.
- One-click student preview.
- Error list with jump-to-content where possible.
- Keyboard shortcuts in tooltips and command menu.

### 6.2 Student Reading

Student rendering should be:

- Readable on mobile and desktop.
- Stable with no horizontal page overflow except inside code/table scroll regions.
- Good for math, code, tables, lists, and long instructions.
- Consistent across assessment, file submission, code challenge, and course pages.
- Free of authoring chrome and validation noise.

### 6.3 LMS-Specific Snippets

Add snippets by preset:

| Preset | Required snippets |
| --- | --- |
| File submission instructions | Required files, naming format, submission checklist, rubric table, late policy, academic integrity note. |
| Code problem | Problem skeleton, examples, constraints, input/output format, edge cases, complexity note. |
| Assessment description | Exam policy, time limit note, allowed materials, grading policy, review policy. |
| Question prompt | Scenario prompt, multi-step prompt, data table prompt, math prompt. |
| Explanation/rubric | Scoring rubric, common mistake, model answer, feedback template. |
| Course description | Overview, prerequisites, outcomes, workload, certificate, module overview. |

Snippets must insert clean Markdown and must be localized.

---

## 7. Implementation Plan

### Phase 0: Stabilize Current Package

Purpose: stop shipping known broken behavior before large refactors.

Tasks:

- Fix code block authoring by registering the correct TipTap code block extension.
- Fix whitespace-only rendering so `emptyFallback` is used reliably.
- Fix math delimiter validation for balanced inline math and escaped dollars.
- Fix clipboard tests by using a test-owned clipboard mock that does not conflict with `user-event`.
- Add direct `MarkdownEditor` tests for toolbar actions, serialization, preview, disabled state, and validation display.
- Add a regression test for the code block toolbar button.

Acceptance criteria:

- `bun run --cwd apps/web test src/tests/content-markdown` passes.
- A code block can be created in the editor, serialized to fenced Markdown, and rendered with a copy button.

### Phase 1: Define Contracts And Policies

Tasks:

- Introduce `contracts/` and `policy/` modules.
- Split preset policy from UI labels and snippets.
- Add `MarkdownValidationResult` with `errors`, `warnings`, `info`, and `blocking`.
- Add `getMarkdownSaveGate(markdown, preset, intent)`.
- Define trust levels for `teacher`, `student`, `system`, and `ai`.
- Define image policy as disabled by default except for controlled platform uploads.

Acceptance criteria:

- Every preset has explicit capabilities, limits, render mode, validation policy, and image/link policy.
- Save/publish flows can ask one helper whether content is valid for the intended operation.

### Phase 2: Rebuild Renderer Foundation

Tasks:

- Build a server-compatible renderer path for read-only content.
- Keep copy buttons and interactive anchors as small client components.
- Add safe `MarkdownLink`, `MarkdownImage`, `MarkdownTable`, and `MarkdownHeading` components.
- Add deterministic heading ID de-duping.
- Replace ad hoc regex validation with parser-backed inspection for links, images, headings, tables, code fences, and math where practical.
- Add a dedicated `plainSummary` utility that strips Markdown and handles code/math/images intentionally.

Acceptance criteria:

- Renderer supports GFM, tables, task lists, math, links, code blocks, and headings according to preset policy.
- Unsafe links never render as clickable links.
- Raw HTML never executes.
- Tables and code blocks never create page-level horizontal overflow.
- Course, task, prompt, compact, code problem, and summary modes have snapshot coverage.

### Phase 3: Rebuild Editor Shell

Tasks:

- Add source mode.
- Add command menu.
- Add code block language dropdown.
- Add table editing controls.
- Add localized toolbar, dialog, status, and snippet strings.
- Replace custom dialogs/popovers with accessible primitives or hardened equivalents.
- Scope fullscreen keyboard behavior to focused editor instances.
- Expose `onValidationChange` and `validationResult`.
- Add `onModeChange` and preference persistence for editor mode per preset.

Acceptance criteria:

- Keyboard-only users can author, insert links, insert snippets, switch modes, and close dialogs.
- Preview uses exactly the same renderer as student surfaces.
- Editor does not lose selection or content on controlled prop updates.
- All UI strings are localized.

### Phase 4: Surface Migration

Migrate in this order:

1. File submission instructions.
2. Assessment general description and prompts.
3. Assessment explanations and rubrics.
4. Code challenge prompt/input/output/example/hint/editorial fields.
5. Course edit and course creation descriptions.
6. Course detail, cards, search, metadata, analytics tables, and publish review surfaces.

For each surface:

- Replace direct `Textarea` usage for teacher-authored student-facing rich content.
- Use the correct preset adapter.
- Use save/publish gates.
- Add focused component/integration tests.
- Verify student view parity.

Acceptance criteria:

- No target field imports `RichTextPromptEditor` or `MarkdownRenderer`.
- No target field uses raw `Textarea` for rich teacher-authored student-facing content.
- Existing plain text content still renders correctly as Markdown.

### Phase 5: LMS Polish

Tasks:

- Add student-view preview shells for each major surface.
- Add preset-specific snippets and quality checks.
- Add draft/publish readiness messages.
- Add mobile editor layout QA.
- Add dark/light theme QA.
- Add visual regression screenshots for representative content.
- Add analytics for validation errors, editor mount failures, copy usage, and publish blocking reasons.

Acceptance criteria:

- Teachers can create a polished file submission task, code challenge, exam prompt, and course description without raw Markdown expertise.
- Students get consistent, readable content across devices.
- Publish readiness catches empty, unsafe, malformed, and over-limit content before students see it.

---

## 8. Testing Plan

### Unit Tests

Required:

- URL policy: safe/unsafe links, relative paths, anchors, protocol-relative URLs.
- Image policy: upload-only, missing alt, unsafe URL, unsupported source.
- Empty detection: whitespace, syntax-only, images-only, code-only, math-only.
- Math validation: balanced inline, balanced block, escaped dollars, currency, multi-expression text.
- Code fence validation: fenced, nested backticks, language tags.
- Table validation: column mismatch, huge tables, overflow behavior.
- Summary extraction: links, headings, lists, code, math, images.

### Component Tests

Required:

- Toolbar actions create expected Markdown.
- Code block language control serializes fenced language.
- Source mode updates preview.
- Split mode shows exact renderer output.
- Link dialog blocks unsafe URLs.
- Image dialog requires allowed source and alt policy.
- Status bar displays and expands issues.
- Disabled editor blocks changes.
- Clipboard copy works with deterministic mocks.

### Integration Tests

Required:

- File submission authoring saves rich instructions and student upload page renders them.
- Assessment studio saves prompt/explanation Markdown and attempt page renders it.
- Code challenge authoring saves prompt/input/output Markdown and attempt problem pane renders it.
- Course creation/edit saves Markdown description and course detail page renders it.
- Course cards/search/metadata use extracted summaries, not raw Markdown.

### E2E And Visual QA

Required screenshots:

- File submission instructions with rubric table and checklist.
- Code problem with code blocks, examples, constraints, and math.
- Assessment prompt with table and math.
- Course description with headings, lists, links, and image placeholder/uploaded image.
- Mobile write/source/split/preview flows.
- Dark mode equivalents.

---

## 9. Security Plan

Rules:

- Raw HTML is disabled for all LMS-authored Markdown.
- Unsafe URLs are rejected at edit time and rendered as inert text if encountered.
- Student-authored Markdown, if introduced later, gets a stricter trust level.
- Images require platform upload or configured proxy/allowlist.
- Alt text is required for author-inserted images.
- No arbitrary embeds in the Markdown editor.
- Shiki highlighted HTML is the only allowed `dangerouslySetInnerHTML` source, documented as trusted generated output and covered by tests.

Add tests for:

- `[x](javascript:alert(1))`
- `[x](data:text/html;base64,...)`
- protocol-relative URLs
- raw `<script>`
- raw `<img onerror>`
- image URL with unsafe protocol
- escaped Markdown edge cases

---

## 10. Performance Plan

Targets:

- Read-only Markdown should not force TipTap into learner bundles.
- Static or server-renderable content should render without client-only Markdown parsing where practical.
- Shiki and KaTeX should load only when content needs them.
- Split preview should debounce or transition expensive rendering for long documents.
- Editor imports should be lazy-loaded on authoring screens.

Tasks:

- Profile bundle impact of `features/content-markdown`.
- Move editor-only exports behind dynamic imports in authoring surfaces.
- Build server renderer path for non-interactive display.
- Memoize render input by normalized Markdown and mode.
- Avoid runtime `require()` in client-targeted code.

---

## 11. Data And API Plan

Storage can remain Markdown strings in the first production refactor, but the platform needs explicit field semantics.

Add documentation and backend validation for:

- `assessment.description`
- assessment item `prompt`
- assessment `explanation` and `rubric`
- `file_submission.instructions`
- code challenge `prompt`, `input_spec`, `output_spec`, example descriptions, hints, editorial fields
- `course.description`

Backend should mirror:

- max length
- empty policy for required fields
- unsafe link rejection
- raw HTML rejection
- future image reference policy

Search/indexing:

- Backend search should index extracted plain text rather than raw Markdown.
- Metadata generation should use extracted summaries rather than raw Markdown.

---

## 12. Rollout Strategy

### Compatibility

Existing plain text remains valid Markdown. Do not run a destructive data migration.

### Feature Flag

Use a temporary flag while migrating surfaces:

```text
NEXT_PUBLIC_CONTENT_MARKDOWN_V2=true
```

The flag should control authoring shell rollout only. Rendering should move to the safe renderer as soon as it is stable.

### Migration Checkpoints

Each migrated surface must ship with:

- unit tests
- one integration test
- visual screenshot
- save/publish gate use
- student-view parity verification

### Removal

After all target surfaces migrate:

- Delete or replace `features/assessments/shared/RichTextPromptEditor.tsx`.
- Delete or replace `features/assessments/shared/MarkdownRenderer.tsx`.
- Add a lint/check rule preventing new imports from those compatibility wrappers.

---

## 13. Recommended First PR

Make the first PR a stabilization PR:

1. Register code block support correctly in `buildEditorExtensions`.
2. Fix whitespace-only fallback rendering.
3. Fix inline math delimiter validation.
4. Fix clipboard tests.
5. Add `MarkdownEditor` component tests for code block, split preview, source-equivalent serialization, and validation display.
6. Add a short migration inventory document or test fixture list.

Do not start broad UI migration until these basics are green.

---

## 14. Definition Of Done

The refactor is done when:

- All target teacher-authored student-facing rich content fields use the unified Markdown editor or a preset adapter.
- All target student-facing Markdown uses the unified renderer.
- The editor supports write, source, split, and preview modes.
- Code block authoring and rendering work end to end.
- Validation gates are enforced consistently on save/publish/import.
- Images follow a controlled upload/proxy policy.
- Toolbar, dialogs, snippets, status bar, and errors are localized.
- Mobile and dark mode visual QA passes.
- `src/tests/content-markdown` is green.
- Key assessment, file submission, code challenge, and course flows have integration or E2E coverage.
- Compatibility wrappers are removed or blocked from new usage.

---

## 15. Final Recommendation

Keep the shared `features/content-markdown` direction, but treat the current code as a foundation to harden, not as a finished system. The next-generation LMS experience should be contract-driven: presets define what authors can create, validation defines what can be saved or published, and the renderer defines exactly what students see.

The biggest immediate priority is correctness. Fix code block authoring, failing tests, save gates, and migration drift first. Then move into source mode, localized LMS snippets, server-first rendering, image policy, accessibility hardening, and full surface migration.
