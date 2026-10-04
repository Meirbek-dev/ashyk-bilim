import { EditorContent } from '@tiptap/react'

import { ContentStyles } from './content-styles'
import { useDocumentEditor } from './use-document-editor'

/**
 * A lesson page or a post, read-only: flip cards flip, scenarios play, embeds and media load. `discussion`: a post,
 * read with the post schema (no lesson blocks, embeds as links).
 */
export function BlockViewer({ content, discussion = false }: { content: unknown; discussion?: boolean }) {
  const editor = useDocumentEditor({ preset: discussion ? 'discussion-view' : 'view', content })
  return (
    <>
      <ContentStyles />
      <EditorContent editor={editor} />
    </>
  )
}
