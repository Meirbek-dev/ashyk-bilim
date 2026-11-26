import { Switch } from '#/shared/ui/switch'

import { errorText } from './field-errors'
import { FieldShell } from './field-shell'
import { useFieldContext } from './form-context'

export function SwitchField({ label, description }: { label: string; description?: string }) {
  const field = useFieldContext<boolean | null | undefined>()
  return (
    <FieldShell inline label={label} description={description} error={errorText(field.state.meta.errors)}>
      <Switch
        name={field.name}
        checked={field.state.value === true}
        onCheckedChange={checked => field.handleChange(checked)}
        onBlur={field.handleBlur}
      />
    </FieldShell>
  )
}
