import { Field as BaseField } from '@base-ui/react/field'
import type { ReactNode } from 'react'

type FieldProps = {
  label: string
  description?: string | undefined
  error?: string | undefined
  /** Checkbox and switch: the control sits before its label on one line. */
  inline?: boolean
  /** One Base UI control (Field.Control, Checkbox, Switch...): Field wires its id, label and messages. */
  children: ReactNode
}

/** Label, control, one-line description and the error under the field (DESIGN 3, 8). */
export function Field({ label, description, error, inline = false, children }: FieldProps) {
  return (
    <BaseField.Root invalid={error !== undefined} className="flex flex-col gap-1.5">
      {inline ? (
        <BaseField.Label className="flex min-h-6 items-center gap-2 text-sm font-medium">
          {children}
          {label}
        </BaseField.Label>
      ) : (
        <>
          <BaseField.Label className="text-sm font-medium">{label}</BaseField.Label>
          {children}
        </>
      )}
      {description ? (
        <BaseField.Description className="text-sm text-muted-foreground">{description}</BaseField.Description>
      ) : null}
      <BaseField.Error match={error !== undefined} className="text-sm text-destructive">
        {error}
      </BaseField.Error>
    </BaseField.Root>
  )
}
