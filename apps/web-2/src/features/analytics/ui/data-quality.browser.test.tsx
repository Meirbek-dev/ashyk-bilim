import { describe, expect, test } from 'vite-plus/test'

import { m } from '#/paraglide/messages'
import { renderInRouter } from '#/shared/components/testing'

import { DataQuality } from './data-quality'

describe('DataQuality', () => {
  test('B-ANL-32 the panel says how far the numbers can be trusted and which courses have too little data', async () => {
    const screen = await renderInRouter(
      <DataQuality
        quality={{
          mode: 'rollup',
          confidence_level: 'medium',
          freshness_seconds: 600,
          last_rollup_time_unix: 1_760_000_000,
          excluded_preview_attempts: 3,
          excluded_teacher_attempts: 1,
          missing_event_sources: [],
          issues: [],
          courses_without_enough_data: [
            {
              course_id: '0190a5d2-0000-7000-8000-000000000051',
              course_name: 'Алгебра',
              learner_count: 2,
              reason: 'fewer_than_5_learners',
            },
          ],
        }}
      />,
    )
    await expect.element(screen.getByText(m.analytics_mode_rollup())).toBeVisible()
    await expect.element(screen.getByText(m.analytics_confidence_medium())).toBeVisible()
    await expect.element(screen.getByText(m.analytics_dq_minutes({ count: '10' }))).toBeVisible()
    await expect.element(screen.getByText(m.analytics_dq_thin_course({ course: 'Алгебра', count: '2' }))).toBeVisible()
  })

  test('B-ANL-32 the age of the numbers is in hours past an hour and in days past two', async () => {
    const quality = {
      mode: 'rollup' as const,
      confidence_level: 'medium' as const,
      last_rollup_time_unix: null,
      excluded_preview_attempts: 0,
      excluded_teacher_attempts: 0,
      missing_event_sources: [],
      issues: [],
      courses_without_enough_data: [],
    }
    const hours = await renderInRouter(<DataQuality quality={{ ...quality, freshness_seconds: 19_920 }} />)
    await expect.element(hours.getByText(m.analytics_dq_hours({ count: '6' }))).toBeVisible()
    const days = await renderInRouter(<DataQuality quality={{ ...quality, freshness_seconds: 3 * 86_400 }} />)
    await expect.element(days.getByText(m.analytics_dq_days({ count: '3' }))).toBeVisible()
  })
})
