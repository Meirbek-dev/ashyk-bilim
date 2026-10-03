import { lazy } from 'react'

export { AppShell } from './ui/app-shell'
export { NotFoundView } from './ui/not-found-view'
export { PendingView } from './ui/pending-view'
export { RootDocument } from './ui/root-document'
export { SettingsLayout } from './ui/settings-layout'

// The root route is never code-split: a static ErrorView would put every API error message in the entry chunk
// (G-05). It loads when an error is shown; SSR renders it and hydration waits for its chunk. React.lazy, not
// `lazyRouteComponent`: that one calls use() only until the chunk is in, which React (dev) reports as a misuse.
export const ErrorView = lazy(() => import('./ui/error-view').then(module => ({ default: module.ErrorView })))
