import { lazy } from 'react'

// Tiptap, KaTeX and shiki load behind these lazy boundaries only: wrap each in <Suspense>.
export const BlockEditor = lazy(() => import('./ui/block-editor').then(module => ({ default: module.BlockEditor })))
export const BlockViewer = lazy(() => import('./ui/block-viewer').then(module => ({ default: module.BlockViewer })))
export const DiscussionEditor = lazy(() =>
  import('./ui/discussion-editor').then(module => ({ default: module.DiscussionEditor })),
)

// Pure helpers: no Tiptap at runtime.
export { EMPTY_DOCUMENT, stripEmptyFileBlocks, type EditorDocument } from './model/document'
export { normalizeDocument } from './model/normalize'
export { extractPlainText } from './model/plain-text'
