import { EditorContent } from '@tiptap/react'
import type { ReactNode } from 'react'

import { ContentStyles } from './content-styles'
import { useDocumentEditor } from './use-document-editor'

/**
 * A lesson page or a post, read-only: flip cards flip, scenarios play, embeds and media load. `discussion`: a post,
 * read with the post schema (no lesson blocks, embeds as links). `fallback`: what shows until the editor exists (it is
 * created after the first render), e.g. the post's plain text, so the content never flashes empty.
 */
export function BlockViewer({
  content,
  discussion = false,
  fallback = null,
}: {
  content: unknown
  discussion?: boolean
  fallback?: ReactNode
}) {
  const editor = useDocumentEditor({ preset: discussion ? 'discussion-view' : 'view', content })
  return (
    <>
      <ContentStyles />
      {editor ? <EditorContent editor={editor} /> : fallback}
    </>
  )
}
