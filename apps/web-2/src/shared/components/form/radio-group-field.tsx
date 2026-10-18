import { useId, type ReactNode } from 'react'

import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
  FieldLegend,
  FieldSet,
  FieldTitle,
} from '#/shared/ui/field'
import { RadioGroup, RadioGroupItem } from '#/shared/ui/radio-group'

import { errorText } from './field-errors'
import { useFieldContext } from './form-context'

type RadioOption = { value: string; label: string; description?: string; icon?: ReactNode }
type RadioGroupFieldProps = { label: string; options: readonly RadioOption[] }

/**
 * A choice of a few options, all visible: a stock fieldset whose legend names the radio group. Options with a
 * description become the kit's choice cards (icon, title, one line), two per row when there is room.
 */
export function RadioGroupField({ label, options }: RadioGroupFieldProps) {
  const field = useFieldContext<string>()
  const id = useId()
  const error = errorText(field.state.meta.errors)
  const cards = options.some(option => option.description)
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
        className={cards ? 'grid gap-2 sm:grid-cols-2' : undefined}
      >
        {options.map(option =>
          cards ? (
            <FieldLabel key={option.value} htmlFor={`${id}-${option.value}`}>
              <Field orientation="horizontal">
                {option.icon}
                <FieldContent>
                  <FieldTitle id={`${id}-${option.value}-title`}>{option.label}</FieldTitle>
                  {option.description ? (
                    <FieldDescription id={`${id}-${option.value}-hint`}>{option.description}</FieldDescription>
                  ) : null}
                </FieldContent>
                {/* Named by the title alone; the purpose line is its description. */}
                <RadioGroupItem
                  id={`${id}-${option.value}`}
                  value={option.value}
                  aria-labelledby={`${id}-${option.value}-title`}
                  aria-describedby={option.description ? `${id}-${option.value}-hint` : undefined}
                />
              </Field>
            </FieldLabel>
          ) : (
            <Field key={option.value} orientation="horizontal">
              <RadioGroupItem id={`${id}-${option.value}`} value={option.value} />
              <FieldLabel htmlFor={`${id}-${option.value}`} className="font-normal">
                {option.label}
              </FieldLabel>
            </Field>
          ),
        )}
      </RadioGroup>
      {error ? <FieldError>{error}</FieldError> : null}
    </FieldSet>
  )
}
