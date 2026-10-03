import { EditorContent } from '@tiptap/react'

import type { EditorDocument } from '../model/document'
import { ContentStyles } from './content-styles'
import { EditorToolbar } from './toolbar/editor-toolbar'
import { useDocumentEditor } from './use-document-editor'

type DiscussionEditorProps = { content: unknown; onChange: (doc: EditorDocument) => void }

/** A discussion post or reply: rich text, code, links; images and embeds of old posts are kept. */
export function DiscussionEditor({ content, onChange }: DiscussionEditorProps) {
  const editor = useDocumentEditor({ preset: 'discussion', content, onChange })
  return (
    <div className="flex flex-col gap-2">
      <ContentStyles />
      {editor ? <EditorToolbar editor={editor} /> : null}
      <EditorContent editor={editor} />
    </div>
  )
}
