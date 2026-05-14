# Design Document: Rich Text Editor (TipTap v3 Migration + EmbedBlock)

## Overview

This design covers two tightly coupled changes to the Ashyk Bilim LMS editor:

1. **TipTap v3 Composable API migration** — replace the legacy `useEditor` + `<EditorContent>` pattern in `AuthoringEditor` with the declarative `<Tiptap instance={editor}>` component tree, `useTiptap()`, and `useTiptapState()` hooks.
2. **EmbedBlock node extension** — a new `embedBlock` TipTap node that stores YouTube, Excalidraw, and tldraw embeds, surfaced via a modal Embed Panel triggered from the toolbar and slash command menu.

The existing `EmbedObjects` (`blockEmbed`) extension is preserved for backward compatibility. Both extensions coexist in the editor kernel.

### Key Design Decisions

- **Composable API over EditorContext.Provider**: The `<Tiptap>` component automatically provides context to all child components, eliminating manual prop drilling of the `editor` instance to `EditorToolbar`, `BubbleToolbar`, `FloatingPlusButton`, and `SlashCommandMenu`.
- **`EditorCore` isolation**: The `useEditor` call and `<Tiptap>` tree live in a dedicated `EditorCore` inner component that does not receive `saveState` or `isAIOpen` as props, preventing those parent state changes from triggering re-renders of the editor subtree.
- **Embed Panel as a separate modal**: The Embed Panel is a standalone modal dialog component, not embedded inside the NodeView. This keeps the NodeView lean and allows the panel to be triggered from both the toolbar and the slash command menu.
- **Single `EmbedBlock` node for all embed types**: A single node extension with a `type` discriminant (`youtube | excalidraw | tldraw`) keeps the document schema consistent and serialization straightforward.
- **`ResizableNodeView` from `@tiptap/core`**: The built-in `ResizableNodeView` class handles pointer-event-based resizing with `onResize`/`onCommit` callbacks, avoiding custom drag logic.

---

## Architecture

### Component Tree (After Migration)

```
AuthoringEditor                          ← parent; owns saveState, isAIOpen
  └─ EditorCore                          ← NEW inner component; owns useEditor + <Tiptap>
       └─ <Tiptap instance={editor}>
            ├─ <Tiptap.Loading>          ← skeleton placeholder while editor is null
            ├─ EditorToolbar             ← reads editor via useTiptap() + useTiptapState()
            ├─ <Tiptap.Content />        ← replaces <EditorContent editor={editor} />
            ├─ <Tiptap.BubbleMenu>       ← replaces BubbleMenu with editor prop
            │    └─ BubbleToolbar (inner content)
            ├─ FloatingPlusButton        ← reads editor via useTiptap()
            ├─ SlashCommandMenu          ← reads editor via useTiptap()
            └─ AIEditorToolkit           ← reads editor via useTiptap()
```

### Embed Panel Flow

```
Toolbar "Embed" button click
  → EmbedPanelStore.open(cursorPos)      ← Zustand store captures cursor position
  → EmbedPanel modal renders
       ├─ EmbedTypeSelector (YouTube / Excalidraw / tldraw cards)
       ├─ EmbedTypeForm (URL input + live preview, per type)
       └─ Insert / Cancel buttons
  → on Insert: editor.commands.insertEmbedBlock({ type, url })
  → EmbedBlock NodeView renders

Slash command "/embed"
  → SlashCommand deletes "/" text
  → EmbedPanelStore.open(cursorPos)
  → same EmbedPanel flow
```

### Embed Panel "Edit" Flow (from NodeView)

```
NodeView overlay "Edit" button click
  → EmbedPanelStore.openForEdit(nodePos, { type, url })
  → EmbedPanel opens pre-populated
  → on Insert: editor.commands.updateEmbedBlock(nodePos, { url })
```

---

## Components and Interfaces

### `EditorCore` (new inner component)

```tsx
// Owns useEditor and <Tiptap> tree. Does NOT receive saveState or isAIOpen.
interface EditorCoreProps {
  activity: ActivityRef;
  content: unknown;
  onUpdate: (json: object) => void;
  onAIToggle: () => void;
}
```

`EditorCore` calls `useEditorInstance` (which already sets `immediatelyRender: false`) and renders the `<Tiptap instance={editor}>` tree. `AuthoringEditor` passes `onAIToggle` down as a stable callback ref so that `EditorToolbar` can call it without `isAIOpen` being in scope.

### `EditorToolbar` (updated)

Removes the `editor: Editor | null` prop. Reads the editor via `useTiptap()` and subscribes to state via `useTiptapState()`:

```tsx
const toolbarState = useTiptapState((snap) => ({
  isBold: snap.editor.isActive('bold'),
  isItalic: snap.editor.isActive('italic'),
  isStrike: snap.editor.isActive('strike'),
  isBulletList: snap.editor.isActive('bulletList'),
  isOrderedList: snap.editor.isActive('orderedList'),
  isCodeBlock: snap.editor.isActive('codeBlock'),
  isLink: snap.editor.isActive('link'),
  headingLevel: resolveHeadingLevel(snap.editor),
  canUndo: snap.editor.can().undo(),
  canRedo: snap.editor.can().redo(),
  codeBlockLanguage: snap.editor.getAttributes('codeBlock').language ?? null,
  linkHref: snap.editor.getAttributes('link').href ?? '',
}));
```

All returned values are primitives. `useTiptapState` deep-compares by default, so the toolbar only re-renders when these specific values change.

### `BubbleToolbar` (updated)

Removes the `editor: Editor` prop. Uses `useTiptap()` to access the editor instance. Rendered inside `<Tiptap.BubbleMenu>`.

### `FloatingPlusButton`, `SlashCommandMenu`, `AIEditorToolkit` (updated)

Remove `editor` props. Use `useTiptap()` to access the editor instance.

### `EmbedPanel` (new)

```tsx
interface EmbedPanelProps {
  // No props — reads from EmbedPanelStore
}
```

A modal dialog component. Reads open state and initial values from `EmbedPanelStore`. Renders:
- Dialog header with title (i18n: `DashPage.Editor.EmbedPanel.title`)
- Three embed type cards: YouTube, Excalidraw, tldraw
- Per-type form (URL input + live preview for YouTube)
- Insert / Cancel buttons

Accessibility: `role="dialog"`, `aria-modal="true"`, `aria-labelledby` pointing to the title element. Focus is moved to the first focusable element within 100ms of opening. Tab/Shift+Tab cycle within the dialog. Escape closes and returns focus to the trigger.

### `EmbedPanelStore` (new Zustand store)

```ts
interface EmbedPanelState {
  isOpen: boolean;
  mode: 'insert' | 'edit';
  nodePos: number | null;          // document position for edit mode
  initialType: EmbedType | null;
  initialUrl: string;
  triggerRef: RefObject<HTMLButtonElement> | null;  // for focus return on close
  open: (triggerRef: RefObject<HTMLButtonElement>) => void;
  openForEdit: (nodePos: number, attrs: { type: EmbedType; url: string }, triggerRef: RefObject<HTMLButtonElement>) => void;
  close: () => void;
}
```

The store is consumed by `EmbedPanel` and by the toolbar/slash command trigger sites.

### `EmbedBlock` TipTap Extension (new)

```ts
// Node name: "embedBlock"
interface EmbedBlockAttrs {
  type: 'youtube' | 'excalidraw' | 'tldraw' | null;
  url: string | null;
  width: string;    // default: "100%"
  height: number;   // default: 500
}

// Commands added to TipTap's Commands interface:
interface Commands<ReturnType> {
  embedBlock: {
    insertEmbedBlock: (attrs?: Partial<EmbedBlockAttrs>) => ReturnType;
    updateEmbedBlock: (pos: number, attrs: Partial<EmbedBlockAttrs>) => ReturnType;
  };
}
```

HTML serialization uses `<div data-embed-block data-embed-type data-embed-url data-embed-width data-embed-height>`.

### `EmbedBlockNodeView` (new React component)

Rendered via `ReactNodeViewRenderer`. Dispatches to one of three sub-renderers based on `node.attrs.type`:

- `YouTubeNodeView` — renders `<YouTubeEmbed>` from `@next/third-parties/google` in a 16:9 responsive container
- `ExcalidrawNodeView` — renders `<iframe src={url + '?embed=1'}>` with `ResizableNodeView`
- `TldrawNodeView` — renders `<iframe src={url + '?embed=1'}>` with `ResizableNodeView`

In authoring mode, Excalidraw and tldraw NodeViews show an overlay toolbar with Edit and Delete buttons (aria-labels: `"Edit Excalidraw embed"`, `"Delete Excalidraw embed"`, etc.).

In read-only mode: YouTube renders without overlay; Excalidraw/tldraw hide the overlay toolbar and enable pointer events on the iframe.

### URL Validators (pure functions, new)

```ts
// Returns the video ID string if valid, null otherwise
function parseYouTubeUrl(url: string): string | null

// Returns null if valid, or an error key ('errorEmpty' | 'errorInvalid') if invalid
function validateExcalidrawUrl(url: string): null | 'errorEmpty' | 'errorInvalid'

// Returns null if valid, or an error key ('errorEmpty' | 'errorInvalid') if invalid
function validateTldrawUrl(url: string): null | 'errorEmpty' | 'errorInvalid'
```

YouTube valid formats:
- `https://www.youtube.com/watch?v=<id>`
- `https://youtu.be/<id>`
- `https://www.youtube.com/embed/<id>`
- `https://www.youtube.com/shorts/<id>`

Excalidraw valid: absolute URL with hostname exactly `excalidraw.com`.

tldraw valid: absolute URL with hostname exactly `tldraw.com` and path matching `/r/<room-id>` (non-empty room-id).

---

## Data Models

### EmbedBlock Document Node (ProseMirror JSON)

```json
{
  "type": "embedBlock",
  "attrs": {
    "type": "youtube",
    "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "width": "100%",
    "height": 500
  }
}
```

### EmbedBlock HTML Serialization

```html
<div
  data-embed-block
  data-embed-type="youtube"
  data-embed-url="https://www.youtube.com/watch?v=dQw4w9WgXcQ"
  data-embed-width="100%"
  data-embed-height="500"
></div>
```

### i18n Message Keys (`DashPage.Editor.EmbedPanel`)

| Key | Purpose |
|-----|---------|
| `title` | Dialog title |
| `youtubeLabel` | YouTube card label |
| `excalidrawLabel` | Excalidraw card label |
| `tldrawLabel` | tldraw card label |
| `urlPlaceholder` | URL input placeholder |
| `errorEmpty` | Validation error: empty URL |
| `errorInvalid` | Validation error: malformed or wrong-hostname URL |
| `insertButton` | Insert button label |
| `cancelButton` | Cancel button label |
| `editButton` | NodeView overlay Edit button label |
| `deleteButton` | NodeView overlay Delete button label |

The toolbar Embed button uses the existing key `DashPage.Editor.Toolbar.externalObject`.

### File Layout

```
src/components/Objects/Editor/
  Extensions/
    EmbedBlock/
      EmbedBlock.ts                  ← TipTap node extension
      EmbedBlockNodeView.tsx         ← root NodeView dispatcher
      YouTubeNodeView.tsx
      ExcalidrawNodeView.tsx
      TldrawNodeView.tsx
      embed-validators.ts            ← parseYouTubeUrl, validateExcalidrawUrl, validateTldrawUrl
    EmbedObjects/                    ← unchanged (legacy)
  Toolbar/
    EmbedPanel/
      EmbedPanel.tsx                 ← modal dialog
      EmbedPanelStore.ts             ← Zustand store
      EmbedTypeSelector.tsx
      YouTubeEmbedForm.tsx
      ExcalidrawEmbedForm.tsx
      TldrawEmbedForm.tsx
  views/
    AuthoringEditor.tsx              ← updated (adds EditorCore)
```

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: YouTube URL validation is complete and sound

*For any* string input, the `parseYouTubeUrl` function SHALL return a non-null video ID string if and only if the input matches one of the four valid YouTube URL formats (`watch?v=`, `youtu.be/`, `/embed/`, `/shorts/`) with a non-empty ID segment; for all other inputs (empty string, wrong hostname, malformed URL, missing ID) it SHALL return `null`.

**Validates: Requirements 4.2, 4.6**

### Property 2: YouTube video ID extraction is correct for all valid formats

*For any* valid YouTube URL in any of the four supported formats, `parseYouTubeUrl` SHALL return the exact video ID string that appears in the URL, with no leading or trailing whitespace and no URL-encoding artifacts.

**Validates: Requirements 4.4**

### Property 3: Excalidraw URL validation produces correct specific errors

*For any* string input submitted as an Excalidraw URL, `validateExcalidrawUrl` SHALL return `'errorEmpty'` if the trimmed input is empty, `'errorInvalid'` if the input is a non-empty string that is either not a valid absolute URL or has a hostname other than `excalidraw.com`, and `null` if the input is a valid absolute URL with hostname exactly `excalidraw.com`.

**Validates: Requirements 5.3**

### Property 4: Excalidraw iframe src is always the stored URL with `?embed=1` appended

*For any* valid Excalidraw share URL stored in an `embedBlock` node's `url` attribute, the `src` attribute of the rendered `<iframe>` SHALL equal the stored URL with `?embed=1` appended (and no double `?` if the URL already contains a query string).

**Validates: Requirements 5.2**

### Property 5: tldraw URL validation produces correct specific errors

*For any* string input submitted as a tldraw URL, `validateTldrawUrl` SHALL return `'errorEmpty'` if the trimmed input is empty, `'errorInvalid'` if the input is a non-empty string that is not a valid absolute URL, has a hostname other than `tldraw.com`, or has a path that does not match `/r/<non-empty-room-id>`, and `null` if the input is a valid absolute URL with hostname `tldraw.com` and path `/r/<non-empty-room-id>`.

**Validates: Requirements 6.3**

### Property 6: tldraw iframe src is always the stored URL with `?embed=1` appended

*For any* valid tldraw share URL stored in an `embedBlock` node's `url` attribute, the `src` attribute of the rendered `<iframe>` SHALL equal the stored URL with `?embed=1` appended.

**Validates: Requirements 6.2**

### Property 7: EmbedBlock HTML serialization round-trip preserves all attributes

*For any* `embedBlock` node where `type` is one of `"youtube"`, `"excalidraw"`, or `"tldraw"` and `url` is a non-empty string, calling `renderHTML` to produce a `<div data-embed-block …>` element and then calling `parseHTML` on that element SHALL produce a node with `type`, `url`, `width`, and `height` attribute values identical to the originals.

**Validates: Requirements 7.7, 7.8**

### Property 8: EmbedBlock NodeView height is always clamped to `[200, 1200]`

*For any* pointer drag delta applied to the resize handle of an `embedBlock` NodeView in authoring mode, the rendered container height during drag (via `onResize`) and the persisted height after drag completion (via `onCommit` → `updateAttributes`) SHALL both be clamped to the range `[200, 1200]` pixels inclusive.

**Validates: Requirements 8.4, 8.5**

### Property 9: Toolbar state selector returns only primitives

*For any* editor state snapshot passed to the `EditorToolbar`'s `useTiptapState` selector, the returned object SHALL contain only values of type `boolean`, `number`, `string`, or `null` — no object references, arrays, or functions — so that the default deep-equality check in `useTiptapState` correctly prevents re-renders when unrelated state changes.

**Validates: Requirements 1.4, 2.2**

### Property 10: `updateEmbedBlock` is a no-op at positions without an `embedBlock` node

*For any* document position `pos` that does not resolve to an `embedBlock` node, calling `editor.commands.updateEmbedBlock(pos, attrs)` SHALL leave the document state unchanged and SHALL NOT throw an error or return `false` in a way that breaks the command chain.

**Validates: Requirements 7.5**

---

## Error Handling

### EmbedPanel Validation Errors

- **Empty URL**: Shown inline below the URL input using the `errorEmpty` i18n key. The Insert button remains enabled but submission is blocked.
- **Invalid URL**: Shown inline below the URL input using the `errorInvalid` i18n key with a description of the specific rejection reason.
- **No embed type selected**: Shown inline near the type selector. Insert is blocked.
- Errors are cleared on any change to the URL input field (requirement 4.5).

### EmbedBlock NodeView Error Boundary

Each NodeView sub-renderer (`YouTubeNodeView`, `ExcalidrawNodeView`, `TldrawNodeView`) is wrapped in a React error boundary. If rendering fails (e.g., malformed `url` attribute), the boundary renders a visible error placeholder card with the embed type name and a generic error message. The editor does not unmount.

### Legacy `blockEmbed` Error Boundary

`EmbedObjectsComponent` is wrapped in an error boundary. If it fails to render (e.g., missing `src` attribute), a visible error placeholder is shown in its place (requirement 10.4).

### SSR Safety

- `ExcalidrawNodeView` and `TldrawNodeView` render `<iframe>` elements only in browser environments. They use a `useEffect`-based mount guard (`const [mounted, setMounted] = useState(false)`) to prevent SSR rendering of the iframe (requirement 5.6).
- `useEditorInstance` already sets `immediatelyRender: false` (requirement 1.6).
- `EditorCore` renders `<Tiptap.Loading>` while the editor is null, preventing layout shift (requirement 1.2).

### `onUpdate` and `flushSync`

The `onUpdate` callback in `useEditorInstance` wraps any React state setter calls in `queueMicrotask` to avoid the `flushSync` warning (requirement 2.3):

```ts
onUpdate: onUpdate
  ? ({ editor }) => queueMicrotask(() => onUpdate(editor.getJSON()))
  : undefined,
```

### Cleanup on Unmount

TipTap's `useEditor` hook handles ProseMirror plugin cleanup on unmount. No additional cleanup is needed beyond what the hook provides. The `EmbedPanelStore` is reset to closed state when `EditorCore` unmounts via a `useEffect` cleanup.

---

## Testing Strategy

### Unit Tests (Vitest + jsdom)

Focus on pure functions and specific behavioral examples:

- `embed-validators.ts`: example-based tests for each valid YouTube URL format, each invalid case (empty, wrong hostname, malformed, missing ID), Excalidraw valid/invalid cases, tldraw valid/invalid/wrong-path cases.
- `EmbedBlock.ts`: test `insertEmbedBlock` inserts a node, `updateEmbedBlock` updates attributes, `updateEmbedBlock` is a no-op at invalid positions.
- `EmbedPanel`: test that the dialog opens/closes, validation errors appear, Insert is blocked without a type selection, focus moves to first element on open, Escape closes and returns focus.
- `AuthoringEditor`: test that `EditorCore` does not re-render when `isAIOpen` changes in the parent.

### Property-Based Tests (Vitest + fast-check)

Property-based testing is appropriate here because the feature includes pure validation and serialization functions with large input spaces. The project uses Vitest; `fast-check` is the standard PBT library for TypeScript/Vitest projects.

Each property test runs a minimum of 100 iterations.

**Tag format**: `// Feature: rich-text-editor, Property N: <property text>`

```ts
// Feature: rich-text-editor, Property 1: YouTube URL validation is complete and sound
test.prop([fc.string()])('parseYouTubeUrl accepts valid and rejects invalid URLs', (url) => {
  const result = parseYouTubeUrl(url);
  const isValidFormat = YOUTUBE_PATTERNS.some(p => p.test(url));
  expect(result !== null).toBe(isValidFormat);
});
```

```ts
// Feature: rich-text-editor, Property 2: YouTube video ID extraction is correct for all valid formats
test.prop([fc.constantFrom(...validYouTubeUrlExamples)])('parseYouTubeUrl extracts correct ID', (url) => {
  const id = parseYouTubeUrl(url);
  expect(id).not.toBeNull();
  expect(url).toContain(id!);
});
```

```ts
// Feature: rich-text-editor, Property 3: Excalidraw URL validation produces correct specific errors
test.prop([fc.string()])('validateExcalidrawUrl returns correct error key', (url) => {
  const result = validateExcalidrawUrl(url);
  if (url.trim() === '') {
    expect(result).toBe('errorEmpty');
  } else {
    try {
      const parsed = new URL(url);
      if (parsed.hostname === 'excalidraw.com') expect(result).toBeNull();
      else expect(result).toBe('errorInvalid');
    } catch {
      expect(result).toBe('errorInvalid');
    }
  }
});
```

```ts
// Feature: rich-text-editor, Property 4: Excalidraw iframe src is always url + ?embed=1
test.prop([fc.webUrl().filter(u => new URL(u).hostname === 'excalidraw.com')])(
  'ExcalidrawNodeView iframe src = url + ?embed=1',
  (url) => {
    const src = buildExcalidrawSrc(url);
    expect(src).toBe(url.includes('?') ? `${url}&embed=1` : `${url}?embed=1`);
  }
);
```

```ts
// Feature: rich-text-editor, Property 5: tldraw URL validation produces correct specific errors
test.prop([fc.string()])('validateTldrawUrl returns correct error key', (url) => {
  const result = validateTldrawUrl(url);
  if (url.trim() === '') {
    expect(result).toBe('errorEmpty');
  } else {
    try {
      const parsed = new URL(url);
      const isValidPath = /^\/r\/[^/]+$/.test(parsed.pathname);
      if (parsed.hostname === 'tldraw.com' && isValidPath) expect(result).toBeNull();
      else expect(result).toBe('errorInvalid');
    } catch {
      expect(result).toBe('errorInvalid');
    }
  }
});
```

```ts
// Feature: rich-text-editor, Property 6: tldraw iframe src is always url + ?embed=1
test.prop([fc.webUrl().filter(u => /^\/r\/[^/]+$/.test(new URL(u).pathname) && new URL(u).hostname === 'tldraw.com')])(
  'TldrawNodeView iframe src = url + ?embed=1',
  (url) => {
    const src = buildTldrawSrc(url);
    expect(src).toBe(url.includes('?') ? `${url}&embed=1` : `${url}?embed=1`);
  }
);
```

```ts
// Feature: rich-text-editor, Property 7: EmbedBlock HTML serialization round-trip preserves all attributes
test.prop([
  fc.constantFrom('youtube', 'excalidraw', 'tldraw'),
  fc.string({ minLength: 1 }),
  fc.constantFrom('100%', '80%', '60%'),
  fc.integer({ min: 200, max: 1200 }),
])('EmbedBlock renderHTML → parseHTML round-trip', (type, url, width, height) => {
  const node = createEmbedBlockNode({ type, url, width, height });
  const html = renderEmbedBlockHTML(node);
  const parsed = parseEmbedBlockHTML(html);
  expect(parsed.type).toBe(type);
  expect(parsed.url).toBe(url);
  expect(parsed.width).toBe(width);
  expect(parsed.height).toBe(height);
});
```

```ts
// Feature: rich-text-editor, Property 8: EmbedBlock NodeView height is always clamped to [200, 1200]
test.prop([fc.integer({ min: -500, max: 3000 })])(
  'EmbedBlock resize height is clamped to [200, 1200]',
  (rawHeight) => {
    const clamped = clampEmbedHeight(rawHeight);
    expect(clamped).toBeGreaterThanOrEqual(200);
    expect(clamped).toBeLessThanOrEqual(1200);
  }
);
```

```ts
// Feature: rich-text-editor, Property 9: Toolbar state selector returns only primitives
test.prop([arbitraryEditorStateSnapshot()])(
  'Toolbar selector returns only primitive values',
  (snapshot) => {
    const result = toolbarSelector(snapshot);
    for (const value of Object.values(result)) {
      const t = typeof value;
      expect(['boolean', 'number', 'string']).toContain(t === 'object' && value === null ? 'string' : t);
    }
  }
);
```

```ts
// Feature: rich-text-editor, Property 10: updateEmbedBlock is a no-op at positions without an embedBlock node
test.prop([arbitraryDocumentWithoutEmbedBlock(), fc.integer({ min: 0 })])(
  'updateEmbedBlock is a no-op at invalid positions',
  (doc, pos) => {
    const before = JSON.stringify(doc.toJSON());
    updateEmbedBlockAtPos(doc, pos, { url: 'https://example.com' });
    const after = JSON.stringify(doc.toJSON());
    expect(after).toBe(before);
  }
);
```

### Integration Tests

- Render `AuthoringEditor` with a document containing both `blockEmbed` and `embedBlock` nodes; verify both render without errors (requirement 10.1).
- Verify `EditorToolbar` does not re-render when `isAIOpen` changes (requirement 2.4).

### Accessibility Tests

- Verify `role="toolbar"` and `aria-label` on the toolbar element.
- Verify `role="dialog"`, `aria-modal="true"`, `aria-labelledby` on the Embed Panel.
- Verify focus trap behavior using `@testing-library/user-event`.
