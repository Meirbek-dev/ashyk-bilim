import { X } from 'lucide-react'
import type { Ref } from 'react'

import { m } from '#/paraglide/messages'
import { IconButton } from '#/shared/components/icon-button'

import type { CodeFormApi } from './use-code-item-form'

type CaseRowProps = {
  form: CodeFormApi
  index: number
  editable: boolean
  onRemove: () => void
  ref?: Ref<HTMLLIElement>
}

/** One test case: its number, visibility and removal above its description, weight, input and expected output. */
export function CaseRow({ form, index, editable, onRemove, ref }: CaseRowProps) {
  return (
    <li ref={ref} className="flex min-w-0 flex-col gap-4 py-6 first:pt-0 last:pb-0">
      {/* The case's number, whether the learner sees it and its removal: one line above its fields. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <span className="flex-1 font-medium">{m.code_case({ number: index + 1 })}</span>
        <div className="order-last w-full @xl:order-none @xl:w-auto">
          <form.AppField name={`tests[${index}].visible`}>
            {field => <field.CheckboxField label={m.code_field_visible()} />}
          </form.AppField>
        </div>
        {editable ? (
          <IconButton label={m.code_case_remove({ number: index + 1 })} icon={<X aria-hidden />} onClick={onRemove} />
        ) : null}
      </div>
      <div className="grid gap-4 @xl:grid-cols-[minmax(0,1fr)_6rem] @xl:items-start">
        <form.AppField name={`tests[${index}].description`}>
          {field => <field.TextField label={m.code_field_description()} />}
        </form.AppField>
        <form.AppField name={`tests[${index}].weight`}>
          {field => <field.TextField label={m.code_field_weight()} inputMode="numeric" />}
        </form.AppField>
      </div>
      {/* What the program reads and prints: set as code, its spaces and line breaks are the point. */}
      <div className="grid gap-4 @xl:grid-cols-2 @xl:items-start [&_textarea]:font-mono [&_textarea]:text-sm">
        <form.AppField name={`tests[${index}].input`}>
          {field => <field.TextareaField label={m.code_field_input()} />}
        </form.AppField>
        <form.AppField name={`tests[${index}].expected`}>
          {field => <field.TextareaField label={m.code_field_expected()} />}
        </form.AppField>
      </div>
    </li>
  )
}
