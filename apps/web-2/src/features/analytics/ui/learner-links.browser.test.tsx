import { describe, expect, test } from 'vite-plus/test'

import { m } from '#/paraglide/messages'
import { renderInRouter } from '#/shared/components/testing'

import { LearnerLinks } from './learner-links'

const row = {
  course_id: '0190a5d2-0000-7000-8000-0000000000c1',
  user_display_name: 'Айжан Б',
  user_username: 'aizhan.b',
  user_email: 'aizhan@example.com',
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

  test('B-ANL-42 «Связаться» has a way: an email to the learner, and the roster found by username', async () => {
    const screen = await renderInRouter(<LearnerLinks row={row} />)
    await expect
      .element(screen.getByRole('link', { name: m.analytics_write_email() }))
      .toHaveAttribute('href', 'mailto:aizhan@example.com')
    await expect
      .element(screen.getByRole('link', { name: m.analytics_learner_in_course() }))
      .toHaveAttribute('href', expect.stringContaining('q=aizhan.b'))
  })
})
