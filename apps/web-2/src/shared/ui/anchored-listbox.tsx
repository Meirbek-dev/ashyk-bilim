import { Combobox as BaseCombobox } from '@base-ui/react/combobox'
import type { ReactNode } from 'react'

import { m } from '#/paraglide/messages'

import type { ComboboxOption } from './combobox'
import { controlClass } from './form/control-classes'
import { menuItemClass, menuPopupClass } from './menu-classes'

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
 * A searchable list anchored to anything (the editor's "/" menu at the caret): focus moves into its search input,
 * the list filters by label as the user types, arrows move, Enter picks and closes.
 */
export function AnchoredListbox({ label, options, anchor, open, onOpenChange, onSelect }: AnchoredListboxProps) {
  return (
    <BaseCombobox.Root
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
      <BaseCombobox.Portal>
        <BaseCombobox.Positioner anchor={anchor} side="bottom" align="start" sideOffset={4} className="z-50">
          <BaseCombobox.Popup aria-label={label} className={`${menuPopupClass} flex w-72 flex-col gap-1`}>
            <BaseCombobox.Input aria-label={label} className={`h-control ${controlClass}`} />
            <BaseCombobox.Empty className="px-2 py-1.5 text-sm text-muted-foreground empty:hidden">
              {m.ui_options_empty()}
            </BaseCombobox.Empty>
            <BaseCombobox.List className="max-h-72 overflow-y-auto">
              {(option: ListboxOption) => (
                <BaseCombobox.Item
                  key={option.value}
                  value={option}
                  className={`${menuItemClass} [&_svg]:size-4 [&_svg]:shrink-0`}
                >
                  {option.icon}
                  {option.label}
                </BaseCombobox.Item>
              )}
            </BaseCombobox.List>
          </BaseCombobox.Popup>
        </BaseCombobox.Positioner>
      </BaseCombobox.Portal>
    </BaseCombobox.Root>
  )
}
