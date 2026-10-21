import { lazy, Suspense, type ComponentProps } from 'react'

import { markdownPlainText } from '../model/plain-text'

const LazyMarkdownView = lazy(() => import('./markdown-view').then(module => ({ default: module.MarkdownView })))

/** The text while the renderer loads: each paragraph's plain words, so the reader has them at once and nothing jumps. */
const draft = (markdown: string) =>
  markdown
    .split(/\n\s*\n/)
    .map(markdownPlainText)
    .filter(Boolean)
    .join('\n\n')

/**
 * Rendered markdown (react-markdown, loaded on first use). Until the renderer is in, the plain text stands in its place
 * (a question's prompt, a task's instructions, a post): callers' own fallbacks were nothing, a bar or a list skeleton,
 * and the content popped in and pushed the page down.
 */
export function MarkdownView(props: ComponentProps<typeof LazyMarkdownView>) {
  return (
    <Suspense fallback={<p className="wrap-anywhere whitespace-pre-line">{draft(props.content)}</p>}>
      <LazyMarkdownView {...props} />
    </Suspense>
  )
}
