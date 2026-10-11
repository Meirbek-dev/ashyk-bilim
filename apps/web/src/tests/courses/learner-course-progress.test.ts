// BUG-026: the course progress card derives from learner-state, not the trail.
// BUG-318: counts are the server's aggregate (only what is required of this
// learner) and the next step never lands on an activity they may not take.
import { describe, expect, it } from 'vite-plus/test'

import { learnerCourseProgress, scheduledActivities, withScheduledActivities } from '@/features/learner-course/api'
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
  blocked_reason: null,
  opens_at_unix: null,
  due_at_unix: null,
  passed: null,
  score: null,
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

// BUG-336 (not a bug): `outline` is a required non-null array on the wire
// (`Vec<ChapterState>`), and every learner-state read parses it - a null never
// reaches `buildCourseProgressSnapshot`.
describe('LearnerCourseState.outline', () => {
  it('rejects a null outline at the parse boundary', async () => {
    const { LearnerCourseState } = await import('@/lib/api/generated/zod')
    expect(LearnerCourseState.shape.outline.safeParse(null).success).toBe(false)
    expect(LearnerCourseState.shape.outline.safeParse([]).success).toBe(true)
  })
})

// ROUND3-11: a scheduled test is listed (locked, «Откроется …») but not counted - the parse keeps it apart.
describe('scheduledActivities', () => {
  it('lists the scheduled tests with their chapter and opening time, nothing else', () => {
    const scheduled = activity('s1', false, {
      title: 'Рубежный тест',
      available: false,
      required: false,
      blocked_reason: 'scheduled',
      opens_at_unix: 1_791_908_280,
    })
    const got = scheduledActivities({
      outline: [
        { id: 'c1', index: 0, title: 'Введение', activities: [activity('a1', true), scheduled] },
        { id: 'c2', index: 1, title: 'Глава 2', activities: [activity('a2', false, { blocked_reason: 'restricted' })] },
      ],
    } as unknown as LearnerCourseState)
    expect(got).toEqual([
      {
        id: 's1',
        title: 'Рубежный тест',
        activityType: 'quiz',
        opensAtUnix: 1_791_908_280,
        chapterId: 'c1',
        chapterTitle: 'Введение',
        chapterOrder: 0,
      },
    ])
  })
})

describe('withScheduledActivities', () => {
  const entry = (id: string, chapterId: string, chapterOrder: number) => ({
    id,
    title: id,
    activityType: 'quiz',
    opensAtUnix: 100,
    chapterId,
    chapterTitle: `Глава ${chapterId}`,
    chapterOrder,
  })

  it('appends a locked row to its chapter and adds a chapter that holds only the scheduled test', () => {
    const chapters = [
      { chapter_uuid: 'c1', name: 'Глава 1', activities: [{ activity_uuid: 'a1', name: 'Урок' }] },
      { chapter_uuid: 'c3', name: 'Глава 3', activities: [{ activity_uuid: 'a3', name: 'Урок 3' }] },
    ]
    const got = withScheduledActivities(chapters, [entry('s1', 'c1', 0), entry('s2', 'c2', 1)])
    expect(got.map(chapter => chapter.chapter_uuid)).toEqual(['c1', 'c2', 'c3'])
    expect(got[0]!.activities!.map(a => [a.activity_uuid, a.activity_type, a.scheduled_opens_at_unix])).toEqual([
      ['a1', undefined, undefined],
      ['s1', 'TYPE_CUSTOM', 100],
    ])
    expect(got[1]!.activities).toHaveLength(1)
    // The course read itself is untouched.
    expect(chapters[0]!.activities).toHaveLength(1)
  })
})
