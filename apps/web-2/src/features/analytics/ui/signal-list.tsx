import { useNavigate } from '@tanstack/react-router'
import { ChevronRight, CircleAlert, Info, TriangleAlert, type LucideIcon } from 'lucide-react'
import { useId } from 'react'

import type { AnalyticsCode, AssessmentKind, FilterOption, MessageParams, Severity } from '#/shared/api/gen/types.gen'
import { Anchor } from '#/shared/components/anchor'
import { formatNumber } from '#/shared/i18n/format'

import { bySeverity, courseOf, severityBadges, signalTarget, signalText } from '../model/signals'

type Signal = {
  id: string
  code: AnalyticsCode
  params: MessageParams
  severity: Severity
  href?: string | null
  course_id?: string | null
  course_name?: string | null
  assessment_type?: AssessmentKind | null
  assessment_id?: string | null
}

const severityLook = {
  critical: { icon: CircleAlert, ink: 'text-destructive' },
  warning: { icon: TriangleAlert, ink: 'text-warning' },
  info: { icon: Info, ink: 'text-info' },
} satisfies Record<Severity, { icon: LucideIcon; ink: string }>

/**
 * One block of server-composed items (alerts, insights, forecasts, anomalies), grouped by severity: the severity is
 * said once, as a small heading with its icon and count (B-ANL-35), then its sentences, each a link into the tab it is
 * about when the server gives one (B-ANL-25), with the course it is about (from `courses`, the overview's options)
 * when the sentence does not say it. Nothing when empty.
 */
export function SignalList({
  title,
  items,
  courses = [],
}: {
  title: string
  items: readonly Signal[]
  courses?: readonly FilterOption[]
}) {
  const id = useId()
  const navigate = useNavigate()
  if (items.length === 0) return null
  return (
    <section aria-labelledby={id} className="flex min-w-0 flex-col gap-4">
      <h2 id={id} className="text-xl font-semibold">
        {title}
      </h2>
      {bySeverity(items).map(([severity, group]) => {
        const look = severityLook[severity]
        return (
          <div key={severity} className="flex flex-col gap-1">
            <h3 className={`flex items-center gap-2 text-sm font-medium ${look.ink}`}>
              <look.icon aria-hidden className="size-4" />
              {severityBadges[severity].label()}
              <span className="text-muted-foreground tabular-nums">{formatNumber(group.length)}</span>
            </h3>
            <ul className="flex flex-col divide-y border-l pl-4">
              {group.map(item => {
                const text = signalText[item.code](item.params)
                const href = signalTarget(item)
                const course = courseOf(item, courses)
                return (
                  <li key={item.id} className="py-2 wrap-anywhere">
                    {href ? (
                      <Anchor
                        href={href}
                        // A quiet title link with a chevron (B-ANL-40): dozens of fully underlined sentences read as
                        // one block of link text; the chevron tells a row that opens a tab from one that is just text.
                        className="group flex items-start justify-between gap-2 underline-offset-4 hover:underline"
                        onClick={event => {
                          // The server's href is a built URL: a plain click stays in the app, a modified one is the browser's.
                          if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
                            return
                          event.preventDefault()
                          void navigate({ href })
                        }}
                      >
                        <span>{text}</span>
                        <ChevronRight
                          aria-hidden
                          className="mt-0.5 size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground"
                        />
                      </Anchor>
                    ) : (
                      text
                    )}
                    {course ? <span className="block text-sm text-muted-foreground">{course}</span> : null}
                  </li>
                )
              })}
            </ul>
          </div>
        )
      })}
    </section>
  )
}
