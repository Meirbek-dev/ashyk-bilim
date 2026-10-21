import { describe, expect, test } from 'vite-plus/test'

import type { Enrollment } from '#/shared/api/gen/types.gen'
import { renderInRouter } from '#/shared/components/testing'

import { RunItem } from './run-item'

const run: Enrollment = {
  id: 'r1',
  course_id: 'c1',
  course_total_steps: 2,
  created_at_unix: 0,
  updated_at_unix: 0,
  progress_pct: 40,
  learning_status: 'in_progress',
  next_activity_id: 'a1',
  course: {
    id: 'c1',
    name: 'Курс',
    archived_at_unix: null,
    thumbnail_key: null,
  },
}

const direction = async (width: 'w-sm' | 'w-4xl') => {
  const screen = await renderInRouter(
    <div className={`@container ${width}`}>
      <RunItem run={run} />
    </div>,
  )
  await expect.element(screen.getByRole('article')).toBeVisible()
  return getComputedStyle(screen.getByRole('article').element()).flexDirection
}

describe('run item', () => {
  test('B-LRN-10 a thumbnail row in one phone column, a cover card in a wide grid cell', async () => {
    expect(await direction('w-sm')).toBe('row')
    expect(await direction('w-4xl')).toBe('column')
  })
})
