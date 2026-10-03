import { Combobox as BaseCombobox } from '@base-ui/react/combobox'
import { Check, X } from 'lucide-react'

import { m } from '#/paraglide/messages'

import { Field } from './field'
import { controlClass } from './form/control-classes'
import { menuItemClass, menuPopupClass } from './menu-classes'

/** One choice of a combobox or an anchored listbox. `value` is the id the caller keeps. */
export type ComboboxOption = { value: string; label: string }

type ComboboxProps = {
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
  /** The "Show more" row at the list's end (an option, so arrows reach it): useSuspenseInfiniteQuery's fetchNextPage. */
  hasMore?: boolean | undefined
  onMore?: (() => void) | undefined
}

const sameOption = (item: ComboboxOption, selected: ComboboxOption) => item.value === selected.value
// The "Show more" row's value: no id is empty.
const MORE = ''

/** One row of the list: a choice with its check, or the "Show more" row. */
const optionRow = (option: ComboboxOption) =>
  option.value === MORE ? (
    <BaseCombobox.Item key={MORE} value={option} className={`${menuItemClass} justify-center font-medium`}>
      {option.label}
    </BaseCombobox.Item>
  ) : (
    <BaseCombobox.Item key={option.value} value={option} className={menuItemClass}>
      <span className="flex size-4 shrink-0">
        <BaseCombobox.ItemIndicator>
          <Check aria-hidden className="size-4" />
        </BaseCombobox.ItemIndicator>
      </span>
      {option.label}
    </BaseCombobox.Item>
  )

/**
 * Multi-select with search: chips plus a text input; arrows move through the list, Enter toggles, Backspace at the
 * start removes the last chip. The popup stays open while picking several.
 */
export function Combobox(props: ComboboxProps) {
  const { label, description, error, placeholder, options, value, onValueChange, onQueryChange } = props
  const { pending = false, hasMore = false, onMore } = props
  const kept = value.filter(selected => !options.some(item => sameOption(item, selected)))
  const more = onMore && hasMore ? [{ value: MORE, label: m.ui_show_more() }] : []
  const items = [...options, ...kept, ...more]
  return (
    <Field label={label} description={description} error={error}>
      <BaseCombobox.Root
        multiple
        items={items}
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
        <BaseCombobox.InputGroup
          className={`${controlClass} flex min-h-control flex-wrap items-center gap-1 py-1 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ring`}
        >
          <BaseCombobox.Chips className="contents">
            {value.map(option => (
              <BaseCombobox.Chip
                key={option.value}
                className="flex items-center gap-1 rounded-sm bg-secondary py-0.5 ps-2 pe-1 text-sm text-secondary-foreground data-highlighted:bg-accent data-highlighted:text-accent-foreground"
              >
                {option.label}
                <BaseCombobox.ChipRemove
                  aria-label={m.ui_option_remove({ label: option.label })}
                  className="flex size-6 items-center justify-center rounded-sm hover:bg-accent [&_svg]:size-3.5"
                >
                  <X aria-hidden />
                </BaseCombobox.ChipRemove>
              </BaseCombobox.Chip>
            ))}
            <BaseCombobox.Input
              placeholder={value.length === 0 ? placeholder : undefined}
              className="h-7 min-w-24 flex-1 bg-transparent outline-none placeholder:text-muted-foreground"
            />
          </BaseCombobox.Chips>
        </BaseCombobox.InputGroup>
        <BaseCombobox.Portal>
          <BaseCombobox.Positioner sideOffset={4} className="z-50">
            <BaseCombobox.Popup
              aria-busy={pending || undefined}
              className={`${menuPopupClass} flex max-h-80 w-(--anchor-width) flex-col gap-1 overflow-y-auto`}
            >
              {pending ? (
                <BaseCombobox.Status className="px-2 py-1.5 text-sm text-muted-foreground">
                  {m.ui_loading()}
                </BaseCombobox.Status>
              ) : (
                <BaseCombobox.Empty className="px-2 py-1.5 text-sm text-muted-foreground empty:hidden">
                  {m.ui_options_empty()}
                </BaseCombobox.Empty>
              )}
              <BaseCombobox.List>{optionRow}</BaseCombobox.List>
            </BaseCombobox.Popup>
          </BaseCombobox.Positioner>
        </BaseCombobox.Portal>
      </BaseCombobox.Root>
    </Field>
  )
}
