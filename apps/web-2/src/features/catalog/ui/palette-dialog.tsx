import { useDebouncedValue } from '@tanstack/react-pacer'
import { Suspense, useDeferredValue, useRef, useState } from 'react'

import { m } from '#/paraglide/messages'
import { Command, CommandEmpty, CommandInput, CommandStatus } from '#/shared/ui/command'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '#/shared/ui/dialog'

import { ShortcutHelp } from './shortcut-help'
import { PaletteEntries } from './palette-entries'

export type PaletteMode = 'palette' | 'help'

/** Typing settles for this long before the palette asks `search`. */
const SEARCH_WAIT_MS = 250

type PaletteDialogProps = { mode: PaletteMode | null; onModeChange: (mode: PaletteMode | null) => void }

/** The command palette (N-4) or the shortcut help, in the stock dialog and command list; closing clears the typed text. */
export function PaletteDialog({ mode, onModeChange }: PaletteDialogProps) {
  const [text, setText] = useState('')
  const [settled] = useDebouncedValue(text.trim(), { wait: SEARCH_WAIT_MS })
  // A new query suspends while it loads: the deferred value keeps the previous entries on screen meanwhile.
  const q = useDeferredValue(settled)
  const searching = text.trim() !== q
  // Focus starts in the input (or on the help list), not on the Close button, whose tooltip would take the
  // first Escape.
  const inputRef = useRef<HTMLInputElement>(null)
  const helpRef = useRef<HTMLDivElement>(null)
  const close = () => {
    setText('')
    onModeChange(null)
  }
  return (
    <Dialog
      open={mode !== null}
      onOpenChange={open => {
        if (!open) close()
      }}
    >
      <DialogContent initialFocus={() => (mode === 'help' ? helpRef : inputRef).current} className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{mode === 'help' ? m.catalog_help_title() : m.catalog_palette_title()}</DialogTitle>
        </DialogHeader>
        {mode === 'help' ? (
          <div ref={helpRef} tabIndex={-1}>
            <ShortcutHelp />
          </div>
        ) : (
          // Filtering is ours (entries come from the server and the access table): the command list only handles
          // focus, arrows, Enter and its ARIA.
          <Command
            filter={false}
            autoHighlight
            query={text}
            onQueryChange={setText}
            status={searching ? 'loading' : 'idle'}
          >
            <CommandInput
              ref={inputRef}
              aria-label={m.catalog_palette_title()}
              placeholder={m.catalog_palette_input()}
            />
            <CommandStatus>{state => (state.loading ? m.catalog_palette_searching() : null)}</CommandStatus>
            <CommandEmpty>{state => (state.loading ? null : m.catalog_palette_empty())}</CommandEmpty>
            {/* The entries suspend on their first reads (dashboard, search): only they wait, the input and what was
                typed into it stay (a suspended dialog came back empty: "python" typed at once arrived as "n"). */}
            <Suspense fallback={null}>
              <PaletteEntries text={text} q={q} actions={{ close, showHelp: () => onModeChange('help') }} />
            </Suspense>
          </Command>
        )}
      </DialogContent>
    </Dialog>
  )
}
