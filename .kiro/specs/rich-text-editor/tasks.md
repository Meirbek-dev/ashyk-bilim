# Implementation Plan: Rich Text Editor (TipTap v3 Migration + EmbedBlock)

## Overview

Migrate `AuthoringEditor` from the legacy `useEditor` + `<EditorContent>` pattern to the TipTap v3 Composable API (`<Tiptap>`, `useTiptap`, `useTiptapState`), and add the `EmbedBlock` node extension with YouTube, Excalidraw, and tldraw embed types surfaced via a modal Embed Panel. The legacy `EmbedObjects` extension is preserved for backward compatibility.

## Tasks

- [x] 1. Set up URL validators and core types
  - [x] 1.1 Create `embed-validators.ts` with `parseYouTubeUrl`, `validateExcalidrawUrl`, and `validateTldrawUrl` pure functions
    - Implement `parseYouTubeUrl(url: string): string | null` — returns video ID for the four valid YouTube formats, `null` otherwise
    - Implement `validateExcalidrawUrl(url: string): null | 'errorEmpty' | 'errorInvalid'` — returns `'errorEmpty'` for blank input, `'errorInvalid'` for non-absolute or wrong-hostname URLs, `null` for valid `excalidraw.com` URLs
    - Implement `validateTldrawUrl(url: string): null | 'errorEmpty' | 'errorInvalid'` — returns `'errorEmpty'` for blank input, `'errorInvalid'` for non-absolute, wrong-hostname, or wrong-path URLs, `null` for valid `tldraw.com/r/<room-id>` URLs
    - Export `buildExcalidrawSrc(url: string): string` and `buildTldrawSrc(url: string): string` helpers that append `?embed=1` (or `&embed=1` if query string already present)
    - _Requirements: 4.2, 4.6, 5.3, 6.3_

  - [x] 1.2 Write property tests for `parseYouTubeUrl` (Properties 1 & 2)
    - **Property 1: YouTube URL validation is complete and sound**
    - **Validates: Requirements 4.2, 4.6**
    - **Property 2: YouTube video ID extraction is correct for all valid formats**
    - **Validates: Requirements 4.4**
    - Use `fast-check` with `fc.string()` and `fc.constantFrom(...validYouTubeUrlExamples)`
    - _Requirements: 4.2, 4.4, 4.6_

  - [x] 1.3 Write property tests for `validateExcalidrawUrl` and `buildExcalidrawSrc` (Properties 3 & 4)
    - **Property 3: Excalidraw URL validation produces correct specific errors**
    - **Validates: Requirements 5.3**
    - **Property 4: Excalidraw iframe src is always the stored URL with `?embed=1` appended**
    - **Validates: Requirements 5.2**
    - _Requirements: 5.2, 5.3_

  - [x] 1.4 Write property tests for `validateTldrawUrl` and `buildTldrawSrc` (Properties 5 & 6)
    - **Property 5: tldraw URL validation produces correct specific errors**
    - **Validates: Requirements 6.3**
    - **Property 6: tldraw iframe src is always the stored URL with `?embed=1` appended**
    - **Validates: Requirements 6.2**
    - _Requirements: 6.2, 6.3_

- [x] 2. Implement `EmbedBlock` TipTap node extension
  - [x] 2.1 Create `EmbedBlock.ts` — TipTap node extension with attributes, commands, and HTML serialization
    - Define node name `"embedBlock"` in the `"block"` group
    - Define attributes: `type` (`'youtube' | 'excalidraw' | 'tldraw' | null`, default `null`), `url` (`string | null`, default `null`), `width` (`string`, default `"100%"`), `height` (`number`, default `500`)
    - Implement `parseHTML` matching `<div data-embed-block>` reading `data-embed-type`, `data-embed-url`, `data-embed-width`, `data-embed-height`
    - Implement `renderHTML` emitting `<div>` with those same `data-*` attributes
    - Implement `insertEmbedBlock` command that inserts a new `embedBlock` node at the cursor
    - Implement `updateEmbedBlock(pos, attrs)` command that updates attributes at `pos`; no-op (no throw) if no `embedBlock` node exists at `pos`
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7_

  - [x] 2.2 Write property test for `EmbedBlock` HTML round-trip (Property 7)
    - **Property 7: EmbedBlock HTML serialization round-trip preserves all attributes**
    - **Validates: Requirements 7.7, 7.8**
    - Use `fc.constantFrom('youtube', 'excalidraw', 'tldraw')`, `fc.string({ minLength: 1 })`, `fc.constantFrom('100%', '80%', '60%')`, `fc.integer({ min: 200, max: 1200 })`
    - _Requirements: 7.7, 7.8_

  - [x] 2.3 Write property test for `updateEmbedBlock` no-op behavior (Property 10)
    - **Property 10: `updateEmbedBlock` is a no-op at positions without an `embedBlock` node**
    - **Validates: Requirements 7.5**
    - Use `fc.integer({ min: 0 })` for arbitrary positions against a document without `embedBlock` nodes
    - _Requirements: 7.5_

- [x] 3. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Implement `EmbedBlock` NodeViews
  - [x] 4.1 Create `clampEmbedHeight` utility and `EmbedBlockNodeView.tsx` dispatcher
    - Export `clampEmbedHeight(raw: number): number` that clamps to `[200, 1200]`
    - Create `EmbedBlockNodeView.tsx` as the root `ReactNodeViewRenderer` component
    - Dispatch to `YouTubeNodeView`, `ExcalidrawNodeView`, or `TldrawNodeView` based on `node.attrs.type`
    - Wrap each sub-renderer in a React error boundary that renders a visible error placeholder card on failure
    - Register `EmbedBlockNodeView` in `EmbedBlock.ts` via `addNodeView: () => ReactNodeViewRenderer(EmbedBlockNodeView)`
    - _Requirements: 7.1, 10.4_

  - [x] 4.2 Write property test for resize height clamping (Property 8)
    - **Property 8: EmbedBlock NodeView height is always clamped to `[200, 1200]`**
    - **Validates: Requirements 8.4, 8.5**
    - Use `fc.integer({ min: -500, max: 3000 })` against `clampEmbedHeight`
    - _Requirements: 8.4, 8.5_

  - [x] 4.3 Create `YouTubeNodeView.tsx`
    - Render `<YouTubeEmbed>` from `@next/third-parties/google` in a responsive 16:9 container with `border-radius ≥ 4px`
    - In authoring mode: no overlay toolbar
    - In read-only mode: no overlay toolbar, no edit/delete controls
    - _Requirements: 4.4, 4.7, 4.8_

  - [x] 4.4 Create `ExcalidrawNodeView.tsx`
    - Use a `useEffect`-based `mounted` guard (`const [mounted, setMounted] = useState(false)`) to render the `<iframe>` only in browser environments
    - Set `iframe.src` to `buildExcalidrawSrc(url)` (i.e., `url + ?embed=1`)
    - In authoring mode: use `ResizableNodeView` from `@tiptap/core` with `onResize`/`onCommit` callbacks; clamp height via `clampEmbedHeight`; default height `500px`, min `100px`, max `1200px`; show overlay toolbar with "Edit" and "Delete" buttons (aria-labels: `"Edit Excalidraw embed"`, `"Delete Excalidraw embed"`)
    - In read-only mode: hide overlay toolbar, enable pointer events on iframe
    - _Requirements: 5.2, 5.4, 5.5, 5.6, 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 12.7_

  - [x] 4.5 Create `TldrawNodeView.tsx`
    - Use a `useEffect`-based `mounted` guard to render the `<iframe>` only in browser environments
    - Set `iframe.src` to `buildTldrawSrc(url)` (i.e., `url + ?embed=1`)
    - In authoring mode: use `ResizableNodeView` from `@tiptap/core`; clamp height via `clampEmbedHeight`; default height `500px`, min `200px`, max `2000px`; show overlay toolbar with "Edit" and "Delete" buttons (aria-labels: `"Edit tldraw embed"`, `"Delete tldraw embed"`)
    - In read-only mode: hide overlay toolbar, enable pointer events on iframe
    - _Requirements: 6.2, 6.4, 6.5, 6.6, 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 12.7_

- [x] 5. Implement `EmbedPanelStore` and `EmbedPanel` modal
  - [x] 5.1 Create `EmbedPanelStore.ts` — Zustand store
    - Define state: `isOpen`, `mode: 'insert' | 'edit'`, `nodePos: number | null`, `initialType: EmbedType | null`, `initialUrl: string`, `triggerRef: RefObject<HTMLButtonElement> | null`
    - Implement `open(triggerRef)`, `openForEdit(nodePos, attrs, triggerRef)`, and `close()` actions
    - _Requirements: 3.2, 3.4, 3.6, 5.5, 6.5_

  - [x] 5.2 Create `EmbedTypeSelector.tsx` — three selectable cards for YouTube, Excalidraw, tldraw
    - Use i18n keys `DashPage.Editor.EmbedPanel.youtubeLabel`, `excalidrawLabel`, `tldrawLabel`
    - Show inline validation error when Insert is attempted with no type selected
    - _Requirements: 3.3, 3.5, 11.1_

  - [x] 5.3 Create `YouTubeEmbedForm.tsx` — URL input with live preview
    - Label the input for YouTube video URLs (i18n `urlPlaceholder`)
    - On valid URL: render live `<YouTubeEmbed>` preview below the input
    - On invalid/empty submit: show inline error (`errorEmpty` or `errorInvalid`) below the input
    - Clear error on any input change (requirement 4.5)
    - _Requirements: 4.1, 4.2, 4.3, 4.5, 4.6, 11.1_

  - [x] 5.4 Create `ExcalidrawEmbedForm.tsx` — URL input with validation
    - Label the input for Excalidraw share links (i18n `urlPlaceholder`)
    - On invalid/empty submit: show inline error with specific rejection reason (`errorEmpty` or `errorInvalid`)
    - _Requirements: 5.1, 5.3, 11.1_

  - [x] 5.5 Create `TldrawEmbedForm.tsx` — URL input with validation
    - Label the input for tldraw share links (i18n `urlPlaceholder`)
    - On invalid/empty submit: show inline error beneath the input (`errorEmpty` or `errorInvalid`)
    - _Requirements: 6.1, 6.3, 11.1_

  - [x] 5.6 Create `EmbedPanel.tsx` — modal dialog
    - Apply `role="dialog"`, `aria-modal="true"`, `aria-labelledby` pointing to the title element's `id`
    - Render title (i18n `DashPage.Editor.EmbedPanel.title`), `EmbedTypeSelector`, the active type's form, and Insert/Cancel buttons (i18n `insertButton`, `cancelButton`)
    - On open: move focus to first focusable, non-disabled, visible element within 100ms
    - Implement Tab/Shift+Tab focus trap cycling within the dialog
    - Return focus to `triggerRef` on close
    - On Escape: close and return focus to trigger
    - On backdrop/Cancel click: close without inserting
    - On Insert with valid type+URL: call `editor.commands.insertEmbedBlock` (insert mode) or `editor.commands.updateEmbedBlock` (edit mode), then close
    - On Insert with no type selected or invalid URL: show validation error, do not close
    - _Requirements: 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 12.2, 12.3, 12.4, 12.5, 12.6_

- [x] 6. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Add i18n message keys
  - [x] 7.1 Add `DashPage.Editor.EmbedPanel` section to `en-US`, `ru-RU`, and `kk-KZ` message files
    - Add keys: `title`, `youtubeLabel`, `excalidrawLabel`, `tldrawLabel`, `urlPlaceholder`, `errorEmpty`, `errorInvalid`, `insertButton`, `cancelButton`, `editButton`, `deleteButton`
    - Verify `DashPage.Editor.Toolbar.externalObject` key already exists in all three locales (used by the toolbar Embed button)
    - _Requirements: 11.1, 11.2, 11.3, 11.4_

- [x] 8. Migrate `AuthoringEditor` to TipTap v3 Composable API
  - [x] 8.1 Create `EditorCore` inner component in `AuthoringEditor.tsx`
    - Define `EditorCoreProps`: `activity: ActivityRef`, `content: unknown`, `onUpdate: (json: object) => void`, `onAIToggle: () => void`
    - Move `useEditorInstance` call (with `immediatelyRender: false`) into `EditorCore`
    - Wrap the editor tree in `<Tiptap instance={editor}>`
    - Render `<Tiptap.Loading>` (same dimensions as content area) while `editor` is null
    - Replace `<EditorContent editor={editor} />` with `<Tiptap.Content />`
    - Replace `<BubbleMenu editor={editor}>` with `<Tiptap.BubbleMenu>` (or `useTiptap()` fallback if `Tiptap.BubbleMenu` is not exported)
    - Wrap `onUpdate` callback with `queueMicrotask` to avoid `flushSync` warning
    - Add `useEffect` cleanup in `EditorCore` to call `EmbedPanelStore.close()` on unmount
    - `AuthoringEditor` passes `onAIToggle` as a stable callback ref; does NOT pass `saveState` or `isAIOpen` to `EditorCore`
    - _Requirements: 1.1, 1.2, 1.3, 1.5, 1.6, 1.7, 2.1, 2.3_

  - [x] 8.2 Update `EditorToolbar` to use `useTiptap()` and `useTiptapState()`
    - Remove `editor: Editor | null` prop
    - Subscribe to editor state via `useTiptapState` selector returning only primitive values: `isBold`, `isItalic`, `isStrike`, `isBulletList`, `isOrderedList`, `isCodeBlock`, `isLink`, `headingLevel`, `canUndo`, `canRedo`, `codeBlockLanguage`, `linkHref`
    - Add "Embed" button to the `media` insert group using i18n key `DashPage.Editor.Toolbar.externalObject`; on click, call `EmbedPanelStore.open(triggerRef)`
    - Ensure `role="toolbar"` and non-empty `aria-label` on the toolbar element
    - _Requirements: 1.1, 1.4, 2.2, 2.4, 3.1, 12.1_

  - [x] 8.3 Update `BubbleToolbar`, `FloatingPlusButton`, `SlashCommandMenu`, and `AIEditorToolkit` to use `useTiptap()`
    - Remove `editor` props from each component
    - Access the editor instance via `useTiptap()` inside each component
    - _Requirements: 1.1, 1.5_

  - [x] 8.4 Write property test for toolbar state selector (Property 9)
    - **Property 9: Toolbar state selector returns only primitives**
    - **Validates: Requirements 1.4, 2.2**
    - Use an arbitrary editor state snapshot generator with `fast-check`; assert all returned values are `boolean`, `number`, `string`, or `null`
    - _Requirements: 1.4, 2.2_

- [x] 9. Add "Embed" slash command entry
  - [x] 9.1 Add `"embed"` entry to `SlashCommandMenu` in the `media` category
    - Use `id: "embed"`, same i18n label key as the toolbar Embed button (`DashPage.Editor.Toolbar.externalObject`), same icon component
    - On selection: delete text from `/` position to cursor, then call `EmbedPanelStore.open()`
    - _Requirements: 9.1, 9.2, 9.3_

- [x] 10. Register `EmbedBlock` extension and mount `EmbedPanel` in the editor kernel
  - [x] 10.1 Register `EmbedBlock` extension in the editor extensions array alongside the existing `EmbedObjects` extension
    - Confirm node names do not conflict (`embedBlock` vs `blockEmbed`)
    - Wrap `EmbedObjectsComponent` in an error boundary that renders a visible placeholder on failure
    - _Requirements: 7.6, 10.1, 10.2, 10.3, 10.4_

  - [x] 10.2 Mount `<EmbedPanel />` inside the `<Tiptap>` tree in `EditorCore`
    - `EmbedPanel` reads open state from `EmbedPanelStore` and accesses the editor via `useTiptap()`
    - _Requirements: 3.2, 3.4_

- [x] 11. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 12. Write integration and accessibility tests
  - [x] 12.1 Write integration test: render `AuthoringEditor` with mixed `blockEmbed` + `embedBlock` document
    - Verify both node types render without errors
    - _Requirements: 10.1, 10.2_

  - [x] 12.2 Write integration test: `EditorToolbar` does not re-render when `isAIOpen` changes
    - Use `vi.spyOn` or render count tracking to assert no re-render of `EditorToolbar` when parent `isAIOpen` toggles
    - _Requirements: 2.4_

  - [x] 12.3 Write accessibility tests for toolbar and Embed Panel
    - Verify `role="toolbar"` and non-empty `aria-label` on the toolbar element
    - Verify `role="dialog"`, `aria-modal="true"`, `aria-labelledby` on the Embed Panel
    - Verify focus trap behavior using `@testing-library/user-event` (Tab/Shift+Tab cycles within dialog, Escape closes and returns focus)
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6_

- [x] 13. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation at logical milestones
- Property tests (Properties 1–10) validate universal correctness properties using `fast-check` with Vitest
- Unit tests validate specific examples and edge cases
- `fast-check` is not yet listed in `package.json` — add it as a dev dependency (`bun add -D fast-check`) before running property tests
- `ResizableNodeView` from `@tiptap/core` handles pointer-event-based resizing; verify it is exported in the installed `^3.23.4` version before use
- The `Tiptap.BubbleMenu` wrapper availability should be checked at runtime; fall back to `useTiptap()` if not exported

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "2.1", "5.1", "7.1"] },
    { "id": 1, "tasks": ["1.2", "1.3", "1.4", "2.2", "2.3", "4.1"] },
    { "id": 2, "tasks": ["4.2", "4.3", "4.4", "4.5", "5.2", "5.3", "5.4", "5.5"] },
    { "id": 3, "tasks": ["5.6", "8.1"] },
    { "id": 4, "tasks": ["8.2", "8.3", "10.1"] },
    { "id": 5, "tasks": ["8.4", "9.1", "10.2"] },
    { "id": 6, "tasks": ["12.1", "12.2", "12.3"] }
  ]
}
```
