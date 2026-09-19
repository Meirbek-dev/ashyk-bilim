import { describe, expect, it } from 'vitest'
import type { Course, Curriculum, GradebookPage } from '@/lib/api/generated/zod'
import { gradebookFromWire } from '@/features/grading/domain/wire'
import { localizeItemFeedback, matchesGradebookSavedFilter } from '@/features/grading/domain'

const COURSE_ID = '01a0910d-2963-7483-a97d-40dc56e9aa20'
const EXAM_ID = '01a0917d-e89b-7b39-8060-bd90a28efa9f'
const FILE_ID = '01a0917d-e89b-7b39-8060-bd90a28efa10'
const USER_ID = '01a0910c-796a-75f5-b21c-93955233d327'

const course = { id: COURSE_ID, name: 'Course' } as Course
const user = { id: USER_ID, username: 'learner', display_name: 'Learner', email: 'learner@example.com' }
const exam = { id: EXAM_ID, activity_id: 'activity_exam', title: 'Exam', kind: 'exam' as const, due_at_unix: null, passing_score: 60 }
const upload = { id: FILE_ID, activity_id: 'activity_upload', title: 'Project Upload', due_at_unix: null }

type Cell = GradebookPage['cells'][number]

function examCell(status: Cell['status'], final_score: number | null = 80): Cell {
  return {
    user_id: USER_ID, activity_id: 'activity_exam', assessment_id: EXAM_ID, submission_id: 'submission_1',
    file_submission_id: null, attempt_id: null, status, attempt_number: 1, attempts: 1, is_late: false, final_score,
  }
}

function fileCell(status: Cell['status'], final_score: number | null): Cell {
  return {
    user_id: USER_ID, activity_id: 'activity_upload', assessment_id: null, submission_id: null,
    file_submission_id: FILE_ID, attempt_id: 'attempt_2', status, attempt_number: 2, attempts: 2, is_late: false, final_score,
  }
}

function page(cells: Cell[], withFile = false): GradebookPage {
  return { cells, users: [user], assessments: [exam], file_submissions: withFile ? [upload] : [], next_cursor: null }
}

describe('gradebookFromWire (UX-013)', () => {
  it('treats graded-but-unreleased work as pending teacher action', () => {
    const data = gradebookFromWire([page([examCell('graded')])], course)
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
    expect(gradebookFromWire([page([examCell('published')])], course, curriculum).activities[0]!.name).toBe('Final Exam')
    // Without a curriculum row (unlinked activity) the assessment title is the fallback.
    expect(gradebookFromWire([page([examCell('published')])], course).activities[0]!.name).toBe('Exam')
  })

  // Q-2026-09-12-2 #1: file-submission attempts arrive on the wire in the
  // same cell shape, keyed by `file_submission_id` + `attempt_id`.
  it('reads file-submission columns and cells from the wire', () => {
    const data = gradebookFromWire([page([examCell('published'), fileCell('published', 77)], true)], course)
    expect(data.activities.map(a => [a.name, a.assessment_type])).toEqual([
      ['Exam', 'exam'],
      ['Project Upload', 'file_submission'],
    ])
    const cell = data.cells.find(c => c.activity_id === 'activity_upload')!
    expect(cell).toMatchObject({
      latest_submission_uuid: 'attempt_2', latest_submission_status: 'PUBLISHED', state: 'COMPLETED',
      score: 77, attempt_count: 2, teacher_action_required: false, passed: null,
    })
    expect(data.cells.find(c => c.activity_id === 'activity_exam')).toMatchObject({ state: 'PASSED', passed: true })
    expect(data.summary).toMatchObject({ activity_count: 2, completed_count: 2, not_started_count: 0 })

    // A handed-in but ungraded attempt is teacher work, like a pending assessment.
    const pending = gradebookFromWire([page([fileCell('pending', null)], true)], course)
    expect(pending.cells[0]).toMatchObject({ state: 'NEEDS_GRADING', teacher_action_required: true, score: null })
    expect(pending.teacher_actions.map(action => action.activity_name)).toEqual(['Project Upload'])
  })

  // UX-113: «Просрочено» honours the learner's active deadline override.
  it("judges overdue against the cell's deadline override before the assessment due", () => {
    const past = Math.floor(Date.now() / 1000) - 3600
    const future = past + 86_400
    const overdue = gradebookFromWire([{ ...page([examCell('pending', null)]), assessments: [{ ...exam, due_at_unix: past }] }], course)
    expect(overdue.summary.overdue_count).toBe(1)
    expect(matchesGradebookSavedFilter(overdue.cells[0]!, 'overdue')).toBe(true)

    const extended = gradebookFromWire(
      [{ ...page([{ ...examCell('pending', null), due_at_override_unix: future }]), assessments: [{ ...exam, due_at_unix: past }] }],
      course,
    )
    expect(extended.summary.overdue_count).toBe(0)
    expect(matchesGradebookSavedFilter(extended.cells[0]!, 'overdue')).toBe(false)
  })

  it('leaves published work out of the teacher queue', () => {
    const data = gradebookFromWire([page([examCell('published')])], course)
    expect(data.cells[0]!.teacher_action_required).toBe(false)
    expect(data.summary.needs_grading_count).toBe(0)
  })

  // BUG-175: the cell ranks the published grade of record (attempt 1, 80 %)
  // while a newer attempt still waits — the queue, filter and count see it.
  it('flags a pending attempt behind a published grade of record', () => {
    const data = gradebookFromWire([page([{ ...examCell('published', 80), attempts: 2, pending_attempt: 2 }])], course)
    const cell = data.cells[0]!
    expect(cell).toMatchObject({ state: 'PASSED', score: 80, pending_attempt: 2, teacher_action_required: true })
    expect(matchesGradebookSavedFilter(cell, 'needs_grading')).toBe(true)
    expect(data.summary.needs_grading_count).toBe(1)
    expect(data.teacher_actions).toHaveLength(1)
  })
})

describe('localizeItemFeedback (Q-2026-09-11-2)', () => {
  const t = (key: string, values?: Record<string, string | number>) =>
    values && Object.keys(values).length > 0 ? `${key}:${Object.values(values).join('/')}` : key

  it('renders the auto-grader code through the catalog, params included', () => {
    expect(localizeItemFeedback({ feedback: 'No answer provided', feedback_code: 'no-answer' }, t)).toBe(
      'itemFeedback.noAnswer',
    )
    expect(
      localizeItemFeedback(
        { feedback: 'Partially correct (2/3)', feedback_code: 'partially-correct', feedback_params: { correct: 2, total: 3 } },
        t,
      ),
    ).toBe('itemFeedback.partiallyCorrect:2/3')
    expect(
      localizeItemFeedback({ feedback: '3/4 pairs matched', feedback_code: 'pairs-matched', feedback_params: { correct: 3, total: 4 } }, t),
    ).toBe('itemFeedback.pairsMatched:3/4')
  })

  it('passes teacher prose and unknown codes through as text', () => {
    expect(localizeItemFeedback({ feedback: 'Хорошая работа' }, t)).toBe('Хорошая работа')
    expect(localizeItemFeedback({ feedback: 'Something new', feedback_code: 'future-code' }, t)).toBe('Something new')
    expect(localizeItemFeedback({ feedback: null }, t)).toBe('')
  })
})
