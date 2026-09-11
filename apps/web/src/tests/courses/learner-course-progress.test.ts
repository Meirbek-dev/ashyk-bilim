// BUG-026: the course progress card derives from the learner-state outline
// (published activities only) — the same data the activity sidebar renders.
import { describe, expect, it } from 'vite-plus/test'

import { learnerCourseProgress } from '@/features/learner-course/api'
import type { LearnerCourseState } from '@/features/learner-course/api'

const activity = (id: string, complete: boolean): LearnerCourseState['outline'][number]['activities'][number] => ({
  id,
  title: id,
  activity_type: 'quiz',
  available: true,
  required: true,
  complete,
  is_late: false,
  state: complete ? 'passed' : 'not_started',
  allowed_actions: [],
})

describe('learnerCourseProgress (BUG-026)', () => {
  it('counts completed and total from the outline, not the trail', () => {
    const state = {
      outline: [
        { id: 'c1', index: 0, title: 'Введение', activities: [activity('a1', false)] },
        { id: 'c2', index: 1, title: 'Основные уроки', activities: [activity('a2', true), activity('a3', true)] },
      ],
    } as unknown as LearnerCourseState

    expect(learnerCourseProgress(state)).toEqual({
      completedIds: new Set(['a2', 'a3']),
      completed: 2,
      total: 3,
      percent: 67,
    })
  })

  it('is empty (0 of 0, 0%) before the state has loaded', () => {
    expect(learnerCourseProgress(undefined)).toEqual({ completedIds: new Set(), completed: 0, total: 0, percent: 0 })
  })
})
