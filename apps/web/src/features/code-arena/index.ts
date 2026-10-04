import { lazy } from 'react'

// Route files import only the loaders from here (the search schema is in route.ts); the screens (and CodeMirror under them) load
// behind these lazy boundaries.
export { ensureArena, ensureCodeStudio } from './queries'

export const CodeArenaPage = lazy(() => import('./ui/arena-page').then(module => ({ default: module.ArenaPage })))
export const CodeStudio = lazy(() => import('./ui/code-studio').then(module => ({ default: module.CodeStudio })))
