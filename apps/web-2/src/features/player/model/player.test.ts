import { describe, expect, test } from 'vite-plus/test'

import type { ActivityState, LearnerCourseState, NextAction } from '#/shared/api/gen/types.gen'

import { activityKind, locate, playerAction } from './player'

const activity = (id: string, patch: Partial<ActivityState> = {}): ActivityState => ({
  id,
  title: id,
  activity_type: 'dynamic',
  allowed_actions: ['start'],
  available: true,
  blocked_reason: null,
  complete: false,
  due_at_unix: null,
  is_late: false,
  passed: null,
  required: true,
  score: null,
  state: 'not_started',
  ...patch,
})

function course(activities: ActivityState[][], next: Partial<NextAction> | null = null): LearnerCourseState {
  return {
    course_id: 'c',
    title: 'Course',
    enrolled: true,
    enrollment_state: 'in_progress',
    public: true,
    next_action: next && { id: 'start', label: '', reason: '', enabled: true, activity_id: null, href: null, ...next },
    outline: activities.map((list, index) => ({
      id: `ch${index}`,
      title: `Chapter ${index}`,
      index,
      activities: list,
    })),
    permissions: { can_access: true, can_discover: true, can_enroll: false, denial_reason: null },
    progress: {
      completed_required_count: 0,
      total_required_count: 0,
      missing_required_count: 0,
      needs_grading_count: 0,
      progress_pct: 0,
      completed_at_unix: null,
      grade_average: null,
    },
    certificate: { configured: false, eligible: false, issued: false, href: null, verify_code: null },
  }
}

describe('player model', () => {
  test('B-PLY-02 B-PLY-05 neighbours follow the outline across chapters; an unknown id is not in the course', () => {
    const state = course([[activity('a'), activity('b')], [activity('c')]])
    expect(locate(state, 'b')).toMatchObject({ entry: { id: 'b' }, prev: { id: 'a' }, next: { id: 'c' } })
    expect(locate(state, 'a')).toMatchObject({ prev: null, next: { id: 'b' } })
    expect(locate(state, 'c')).toMatchObject({ prev: { id: 'b' }, next: null })
    expect(locate(state, 'elsewhere')).toBeNull()
  })

  test('B-PLY-06 a lesson that is not done offers to mark it, whatever comes next', () => {
    for (const type of ['dynamic', 'video', 'document', 'custom', 'unknown-type']) {
      const entry = activity('a', { activity_type: type })
      expect(activityKind(type)).toBe('lesson')
      expect(playerAction(course([[entry]], { activity_id: 'b' }), entry)).toEqual({ kind: 'mark' })
    }
  })

  test("B-PLY-07 a done lesson continues at the server's next step; a finished course goes to the summary", () => {
    const done = activity('a', { complete: true, state: 'complete', allowed_actions: ['view_feedback'] })
    expect(playerAction(course([[done]], { id: 'continue', activity_id: 'b' }), done)).toEqual({
      kind: 'continue',
      activityId: 'b',
    })
    expect(playerAction(course([[done]], { id: 'review_completion' }), done)).toEqual({ kind: 'finish' })
    expect(playerAction(course([[done]], { id: 'view_certificate' }), done)).toEqual({ kind: 'finish' })
    expect(playerAction(course([[done]], { id: 'wait_for_grade', enabled: false }), done)).toBeNull()
    expect(playerAction(course([[done]], { activity_id: 'a' }), done)).toBeNull()
    expect(playerAction(course([[done]]), done)).toBeNull()
  })

  test('B-PLY-11 graded work opens its own child route with the action the server allows', () => {
    const cases = [
      ['quiz', 'attempt', ['start'], 'start'],
      ['exam', 'attempt', ['view_receipt'], 'view_receipt'],
      ['code_challenge', 'code', ['continue'], 'continue'],
      ['file_submission', 'submission', ['revise', 'view_feedback'], 'revise'],
    ] as const
    for (const [type, route, actions, action] of cases) {
      const entry = activity('q', { activity_type: type, allowed_actions: [...actions] })
      expect(playerAction(course([[entry]]), entry)).toEqual({ kind: 'open', route, action })
    }
    const silent = activity('q', { activity_type: 'quiz', allowed_actions: ['something_new'] })
    expect(playerAction(course([[silent]]), silent)).toBeNull()
  })

  test('B-PLY-12 a restricted activity has no action at all', () => {
    for (const type of ['dynamic', 'quiz']) {
      const entry = activity('a', { activity_type: type, blocked_reason: 'restricted' })
      expect(playerAction(course([[entry]]), entry)).toBeNull()
    }
  })
})
