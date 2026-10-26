import { describe, expect, test } from 'vite-plus/test'

import type { CourseListItem } from '#/shared/api/gen/types.gen'

import { suggestedCourses } from './suggestions'

type Item = Pick<CourseListItem, 'id' | 'progress' | 'allowed_actions'>
const course = (id: string, extra: Partial<Item> = {}): Item => ({ id, allowed_actions: [], progress: null, ...extra })

describe('suggestedCourses', () => {
  test('B-HOME-13 leaves out courses the caller took or teaches, keeps order, caps at three', () => {
    const list = [
      course('own', { allowed_actions: ['update', 'publish'] }),
      course('a'),
      course('done', { progress: { progress_pct: 100, completed_at_unix: 1 } }),
      course('b'),
      course('c'),
      course('d'),
    ]
    expect(suggestedCourses(list).map(c => c.id)).toEqual(['a', 'b', 'c'])
  })
})
