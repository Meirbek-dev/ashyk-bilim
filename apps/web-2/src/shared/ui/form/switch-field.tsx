import { Switch } from '@base-ui/react/switch'

import { Field } from '../field'
import { errorText } from './field-errors'
import { useFieldContext } from './form-context'

export function SwitchField({ label, description }: { label: string; description?: string }) {
  const field = useFieldContext<boolean | null | undefined>()
  return (
    <Field inline label={label} description={description} error={errorText(field.state.meta.errors)}>
      <Switch.Root
        name={field.name}
        checked={field.state.value === true}
        onCheckedChange={checked => field.handleChange(checked)}
        onBlur={field.handleBlur}
        className="inline-flex h-5 w-9 shrink-0 items-center rounded-full border border-input bg-background transition-colors duration-150 data-checked:border-primary data-checked:bg-primary"
      >
        <Switch.Thumb className="size-3.5 translate-x-0.5 rounded-full bg-input transition-transform duration-150 data-checked:translate-x-4.5 data-checked:bg-primary-foreground" />
      </Switch.Root>
    </Field>
  )
}
