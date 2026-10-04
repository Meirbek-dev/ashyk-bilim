import { useDebouncedValue } from '@tanstack/react-pacer'
import { useDeferredValue, useRef, useState } from 'react'

import { m } from '#/paraglide/messages'
import { Combobox, ComboboxGroup, ComboboxInput, ComboboxItem, ComboboxLabel, ComboboxList } from '#/shared/ui/combobox'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '#/shared/ui/dialog'

import { ShortcutHelp } from './shortcut-help'
import { type PaletteEntry, usePaletteGroups } from './use-palette-groups'

export type PaletteMode = 'palette' | 'help'

/** Typing settles for this long before the palette asks `search`. */
const SEARCH_WAIT_MS = 250

type PaletteDialogProps = { mode: PaletteMode | null; onModeChange: (mode: PaletteMode | null) => void }

/** The command palette (N-4) or the shortcut help, in the stock dialog and an inline combobox; closing clears the typed text. */
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
          // Filtering is ours (entries come from the server and the access table): the combobox only handles focus,
          // arrows, Enter and the ARIA combobox. Nothing stays selected; only typing changes the text.
          <Combobox
            inline
            open
            filter={null}
            autoHighlight
            value={null}
            onValueChange={(entry: PaletteEntry | null) => entry?.onSelect()}
            itemToStringLabel={(entry: PaletteEntry) => entry.label}
            inputValue={text}
            onInputValueChange={(value, { reason }) => {
              if (reason === 'input-change' || reason === 'input-clear') setText(value)
            }}
          >
            <ComboboxInput
              ref={inputRef}
              className="w-full"
              aria-label={m.catalog_palette_title()}
              placeholder={m.catalog_palette_input()}
              showTrigger={false}
            />
            <ComboboxList aria-label={m.catalog_palette_title()} className="max-h-80">
              {searching ? (
                <output className="block px-2 py-2 text-sm text-muted-foreground">
                  {m.catalog_palette_searching()}
                </output>
              ) : groups.length === 0 ? (
                <p className="py-2 text-center text-sm text-muted-foreground">{m.catalog_palette_empty()}</p>
              ) : null}
              {groups.map(group => (
                <ComboboxGroup key={group.heading}>
                  <ComboboxLabel>{group.heading}</ComboboxLabel>
                  {group.entries.map(entry => (
                    <ComboboxItem key={entry.id} value={entry}>
                      {entry.icon}
                      <span className="min-w-0 flex-1 truncate">{entry.label}</span>
                      {entry.hint ? <span className="text-xs text-muted-foreground">{entry.hint}</span> : null}
                    </ComboboxItem>
                  ))}
                </ComboboxGroup>
              ))}
            </ComboboxList>
          </Combobox>
        )}
      </DialogContent>
    </Dialog>
  )
}
