import { describe, expect, test } from 'vite-plus/test'

import type { TrailRun } from '#/shared/api/gen/types.gen'
import { renderInRouter } from '#/shared/components/testing'

import { RunItem } from './run-item'

const run: TrailRun = {
  id: 'r1',
  course_id: 'c1',
  course_total_steps: 2,
  created_at_unix: 0,
  updated_at_unix: 0,
  progress_pct: 40,
  learning_status: 'in_progress',
  next_activity_id: 'a1',
  status: 'in_progress',
  steps: [],
  course: {
    id: 'c1',
    version: 1,
    name: 'Курс',
    about: '',
    description: '',
    allowed_actions: [],
    archived_at_unix: null,
    archived_by: null,
    contributor_ids: [],
    creator_id: null,
    created_at_unix: 0,
    updated_at_unix: 0,
    learnings: [],
    open_to_contributors: false,
    assessments_require_enrollment: true,
    public: true,
    tags: [],
    thumbnail_key: null,
    thumbnail_video_key: null,
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
