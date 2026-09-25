// BUG-026: the course progress card derives from learner-state, not the trail.
// BUG-318: counts are the server's aggregate (only what is required of this
// learner) and the next step never lands on an activity they may not take.
import { describe, expect, it } from 'vite-plus/test'

import { learnerCourseProgress } from '@/features/learner-course/api'
import type { LearnerCourseState } from '@/features/learner-course/api'

type Activity = LearnerCourseState['outline'][number]['activities'][number]
const activity = (id: string, complete: boolean, extra: Partial<Activity> = {}): Activity => ({
  id,
  title: id,
  activity_type: 'quiz',
  available: true,
  required: true,
  complete,
  is_late: false,
  state: complete ? 'passed' : 'not_started',
  allowed_actions: [],
  ...extra,
})

const state = (activities: Activity[], progress: Partial<LearnerCourseState['progress']>, nextId: string | null) =>
  ({
    outline: [{ id: 'c1', index: 0, title: 'Введение', activities }],
    progress: { completed_required_count: 0, total_required_count: 0, progress_pct: 0, ...progress },
    next_action: { id: nextId ? 'start' : 'view_certificate', activity_id: nextId },
  }) as unknown as LearnerCourseState

describe('learnerCourseProgress', () => {
  it('takes counts and percent from the server aggregate, not an outline recount', () => {
    const got = learnerCourseProgress(
      state(
        [activity('a1', false), activity('a2', true), activity('a3', true)],
        {
          completed_required_count: 2,
          total_required_count: 3,
          progress_pct: 66.67,
        },
        'a1',
      ),
    )
    expect(got).toEqual({
      completedIds: new Set(['a2', 'a3']),
      optionalIds: new Set(),
      completed: 2,
      total: 3,
      percent: 67,
      activityCount: 3,
      nextActivityId: 'a1',
    })
  })

  it('a learner off a quiz allowlist is done at 100 % and is never sent into the quiz (BUG-318)', () => {
    const got = learnerCourseProgress(
      state(
        [
          activity('lesson', true),
          activity('quiz', false, { required: false, available: false, blocked_reason: 'restricted' }),
        ],
        { completed_required_count: 1, total_required_count: 1, progress_pct: 100 },
        null,
      ),
    )
    expect(got).toMatchObject({ completed: 1, total: 1, percent: 100, activityCount: 2, nextActivityId: null })
    // The course-page indicators leave it out of their tallies (reverify-E).
    expect(got.optionalIds).toEqual(new Set(['quiz']))
  })

  it('is empty (0 of 0, 0%) before the state has loaded', () => {
    expect(learnerCourseProgress(undefined)).toEqual({
      completedIds: new Set(),
      optionalIds: new Set(),
      completed: 0,
      total: 0,
      percent: 0,
      activityCount: 0,
      nextActivityId: null,
    })
  })
})
