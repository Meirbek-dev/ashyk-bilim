import { lazy } from 'react'

/** CodeMirror and its modes in their own chunk (G-05): render inside <Suspense>. */
export const CodeEditor = lazy(() => import('./code-editor').then(module => ({ default: module.CodeEditor })))
