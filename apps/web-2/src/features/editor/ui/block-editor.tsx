import { EditorContent } from '@tiptap/react'

import type { EditorDocument } from '../model/document'
import { ContentStyles } from './content-styles'
import { EditorToolbar } from './toolbar/editor-toolbar'
import { useDocumentEditor } from './use-document-editor'

type BlockEditorProps = {
  /** Stored content as the API returns it (legacy shapes are read and saved canonical). */
  content: unknown
  /** Every change, as the canonical document to autosave. */
  onChange: (doc: EditorDocument) => void
}

/** Authoring of a lesson page: every block of the schema, toolbar with the Insert menu. */
export function BlockEditor({ content, onChange }: BlockEditorProps) {
  const editor = useDocumentEditor({ preset: 'authoring', content, onChange })
  return (
    <div className="flex flex-col gap-2">
      <ContentStyles />
      {editor ? <EditorToolbar editor={editor} blocks /> : null}
      <EditorContent editor={editor} />
    </div>
  )
}
