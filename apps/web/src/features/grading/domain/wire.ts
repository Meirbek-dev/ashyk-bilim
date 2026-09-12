import { Course, Curriculum, GradebookPage, ReviewItem, Stats, TeacherSubmission } from '@/lib/api/generated/zod'
import { unixToIso } from '@/lib/api/contract'
import type { ActivityProgressCell, CourseGradebookResponse, Submission, SubmissionStatus } from './types'
import { normalizeSubmission } from './types'
import { isActivityProgressComplete } from './status'
import { submissionFromWire } from '@/features/assessments/domain/submission-wire'

const statuses = { draft: 'DRAFT', pending: 'PENDING', graded: 'GRADED', published: 'PUBLISHED', returned: 'RETURNED' } as const

export function reviewItemFromWire(value: unknown): Submission {
  const item = ReviewItem.parse(value)
  return normalizeSubmission({
    id: item.id, submission_uuid: item.id, user_id: item.user.id,
    user: { ...item.user, first_name: item.user.display_name },
    status: statuses[item.status], attempt_number: item.attempt_number,
    auto_score: item.auto_score ?? null, final_score: item.final_score ?? null,
    is_late: item.is_late, version: item.version,
    submitted_at: unixToIso(item.submitted_at_unix), graded_at: unixToIso(item.graded_at_unix),
  })
}

export function teacherSubmissionFromWire(value: unknown): Submission {
  const item = TeacherSubmission.parse(value)
  const answeredCount = Object.keys(item.answers).length
  const learner = submissionFromWire({
    ...item,
    draft_version: 0,
    total_items: answeredCount,
    answered_count: answeredCount,
  })
  return {
    ...reviewItemFromWire(item), assessment_id: item.assessment_id,
    answers_json: learner.answers_json, grading_json: item.grading,
    release_state: item.release_state.toUpperCase(),
    started_at: unixToIso(item.started_at_unix),
    metadata_json: { violations: item.violations },
  }
}

export function statsFromWire(value: unknown) {
  const stats = Stats.parse(value)
  return { ...stats, needs_grading_count: stats.needs_grading, avg_score: stats.avg_score ?? null, pass_rate: stats.pass_rate ?? null }
}

const cellStates: Record<SubmissionStatus, ActivityProgressCell['state']> = {
  DRAFT: 'IN_PROGRESS', PENDING: 'NEEDS_GRADING', GRADED: 'GRADED', RETURNED: 'RETURNED', PUBLISHED: 'COMPLETED',
}

/**
 * `GET courses/{id}/gradebook` carries the latest non-draft attempt per
 * (learner, graded activity) — assessment submissions and file-submission
 * attempts in one cell shape — plus both column lists.
 */
export function gradebookFromWire(pages: GradebookPage[], course: Course, curriculum?: Curriculum): CourseGradebookResponse {
  const assessmentMap = new Map(pages.flatMap(p => p.assessments).map(a => [a.id, a]))
  const fileMap = new Map(pages.flatMap(p => p.file_submissions).map(f => [f.id, f]))
  // Columns are activities, so they carry the activity's name, not the assessment title.
  const activityNames = new Map(curriculum?.chapters.flatMap(ch => ch.activities.map(a => [a.id, a.name] as const)))
  const users = new Map(pages.flatMap(p => p.users).map(u => [u.id, { ...u, first_name: u.display_name }]))
  const cells: ActivityProgressCell[] = pages.flatMap(p => p.cells).map(c => {
    const status = statuses[c.status]
    const assessment = c.assessment_id ? assessmentMap.get(c.assessment_id) : undefined
    const file = c.file_submission_id ? fileMap.get(c.file_submission_id) : undefined
    if (!assessment && !file) throw new Error('Gradebook cell points at an unknown column')
    const passed = assessment && c.final_score != null ? c.final_score >= assessment.passing_score : null
    const state: ActivityProgressCell['state'] =
      status === 'PUBLISHED' && assessment ? (passed === false ? 'FAILED' : passed === true ? 'PASSED' : 'SUBMITTED') : cellStates[status]
    return {
      activity_id: c.activity_id, user_id: c.user_id, attempt_count: c.attempts,
      latest_submission_uuid: c.submission_id ?? c.attempt_id ?? null, latest_submission_status: status,
      state, score: c.final_score ?? null, passed,
      due_at: unixToIso(assessment?.due_at_unix ?? file?.due_at_unix), is_late: c.is_late,
      // `graded` = scored but unreleased (batch release mode): the teacher still owes a publish.
      teacher_action_required: c.status === 'pending' || c.status === 'graded',
    }
  })
  const columnName = (activityId: string, fallback: string) => activityNames.get(activityId) ?? fallback
  const graded = [...assessmentMap.values()].map(a => ({
    id: a.activity_id, activity_uuid: a.activity_id, name: columnName(a.activity_id, a.title),
    activity_type: `TYPE_${a.kind.toUpperCase()}`, assessment_type: a.kind,
  }))
  const files = [...fileMap.values()].map(f => ({
    id: f.activity_id, activity_uuid: f.activity_id, name: columnName(f.activity_id, f.title),
    activity_type: 'TYPE_FILE_SUBMISSION', assessment_type: 'file_submission',
  }))
  const activities = [...graded, ...files]
  const now = Date.now()
  return {
    course_id: course.id, course_uuid: course.id, course_name: course.name,
    cells, activities, students: [...users.values()],
    summary: {
      activity_count: activities.length, student_count: users.size,
      completed_count: cells.filter(c => isActivityProgressComplete(c.state)).length,
      needs_grading_count: cells.filter(c => c.teacher_action_required).length,
      not_started_count: users.size * activities.length - cells.length,
      overdue_count: cells.filter(c => c.due_at && Date.parse(c.due_at) < now && !isActivityProgressComplete(c.state)).length,
    },
    teacher_actions: cells.filter(c => c.teacher_action_required).map(c => ({
      activity_id: c.activity_id, activity_name: activities.find(a => a.id === c.activity_id)?.name ?? '',
      user_id: c.user_id, student_name: users.get(c.user_id)?.display_name ?? '', submission_uuid: c.latest_submission_uuid!,
    })),
  }
}
