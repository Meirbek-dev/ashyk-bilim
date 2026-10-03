import type { FormEvent } from 'react'
import * as v from 'valibot'

import { m } from '#/paraglide/messages'
import { useAppForm } from '#/shared/components/form/use-app-form'
import { Button } from '#/shared/ui/button'

export type AttrField = {
  name: string
  label: string
  /** A textarea instead of a one-line field. */
  multiline?: boolean
  /** Extra rule on the trimmed value (every field is required); a failure reads "invalid format". */
  check?: (value: string) => boolean
}

type AttrFormProps = {
  fields: readonly AttrField[]
  values: Record<string, string>
  onApply: (values: Record<string, string>) => void
}

const fieldSchema = ({ check }: AttrField) =>
  v.pipe(
    v.string(),
    v.trim(),
    v.nonEmpty(),
    v.check(value => check?.(value) ?? true),
  )

/** The authoring form of a block's attributes (URL, formula, question...): validated, applied to the node. */
export function AttrForm({ fields, values, onApply }: AttrFormProps) {
  const schema = v.object(Object.fromEntries(fields.map(field => [field.name, fieldSchema(field)])))
  const form = useAppForm(schema, {
    defaultValues: Object.fromEntries(fields.map(field => [field.name, values[field.name] ?? ''])),
    onSubmit: next => onApply(v.parse(schema, next)),
  })
  const submit = (event: FormEvent) => {
    event.preventDefault()
    void form.handleSubmit()
  }
  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4">
      {fields.map(field => (
        <form.AppField key={field.name} name={field.name}>
          {control =>
            field.multiline ? <control.TextareaField label={field.label} /> : <control.TextField label={field.label} />
          }
        </form.AppField>
      ))}
      <div>
        <Button type="submit" variant="secondary">
          {m.editor_apply()}
        </Button>
      </div>
    </form>
  )
}
