# Requirements Document

## Introduction

This feature rewrites the existing TipTap-based rich text editor in the Ashyk Bilim LMS to align with TipTap v3 best practices. The rewrite targets the authoring editor surface (`AuthoringEditor`) and its supporting infrastructure. It also introduces a dedicated **Embed Panel** — a modal dialog triggered by a toolbar button — that allows course authors to embed YouTube videos, Excalidraw diagrams, and tldraw whiteboards directly into lesson content. The result must be production-ready, performant, and accessible for a world-class LMS context.

The existing editor already uses TipTap v3 packages (`@tiptap/core ^3.23.4`, `@tiptap/react ^3.23.4`). The rewrite focuses on adopting the v3 Composable React API (`<Tiptap>` component, `useTiptap`, `useTiptapState`), replacing the legacy `useEditor` + `<EditorContent>` pattern in the authoring surface, and adding the new embed capabilities.

---

## Glossary

- **Editor**: The TipTap-based rich text editor used by course authors to create lesson content.
- **AuthoringEditor**: The full-featured editing surface rendered at `/[locale]/editor/…`, including toolbar, bubble menu, floating plus button, slash command menu, and AI toolkit.
- **Composable API**: TipTap v3's declarative `<Tiptap instance={editor}>` component tree with `useTiptap()` and `useTiptapState()` hooks.
- **Embed Panel**: A modal dialog that lets authors choose and configure an embedded external resource (YouTube, Excalidraw, or tldraw) to insert as a node into the editor.
- **EmbedBlock**: The TipTap node extension that stores and renders an embedded external resource inside the editor document.
- **EmbedType**: One of `youtube`, `excalidraw`, or `tldraw`.
- **NodeView**: A React component registered via `ReactNodeViewRenderer` that renders a TipTap node inside the editor canvas.
- **Toolbar**: The sticky horizontal bar above the editor content area containing formatting controls and insert buttons.
- **BubbleMenu**: The floating inline toolbar that appears when text is selected.
- **SlashCommandMenu**: The command palette triggered by typing `/` at the start of an empty block.
- **useEditorState**: TipTap v3 hook for subscribing to a slice of editor state without causing full re-renders.
- **useTiptapState**: TipTap v3 Composable API hook for subscribing to editor state within a `<Tiptap>` context.
- **ActivityRef**: The minimal typed reference `{ activity_uuid: string; name?: string }` passed to extensions that need activity context.

---

## Requirements

### Requirement 1: Adopt TipTap v3 Composable React API in AuthoringEditor

**User Story:** As a platform engineer, I want the AuthoringEditor to use TipTap v3's Composable API (`<Tiptap>` component, `useTiptap`, `useTiptapState`), so that the editor follows modern best practices, benefits from automatic context management, and is easier to maintain.

#### Acceptance Criteria

1. THE AuthoringEditor SHALL wrap the editor instance in a `<Tiptap instance={editor}>` component tree, making the editor instance available to `EditorToolbar`, `BubbleToolbar`, `FloatingPlusButton`, and `SlashCommandMenu` via context rather than explicit props.
2. WHEN the editor instance is null (i.e., before `useEditor` has returned a non-null value), THE AuthoringEditor SHALL render a `<Tiptap.Loading>` placeholder of the same dimensions as the editor content area to prevent layout shift and SSR hydration mismatches.
3. THE AuthoringEditor SHALL use `<Tiptap.Content />` to render the editable content area instead of `<EditorContent editor={editor} />`.
4. THE Toolbar SHALL subscribe to editor state using `useEditorState` (from `@tiptap/react`) with a selector function that returns only the specific state slices it needs (e.g., bold active, italic active, current heading level), so that state changes unrelated to those slices do not cause the toolbar to re-render.
5. WHEN the `<Tiptap.BubbleMenu>` wrapper component is available in the installed version of `@tiptap/react`, THE BubbleMenu SHALL be rendered using `<Tiptap.BubbleMenu>`; IF the wrapper is not available, THE BubbleMenu SHALL use `useTiptap()` to access the editor instance without prop drilling.
6. THE `useEditorInstance` hook SHALL call `useEditor` with `immediatelyRender: false` to prevent SSR rendering issues in the Next.js App Router environment.
7. WHEN the editor component unmounts, THE Editor SHALL have no dangling ProseMirror plugin instances or DOM event listeners attached to the editor's DOM node after the unmount completes.

---

### Requirement 2: Isolate Editor Rendering for Performance

**User Story:** As a platform engineer, I want the editor component tree to be isolated from unrelated parent state changes, so that typing and formatting remain smooth even when surrounding UI (save state indicator, AI panel toggle) updates.

#### Acceptance Criteria

1. THE `useEditor` call and `<Tiptap>` component tree SHALL reside in a dedicated inner component (e.g., `EditorCore`) that does not receive `saveState` or `isAIOpen` as props, so that changes to those values in the parent do not cause `EditorCore` to re-render.
2. THE Toolbar's `useEditorState` selector SHALL return only primitive values (booleans, numbers, strings) or objects that are referentially stable when the selected state has not changed, so that the toolbar does not re-render when unrelated editor state changes.
3. WHEN the editor's `onUpdate` callback fires, THE callback SHALL not call any React state setter synchronously within the same call stack frame, so that the React `flushSync` warning is not triggered.
4. WHEN `isAIOpen` changes in the parent component, THE `EditorToolbar` component SHALL NOT re-render.

---

### Requirement 3: Embed Panel — Trigger and Dialog

**User Story:** As a course author, I want a dedicated "Embed" button in the editor toolbar that opens a modal panel, so that I can choose and configure an external embed (YouTube, Excalidraw, or tldraw) to insert into my lesson.

#### Acceptance Criteria

1. THE Toolbar SHALL include an "Embed" button in the `media` insert group at all times when the editor is in authoring mode.
2. WHEN the "Embed" toolbar button is clicked, THE EmbedPanel dialog SHALL open as a modal rendered above the editor content.
3. THE EmbedPanel SHALL display three embed type options as selectable cards or tabs: YouTube, Excalidraw, and tldraw.
4. WHEN an embed type is selected and the author clicks the "Insert" button, THE EmbedPanel SHALL close and THE Editor SHALL insert an EmbedBlock node at the cursor position that was active when the dialog opened.
5. WHEN no embed type has been selected and the author clicks the "Insert" button, THE EmbedPanel SHALL display a validation error and SHALL NOT close or insert a node.
6. WHEN the author dismisses the Embed Panel by clicking the "Cancel" button, pressing the Escape key, or clicking the backdrop outside the dialog, THE EmbedPanel SHALL close and THE Editor document SHALL remain unchanged.
7. WHEN the Embed Panel opens, THE EmbedPanel SHALL move focus to the first focusable, non-disabled, visible element inside the dialog within 100ms of the dialog becoming visible.
8. WHILE the Embed Panel is open, pressing Tab or Shift+Tab SHALL cycle focus only through focusable elements inside the dialog.

---

### Requirement 4: YouTube Embed Type

**User Story:** As a course author, I want to embed a YouTube video by pasting its URL into the Embed Panel, so that students can watch the video directly within the lesson without leaving the page.

#### Acceptance Criteria

1. WHEN the YouTube embed type is selected in the Embed Panel, THE EmbedPanel SHALL display a URL input field labeled for YouTube video URLs.
2. A URL SHALL be considered valid for YouTube embedding if it matches one of the following formats: `https://www.youtube.com/watch?v=<id>`, `https://youtu.be/<id>`, `https://www.youtube.com/embed/<id>`, or `https://www.youtube.com/shorts/<id>`, where `<id>` is a non-empty string.
3. WHEN a valid YouTube URL is entered in the URL input field, THE EmbedPanel SHALL render a live preview of the video using the `@next/third-parties/google` `YouTubeEmbed` component below the input field.
4. WHEN the author clicks "Insert" after entering a valid YouTube URL, THE EmbedPanel SHALL close and THE EmbedBlock node inserted into the editor SHALL store the extracted video ID and render the video in the NodeView.
5. WHEN the author modifies the URL input field, any previously displayed validation error SHALL be cleared.
6. IF an empty, non-YouTube, or malformed URL is submitted, THEN THE EmbedPanel SHALL display an inline validation error message below the URL input field and SHALL NOT insert the node.
7. THE YouTube NodeView SHALL render the video in a responsive container with a 16:9 aspect ratio and a minimum border radius of 4px.
8. WHEN the editor is in read-only (interactive/viewing) mode, THE YouTube NodeView SHALL render the video player without an overlay toolbar (no edit or delete controls).

---

### Requirement 5: Excalidraw Embed Type

**User Story:** As a course author, I want to embed an Excalidraw whiteboard into a lesson, so that students can view or interact with diagrams created in Excalidraw.

#### Acceptance Criteria

1. WHEN the Excalidraw embed type is selected in the Embed Panel, THE EmbedPanel SHALL display a URL input field for the Excalidraw share link.
2. WHEN a valid Excalidraw share URL (hostname exactly `excalidraw.com`) is submitted, THE EmbedBlock SHALL store the URL and THE NodeView SHALL render an `<iframe>` whose `src` is derived by appending `?embed=1` to the share URL.
3. IF an empty URL, a URL whose hostname is not `excalidraw.com`, or a URL that is not a valid absolute URL is submitted, THEN THE EmbedPanel SHALL display an inline validation error message that describes the specific rejection reason (empty, wrong hostname, or malformed URL) and SHALL NOT insert the node.
4. WHILE the Excalidraw NodeView is rendered in authoring mode, THE iframe container SHALL be resizable by the author via a drag handle, with a minimum height of 100px, a maximum height of 1200px, and a default height of 500px at 100% width.
5. WHILE the Excalidraw NodeView is rendered in authoring mode, THE NodeView SHALL display an overlay toolbar with an "Edit" button that re-opens the Embed Panel pre-populated with the stored URL, and a "Delete" button that removes the EmbedBlock node from the document.
6. WHEN the Excalidraw NodeView is rendered, THE iframe SHALL load without server-side rendering errors (i.e., the component is only instantiated in a browser environment).

---

### Requirement 6: tldraw Embed Type

**User Story:** As a course author, I want to embed a tldraw whiteboard into a lesson, so that students can view or interact with diagrams created in tldraw.

#### Acceptance Criteria

1. WHEN the tldraw embed type is selected in the Embed Panel, THE EmbedPanel SHALL display a URL input field for the tldraw share link.
2. WHEN a valid tldraw share URL (hostname exactly `tldraw.com`, path matching `/r/<room-id>`) is submitted, THE EmbedBlock SHALL store the URL and THE NodeView SHALL render an `<iframe>` whose `src` is derived by appending `?embed=1` to the share URL.
3. IF an empty URL, a URL whose hostname is not `tldraw.com`, a URL whose path does not match `/r/<room-id>`, or a URL that is not a valid absolute URL is submitted, THEN THE EmbedPanel SHALL display an inline validation error message beneath the URL input field and SHALL NOT insert the node.
4. WHILE the tldraw NodeView is rendered in authoring mode, THE iframe container SHALL be resizable by the author via a drag handle, with a minimum height of 200px, a maximum height of 2000px, and a default height of 500px at 100% width.
5. WHILE the tldraw NodeView is rendered in authoring mode, THE NodeView SHALL display an overlay toolbar with an "Edit" button that re-opens the Embed Panel pre-populated with the stored URL, and a "Delete" button that removes the EmbedBlock node from the document.
6. WHEN the tldraw NodeView is rendered in read-only (student/view) mode, THE overlay toolbar SHALL be hidden and THE iframe SHALL accept pointer events so students can interact with the tldraw canvas.

---

### Requirement 7: EmbedBlock Node Extension

**User Story:** As a platform engineer, I want a single, well-typed TipTap node extension (`EmbedBlock`) that stores all embed types (YouTube, Excalidraw, tldraw), so that the document schema is consistent and serialization is reliable.

#### Acceptance Criteria

1. THE EmbedBlock extension SHALL define a `type` attribute accepting values `"youtube"`, `"excalidraw"`, or `"tldraw"`, with a default of `null`.
2. THE EmbedBlock extension SHALL define a `url` attribute storing the embed URL as a string, with a default of `null`.
3. THE EmbedBlock extension SHALL define `width` and `height` attributes for the rendered container dimensions, with defaults of `"100%"` and `500` respectively.
4. THE EmbedBlock extension SHALL expose an `insertEmbedBlock` command that inserts a new `embedBlock` node at the current cursor position.
5. THE EmbedBlock extension SHALL expose an `updateEmbedBlock(pos: number, attrs: Partial<EmbedBlockAttrs>)` command that updates the attributes of the `embedBlock` node at the given document position; IF no `embedBlock` node exists at `pos`, THE command SHALL be a no-op and SHALL NOT throw.
6. THE EmbedBlock extension SHALL belong to the `"block"` node group so that it is valid wherever block nodes are permitted in the document schema.
7. THE EmbedBlock extension SHALL implement `parseHTML` to match a `<div data-embed-block>` element and read `data-embed-type`, `data-embed-url`, `data-embed-width`, and `data-embed-height` attributes, and SHALL implement `renderHTML` to emit a `<div>` with those same `data-*` attributes.
8. FOR ALL `embedBlock` nodes where `type` is one of `"youtube"`, `"excalidraw"`, or `"tldraw"` and `url` is a non-empty string, serializing the node to HTML via `renderHTML` and then parsing the resulting HTML via `parseHTML` SHALL produce a node with identical `type`, `url`, `width`, and `height` attribute values.

---

### Requirement 8: EmbedBlock NodeView — Resizing

**User Story:** As a course author, I want to resize an embedded block by dragging its handles, so that I can control how much vertical space the embed occupies in the lesson layout.

#### Acceptance Criteria

1. WHEN the editor is in authoring mode, THE EmbedBlock NodeView SHALL display a resize handle on the bottom edge of the container.
2. WHEN a resize handle drag is in progress, THE EmbedBlock NodeView SHALL update the container's rendered height on each `pointermove` event.
3. WHEN the drag ends (on `pointerup`), THE EmbedBlock NodeView SHALL persist the final height by calling `updateAttributes({ height })`.
4. THE EmbedBlock NodeView SHALL enforce a minimum height of 200px and a maximum height of 1200px during drag: on each `pointermove` event, the rendered height SHALL be clamped to `[200, 1200]`.
5. IF the drag ends at a position that would result in a height below 200px, THEN THE persisted height SHALL be 200px; IF the drag ends at a position that would result in a height above 1200px, THEN THE persisted height SHALL be 1200px.
6. WHEN an EmbedBlock node is rendered and its `height` attribute is not set or is `null`, THE NodeView SHALL render the container at a default height of 200px.
7. WHEN the editor is in read-only mode, THE EmbedBlock NodeView SHALL NOT display resize handles.

---

### Requirement 9: Slash Command Integration

**User Story:** As a course author, I want to insert an embed block via the slash command menu by typing `/embed`, so that I can stay in keyboard-driven flow without reaching for the toolbar.

#### Acceptance Criteria

1. WHEN the slash command menu is open, THE SlashCommandMenu SHALL include an "Embed" entry in the `media` category with `id: "embed"` that is returned when the query matches `"embed"`.
2. WHEN the "Embed" slash command entry is selected, THE SlashCommand extension SHALL delete the text from the position of the `/` character to the current cursor position before opening the Embed Panel dialog.
3. THE Embed slash command entry SHALL use the same i18n label key and the same icon component as the "Embed" button in the Toolbar's `media` insert group.

---

### Requirement 10: Backward Compatibility — Existing EmbedObjects Nodes

**User Story:** As a platform engineer, I want existing lesson documents that contain `blockEmbed` nodes (from the old `EmbedObjects` extension) to continue rendering correctly, so that no content is lost during the migration.

#### Acceptance Criteria

1. WHILE both the legacy `EmbedObjects` extension and the new `EmbedBlock` extension are registered in the editor kernel, THE editor SHALL load and render documents containing either `blockEmbed` or `embedBlock` nodes without errors.
2. WHEN a document containing a `blockEmbed` node is loaded, THE Editor SHALL render the node using the `EmbedObjectsComponent` NodeView, and the rendered output SHALL be visible to the user with no fallback placeholder shown in its place.
3. THE new `EmbedBlock` extension SHALL use the node name `embedBlock`, which SHALL NOT conflict with the legacy node name `blockEmbed`.
4. IF a `blockEmbed` node fails to render (e.g., due to a missing or malformed `src` attribute), THEN THE Editor SHALL render a visible error placeholder in place of the node and SHALL NOT crash or unmount the editor.

---

### Requirement 11: Internationalization

**User Story:** As a platform engineer, I want all user-facing strings in the Embed Panel and EmbedBlock NodeView to be defined in the i18n message files, so that the feature supports English, Russian, and Kazakh locales.

#### Acceptance Criteria

1. WHEN the EmbedPanel renders any user-facing string, THE string SHALL be sourced from the `DashPage.Editor.EmbedPanel` namespace via `useTranslations('DashPage.Editor.EmbedPanel')`.
2. WHEN the EmbedBlock NodeView overlay toolbar renders any label, THE label SHALL be sourced from the `DashPage.Editor.EmbedPanel` namespace via `useTranslations('DashPage.Editor.EmbedPanel')`.
3. THE `en-US`, `ru-RU`, and `kk-KZ` message files SHALL each contain a `DashPage.Editor.EmbedPanel` section with the following keys: `title` (dialog title), `youtubeLabel`, `excalidrawLabel`, `tldrawLabel`, `urlPlaceholder`, `errorEmpty` (validation error for empty URL), `errorInvalid` (validation error for malformed or wrong-hostname URL), `insertButton`, `cancelButton`, `editButton`, and `deleteButton`.
4. THE Toolbar insert button for the Embed Panel SHALL use the existing `DashPage.Editor.Toolbar` namespace key `externalObject`.

---

### Requirement 12: Accessibility

**User Story:** As a student or course author using assistive technology, I want the editor toolbar and embed panel to be fully keyboard-navigable and screen-reader-friendly, so that the LMS is inclusive.

#### Acceptance Criteria

1. THE Toolbar element SHALL have `role="toolbar"` and a non-empty `aria-label` attribute that identifies the toolbar's purpose (e.g., "Editor formatting toolbar").
2. THE Embed Panel dialog element SHALL have `role="dialog"`, `aria-modal="true"`, and an `aria-labelledby` attribute whose value is the `id` of the visible title element rendered inside the dialog.
3. WHEN the Embed Panel becomes visible, THE EmbedPanel SHALL move focus to the first focusable, non-disabled, visible element in the dialog's DOM order within 100ms of the dialog becoming visible.
4. WHILE the Embed Panel is open, pressing Tab SHALL move focus to the next focusable element inside the dialog, and pressing Shift+Tab SHALL move focus to the previous focusable element inside the dialog, cycling within the dialog's focusable elements.
5. IF focus moves to an element outside the Embed Panel dialog while the dialog is open, THEN THE EmbedPanel SHALL immediately return focus to the first focusable element inside the dialog.
6. WHEN the Escape key is pressed while the Embed Panel is open, THE EmbedPanel SHALL close and return focus to the toolbar button that triggered it.
7. THE EmbedBlock NodeView overlay toolbar buttons SHALL each have a non-empty `aria-label` attribute that uniquely identifies the button's specific action (e.g., "Edit Excalidraw embed", "Delete Excalidraw embed").
