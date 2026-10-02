import { Field as BaseField } from '@base-ui/react/field'
import { Fieldset } from '@base-ui/react/fieldset'
import { Radio } from '@base-ui/react/radio'
import { RadioGroup } from '@base-ui/react/radio-group'

import { errorText } from './field-errors'
import { useFieldContext } from './form-context'

type RadioGroupFieldProps = { label: string; options: readonly { value: string; label: string }[] }

/** A choice of a few options, all visible: a fieldset whose legend is the label. */
export function RadioGroupField({ label, options }: RadioGroupFieldProps) {
  const field = useFieldContext<string>()
  const error = errorText(field.state.meta.errors)
  return (
    <BaseField.Root name={field.name} invalid={error !== undefined}>
      <Fieldset.Root
        render={
          <RadioGroup
            value={field.state.value}
            onValueChange={value => field.handleChange(value)}
            className="flex flex-col gap-2"
          />
        }
      >
        <Fieldset.Legend className="text-sm font-medium">{label}</Fieldset.Legend>
        {options.map(option => (
          <BaseField.Item key={option.value}>
            <BaseField.Label className="flex min-h-6 items-center gap-2 text-sm">
              <Radio.Root
                value={option.value}
                className="flex size-4 shrink-0 items-center justify-center rounded-full border border-input bg-background shadow-xs data-checked:border-primary"
              >
                <Radio.Indicator className="size-2 rounded-full bg-primary" />
              </Radio.Root>
              {option.label}
            </BaseField.Label>
          </BaseField.Item>
        ))}
      </Fieldset.Root>
      <BaseField.Error match={error !== undefined} className="text-sm text-destructive">
        {error}
      </BaseField.Error>
    </BaseField.Root>
  )
}
