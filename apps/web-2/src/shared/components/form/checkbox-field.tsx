import { useId } from 'react'

import { Checkbox } from '#/shared/ui/checkbox'

import { errorText } from './field-errors'
import { describedBy, FieldShell } from './field-shell'
import { useFieldContext } from './form-context'

export function CheckboxField({ label, description }: { label: string; description?: string }) {
  const field = useFieldContext<boolean | null | undefined>()
  const id = useId()
  const error = errorText(field.state.meta.errors)
  return (
    <FieldShell inline id={id} label={label} description={description} error={error}>
      <Checkbox
        id={id}
        name={field.name}
        checked={field.state.value === true}
        onCheckedChange={checked => field.handleChange(checked)}
        onBlur={field.handleBlur}
        aria-invalid={error !== undefined || undefined}
        aria-describedby={describedBy(id, description, error)}
      />
    </FieldShell>
  )
}
