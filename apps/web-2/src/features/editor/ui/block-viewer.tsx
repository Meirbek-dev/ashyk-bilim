import { lazy, Suspense, type ReactNode } from 'react'

import { normalizeDocument } from '../model/normalize'
import { ContentStyles } from './content-styles'
import { StaticDocument } from './static/document'

// Only legacy HTML still needs the editor to be read (none in production since D-01): it loads with such a page.
const HtmlViewer = lazy(() => import('./html-viewer').then(module => ({ default: module.HtmlViewer })))

/**
 * A lesson page or a post, read-only: flip cards flip, scenarios play, embeds and media load. A stored document is
 * drawn without the editor (B-EDT-34). `discussion`: a post, read with the post schema (no lesson blocks, embeds as
 * links). `fallback`: what shows while legacy HTML content waits for the editor, e.g. the post's plain text.
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
  const doc = normalizeDocument(content)
  return (
    <>
      <ContentStyles />
      {typeof doc === 'string' ? (
        <Suspense fallback={fallback}>
          <HtmlViewer html={doc} discussion={discussion} fallback={fallback} />
        </Suspense>
      ) : (
        <StaticDocument doc={doc} discussion={discussion} />
      )}
    </>
  )
}
