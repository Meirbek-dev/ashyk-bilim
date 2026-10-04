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
  /** Extra rule on the trimmed value (every field is required): `false` reads "invalid", a string is the error text. */
  check?: (value: string) => boolean | string
}

type AttrFormProps = {
  fields: readonly AttrField[]
  values: Record<string, string>
  /** A rejected promise with a 422 puts its field errors under the fields of the same name. */
  onApply: (values: Record<string, string>) => unknown
}

const fieldSchema = ({ check }: AttrField) =>
  v.pipe(
    v.string(),
    v.trim(),
    v.nonEmpty(),
    v.rawCheck(({ dataset, addIssue }) => {
      const result = dataset.typed ? (check?.(dataset.value) ?? true) : true
      if (result !== true) addIssue(typeof result === 'string' ? { message: result } : undefined)
    }),
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
