import { QueryClient } from '@tanstack/react-query'
import { expect, test, vi } from 'vite-plus/test'

import { learnerRiskOptions, loadLearnerRisk } from './queries'

const filters = {
  window: '28d',
  compare: 'previous_period',
  bucket: 'day',
  course: undefined,
  cohort: undefined,
} as const
const courseId = '0190a5d2-0000-7000-8000-000000000001'
const userId = '0190a5d2-0000-7000-8000-000000000002'
const row = { user_id: userId, course_id: courseId }

test('B-ANL-24 a learner deep link finds the later course page, then stops', async () => {
  const client = new QueryClient()
  const read = vi
    .spyOn(client, 'query')
    .mockResolvedValueOnce({ items: [{ ...row, user_id: courseId }], total: 401, page_size: 200 })
    .mockResolvedValueOnce({ items: [row], total: 401, page_size: 200 })
  expect(await loadLearnerRisk(client, filters, userId, courseId)).toEqual(row)
  expect(read).toHaveBeenCalledTimes(2)
  expect(read.mock.calls.map(([options]) => options.queryKey)).toEqual([
    learnerRiskOptions(filters, courseId, 1).queryKey,
    learnerRiskOptions(filters, courseId, 2).queryKey,
  ])
})

test.each([0, 1])('B-ANL-24 an absent learner stops at the end of the course list (%s rows)', async count => {
  const client = new QueryClient()
  const read = vi.spyOn(client, 'query').mockResolvedValue({
    items: count ? [{ ...row, user_id: courseId }] : [],
    total: count,
    page_size: 200,
  })
  expect(await loadLearnerRisk(client, filters, userId, courseId)).toBeUndefined()
  expect(read).toHaveBeenCalledTimes(1)
})
