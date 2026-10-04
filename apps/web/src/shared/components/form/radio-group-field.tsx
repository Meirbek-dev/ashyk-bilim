import { useId } from 'react'

import { Field, FieldError, FieldLabel, FieldLegend, FieldSet } from '#/shared/ui/field'
import { RadioGroup, RadioGroupItem } from '#/shared/ui/radio-group'

import { errorText } from './field-errors'
import { useFieldContext } from './form-context'

type RadioGroupFieldProps = { label: string; options: readonly { value: string; label: string }[] }

/** A choice of a few options, all visible: a stock fieldset whose legend names the radio group. */
export function RadioGroupField({ label, options }: RadioGroupFieldProps) {
  const field = useFieldContext<string>()
  const id = useId()
  const error = errorText(field.state.meta.errors)
  return (
    <FieldSet data-invalid={error !== undefined || undefined}>
      <FieldLegend id={`${id}-legend`} variant="label">
        {label}
      </FieldLegend>
      <RadioGroup
        name={field.name}
        value={field.state.value}
        onValueChange={value => field.handleChange(String(value))}
        aria-labelledby={`${id}-legend`}
        aria-invalid={error !== undefined || undefined}
      >
        {options.map(option => (
          <Field key={option.value} orientation="horizontal">
            <RadioGroupItem id={`${id}-${option.value}`} value={option.value} />
            <FieldLabel htmlFor={`${id}-${option.value}`} className="font-normal">
              {option.label}
            </FieldLabel>
          </Field>
        ))}
      </RadioGroup>
      {error ? <FieldError>{error}</FieldError> : null}
    </FieldSet>
  )
}
