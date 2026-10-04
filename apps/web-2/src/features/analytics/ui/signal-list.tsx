import { useNavigate } from '@tanstack/react-router'
import { useId } from 'react'

import type { AnalyticsCode, MessageParams, Severity } from '#/shared/api/gen/types.gen'
import { Anchor } from '#/shared/components/anchor'
import { StatusBadge } from '#/shared/components/status-badge'

import { severityBadges, signalHref, signalText } from '../model/signals'

type Signal = { id: string; code: AnalyticsCode; params: MessageParams; severity: Severity; href?: string | null }

/**
 * One block of server-composed items (alerts, insights, forecasts, anomalies): severity in words, then the sentence,
 * a link into the tab it is about when the server gives one (B-ANL-25). Nothing when empty.
 */
export function SignalList({ title, items }: { title: string; items: readonly Signal[] }) {
  const id = useId()
  const navigate = useNavigate()
  if (items.length === 0) return null
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <h2 id={id} className="text-xl font-semibold">
        {title}
      </h2>
      <ul className="flex flex-col gap-2">
        {items.map(item => {
          const badge = severityBadges[item.severity]
          const text = signalText[item.code](item.params)
          const href = signalHref(item.href)
          return (
            <li key={item.id} className="flex flex-wrap items-baseline gap-2">
              <StatusBadge tone={badge.tone}>{badge.label()}</StatusBadge>
              <span className="min-w-0 wrap-anywhere">
                {href ? (
                  <Anchor
                    href={href}
                    onClick={event => {
                      // The server's href is a built URL: a plain click stays in the app, a modified one is the browser's.
                      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
                      event.preventDefault()
                      void navigate({ href })
                    }}
                  >
                    {text}
                  </Anchor>
                ) : (
                  text
                )}
              </span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
