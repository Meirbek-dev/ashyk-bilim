import { EditorContent } from '@tiptap/react'

import { ContentStyles } from './content-styles'
import { useDocumentEditor } from './use-document-editor'

/** A lesson page or a post, read-only: flip cards flip, scenarios play, embeds and media load. */
export function BlockViewer({ content }: { content: unknown }) {
  const editor = useDocumentEditor({ preset: 'view', content })
  return (
    <>
      <ContentStyles />
      <EditorContent editor={editor} />
    </>
  )
}
