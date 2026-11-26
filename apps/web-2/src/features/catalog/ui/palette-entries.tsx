import { m } from '#/paraglide/messages'
import { CommandGroup, CommandGroupLabel, CommandItem, CommandList } from '#/shared/ui/command'

import { usePaletteGroups } from './use-palette-groups'

type PaletteEntriesProps = { text: string; q: string; actions: { close: () => void; showHelp: () => void } }

/** The palette's groups for the typed text, in the command list. */
export function PaletteEntries({ text, q, actions }: PaletteEntriesProps) {
  const groups = usePaletteGroups(text, q, actions)
  return (
    <CommandList aria-label={m.catalog_palette_title()} className="max-h-80">
      {groups.map(group => (
        <CommandGroup key={group.heading}>
          <CommandGroupLabel>{group.heading}</CommandGroupLabel>
          {group.entries.map(entry => (
            <CommandItem key={entry.id} value={entry.id} label={entry.label} onSelect={() => entry.onSelect()}>
              {entry.icon}
              <span className="min-w-0 flex-1 truncate">{entry.label}</span>
              {/* A lesson's course name can be long: the hint takes at most half, the entry's own name the rest. */}
              {entry.hint ? (
                <span className="max-w-1/2 truncate text-xs text-muted-foreground">{entry.hint}</span>
              ) : null}
            </CommandItem>
          ))}
        </CommandGroup>
      ))}
    </CommandList>
  )
}
