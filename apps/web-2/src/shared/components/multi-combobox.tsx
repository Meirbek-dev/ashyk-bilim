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
} from '#/shared/ui/combobox'

import { FieldShell } from './form/field-shell'

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

// The value of the "Show more" row: no id is empty.
const MORE = ''

/**
 * Multi-select with search on the stock combobox: chips plus a text input; arrows move through the list, Enter
 * toggles, Backspace at the start removes the last chip, Escape only closes the popup (never clears the choices).
 * The popup stays open while picking several.
 */
export function MultiCombobox(props: MultiComboboxProps) {
  const { label, description, error, placeholder, options, value, onValueChange, onQueryChange } = props
  const { pending = false, hasMore = false, onMore } = props
  const kept = value.filter(selected => !options.some(item => item.value === selected.value))
  const more = onMore && hasMore ? [{ value: MORE, label: m.ui_show_more() }] : []
  const listed = [...options, ...kept, ...more]
  const labelOf = (id: string) => [...value, ...listed].find(option => option.value === id)?.label ?? id
  return (
    <FieldShell label={label} description={description} error={error}>
      <Combobox
        multiple
        value={value.map(option => option.value)}
        onValueChange={next => {
          if (next.includes(MORE)) onMore?.()
          else onValueChange(next.map(chosen => ({ value: chosen, label: labelOf(chosen) })))
        }}
        itemToLabel={labelOf}
        // Server search: the caller's options are already the matches.
        {...(onQueryChange ? { filter: false } : {})}
        status={pending ? 'loading' : 'idle'}
        onQueryChange={query => onQueryChange?.(query)}
      >
        <ComboboxChips>
          {value.map(option => (
            <ComboboxChip
              key={option.value}
              value={option.value}
              removeLabel={m.ui_option_remove({ label: option.label })}
            >
              {option.label}
            </ComboboxChip>
          ))}
          <ComboboxChipsInput placeholder={value.length === 0 ? placeholder : undefined} />
        </ComboboxChips>
        <ComboboxContent>
          <ComboboxEmpty>{pending ? m.ui_loading() : m.ui_options_empty()}</ComboboxEmpty>
          <ComboboxList>
            {listed.map(option => (
              <ComboboxItem key={option.value} value={option.value} label={option.label}>
                {option.label}
              </ComboboxItem>
            ))}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
    </FieldShell>
  )
}
