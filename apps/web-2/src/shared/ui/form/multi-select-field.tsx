import { useState } from 'react'

import { Combobox, type ComboboxOption } from '../combobox'
import { errorText } from './field-errors'
import { useFieldContext } from './form-context'

type MultiSelectFieldProps = {
  label: string
  description?: string
  placeholder?: string
  /** The current page of choices; include the already selected ones when editing so their chips have labels. */
  options: readonly ComboboxOption[]
  onQueryChange?: (query: string) => void
  pending?: boolean
  hasMore?: boolean
  onMore?: () => void
}

/** The field's value is the list of chosen ids (`course_ids`...): `<f.MultiSelectField options={...} />`. */
export function MultiSelectField({ label, description, placeholder, options, ...search }: MultiSelectFieldProps) {
  const field = useFieldContext<readonly string[] | null | undefined>()
  // Chosen options keep their labels after a search or a page change drops them from `options`.
  const [picked, setPicked] = useState<readonly ComboboxOption[]>([])
  const known = [...picked, ...options]
  const value = (field.state.value ?? []).map(
    id => known.find(option => option.value === id) ?? { value: id, label: id },
  )
  return (
    <Combobox
      label={label}
      description={description}
      placeholder={placeholder}
      error={errorText(field.state.meta.errors)}
      options={options}
      value={value}
      onValueChange={next => {
        setPicked(next)
        field.handleChange(next.map(option => option.value))
      }}
      {...search}
    />
  )
}
