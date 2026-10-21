import * as v from 'valibot'
import { describe, expect, test } from 'vite-plus/test'

import type { Enrollment } from '#/shared/api/gen/types.gen'

import { learningSearchSchema } from '../route'
import { countByState, nextActivity, orderRuns, runState } from './learning'

function run(id: string, progress: number | null, archived = false): Enrollment {
  return {
    id,
    course_id: id,
    course_total_steps: 2,
    created_at_unix: 0,
    updated_at_unix: 0,
    progress_pct: progress,
    learning_status: 'in_progress',
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
  test('B-LRN-02 the state follows the server rule: 100 % is completed, no progress row or 0 % is not started', () => {
    expect(runState({ progress_pct: null })).toBe('not_started')
    expect(runState({ progress_pct: 0 })).toBe('not_started')
    expect(runState({ progress_pct: 0.5 })).toBe('in_progress')
    expect(runState({ progress_pct: 99.9 })).toBe('in_progress')
    expect(runState({ progress_pct: 100 })).toBe('completed')
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

  test('B-LRN-04 the card goes to the next activity until the course is completed', () => {
    expect(nextActivity({ progress_pct: 40, next_activity_id: 'x' })).toBe('x')
    expect(nextActivity({ progress_pct: null, next_activity_id: 'x' })).toBe('x')
    expect(nextActivity({ progress_pct: 100, next_activity_id: 'x' })).toBeNull()
    expect(nextActivity({ progress_pct: 40, next_activity_id: null })).toBeNull()
  })
})
