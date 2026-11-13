import { X } from 'lucide-react'

import { m } from '#/paraglide/messages'
import { IconButton } from '#/shared/components/icon-button'
import { formatNumber } from '#/shared/i18n/format'

import type { PolicyFormApi } from './use-policy-form'

type StratumRowProps = {
  form: PolicyFormApi
  /** The quota's index in `draw_strata`. */
  at: number
  /** How many questions its group has; null before a group is typed. */
  have: number | null
  onRemove: () => void
}

/** One quota of the draw: the group, how many of its questions an attempt takes, remove. */
export function StratumRow({ form, at, have, onRemove }: StratumRowProps) {
  return (
    <li className="flex flex-wrap items-start gap-2">
      <div className="min-w-40 flex-1">
        <form.AppField name={`draw_strata[${at}].group`}>
          {field => (
            <field.TextField
              label={m.assessments_stratum_group({ number: at + 1 })}
              description={have === null ? undefined : m.assessments_stratum_have({ count: formatNumber(have) })}
            />
          )}
        </form.AppField>
      </div>
      <div className="w-40">
        <form.AppField name={`draw_strata[${at}].count`}>
          {field => <field.TextField label={m.assessments_stratum_count({ number: at + 1 })} inputMode="numeric" />}
        </form.AppField>
      </div>
      <div className="pt-6">
        <IconButton
          label={m.assessments_stratum_remove({ number: at + 1 })}
          icon={<X aria-hidden />}
          onClick={onRemove}
        />
      </div>
    </li>
  )
}
