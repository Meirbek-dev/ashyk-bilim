import { lazy, Suspense, type ComponentProps } from 'react'

import { MarkdownDraft } from './markdown-draft'
import type { MarkdownView as Rendered } from './markdown-view'

// The network lost before the renderer came in (a test started on a weak connection) keeps the plain words in place
// (B-MD-10): a failed chunk threw to the route, and the learner lost the question for an error page.
const LazyMarkdownView = lazy(() =>
  import('./markdown-view').then(
    module => ({ default: module.MarkdownView }),
    () => ({ default: MarkdownDraft }),
  ),
)

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
