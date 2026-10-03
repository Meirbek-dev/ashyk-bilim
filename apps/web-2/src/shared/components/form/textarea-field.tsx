import { useId } from 'react'

import { Textarea } from '#/shared/ui/textarea'

import { errorText } from './field-errors'
import { describedBy, FieldShell } from './field-shell'
import { useFieldContext } from './form-context'

type TextareaFieldProps = { label: string; description?: string; required?: boolean }

export function TextareaField({ label, description, required }: TextareaFieldProps) {
  const field = useFieldContext<string | null | undefined>()
  const id = useId()
  const error = errorText(field.state.meta.errors)
  return (
    <FieldShell id={id} label={label} description={description} error={error}>
      <Textarea
        id={id}
        name={field.name}
        required={required}
        value={field.state.value ?? ''}
        onChange={event => field.handleChange(event.target.value)}
        onBlur={field.handleBlur}
        aria-invalid={error !== undefined || undefined}
        aria-describedby={describedBy(id, description, error)}
      />
    </FieldShell>
  )
}
