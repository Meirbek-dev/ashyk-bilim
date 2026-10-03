import { useId } from 'react'

import { m } from '#/paraglide/messages'
import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
  useComboboxAnchor,
} from '#/shared/ui/combobox'

import { describedBy, FieldShell } from './form/field-shell'

/** One choice of a combobox or an anchored listbox. `value` is the id the caller keeps. */
export type ComboboxOption = { value: string; label: string }

type MultiComboboxProps = {
  label: string
  description?: string | undefined
  error?: string | undefined
  placeholder?: string | undefined
  /** The current page of choices; the selected ones stay listed even when the page no longer has them. */
  options: readonly ComboboxOption[]
  value: readonly ComboboxOption[]
  onValueChange: (value: ComboboxOption[]) => void
  /** Server search: the caller refetches `options` for the typed text. Without it the list filters by label. */
  onQueryChange?: ((query: string) => void) | undefined
  /** Options are loading (first page, a search or the next page). */
  pending?: boolean | undefined
  /** The "Show more" row at the end of the list (an option, so arrows reach it): fetchNextPage. */
  hasMore?: boolean | undefined
  onMore?: (() => void) | undefined
}

const sameOption = (item: ComboboxOption, selected: ComboboxOption) => item.value === selected.value
// The value of the "Show more" row: no id is empty.
const MORE = ''

/**
 * Multi-select with search on the stock combobox: chips plus a text input; arrows move through the list, Enter
 * toggles, Backspace at the start removes the last chip. The popup stays open while picking several.
 */
export function MultiCombobox(props: MultiComboboxProps) {
  const { label, description, error, placeholder, options, value, onValueChange, onQueryChange } = props
  const { pending = false, hasMore = false, onMore } = props
  const id = useId()
  const anchor = useComboboxAnchor()
  const kept = value.filter(selected => !options.some(item => sameOption(item, selected)))
  const more = onMore && hasMore ? [{ value: MORE, label: m.ui_show_more() }] : []
  return (
    <FieldShell id={id} label={label} description={description} error={error}>
      <Combobox
        multiple
        items={[...options, ...kept, ...more]}
        value={[...value]}
        onValueChange={next => (next.some(option => option.value === MORE) ? onMore?.() : onValueChange(next))}
        itemToStringLabel={(item: ComboboxOption) => item.label}
        isItemEqualToValue={sameOption}
        filter={onQueryChange ? null : undefined}
        onInputValueChange={query => onQueryChange?.(query)}
        onOpenChange={(open, details) => {
          if (!open && details.reason === 'item-press') details.cancel()
        }}
      >
        <ComboboxChips ref={anchor}>
          {value.map(option => (
            <ComboboxChip key={option.value} removeLabel={m.ui_option_remove({ label: option.label })}>
              {option.label}
            </ComboboxChip>
          ))}
          <ComboboxChipsInput
            id={id}
            placeholder={value.length === 0 ? placeholder : undefined}
            aria-invalid={error !== undefined || undefined}
            aria-describedby={describedBy(id, description, error)}
          />
        </ComboboxChips>
        <ComboboxContent anchor={anchor} aria-busy={pending || undefined}>
          <ComboboxEmpty>{pending ? m.ui_loading() : m.ui_options_empty()}</ComboboxEmpty>
          <ComboboxList>
            {(option: ComboboxOption) => (
              <ComboboxItem key={option.value} value={option}>
                {option.label}
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
    </FieldShell>
  )
}
