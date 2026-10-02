import { Field as BaseField } from '@base-ui/react/field'

import { Field } from '../field'
import { controlClass } from './control-classes'
import { errorText } from './field-errors'
import { useFieldContext } from './form-context'

type SelectFieldProps = {
  label: string
  description?: string
  options: readonly { value: string; label: string }[]
}

/** A native select: the platform picker on phones, no popup to build. */
export function SelectField({ label, description, options }: SelectFieldProps) {
  const field = useFieldContext<string>()
  return (
    <Field label={label} description={description} error={errorText(field.state.meta.errors)}>
      <BaseField.Control
        name={field.name}
        value={field.state.value}
        onValueChange={value => field.handleChange(value)}
        onBlur={field.handleBlur}
        className={`h-control ${controlClass}`}
        render={
          <select>
            {options.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        }
      />
    </Field>
  )
}
