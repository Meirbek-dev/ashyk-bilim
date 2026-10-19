import { m } from '#/paraglide/messages'

import type { CodeFormApi } from './use-code-item-form'

/** The run limits of the challenge: time and memory (empty = the sandbox's defaults). */
export function LimitFields({ form }: { form: CodeFormApi }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h3 className="text-lg font-semibold">{m.code_limits()}</h3>
        {/* Under the heading, not under the time field: it holds for both, and the 10 rem column broke it in four. */}
        <p className="text-sm text-muted-foreground">{m.code_limits_hint()}</p>
      </div>
      <div className="flex flex-wrap gap-4">
        <div className="w-40">
          <form.AppField name="time">
            {field => <field.TextField label={m.code_field_time()} inputMode="numeric" />}
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
