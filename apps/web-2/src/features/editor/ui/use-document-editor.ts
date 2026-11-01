import { useEditor } from '@tiptap/react'
import { useEffect, useRef } from 'react'

import { sanitize } from '#/features/markdown'
import { m } from '#/paraglide/messages'
import { clipboardImage } from '#/shared/api/upload'

import { isDocument, stripEmptyFileBlocks, type EditorDocument } from '../model/document'
import { normalizeDocument } from '../model/normalize'
import { presetExtensions, type Preset } from './extensions'
import { slashAnchor, type MenuAnchor } from './toolbar/insert-items'

const isLinkKey = (event: KeyboardEvent) =>
  event.code === 'KeyK' && (event.ctrlKey || event.metaKey) && !event.shiftKey && !event.altKey

/** Stored content as Tiptap takes it: the canonical JSON document, or legacy HTML after sanitize(). */
const loadable = (content: unknown) => {
  const doc = normalizeDocument(content)
  return typeof doc === 'string' ? sanitize(doc) : doc
}

type Options = {
  preset: Preset
  content: unknown
  onChange?: ((doc: EditorDocument) => void) | undefined
  /** "/" in an empty paragraph: open the insert menu there. */
  onSlash?: (anchor: MenuAnchor) => void
  /** Ctrl/⌘+K (by the physical key, in any layout): open the link dialog. */
  onLinkKey?: () => void
  /** A pasted image (discussions: uploaded and inserted by the caller); absent = the editor's own handling. */
  onPasteImage?: (file: File) => void
  /** Put the caret at the end once mounted (an edit opened by a button that then unmounts). */
  focusOnMount?: boolean
}

/**
 * The Tiptap instance behind every editor of this feature. Content is normalized on load (legacy shapes
 * become canonical), external content changes are applied without an update event, and `onChange` gets the
 * canonical JSON (placeholders of never-uploaded files dropped).
 */
// A lesson page is written at the width the learner reads it, on the page's own sheet (BlockEditor draws the sheet);
// a post is a field among fields.
const surface = {
  view: 'max-w-none',
  // The sheet around it draws the focus ring (BlockEditor): an outline here would box the text column alone.
  authoring: 'mx-auto min-h-96 max-w-prose px-4 py-gutter outline-none',
  input: 'max-w-none min-h-40 rounded-md border border-input bg-background p-4',
}

export function useDocumentEditor({
  preset,
  content,
  onChange,
  onSlash,
  onLinkKey,
  onPasteImage,
  focusOnMount,
}: Options) {
  const readOnly = preset === 'view' || preset === 'discussion-view'
  // What this editor last emitted: a parent that passes it back as `content` must not reset the cursor.
  const emitted = useRef<unknown>(undefined)
  const editor = useEditor({
    extensions: presetExtensions(preset),
    content: loadable(content),
    editable: !readOnly,
    immediatelyRender: false,
    autofocus: focusOnMount ? 'end' : false,
    editorProps: {
      handlePaste: (_view, event) => {
        const image = onPasteImage ? clipboardImage(event.clipboardData) : null
        if (image) onPasteImage?.(image)
        return image !== null
      },
      handleKeyDown: (view, event) => {
        if (onLinkKey && isLinkKey(event)) {
          onLinkKey()
          return true
        }
        const anchor = onSlash ? slashAnchor(view, event) : null
        if (anchor) onSlash?.(anchor)
        return anchor !== null
      },
      attributes: {
        'aria-label': preset === 'discussion' ? m.editor_label_post() : m.editor_label(),
        class: `ab-prose ${surface[readOnly ? 'view' : preset === 'authoring' ? 'authoring' : 'input']}`,
        ...(readOnly ? { role: 'article' } : { role: 'textbox', 'aria-multiline': 'true' }),
      },
    },
    onUpdate: ({ editor: current }) => {
      const json: unknown = current.getJSON()
      if (!onChange || !isDocument(json)) return
      const doc = stripEmptyFileBlocks(json)
      emitted.current = doc
      onChange(doc)
    },
  })
  useEffect(() => {
    if (!editor || content === emitted.current) return
    const next = loadable(content)
    const same = typeof next === 'string' ? false : JSON.stringify(next) === JSON.stringify(editor.getJSON())
    if (!same) editor.commands.setContent(next, { emitUpdate: false })
  }, [editor, content])
  return editor
}
