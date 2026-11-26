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
      <FieldLegend variant="label">{label}</FieldLegend>
      <RadioGroup
        name={field.name}
        value={field.state.value}
        onValueChange={value => field.handleChange(value ?? '')}
        aria-invalid={error !== undefined || undefined}
        className={cards ? 'grid gap-2 sm:grid-cols-2' : undefined}
      >
        {options.map(option =>
          cards ? (
            <FieldLabel key={option.value}>
              <Field orientation="horizontal">
                {option.icon}
                <FieldContent>
                  <FieldTitle id={`${id}-${option.value}-title`}>{option.label}</FieldTitle>
                  {option.description ? <FieldDescription>{option.description}</FieldDescription> : null}
                </FieldContent>
                {/* Named by the title alone; its field makes the purpose line the description. */}
                <RadioGroupItem value={option.value} aria-labelledby={`${id}-${option.value}-title`} />
              </Field>
            </FieldLabel>
          ) : (
            <Field key={option.value} orientation="horizontal">
              <RadioGroupItem value={option.value} />
              <FieldLabel className="font-normal">{option.label}</FieldLabel>
            </Field>
          ),
        )}
      </RadioGroup>
      {error ? <FieldError>{error}</FieldError> : null}
    </FieldSet>
  )
}
