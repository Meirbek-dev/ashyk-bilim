import { useId } from 'react'

import { NativeSelect, NativeSelectOption } from '#/shared/ui/native-select'

import { errorText } from './field-errors'
import { describedBy, FieldShell } from './field-shell'
import { useFieldContext } from './form-context'

type SelectFieldProps = {
  label: string
  description?: string
  options: readonly { value: string; label: string }[]
}

/** A stock native select: the platform picker on phones, no popup to build. */
export function SelectField({ label, description, options }: SelectFieldProps) {
  const field = useFieldContext<string>()
  const id = useId()
  const error = errorText(field.state.meta.errors)
  return (
    <FieldShell id={id} label={label} description={description} error={error}>
      <NativeSelect
        id={id}
        name={field.name}
        value={field.state.value}
        onChange={event => field.handleChange(event.target.value)}
        onBlur={field.handleBlur}
        aria-invalid={error !== undefined || undefined}
        aria-describedby={describedBy(id, description, error)}
      >
        {options.map(option => (
          <NativeSelectOption key={option.value} value={option.value}>
            {option.label}
          </NativeSelectOption>
        ))}
      </NativeSelect>
    </FieldShell>
  )
}
