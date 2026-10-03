import { Suspense } from 'react'

import { MarkdownEditor } from '#/features/markdown'
import { m } from '#/paraglide/messages'
import { Skeleton } from '#/shared/ui/skeleton'

import type { CodeFormApi } from './use-code-item-form'

/** The statement (B-COD-14): markdown text, input and output formats, constraints one per line. */
export function StatementFields({ form }: { form: CodeFormApi }) {
  return (
    <div className="flex flex-col gap-4">
      <form.AppField name="prompt">
        {field => (
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium">{m.code_field_prompt()}</span>
            <Suspense fallback={<Skeleton className="h-row w-full" />}>
              <MarkdownEditor label={m.code_field_prompt()} value={field.state.value} onChange={field.handleChange} />
            </Suspense>
          </div>
        )}
      </form.AppField>
      <form.AppField name="input_spec">
        {field => <field.TextareaField label={m.code_field_input_spec()} />}
      </form.AppField>
      <form.AppField name="output_spec">
        {field => <field.TextareaField label={m.code_field_output_spec()} />}
      </form.AppField>
      <form.AppField name="constraints">
        {field => (
          <field.TextareaField label={m.code_field_constraints()} description={m.code_field_constraints_hint()} />
        )}
      </form.AppField>
    </div>
  )
}
