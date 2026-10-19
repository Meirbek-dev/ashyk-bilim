import { Plus, X } from 'lucide-react'

import { m } from '#/paraglide/messages'
import type { FormBody, FormField, FormFieldType } from '#/shared/api/gen/types.gen'
import { IconButton } from '#/shared/components/icon-button'
import { Button } from '#/shared/ui/button'
import { Checkbox } from '#/shared/ui/checkbox'
import { Input } from '#/shared/ui/input'
import { Label } from '#/shared/ui/label'
import { NativeSelect, NativeSelectOption } from '#/shared/ui/native-select'

import { newFormField } from '../model/items'
import type { EditMode } from '../model/route'
import { formTypeLabels } from './labels'

type Form = FormBody & { kind: 'form' }
type FormFieldsProps = { body: Form; onChange: (body: Form) => void; mode: EditMode }

const FORM_TYPES = ['text', 'textarea', 'number', 'date'] as const satisfies FormFieldType[]
const formType = (value: string) => FORM_TYPES.find(type => type === value) ?? 'text'

/** A form question: the fields the learner fills in, each with a label, a type and "required"; `wording`: labels only. */
export function FormFields({ body, onChange, mode }: FormFieldsProps) {
  const editable = mode === 'all'
  const fields = body.fields ?? []
  const setFields = (next: FormField[]) => onChange({ ...body, fields: next })
  const patch = (at: number, change: Partial<FormField>) =>
    setFields(fields.map((field, index) => (index === at ? { ...field, ...change } : field)))
  return (
    <div className="flex flex-col gap-4">
      <ol className="flex flex-col gap-3">
        {fields.map((field, at) => (
          <li key={field.id} className="flex flex-wrap items-center gap-2">
            <Input
              aria-label={m.assessments_form_field_label({ number: at + 1 })}
              placeholder={m.assessments_form_field_label({ number: at + 1 })}
              className="min-w-48 flex-1"
              value={field.label ?? ''}
              disabled={mode === 'none'}
              onChange={event => patch(at, { label: event.target.value })}
            />
            <NativeSelect
              aria-label={m.assessments_form_field_type({ number: at + 1 })}
              value={field.field_type ?? 'text'}
              disabled={!editable}
              onChange={event => patch(at, { field_type: formType(event.target.value) })}
            >
              {FORM_TYPES.map(type => (
                <NativeSelectOption key={type} value={type}>
                  {formTypeLabels[type]()}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            <Label className="font-normal">
              <Checkbox
                aria-label={m.assessments_form_field_required({ number: at + 1 })}
                checked={field.required === true}
                disabled={!editable}
                onCheckedChange={checked => patch(at, { required: checked })}
              />
              {m.assessments_form_required()}
            </Label>
            <IconButton
              label={m.assessments_form_field_remove({ number: at + 1 })}
              icon={<X aria-hidden />}
              disabled={!editable || fields.length <= 1}
              onClick={() => setFields(fields.filter((_, index) => index !== at))}
            />
          </li>
        ))}
      </ol>
      {editable ? (
        <div>
          <Button type="button" variant="outline" size="sm" onClick={() => setFields([...fields, newFormField()])}>
            <Plus data-icon="inline-start" aria-hidden />
            {m.assessments_form_field_add()}
          </Button>
        </div>
      ) : null}
    </div>
  )
}
