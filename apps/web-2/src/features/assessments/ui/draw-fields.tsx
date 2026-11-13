import { Plus } from 'lucide-react'

import { m } from '#/paraglide/messages'
import type { AssessmentItem } from '#/shared/api/gen/types.gen'
import { errorText } from '#/shared/components/form/field-errors'
import { formatNumber } from '#/shared/i18n/format'
import { Button } from '#/shared/ui/button'
import { FieldDescription, FieldError, FieldLegend, FieldSet } from '#/shared/ui/field'

import { MAX_STRATA } from '../model/policy'
import { StratumRow } from './stratum-row'
import type { PolicyFormApi } from './use-policy-form'

type DrawFieldsProps = { form: PolicyFormApi; items: readonly Pick<AssessmentItem, 'metadata'>[] }

/** How many questions of a group the test has (`metadata.draw_group`, compared trimmed like the server). */
const groupSize = (items: DrawFieldsProps['items'], group: string): number =>
  items.filter(item => item.metadata.draw_group === group.trim()).length

/**
 * The question bank: how many questions each attempt draws (blank: all of them), and quotas of that draw by the
 * questions' group (a level of a spreadsheet import). Readiness says when the test or a group has too few.
 */
export function DrawFields({ form, items }: DrawFieldsProps) {
  const total = formatNumber(items.length)
  return (
    <FieldSet>
      <FieldLegend>{m.assessments_draw_title()}</FieldLegend>
      <form.AppField name="draw_count">
        {field => (
          <field.TextField
            label={m.assessments_field_draw_count()}
            description={m.assessments_field_draw_count_hint()}
            suffix={m.assessments_draw_of({ total })}
            inputMode="numeric"
          />
        )}
      </form.AppField>
      <form.Field name="draw_strata" mode="array">
        {strata => {
          const error = errorText(strata.state.meta.errors)
          const rows = strata.state.value
          return (
            <FieldSet>
              <FieldLegend variant="label">{m.assessments_draw_strata()}</FieldLegend>
              <FieldDescription>{m.assessments_draw_strata_hint()}</FieldDescription>
              <ol className="flex flex-col gap-3">
                {rows.map((row, at) => (
                  // The quotas carry no ids: the position is their identity while editing.
                  <StratumRow
                    key={at}
                    form={form}
                    at={at}
                    have={row.group.trim() ? groupSize(items, row.group) : null}
                    onRemove={() => strata.removeValue(at)}
                  />
                ))}
              </ol>
              {error ? <FieldError>{error}</FieldError> : null}
              {rows.length < MAX_STRATA ? (
                <div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => strata.pushValue({ group: '', count: '' })}
                  >
                    <Plus data-icon="inline-start" aria-hidden />
                    {m.assessments_stratum_add()}
                  </Button>
                </div>
              ) : null}
            </FieldSet>
          )
        }}
      </form.Field>
    </FieldSet>
  )
}
