import { describe, expect, it } from 'vitest'
import type { Assessment, Course, Curriculum, GradebookPage } from '@/lib/api/generated/zod'
import { gradebookFromWire } from '@/features/grading/domain/wire'
import { localizeAutoGraderFeedback, matchesGradebookSavedFilter } from '@/features/grading/domain'

const COURSE_ID = '01a0910d-2963-7483-a97d-40dc56e9aa20'
const EXAM_ID = '01a0917d-e89b-7b39-8060-bd90a28efa9f'
const USER_ID = '01a0910c-796a-75f5-b21c-93955233d327'

const course = { id: COURSE_ID, name: 'Course' } as Course
const exam = {
  id: EXAM_ID,
  activity_id: 'activity_exam',
  title: 'Exam',
  kind: 'exam',
  policy: { passing_score: 60, due_at_unix: null, grade_release_mode: 'batch' },
} as unknown as Assessment

function page(status: GradebookPage['cells'][number]['status']): GradebookPage {
  return {
    cells: [
      {
        user_id: USER_ID,
        assessment_id: EXAM_ID,
        submission_id: 'submission_1',
        status,
        attempt_number: 1,
        attempts: 1,
        is_late: false,
        final_score: 80,
      },
    ],
    users: [{ id: USER_ID, username: 'learner', display_name: 'Learner', email: 'learner@example.com' }],
    assessments: [],
    next_cursor: null,
  }
}

describe('gradebookFromWire (UX-013)', () => {
  it('treats graded-but-unreleased work as pending teacher action', () => {
    const data = gradebookFromWire([page('graded')], course, [exam])
    const cell = data.cells[0]!

    expect(cell.state).toBe('GRADED')
    expect(cell.teacher_action_required).toBe(true)
    expect(matchesGradebookSavedFilter(cell, 'needs_grading')).toBe(true)
    expect(data.summary.needs_grading_count).toBe(1)
    expect(data.teacher_actions.map(action => action.submission_uuid)).toEqual(['submission_1'])
  })

  it('labels columns with the curriculum activity name, not the assessment title', () => {
    const curriculum = {
      chapters: [{ activities: [{ id: 'activity_exam', name: 'Final Exam' }] }],
    } as unknown as Curriculum
    expect(gradebookFromWire([page('published')], course, [exam], curriculum).activities[0]!.name).toBe('Final Exam')
    // Without a curriculum row (unlinked activity) the assessment title is the fallback.
    expect(gradebookFromWire([page('published')], course, [exam]).activities[0]!.name).toBe('Exam')
  })

  it('leaves published work out of the teacher queue', () => {
    const data = gradebookFromWire([page('published')], course, [exam])
    expect(data.cells[0]!.teacher_action_required).toBe(false)
    expect(data.summary.needs_grading_count).toBe(0)
  })
})

describe('localizeAutoGraderFeedback (UX-014)', () => {
  const t = (key: string, values?: Record<string, string | number>) =>
    values ? `${key}:${Object.values(values).join('/')}` : key

  it('maps the server auto-grader strings onto catalog keys', () => {
    expect(localizeAutoGraderFeedback('No answer provided', t)).toBe('autoFeedback.noAnswer')
    expect(localizeAutoGraderFeedback('Partially correct (2/3)', t)).toBe('autoFeedback.partial:2/3')
    expect(localizeAutoGraderFeedback('3/4 pairs matched', t)).toBe('autoFeedback.pairsMatched:3/4')
  })

  it('passes teacher-written feedback through untouched', () => {
    expect(localizeAutoGraderFeedback('Хорошая работа', t)).toBe('Хорошая работа')
    expect(localizeAutoGraderFeedback(undefined, t)).toBe('')
  })
})
