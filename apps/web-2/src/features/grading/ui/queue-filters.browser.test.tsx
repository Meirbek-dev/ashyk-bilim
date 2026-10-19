import { expect, test } from 'vite-plus/test'

import { m } from '#/paraglide/messages'
import { renderInRouter } from '#/shared/components/testing'

import { QueueFilters } from './queue-filters'

const ids = { courseId: '0190a5d2-0000-7000-8000-000000000001', activityId: '0190a5d2-0000-7000-8000-000000000002' }
const counts = { needs_grading: 1, graded: 0, published: 2, returned: 0 }

test('B-GRD-02 «late only» shows that it is on, apart from the status tabs', async () => {
  const on = await renderInRouter(<QueueFilters ids={ids} search={{ late: true }} counts={counts} />)
  const toggle = on.getByRole('link', { name: m.grading_late_only() })
  await expect.element(toggle).toHaveAttribute('aria-current', 'true')
  expect(on.getByRole('navigation').getByRole('link', { name: m.grading_late_only() }).elements()).toHaveLength(0)
})

test('B-GRD-02 «late only» off is not marked current', async () => {
  const off = await renderInRouter(<QueueFilters ids={ids} search={{}} counts={counts} />)
  await expect.element(off.getByRole('link', { name: m.grading_late_only() })).not.toHaveAttribute('aria-current')
})
