import * as v from 'valibot'
import { describe, expect, test } from 'vite-plus/test'

import type { Enrollment } from '#/shared/api/gen/types.gen'

import { learningSearchSchema } from '../route'
import { countByState, nextActivity, orderRuns, runState } from './learning'

const statusOf = (progress: number | null): Enrollment['learning_status'] =>
  (progress ?? 0) >= 100 ? 'completed' : (progress ?? 0) > 0 ? 'in_progress' : 'not_started'

function run(id: string, progress: number | null, archived = false): Enrollment {
  return {
    id,
    course_id: id,
    course_total_steps: 2,
    created_at_unix: 0,
    updated_at_unix: 0,
    progress_pct: progress,
    learning_status: statusOf(progress),
    next_activity_id: null,
    course: {
      id,
      name: id,
      archived_at_unix: archived ? 1 : null,
      thumbnail_key: null,
    },
  }
}

describe('learning model', () => {
  test('B-LRN-02 the state is the server rule: work handed in at 0 % is already in progress', () => {
    expect(runState({ learning_status: 'not_started' })).toBe('not_started')
    expect(runState({ learning_status: 'in_progress' })).toBe('in_progress')
    expect(runState({ learning_status: 'completed' })).toBe('completed')
    expect(runState({ ...run('handed-in', 0), learning_status: 'in_progress' })).toBe('in_progress')
    expect(countByState([run('a', null), run('b', 40), run('c', 100), run('d', 100)])).toEqual({
      not_started: 1,
      in_progress: 1,
      completed: 2,
    })
  })

  test('B-LRN-03 the state filter is a URL value; an unknown one is the whole list', () => {
    expect(v.parse(learningSearchSchema, { state: 'completed' })).toEqual({ state: 'completed' })
    expect(v.parse(learningSearchSchema, { state: 'archived' })).toEqual({ state: undefined })
    expect(v.parse(learningSearchSchema, {})).toEqual({})
  })

  test('B-LRN-06 archived courses go after the live ones, each group in the server order', () => {
    const runs = [run('old', 100, true), run('a', 10), run('older', 0, true), run('b', 0)]
    expect(orderRuns(runs).map(item => item.id)).toEqual(['a', 'b', 'old', 'older'])
  })

  test('B-LRN-09 courses in progress come first, then not started, then completed, each in the server order', () => {
    const runs = [run('done', 100), run('fresh', 0), run('mid', 40), run('done2', 100), run('mid2', 5)]
    expect(orderRuns(runs).map(item => item.id)).toEqual(['mid', 'mid2', 'fresh', 'done', 'done2'])
  })

  test('B-LRN-04 the card goes to the next activity until the course is completed or archived', () => {
    const open = { archived_at_unix: null }
    expect(nextActivity({ learning_status: 'in_progress', next_activity_id: 'x', course: open })).toBe('x')
    expect(nextActivity({ learning_status: 'not_started', next_activity_id: 'x', course: open })).toBe('x')
    expect(nextActivity({ learning_status: 'completed', next_activity_id: 'x', course: open })).toBeNull()
    expect(nextActivity({ learning_status: 'in_progress', next_activity_id: null, course: open })).toBeNull()
    expect(
      nextActivity({ learning_status: 'in_progress', next_activity_id: 'x', course: { archived_at_unix: 1 } }),
    ).toBeNull()
  })
})
