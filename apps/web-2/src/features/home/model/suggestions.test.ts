import { describe, expect, test } from 'vite-plus/test'

import type { CourseAuthor, CourseListItem } from '#/shared/api/gen/types.gen'

import { suggestedCourses } from './suggestions'

type Item = Pick<CourseListItem, 'id' | 'progress' | 'authors'>
const author = (user_id: string): CourseAuthor => ({ user_id, username: user_id, display_name: user_id })
const course = (id: string, extra: Partial<Item> = {}): Item => ({
  id,
  authors: [author('t')],
  progress: null,
  ...extra,
})

describe('suggestedCourses', () => {
  test('B-HOME-13 leaves out courses the caller took or makes, keeps order, caps at three', () => {
    const list = [
      course('own', { authors: [author('t'), author('me')] }),
      course('a'),
      course('done', { progress: { progress_pct: 100, completed_at_unix: 1 } }),
      course('b'),
      course('c'),
      course('d'),
    ]
    expect(suggestedCourses(list, 'me').map(c => c.id)).toEqual(['a', 'b', 'c'])
  })

  test('B-HOME-13 an administrator who may edit every course but makes none still gets suggestions', () => {
    expect(suggestedCourses([course('a'), course('b')], 'admin').map(c => c.id)).toEqual(['a', 'b'])
  })
})
