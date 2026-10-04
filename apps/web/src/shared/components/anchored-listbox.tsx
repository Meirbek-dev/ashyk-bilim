import type { ReactNode } from 'react'

import { m } from '#/paraglide/messages'
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from '#/shared/ui/combobox'

import type { ComboboxOption } from './multi-combobox'

/** A rect to anchor to when there is no element: the caret (`editor.view.coordsAtPos(pos)` as a DOMRect). */
type VirtualAnchor = { getBoundingClientRect: () => DOMRect }

/** A choice of the listbox; `icon` is one lucide icon, `aria-hidden`. */
export type ListboxOption = ComboboxOption & { icon?: ReactNode }

type AnchoredListboxProps = {
  /** Names the search input and the list. */
  label: string
  options: readonly ListboxOption[]
  /** The element or rect the popup sits under (flips above when there is no room). */
  anchor: Element | VirtualAnchor | null
  open: boolean
  /** Closed by Escape, a click outside or a pick: return focus to where the user was (the editor). */
  onOpenChange: (open: boolean) => void
  onSelect: (option: ListboxOption) => void
}

/**
 * A searchable list anchored to anything (the "/" menu of the editor at the caret) on the stock combobox: focus moves
 * into its search input, the list filters by label as the user types, arrows move, Enter picks and closes.
 */
export function AnchoredListbox({ label, options, anchor, open, onOpenChange, onSelect }: AnchoredListboxProps) {
  return (
    <Combobox
      items={options}
      open={open}
      onOpenChange={next => onOpenChange(next)}
      value={null}
      onValueChange={(option: ListboxOption | null) => {
        if (option) onSelect(option)
        onOpenChange(false)
      }}
      itemToStringLabel={(option: ListboxOption) => option.label}
      autoHighlight
    >
      <ComboboxContent anchor={anchor} aria-label={label} className="w-72">
        <ComboboxInput aria-label={label} showTrigger={false} />
        <ComboboxEmpty>{m.ui_options_empty()}</ComboboxEmpty>
        <ComboboxList>
          {(option: ListboxOption) => (
            <ComboboxItem key={option.value} value={option}>
              {option.icon}
              {option.label}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  )
}
