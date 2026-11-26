import { Textarea } from '#/shared/ui/textarea'

import { errorText } from './field-errors'
import { FieldShell } from './field-shell'
import { useFieldContext } from './form-context'

type TextareaFieldProps = { label: string; description?: string; required?: boolean }

export function TextareaField({ label, description, required }: TextareaFieldProps) {
  const field = useFieldContext<string | null | undefined>()
  return (
    <FieldShell label={label} description={description} error={errorText(field.state.meta.errors)}>
      <Textarea
        name={field.name}
        required={required}
        value={field.state.value ?? ''}
        onValueChange={value => field.handleChange(value)}
        onBlur={field.handleBlur}
      />
    </FieldShell>
  )
}
