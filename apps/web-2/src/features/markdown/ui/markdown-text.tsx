import { lazy, Suspense, type ComponentProps } from 'react'

import { loadRenderer } from './load-renderer'
import { MarkdownDraft } from './markdown-draft'
import type { MarkdownView as Rendered } from './markdown-view'

const LazyMarkdownView = lazy(() => loadRenderer())

/**
 * Rendered markdown (react-markdown, loaded on first use). Until the renderer is in, the plain text stands in its place
 * (a question's prompt, a task's instructions, a post): callers' own fallbacks were nothing, a bar or a list skeleton,
 * and the content popped in and pushed the page down.
 */
export function MarkdownView(props: ComponentProps<typeof Rendered>) {
  return (
    <Suspense fallback={<MarkdownDraft content={props.content} />}>
      <LazyMarkdownView {...props} />
    </Suspense>
  )
}
