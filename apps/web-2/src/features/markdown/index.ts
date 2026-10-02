import { lazy } from 'react'

// Heavy modules (react-markdown, KaTeX, shiki, Tiptap) sit behind these lazy boundaries: wrap in <Suspense>.
export const MarkdownView = lazy(() => import('./ui/markdown-view').then(module => ({ default: module.MarkdownView })))
export const MarkdownEditor = lazy(() =>
  import('./ui/markdown-editor').then(module => ({ default: module.MarkdownEditor })),
)

/** The shared shiki highlighter (code blocks of the block editor too), loaded on first use. */
export const loadHighlighter = () => import('./ui/shiki')
export { default as proseCss } from './ui/prose.css?url'

export { markdownPlainText, markdownSummary } from './model/plain-text'
export { hasRawHtml, safeImageUrl, safeUrl, sanitize } from './model/sanitize'
