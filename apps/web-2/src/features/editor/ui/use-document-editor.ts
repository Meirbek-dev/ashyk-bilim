import { useEditor } from '@tiptap/react'
import { useEffect, useRef } from 'react'

import { sanitize } from '#/features/markdown'
import { m } from '#/paraglide/messages'

import { isDocument, stripEmptyFileBlocks, type EditorDocument } from '../model/document'
import { normalizeDocument } from '../model/normalize'
import { presetExtensions, type Preset } from './extensions'

/** Stored content as Tiptap takes it: the canonical JSON document, or legacy HTML after sanitize(). */
const loadable = (content: unknown) => {
  const doc = normalizeDocument(content)
  return typeof doc === 'string' ? sanitize(doc) : doc
}

type Options = { preset: Preset; content: unknown; onChange?: ((doc: EditorDocument) => void) | undefined }

/**
 * The Tiptap instance behind every editor of this feature. Content is normalized on load (legacy shapes
 * become canonical), external content changes are applied without an update event, and `onChange` gets the
 * canonical JSON (placeholders of never-uploaded files dropped).
 */
export function useDocumentEditor({ preset, content, onChange }: Options) {
  // What this editor last emitted: a parent that passes it back as `content` must not reset the cursor.
  const emitted = useRef<unknown>(undefined)
  const editor = useEditor({
    extensions: presetExtensions(preset),
    content: loadable(content),
    editable: preset !== 'view',
    immediatelyRender: false,
    editorProps: {
      attributes: {
        'aria-label': m.editor_label(),
        class: `ab-prose max-w-none ${preset === 'view' ? '' : 'min-h-40 rounded-md border border-input bg-background p-4'}`,
        ...(preset === 'view' ? { role: 'article' } : { role: 'textbox', 'aria-multiline': 'true' }),
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
