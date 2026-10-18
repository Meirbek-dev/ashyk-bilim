import { describe, expect, test } from 'vite-plus/test'

import { m } from '#/paraglide/messages'
import { renderInRouter } from '#/shared/components/testing'

import { LearnerLinks } from './learner-links'

const row = {
  course_id: '0190a5d2-0000-7000-8000-0000000000c1',
  user_display_name: 'Айжан Б',
  open_grading_blocks: 2,
}

describe('LearnerLinks', () => {
  test('B-ANL-38 B-ANL-29 the panel leads to the course learners found by name and to the works waiting', async () => {
    const screen = await renderInRouter(<LearnerLinks row={row} />)
    const learners = screen.getByRole('link', { name: m.analytics_learner_in_course() })
    await expect
      .element(learners)
      .toHaveAttribute('href', expect.stringContaining(`/teach/courses/${row.course_id}/learners?q=`))
    await expect
      .element(screen.getByRole('link', { name: m.analytics_grade_blocks({ count: '2' }) }))
      .toHaveAttribute('href', expect.stringContaining('/teach?course='))
  })
})
