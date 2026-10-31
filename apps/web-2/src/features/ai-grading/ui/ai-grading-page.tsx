import { useSuspenseQuery } from '@tanstack/react-query'
import { useParams, useSearch } from '@tanstack/react-router'
import type { ReactElement } from 'react'

import { metricsOptions, settingsOptions } from '../queries'
import { ActivitiesSection } from './activities-section'
import { AutoDrafts } from './auto-drafts'
import { IndexCard } from './index-card'
import { MetricsSection } from './metrics-section'

const ROUTE = '/_authed/teach/courses/$courseId/ai-grading'

/**
 * The course's «ИИ-проверка» tab (docs/AI-FIRST.md 5): the auto-drafts switch, what the drafts changed over a period,
 * the activities with drafts, the course's material index.
 */
// The return type is spelled out: the route's own types refer back to this component (TS7023).
export function AiGradingPage(): ReactElement {
  const { courseId } = useParams({ from: ROUTE })
  const search = useSearch({ from: ROUTE })
  const { data: settings } = useSuspenseQuery(settingsOptions(courseId))
  const { data: metrics } = useSuspenseQuery(metricsOptions(courseId, search))
  return (
    <div className="@container flex flex-col gap-8">
      <AutoDrafts courseId={courseId} settings={settings} />
      <MetricsSection courseId={courseId} search={search} metrics={metrics} />
      <ActivitiesSection courseId={courseId} rows={metrics.activities} />
      <IndexCard courseId={courseId} />
    </div>
  )
}
