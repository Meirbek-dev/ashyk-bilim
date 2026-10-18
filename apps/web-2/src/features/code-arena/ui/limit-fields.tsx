import { m } from '#/paraglide/messages'

import type { CodeFormApi } from './use-code-item-form'

/** The run limits of the challenge: time and memory (empty = the sandbox's defaults). */
export function LimitFields({ form }: { form: CodeFormApi }) {
  return (
    <div className="flex flex-col gap-4">
      <h3 className="text-lg font-semibold">{m.code_limits()}</h3>
      <div className="flex flex-wrap gap-4">
        <div className="w-40">
          <form.AppField name="time">
            {field => (
              <field.TextField label={m.code_field_time()} description={m.code_limits_hint()} inputMode="numeric" />
            )}
          </form.AppField>
        </div>
        <div className="w-40">
          <form.AppField name="memory">
            {field => <field.TextField label={m.code_field_memory()} inputMode="numeric" />}
          </form.AppField>
        </div>
      </div>
    </div>
  )
}
