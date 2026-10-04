import { useId } from 'react'

import type { AnalyticsCode, MessageParams, Severity } from '#/shared/api/gen/types.gen'
import { StatusBadge } from '#/shared/components/status-badge'

import { severityBadges, signalText } from '../model/signals'

type Signal = { id: string; code: AnalyticsCode; params: MessageParams; severity: Severity }

/** One block of server-composed items (alerts, insights, forecasts, anomalies): severity in words, then the sentence. Nothing when empty. */
export function SignalList({ title, items }: { title: string; items: readonly Signal[] }) {
  const id = useId()
  if (items.length === 0) return null
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <h2 id={id} className="text-xl font-semibold">
        {title}
      </h2>
      <ul className="flex flex-col gap-2">
        {items.map(item => {
          const badge = severityBadges[item.severity]
          return (
            <li key={item.id} className="flex flex-wrap items-baseline gap-2">
              <StatusBadge tone={badge.tone}>{badge.label()}</StatusBadge>
              <span className="min-w-0 wrap-anywhere">{signalText[item.code](item.params)}</span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
