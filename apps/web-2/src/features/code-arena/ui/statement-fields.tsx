import { Suspense } from 'react'

import { MarkdownEditor } from '#/features/markdown'
import { m } from '#/paraglide/messages'
import { Skeleton } from '#/shared/ui/skeleton'

import { StudioSection } from './studio-section'
import type { CodeFormApi } from './use-code-item-form'

/** The statement (B-COD-14): markdown text, input and output formats, constraints one per line. */
export function StatementFields({ form }: { form: CodeFormApi }) {
  return (
    <StudioSection title={m.code_field_prompt()}>
      <form.AppField name="prompt">
        {field => (
          <Suspense fallback={<Skeleton className="h-row w-full" />}>
            <MarkdownEditor label={m.code_field_prompt()} value={field.state.value} onChange={field.handleChange} />
          </Suspense>
        )}
      </form.AppField>
      {/* A pair the learner reads as one: what comes in, what goes out. */}
      <div className="grid gap-4 @xl:grid-cols-2 @xl:items-start">
        <form.AppField name="input_spec">
          {field => <field.TextareaField label={m.code_field_input_spec()} />}
        </form.AppField>
        <form.AppField name="output_spec">
          {field => <field.TextareaField label={m.code_field_output_spec()} />}
        </form.AppField>
      </div>
      <form.AppField name="constraints">
        {field => (
          <field.TextareaField label={m.code_field_constraints()} description={m.code_field_constraints_hint()} />
        )}
      </form.AppField>
    </StudioSection>
  )
}
