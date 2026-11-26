import type { ReactNode } from 'react'

import { m } from '#/paraglide/messages'
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '#/shared/ui/command'
import { Popover, PopoverContent } from '#/shared/ui/popover'

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
  /** After the close (its animation and focus return) is over: where the focus goes next. */
  onClosed?: () => void
}

/**
 * A searchable list anchored to anything (the "/" menu of the editor at the caret) : the stock popover around the stock
 * command list. Focus moves into its search input, the list filters by label as the user types, arrows move, Enter picks and closes.
 */
export function AnchoredListbox({
  label,
  options,
  anchor,
  open,
  onOpenChange,
  onSelect,
  onClosed,
}: AnchoredListboxProps) {
  const pick = (value: string) => {
    const option = options.find(item => item.value === value)
    if (option) onSelect(option)
    onOpenChange(false)
  }
  return (
    <Popover
      open={open}
      onOpenChange={next => onOpenChange(next)}
      onOpenChangeComplete={next => (next ? undefined : onClosed?.())}
    >
      <PopoverContent anchor={anchor} align="start" sideOffset={6} aria-label={label} className="w-72 gap-0 p-0">
        <Command filter="contains" autoHighlight onAction={pick} className="gap-0">
          <CommandInput
            aria-label={label}
            placeholder={label}
            className="m-1 mb-0 h-8 w-auto border-border bg-muted shadow-none"
          />
          <CommandEmpty>{m.ui_options_empty()}</CommandEmpty>
          <CommandList aria-label={label} className="max-h-80 p-1">
            {options.map(option => (
              <CommandItem key={option.value} value={option.value} label={option.label}>
                {option.icon}
                {option.label}
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
