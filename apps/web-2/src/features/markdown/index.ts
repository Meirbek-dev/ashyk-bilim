import { lazy } from 'react'

// Heavy modules (the Tiptap parser, KaTeX, code grammars, the editor) sit behind these lazy boundaries: wrap in
// <Suspense>.
export { MarkdownView } from './ui/markdown-text'
export const MarkdownEditor = lazy(() =>
  import('./ui/markdown-editor').then(module => ({ default: module.MarkdownEditor })),
)

/** The shared code highlighter (code blocks of the block editor too): Lezer grammars and CodeMirror legacy modes. */
export const loadHighlighter = () => import('./ui/languages')
export type { CodeToken } from './ui/languages'

export { codeHighlighter } from './model/code-style'
export { markdownPlainText, markdownSummary } from './model/plain-text'
export { hasRawHtml, safeImageUrl, safeUrl, sanitize } from './model/sanitize'
