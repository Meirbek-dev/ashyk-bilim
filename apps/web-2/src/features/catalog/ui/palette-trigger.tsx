import { useHotkey } from '@tanstack/react-hotkeys'
import { Search } from 'lucide-react'
import { lazy, Suspense, useState } from 'react'

import { m } from '#/paraglide/messages'
import { IconButton } from '#/shared/components/icon-button'

import { shortcuts } from '../model/shortcuts'
import type { PaletteMode } from './palette-dialog'

// cmdk and the dialog load on the first open.
const PaletteDialog = lazy(() => import('./palette-dialog').then(module => ({ default: module.PaletteDialog })))

/** The palette button, `Mod+K` for the palette and `?` for the shortcut help. */
export function PaletteTrigger() {
  const [mode, setMode] = useState<PaletteMode | null>(null)
  // Stays mounted after the first open, so the dialog can animate out and return focus.
  const [loaded, setLoaded] = useState(false)
  const open = (next: PaletteMode) => {
    setLoaded(true)
    setMode(next)
  }
  useHotkey(shortcuts.palette.hotkey, () => open('palette'))
  useHotkey(shortcuts.help.hotkey, () => open('help'))
  return (
    <>
      <IconButton label={m.catalog_palette_title()} icon={<Search aria-hidden />} onClick={() => open('palette')} />
      {loaded ? (
        <Suspense fallback={null}>
          <PaletteDialog mode={mode} onModeChange={setMode} />
        </Suspense>
      ) : null}
    </>
  )
}
