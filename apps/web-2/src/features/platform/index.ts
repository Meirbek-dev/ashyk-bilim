import { lazyRouteComponent } from '@tanstack/react-router'

export { AppShell } from './ui/app-shell'
export { NotFoundView } from './ui/not-found-view'
export { PendingView } from './ui/pending-view'
export { RootDocument } from './ui/root-document'
export { SettingsLayout } from './ui/settings-layout'
export { UnderConstruction } from './ui/under-construction'

// The root route is never code-split: a static ErrorView would put every API error message in the entry chunk
// (G-05). It loads when an error is shown; SSR renders it and hydration waits for its chunk.
export const ErrorView = lazyRouteComponent(() => import('./ui/error-view'), 'ErrorView')
