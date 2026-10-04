import { describe, expect, test } from 'vite-plus/test'

import type { Agenda, AgendaDeadline, RecentResult, WorkItem, WorkKind } from '#/shared/api/gen/types.gen'
import { fromDateTimeInput } from '#/shared/i18n/format'

import { attentionWork, groupDeadlines, isEmptyToday, timeOf } from './agenda'

const at = (local: string) => fromDateTimeInput(local)

const deadline = (activity_id: string, due_at_unix: number): AgendaDeadline => ({
  activity_id,
  activity_name: activity_id,
  activity_type: 'quiz',
  assessment_id: null,
  course_id: 'c1',
  course_name: 'Course',
  cutoff_at_unix: null,
  due_at_unix,
  file_submission_id: null,
  state: 'not_started',
})

const work = (activity_id: string, kind: WorkKind): WorkItem => ({
  activity_id,
  activity_title: activity_id,
  allowed_actions: [],
  course_id: 'c1',
  course_title: 'Course',
  created_at_unix: null,
  description: '',
  due_at_unix: null,
  href: '',
  id: `${kind}-${activity_id}`,
  kind,
  primary_action: '',
  priority: 'high',
  role: 'learner',
  status: 'in_progress',
  title: '',
})

const result = (activity_id: string): RecentResult => ({
  activity_id,
  activity_name: activity_id,
  at_unix: 0,
  course_id: 'c1',
  course_name: 'Course',
  kind: 'submission_returned',
  score: null,
  submission_id: null,
})

const empty: Agenda = { continue_learning: [], course_updates: [], deadlines: [], recent_results: [] }

describe('home model', () => {
  test('B-HOME-03 deadlines group by platform day, soonest first, named today and tomorrow', () => {
    const now = at('2026-10-03T22:00')
    const days = groupDeadlines(
      [
        deadline('later', at('2026-10-10T09:00')),
        deadline('tomorrow', at('2026-10-04T00:30')),
        deadline('today-late', at('2026-10-03T23:59')),
        deadline('today', at('2026-10-03T22:30')),
      ],
      now,
    )
    expect(days.map(day => [day.day, day.name, day.deadlines.map(item => item.activity_id)])).toEqual([
      ['2026-10-03', 'today', ['today', 'today-late']],
      ['2026-10-04', 'tomorrow', ['tomorrow']],
      ['2026-10-10', 'later', ['later']],
    ])
    expect(timeOf(at('2026-10-04T00:30'))).toBe('00:30')
  })

  test('B-HOME-04 overdue work and returned work missing from the results; nothing shown twice', () => {
    const items = [
      work('a', 'overdue'),
      work('b', 'returned_for_revision'),
      work('c', 'returned_for_revision'),
      work('d', 'waiting_for_grade'),
      work('e', 'in_progress'),
    ]
    expect(attentionWork(items, [result('c')]).map(item => item.activity_id)).toEqual(['a', 'b'])
  })

  test('B-HOME-07 the page is empty only when every part is', () => {
    expect(isEmptyToday(empty, [])).toBe(true)
    expect(isEmptyToday(empty, [work('a', 'overdue')])).toBe(false)
    expect(isEmptyToday({ ...empty, deadlines: [deadline('a', 0)] }, [])).toBe(false)
    expect(isEmptyToday({ ...empty, recent_results: [result('a')] }, [])).toBe(false)
  })
})
