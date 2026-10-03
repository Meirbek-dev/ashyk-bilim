import * as v from 'valibot'
import { describe, expect, test } from 'vite-plus/test'

import type { TrailRun } from '#/shared/api/gen/types.gen'

import { countByState, learningSearchSchema, orderRuns, runState } from './learning'

function run(id: string, progress: number | null, archived = false): TrailRun {
  return {
    id,
    course_id: id,
    course_total_steps: 2,
    created_at_unix: 0,
    updated_at_unix: 0,
    progress_pct: progress,
    status: 'in_progress',
    steps: [],
    course: {
      id,
      name: id,
      about: '',
      description: '',
      allowed_actions: [],
      archived_at_unix: archived ? 1 : null,
      contributor_ids: [],
      created_at_unix: 0,
      updated_at_unix: 0,
      learnings: [],
      open_to_contributors: false,
      public: true,
      tags: [],
    },
  }
}

describe('learning model', () => {
  test('B-LRN-02 the state follows the server rule: 100 % is completed, no progress row or 0 % is not started', () => {
    expect(runState({ progress_pct: null })).toBe('not_started')
    expect(runState({})).toBe('not_started')
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
})
