import { m } from '#/paraglide/messages'

import { StudioSection } from './studio-section'
import type { CodeFormApi } from './use-code-item-form'

/** The run limits of the challenge: time and memory (empty = the sandbox's defaults). */
export function LimitFields({ form }: { form: CodeFormApi }) {
  return (
    // The hint under the name, not under the time field: it holds for both, and the 10 rem column broke it in four.
    <StudioSection title={m.code_limits()} hint={m.code_limits_hint()}>
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
    </StudioSection>
  )
}
