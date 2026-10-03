import { useId, type ComponentProps } from 'react'

import { Input } from '#/shared/ui/input'

import { errorText } from './field-errors'
import { describedBy, FieldShell } from './field-shell'
import { useFieldContext } from './form-context'

type TextFieldProps = Pick<ComponentProps<'input'>, 'type' | 'autoComplete' | 'inputMode' | 'required'> & {
  label: string
  description?: string
}

/** `<form.AppField name="x">{f => <f.TextField label={...} />}</form.AppField>`: stock `Input` in a stock `Field`. */
export function TextField({ label, description, ...input }: TextFieldProps) {
  const field = useFieldContext<string | null | undefined>()
  const id = useId()
  const error = errorText(field.state.meta.errors)
  return (
    <FieldShell id={id} label={label} description={description} error={error}>
      <Input
        id={id}
        name={field.name}
        value={field.state.value ?? ''}
        onChange={event => field.handleChange(event.target.value)}
        onBlur={field.handleBlur}
        aria-invalid={error !== undefined || undefined}
        aria-describedby={describedBy(id, description, error)}
        {...input}
      />
    </FieldShell>
  )
}
