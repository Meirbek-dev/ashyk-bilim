import { lazy } from 'react'

// Heavy modules (react-markdown, KaTeX, shiki, Tiptap) sit behind these lazy boundaries: wrap in <Suspense>.
export { MarkdownView } from './ui/markdown-text'
export const MarkdownEditor = lazy(() =>
  import('./ui/markdown-editor').then(module => ({ default: module.MarkdownEditor })),
)

/** The shared shiki highlighter (code blocks of the block editor too), loaded on first use. */
export const loadHighlighter = () => import('./ui/shiki')

export { markdownPlainText, markdownSummary } from './model/plain-text'
export { hasRawHtml, safeImageUrl, safeUrl, sanitize } from './model/sanitize'
