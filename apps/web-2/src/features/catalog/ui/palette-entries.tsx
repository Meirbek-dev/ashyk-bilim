import { m } from '#/paraglide/messages'
import { ComboboxGroup, ComboboxItem, ComboboxLabel } from '#/shared/ui/combobox'

import { usePaletteGroups } from './use-palette-groups'

type PaletteEntriesProps = { text: string; q: string; actions: { close: () => void; showHelp: () => void } }

/** The palette's groups for the typed text, inside the combobox list. */
export function PaletteEntries({ text, q, actions }: PaletteEntriesProps) {
  const groups = usePaletteGroups(text, q, actions)
  const searching = text.trim() !== q
  return (
    <>
      {searching ? (
        <output className="block px-2 py-2 text-sm text-muted-foreground">{m.catalog_palette_searching()}</output>
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
    </>
  )
}
