import { Checkbox } from '@base-ui/react/checkbox'
import { Check } from 'lucide-react'

import { Field } from '../field'
import { errorText } from './field-errors'
import { useFieldContext } from './form-context'

export function CheckboxField({ label, description }: { label: string; description?: string }) {
  const field = useFieldContext<boolean | null | undefined>()
  return (
    <Field inline label={label} description={description} error={errorText(field.state.meta.errors)}>
      <Checkbox.Root
        name={field.name}
        checked={field.state.value === true}
        onCheckedChange={checked => field.handleChange(checked)}
        onBlur={field.handleBlur}
        className="flex size-4 shrink-0 items-center justify-center rounded-sm border border-input bg-background shadow-xs transition-colors duration-150 data-checked:border-primary data-checked:bg-primary data-checked:text-primary-foreground data-invalid:border-destructive"
      >
        <Checkbox.Indicator>
          <Check aria-hidden className="size-3.5" />
        </Checkbox.Indicator>
      </Checkbox.Root>
    </Field>
  )
}
