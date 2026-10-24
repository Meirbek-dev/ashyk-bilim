import type { ReactNode } from 'react'

import { DocumentContent } from './tiptap-parts'
import { useDocumentEditor } from './use-document-editor'

/** Legacy HTML content (no stored document yet): the editor's read-only view parses it with the schema. */
export function HtmlViewer({ html, discussion, fallback }: { html: string; discussion: boolean; fallback: ReactNode }) {
  const editor = useDocumentEditor({ preset: discussion ? 'discussion-view' : 'view', content: html })
  return editor ? <DocumentContent editor={editor} /> : fallback
}
