import { useId } from 'react'

import type { FormBody, FormFieldType, ItemAnswer } from '#/shared/api/gen/types.gen'
import { Field, FieldGroup, FieldLabel } from '#/shared/ui/field'
import { Input } from '#/shared/ui/input'
import { Textarea } from '#/shared/ui/textarea'

type FormProps = {
  body: FormBody
  answer: ItemAnswer | undefined
  onChange: (answer: ItemAnswer) => void
  disabled: boolean
}

const inputTypes = {
  text: 'text',
  textarea: 'text',
  number: 'number',
  date: 'date',
} satisfies Record<FormFieldType, string>

/** A form item: one labelled field per author field, of its type; required ones say so to the browser. */
export function FormItem({ body, answer, onChange, disabled }: FormProps) {
  const id = useId()
  const values = answer?.kind === 'form' ? (answer.values ?? {}) : {}
  const set = (field: string, value: string) => onChange({ kind: 'form', values: { ...values, [field]: value } })
  return (
    <FieldGroup>
      {(body.fields ?? []).map(field => {
        const fieldId = `${id}-${field.id}`
        const common = {
          id: fieldId,
          value: values[field.id] ?? '',
          required: field.required,
          disabled,
          onChange: (event: { target: { value: string } }) => set(field.id, event.target.value),
        }
        return (
          <Field key={field.id}>
            <FieldLabel htmlFor={fieldId}>{field.label}</FieldLabel>
            {field.field_type === 'textarea' ? (
              <Textarea rows={4} {...common} />
            ) : (
              <Input type={inputTypes[field.field_type ?? 'text']} {...common} />
            )}
          </Field>
        )
      })}
    </FieldGroup>
  )
}
