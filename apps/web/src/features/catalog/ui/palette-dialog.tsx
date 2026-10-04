import { useDebouncedValue } from '@tanstack/react-pacer'
import { useDeferredValue, useRef, useState } from 'react'

import { m } from '#/paraglide/messages'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from '#/shared/ui/command'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '#/shared/ui/dialog'

import { ShortcutHelp } from './shortcut-help'
import { usePaletteGroups } from './use-palette-groups'

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
  // Focus starts in the input (or on the help list), not on the Close button, whose tooltip would take the
  // first Escape.
  const inputRef = useRef<HTMLInputElement>(null)
  const helpRef = useRef<HTMLDivElement>(null)
  const close = () => {
    setText('')
    onModeChange(null)
  }
  const groups = usePaletteGroups(text, q, { close, showHelp: () => onModeChange('help') })
  const searching = text.trim() !== q
  return (
    <Dialog
      open={mode !== null}
      onOpenChange={open => {
        if (!open) close()
      }}
    >
      <DialogContent initialFocus={mode === 'help' ? helpRef : inputRef} className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{mode === 'help' ? m.catalog_help_title() : m.catalog_palette_title()}</DialogTitle>
        </DialogHeader>
        {mode === 'help' ? (
          <div ref={helpRef} tabIndex={-1}>
            <ShortcutHelp />
          </div>
        ) : (
          // Filtering is ours (entries come from the server and the access table): cmdk only handles focus,
          // arrows, Enter and the ARIA combobox.
          <Command label={m.catalog_palette_title()} shouldFilter={false} loop>
            <CommandInput ref={inputRef} value={text} onValueChange={setText} placeholder={m.catalog_palette_input()} />
            <CommandList label={m.catalog_palette_title()}>
              {searching ? (
                <output className="block px-2 py-2 text-sm text-muted-foreground">
                  {m.catalog_palette_searching()}
                </output>
              ) : (
                <CommandEmpty>{m.catalog_palette_empty()}</CommandEmpty>
              )}
              {groups.map(group => (
                <CommandGroup key={group.heading} heading={group.heading}>
                  {group.entries.map(entry => (
                    <CommandItem key={entry.id} value={entry.id} onSelect={entry.onSelect}>
                      {entry.icon}
                      <span className="min-w-0 flex-1 truncate">{entry.label}</span>
                      {entry.hint ? <CommandShortcut>{entry.hint}</CommandShortcut> : null}
                    </CommandItem>
                  ))}
                </CommandGroup>
              ))}
            </CommandList>
          </Command>
        )}
      </DialogContent>
    </Dialog>
  )
}
