import { describe, expect, it } from 'vitest'
import { resolveStudentAiAvailability } from '@/features/student-ai/api/student-ai-policy'
import type { StudentActivityRuntime } from '@/features/student-activity/api/runtime'

function runtime(overrides: Partial<StudentActivityRuntime> = {}): StudentActivityRuntime {
  return {
    course: {
      id: 1,
      uuid: 'course_1',
      title: 'Dependency Injection',
      public: false,
    },
    activity: {
      id: 10,
      uuid: 'activity_10',
      title: 'Lecture: Dependencies in Axum',
      type: 'TYPE_DYNAMIC',
      chapter_id: 1,
      chapter_title: 'Rust web services',
      published: true,
    },
    content: null,
    outline: [],
    permissions: {
      is_authenticated: true,
      can_view: true,
      can_contribute: false,
      can_update: false,
    },
    policy: null,
    previous: null,
    next: null,
    primary_action: {
      id: 'mark_complete',
      enabled: true,
      reason: null,
      target_activity_uuid: null,
    },
    progress: {
      state: 'available',
      canonical_state: null,
      complete: false,
      score: null,
      passed: null,
      due_at: null,
      is_late: false,
      teacher_action_required: false,
      attempt_count: 0,
      latest_submission_uuid: null,
      latest_submission_status: null,
      submitted_at: null,
      graded_at: null,
      completed_at: null,
      status_reason: null,
    },
    ...overrides,
  } as StudentActivityRuntime
}

describe('resolveStudentAiAvailability', () => {
  it('enables understand, practice, and reflect for dynamic lessons', () => {
    const availability = resolveStudentAiAvailability({
      hasActivity: true,
      isAttemptActive: false,
      runtime: runtime(),
    })

    expect(availability.state).toBe('enabled')
    expect(availability.modes.map(mode => mode.id)).toEqual(['understand', 'practice', 'reflect'])
    expect(availability.safety.level).toBe('permitted')
  })

  it('limits AI during assessed attempts', () => {
    const availability = resolveStudentAiAvailability({
      hasActivity: true,
      isAttemptActive: true,
      runtime: runtime(),
    })

    expect(availability.state).toBe('restricted')
    expect(availability.modes.map(mode => mode.id)).toEqual(['hint'])
    expect(availability.safety.level).toBe('limited')
  })

  it('blocks locked activity context', () => {
    const availability = resolveStudentAiAvailability({
      hasActivity: true,
      isAttemptActive: false,
      runtime: runtime({
        progress: {
          ...runtime().progress,
          state: 'locked',
        },
      }),
    })

    expect(availability.state).toBe('disabled')
    expect(availability.modes).toEqual([])
    expect(availability.safety.level).toBe('blocked')
  })
})
