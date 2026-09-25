import { describe, expect, it } from 'vite-plus/test'

import { derivePrimaryAction, normalizeProgressState } from '@/features/student-activity/domain'
import { buildGradebookRollups, type GradebookRollupKind } from '@/features/grading/domain'
import type { CourseGradebookResponse } from '@/features/grading/domain'

describe('student activity runtime domain', () => {
  it('maps canonical progress states into student workflow states', () => {
    expect(normalizeProgressState('NEEDS_GRADING')).toBe('needs_grading')
    expect(normalizeProgressState('GRADED')).toBe('graded_hidden')
    expect(normalizeProgressState('PASSED')).toBe('passed')
    expect(
      normalizeProgressState('PASSED', {
        completed_at: '2026-05-19T00:00:00Z',
        passed: true,
        latest_submission_status: 'PUBLISHED',
      }),
    ).toBe('passed')
    expect(normalizeProgressState('FAILED')).toBe('failed')
    expect(normalizeProgressState('COMPLETED')).toBe('complete')
  })

  it('derives the next best action from the workflow state', () => {
    expect(
      derivePrimaryAction({
        canMarkComplete: false,
        currentComplete: false,
        hasNext: false,
        isAssessable: true,
        isCourseEnd: false,
        state: 'returned',
      }).id,
    ).toBe('revise')

    expect(
      derivePrimaryAction({
        canMarkComplete: true,
        currentComplete: false,
        hasNext: false,
        isAssessable: false,
        isCourseEnd: false,
        state: 'not_started',
      }).id,
    ).toBe('mark_complete')
  })
})

describe('gradebook rollup taxonomy', () => {
  it('uses activity_category for activity-type rollups', () => {
    const kind: GradebookRollupKind = 'activity_category'
    const data = {
      course_uuid: 'course_1',
      course_id: 'course_1',
      course_name: 'Course',
      students: [],
      activities: [
        {
          id: 'activity_1',
          activity_uuid: 'activity_1',
          name: 'Quiz',
          activity_type: 'TYPE_DYNAMIC',
          assessment_type: 'QUIZ',
        },
      ],
      cells: [],
      teacher_actions: [],
      summary: {
        student_count: 0,
        activity_count: 1,
        needs_grading_count: 0,
        awaiting_release_count: 0,
        overdue_count: 0,
        not_started_count: 0,
        completed_count: 0,
      },
    } satisfies CourseGradebookResponse

    expect(buildGradebookRollups(data, kind)[0]?.label).toBe('QUIZ')
  })

  it('counts «На проверке» like the toolbar tile: a row awaiting release is not owed a grade (UX-215)', () => {
    const cell = (user_id: string, awaiting_release: boolean) => ({
      activity_id: 'activity_1',
      user_id,
      state: 'NEEDS_GRADING' as const,
      attempt_count: 1,
      is_late: false,
      teacher_action_required: true,
      latest_submission_uuid: `sub_${user_id}`,
      awaiting_release,
    })
    const data = {
      course_uuid: 'course_1',
      course_id: 'course_1',
      course_name: 'Course',
      students: [],
      activities: [
        { id: 'activity_1', activity_uuid: 'activity_1', name: 'Quiz', activity_type: 'quiz', assessment_type: 'QUIZ' },
      ],
      cells: [cell('u1', false), cell('u2', true)],
      teacher_actions: [],
      summary: {
        student_count: 2,
        activity_count: 1,
        needs_grading_count: 2,
        awaiting_release_count: 1,
        overdue_count: 0,
        not_started_count: 0,
        completed_count: 0,
      },
    } satisfies CourseGradebookResponse

    const tile = data.summary.needs_grading_count - data.summary.awaiting_release_count
    expect(buildGradebookRollups(data, 'activity')[0]?.needsGrading).toBe(tile)
  })
})
