import { lazy, Suspense } from 'react'

// The trigger (tooltip, hotkeys library) is not needed for the first paint: SSR renders it, the browser hydrates
// it when its chunk arrives, like the shell's menus. This keeps the entry chunk inside its budget (G-05).
const PaletteTrigger = lazy(() => import('./palette-trigger').then(module => ({ default: module.PaletteTrigger })))

/** The shell's `search` slot (spec N-4): the command palette for everyone. */
export function CommandPalette() {
  return (
    <Suspense fallback={null}>
      <PaletteTrigger />
    </Suspense>
  )
}
