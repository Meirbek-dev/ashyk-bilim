import { describe, expect, test } from 'vite-plus/test'

import type { CourseAuthor, CourseListItem, LearningStatus } from '#/shared/api/gen/types.gen'

import { suggestedCourses, welcomeState } from './suggestions'

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

const run = (learning_status: LearningStatus, archived_at_unix: number | null = null) => ({
  learning_status,
  course: { id: 'c', name: 'C', thumbnail_key: null, archived_at_unix },
})

test('B-HOME-10 nothing to continue reads as new, all done, archived or waiting for a next lesson', () => {
  expect(welcomeState([])).toBe('new')
  expect(welcomeState([run('completed'), run('completed', 1)])).toBe('done')
  expect(welcomeState([run('completed'), run('in_progress', 1), run('not_started', 2)])).toBe('archived')
  expect(welcomeState([run('in_progress', 1), run('in_progress')])).toBe('waiting')
})
