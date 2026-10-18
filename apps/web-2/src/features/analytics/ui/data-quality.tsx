import { m } from '#/paraglide/messages'
import type { AnalyticsDataQuality, Confidence, DataMode } from '#/shared/api/gen/types.gen'
import { formatDateTime, formatNumber } from '#/shared/i18n/format'

import { SignalList } from './signal-list'

const modeLabels: Record<DataMode, () => string> = {
  live: m.analytics_mode_live,
  rollup: m.analytics_mode_rollup,
}
const confidenceLabels: Record<Confidence, () => string> = {
  low: m.analytics_confidence_low,
  medium: m.analytics_confidence_medium,
  high: m.analytics_confidence_high,
}

/**
 * How far the numbers can be trusted (B-ANL-32): the data mode and last rollup, freshness, confidence, the attempts
 * left out (previews, teachers'), the courses with too few learners to judge, and the server's data issues.
 */
export function DataQuality({ quality }: { quality: AnalyticsDataQuality }) {
  const tiles = [
    { label: m.analytics_dq_mode(), value: modeLabels[quality.mode]() },
    {
      label: m.analytics_dq_rollup(),
      value: quality.last_rollup_time_unix ? formatDateTime(quality.last_rollup_time_unix) : '—',
    },
    {
      label: m.analytics_dq_freshness(),
      value: m.analytics_dq_minutes({ count: formatNumber(Math.round(quality.freshness_seconds / 60)) }),
    },
    { label: m.analytics_dq_confidence(), value: confidenceLabels[quality.confidence_level]() },
    { label: m.analytics_dq_excluded_preview(), value: formatNumber(quality.excluded_preview_attempts) },
    { label: m.analytics_dq_excluded_teacher(), value: formatNumber(quality.excluded_teacher_attempts) },
  ]
  return (
    <section aria-labelledby="analytics-data-quality" className="flex flex-col gap-4">
      <h2 id="analytics-data-quality" className="text-xl font-semibold">
        {m.analytics_dq_title()}
      </h2>
      {/* Facts, not key numbers: a definition list, so «Живые данные» is not set in a dashboard's display figures. */}
      <dl className="grid grid-cols-1 gap-x-gutter gap-y-3 text-sm @md:grid-cols-2 @3xl:grid-cols-3">
        {tiles.map(tile => (
          <div key={tile.label} className="flex flex-col border-t pt-2">
            <dt className="text-muted-foreground">{tile.label}</dt>
            <dd className="font-medium tabular-nums">{tile.value}</dd>
          </div>
        ))}
      </dl>
      {quality.courses_without_enough_data.length > 0 ? (
        <div className="flex flex-col gap-1">
          <h3 className="text-lg font-semibold">{m.analytics_dq_thin()}</h3>
          <ul className="columns-1 gap-gutter text-sm @3xl:columns-2 [&>li]:break-inside-avoid [&>li]:py-0.5">
            {quality.courses_without_enough_data.map(gap => (
              <li key={gap.course_id} className="wrap-anywhere">
                {m.analytics_dq_thin_course({ course: gap.course_name, count: formatNumber(gap.learner_count) })}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <SignalList title={m.analytics_dq_issues()} items={quality.issues} />
    </section>
  )
}
