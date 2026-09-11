import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { apiJson } from '@/lib/api-client'
import { getStudentActivityRuntime, runStudentActivityAction } from '@/features/student-activity/api/runtime'
import type { LearnerCourseState } from '@/lib/api/generated/zod'

vi.mock('@/lib/api-client', () => ({ apiJson: vi.fn() }))

const courseId = '11111111-1111-4111-8111-111111111111'
const activityId = '22222222-2222-4222-8222-222222222222'
const chapterId = '33333333-3333-4333-8333-333333333333'
function learnerState(): LearnerCourseState {
  return {
    course_id: courseId, title: 'Course', public: true, enrolled: true, enrollment_state: 'in_progress',
    certificate: { configured: false, eligible: false, issued: false },
    next_action: { id: 'start', enabled: true, label: 'Start', reason: '', activity_id: activityId },
    permissions: { can_access: true, can_discover: true, can_enroll: true },
    progress: { completed_required_count: 0, missing_required_count: 1, needs_grading_count: 0,
      progress_pct: 0, total_required_count: 1 },
    outline: [{ id: chapterId, index: 0, title: 'Chapter', activities: [{
      id: activityId, title: 'Lesson', activity_type: 'dynamic', available: true, required: true,
      complete: false, is_late: false, state: 'not_started', allowed_actions: ['start'],
      due_at_unix: 1700000000,
    }] }],
  }
}

describe('learner runtime v2 adapter', () => {
  let state: LearnerCourseState
  beforeEach(() => {
    state = learnerState()
    vi.mocked(apiJson).mockReset()
    vi.mocked(apiJson).mockImplementation(async (_path, init, parse) =>
      init?.method ? {} : parse ? parse(state) : state)
  })

  it('uses the learner projection and preserves IDs and due dates', async () => {
    const runtime = (await getStudentActivityRuntime(courseId, activityId))!
    expect(apiJson).toHaveBeenCalledWith(`courses/${courseId}/learner-state`, {}, expect.any(Function))
    expect(runtime.activity).toMatchObject({ id: activityId, chapter_id: chapterId, type: 'TYPE_DYNAMIC' })
    expect(runtime.primary_action).toEqual({ id: 'mark_complete', enabled: true })
    expect(runtime.progress.due_at).toBe('2023-11-14T22:13:20.000Z')
  })

  it('keeps assessment actions in their submission workflow', async () => {
    const activity = state.outline[0]!.activities[0]!
    activity.activity_type = 'quiz'
    activity.state = 'returned'
    activity.allowed_actions = ['revise', 'view_feedback']
    expect((await getStudentActivityRuntime(courseId, activityId))?.primary_action).toEqual({
      id: 'revise', enabled: true,
    })
    activity.state = 'locked'
    expect((await getStudentActivityRuntime(courseId, activityId))?.primary_action).toMatchObject({
      id: 'none', enabled: false,
    })
  })

  it('returns null for an activity outside the learner outline (BUG-025: unpublished draft)', async () => {
    expect(await getStudentActivityRuntime(courseId, '01a091ab-fafa-7a48-a60b-650685fb0464')).toBeNull()
  })

  it('marks completion through the trail endpoint and propagates mutation failures', async () => {
    await runStudentActivityAction(courseId, activityId, { command: 'mark_complete' })
    expect(apiJson).toHaveBeenNthCalledWith(1, `trail/activities/${activityId}`, { method: 'POST' })
    vi.mocked(apiJson).mockReset().mockRejectedValue(new Error('Forbidden'))
    await expect(runStudentActivityAction(courseId, activityId, { command: 'unmark_complete' }))
      .rejects.toThrow('Forbidden')
    expect(apiJson).toHaveBeenCalledTimes(1)
  })
})
