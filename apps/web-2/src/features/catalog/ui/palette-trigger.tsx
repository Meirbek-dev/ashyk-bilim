import { formatForDisplay, useHotkey } from '@tanstack/react-hotkeys'
import { useHydrated } from '@tanstack/react-router'
import { Search } from 'lucide-react'
import { lazy, Suspense, useState } from 'react'

import { m } from '#/paraglide/messages'
import { IconButton } from '#/shared/components/icon-button'
import { Button } from '#/shared/ui/button'

import { shortcuts } from '../model/shortcuts'
import type { PaletteMode } from './palette-dialog'

// The combobox and the dialog load on the first open.
const PaletteDialog = lazy(() => import('./palette-dialog').then(module => ({ default: module.PaletteDialog })))

/**
 * The palette button, `Mod+K` for the palette and `?` for the shortcut help. From md it looks like a search field
 * with its shortcut; the key names depend on the platform, so they appear once hydrated.
 */
export function PaletteTrigger() {
  const [mode, setMode] = useState<PaletteMode | null>(null)
  // Stays mounted after the first open, so the dialog can animate out and return focus.
  const [loaded, setLoaded] = useState(false)
  const hydrated = useHydrated()
  const open = (next: PaletteMode) => {
    setLoaded(true)
    setMode(next)
  }
  useHotkey(shortcuts.palette.hotkey, () => open('palette'))
  useHotkey(shortcuts.help.hotkey, () => open('help'))
  return (
    <>
      <span className="md:hidden">
        <IconButton label={m.catalog_palette_title()} icon={<Search aria-hidden />} onClick={() => open('palette')} />
      </span>
      <Button
        variant="outline"
        className="hidden w-64 justify-start bg-muted font-normal text-muted-foreground md:inline-flex lg:w-80"
        onClick={() => open('palette')}
      >
        <Search aria-hidden data-icon="inline-start" />
        <span className="truncate">{m.catalog_palette_title()}</span>
        {hydrated ? (
          <kbd aria-hidden className="ml-auto rounded-sm border bg-background px-1.5 font-mono text-xs">
            {formatForDisplay(shortcuts.palette.hotkey)}
          </kbd>
        ) : null}
      </Button>
      {loaded ? (
        <Suspense fallback={null}>
          <PaletteDialog mode={mode} onModeChange={setMode} />
        </Suspense>
      ) : null}
    </>
  )
}
