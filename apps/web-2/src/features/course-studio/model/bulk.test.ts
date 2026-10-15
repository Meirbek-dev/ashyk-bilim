import { describe, expect, test } from 'vite-plus/test'

import { bulkTargets } from './bulk'

describe('bulk', () => {
  test('B-CST-45 a bulk action reaches only the selected courses that allow it', () => {
    const courses = [
      { id: 'a', allowed_actions: ['publish', 'archive'] as const },
      { id: 'b', allowed_actions: ['restore'] as const },
      { id: 'c', allowed_actions: ['publish', 'delete'] as const },
    ].map(course => ({ ...course, allowed_actions: [...course.allowed_actions] }))
    expect(bulkTargets(courses, 'publish').map(course => course.id)).toEqual(['a', 'c'])
    expect(bulkTargets(courses, 'restore').map(course => course.id)).toEqual(['b'])
    expect(bulkTargets(courses, 'unpublish')).toEqual([])
  })
})
