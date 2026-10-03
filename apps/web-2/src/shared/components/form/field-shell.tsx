import type { ReactNode } from 'react'

import { Field, FieldContent, FieldDescription, FieldError, FieldLabel } from '#/shared/ui/field'

type FieldShellProps = {
  /** The control id: the label points at it, the messages are named after it. */
  id: string
  label: string
  description?: string | undefined
  error?: string | undefined
  /** Checkbox and switch: the control sits before its label on one line. */
  inline?: boolean
  /** One stock control with `id`, `aria-invalid` and `aria-describedby={describedBy(...)}`. */
  children: ReactNode
}

/** Where the control points `aria-describedby`: the one-line description and the error under it. */
export const describedBy = (id: string, description: string | undefined, error: string | undefined) =>
  [description ? `${id}-description` : '', error ? `${id}-error` : ''].filter(Boolean).join(' ') || undefined

/** Label, control, description and the error under the field on the stock `Field` (DESIGN 3, 8). */
export function FieldShell({ id, label, description, error, inline = false, children }: FieldShellProps) {
  const messages = (
    <>
      {description ? <FieldDescription id={`${id}-description`}>{description}</FieldDescription> : null}
      {error ? <FieldError id={`${id}-error`}>{error}</FieldError> : null}
    </>
  )
  if (inline)
    return (
      <Field orientation="horizontal" data-invalid={error !== undefined || undefined}>
        {children}
        <FieldContent>
          <FieldLabel htmlFor={id}>{label}</FieldLabel>
          {messages}
        </FieldContent>
      </Field>
    )
  return (
    <Field data-invalid={error !== undefined || undefined}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      {children}
      {messages}
    </Field>
  )
}
