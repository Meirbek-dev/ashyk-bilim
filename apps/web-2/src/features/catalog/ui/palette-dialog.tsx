import { useDebouncedValue } from '@tanstack/react-pacer'
import { useDeferredValue, useRef, useState } from 'react'

import { m } from '#/paraglide/messages'
import { Command } from '#/shared/ui/command'
import { Dialog } from '#/shared/ui/dialog'

import { ShortcutHelp } from './shortcut-help'
import { usePaletteGroups } from './use-palette-groups'

export type PaletteMode = 'palette' | 'help'

/** Typing settles for this long before the palette asks `search`. */
const SEARCH_WAIT_MS = 250

type PaletteDialogProps = { mode: PaletteMode | null; onModeChange: (mode: PaletteMode | null) => void }

/** The command palette (N-4) or the shortcut help, in the kit dialog; closing clears the typed text. */
export function PaletteDialog({ mode, onModeChange }: PaletteDialogProps) {
  const [text, setText] = useState('')
  const [settled] = useDebouncedValue(text.trim(), { wait: SEARCH_WAIT_MS })
  // A new query suspends while it loads: the deferred value keeps the previous entries on screen meanwhile.
  const q = useDeferredValue(settled)
  // Focus starts in the input (or on the help list), not on the Close button, whose tooltip would take the
  // first Escape.
  const inputRef = useRef<HTMLInputElement>(null)
  const helpRef = useRef<HTMLDivElement>(null)
  const close = () => {
    setText('')
    onModeChange(null)
  }
  const groups = usePaletteGroups(text, q, { close, showHelp: () => onModeChange('help') })
  return (
    <Dialog
      open={mode !== null}
      onOpenChange={open => {
        if (!open) close()
      }}
      title={mode === 'help' ? m.catalog_help_title() : m.catalog_palette_title()}
      initialFocus={mode === 'help' ? helpRef : inputRef}
      footer={null}
    >
      {mode === 'help' ? (
        <div ref={helpRef} tabIndex={-1}>
          <ShortcutHelp />
        </div>
      ) : (
        <Command
          label={m.catalog_palette_title()}
          placeholder={m.catalog_palette_input()}
          value={text}
          onValueChange={setText}
          groups={groups}
          emptyText={m.catalog_palette_empty()}
          loadingText={text.trim() === q ? undefined : m.catalog_palette_searching()}
          inputRef={inputRef}
        />
      )}
    </Dialog>
  )
}
