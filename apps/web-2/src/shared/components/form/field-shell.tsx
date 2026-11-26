import type { ReactNode } from 'react'

import { Field, FieldContent, FieldDescription, FieldError, FieldLabel } from '#/shared/ui/field'

type FieldShellProps = {
  label: string
  description?: string | undefined
  error?: string | undefined
  /** Checkbox and switch: the control sits before its label on one line. */
  inline?: boolean
  /** A search box: the control shows its purpose (icon, placeholder), the label stays for screen readers. */
  labelHidden?: boolean
  /** One stock control: the field gives it its id, name, label, description, error and `aria-invalid`. */
  children: ReactNode
}

/** Label, control, description and the error under the field on the stock `Field` (DESIGN 3, 8). */
export function FieldShell(props: FieldShellProps) {
  const { label, description, error, inline = false, labelHidden = false, children } = props
  // The form's schema and the server decide validity, not the browser's constraint check.
  const invalid = error !== undefined
  const messages = (
    <>
      {description ? <FieldDescription>{description}</FieldDescription> : null}
      {error ? <FieldError>{error}</FieldError> : null}
    </>
  )
  if (inline)
    return (
      <Field orientation="horizontal" invalid={invalid}>
        {children}
        <FieldContent>
          <FieldLabel>{label}</FieldLabel>
          {messages}
        </FieldContent>
      </Field>
    )
  return (
    <Field invalid={invalid}>
      <FieldLabel className={labelHidden ? 'sr-only' : undefined}>{label}</FieldLabel>
      {children}
      {messages}
    </Field>
  )
}
