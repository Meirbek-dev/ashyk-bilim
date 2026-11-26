import { Checkbox } from '#/shared/ui/checkbox'

import { errorText } from './field-errors'
import { FieldShell } from './field-shell'
import { useFieldContext } from './form-context'

export function CheckboxField({ label, description }: { label: string; description?: string }) {
  const field = useFieldContext<boolean | null | undefined>()
  return (
    <FieldShell inline label={label} description={description} error={errorText(field.state.meta.errors)}>
      <Checkbox
        name={field.name}
        checked={field.state.value === true}
        onCheckedChange={checked => field.handleChange(checked === true)}
        onBlur={field.handleBlur}
      />
    </FieldShell>
  )
}
