import { Field as BaseField } from '@base-ui/react/field'

import { Field } from '../field'
import { controlClass } from './control-classes'
import { errorText } from './field-errors'
import { useFieldContext } from './form-context'

type TextareaFieldProps = { label: string; description?: string; required?: boolean }

export function TextareaField({ label, description, required }: TextareaFieldProps) {
  const field = useFieldContext<string | null | undefined>()
  return (
    <Field label={label} description={description} error={errorText(field.state.meta.errors)}>
      <BaseField.Control
        name={field.name}
        required={required}
        value={field.state.value ?? ''}
        onValueChange={value => field.handleChange(value)}
        onBlur={field.handleBlur}
        className={`min-h-24 py-2 ${controlClass}`}
        render={<textarea />}
      />
    </Field>
  )
}
