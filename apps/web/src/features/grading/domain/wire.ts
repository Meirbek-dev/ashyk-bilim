import { Assessment, Course, Curriculum, GradebookPage, ReviewItem, Stats, TeacherSubmission } from '@/lib/api/generated/zod'
import type { FileReviewItem, FileSubmission } from '@/lib/api/generated/zod'
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

/** One file-submission activity's grading data: its config plus the review queue (newest attempt first). */
export interface FileGradebookSource {
  config: FileSubmission
  items: FileReviewItem[]
}

const fileStates: Record<FileReviewItem['status'], ActivityProgressCell['state']> = {
  draft: 'IN_PROGRESS', submitted: 'NEEDS_GRADING', graded: 'GRADED', published: 'COMPLETED', returned: 'RETURNED',
}
const fileStatuses: Record<FileReviewItem['status'], SubmissionStatus> = {
  draft: 'DRAFT', submitted: 'PENDING', graded: 'GRADED', published: 'PUBLISHED', returned: 'RETURNED',
}

/**
 * `GET courses/{id}/gradebook` carries assessment attempts only (contract gap),
 * so file-submission cells come from each activity's review queue: the newest
 * non-draft attempt per learner becomes the cell.
 */
function fileCellsFromWire(source: FileGradebookSource): ActivityProgressCell[] {
  const seen = new Set<string>()
  const cells: ActivityProgressCell[] = []
  for (const item of source.items) {
    if (seen.has(item.user.id)) continue
    seen.add(item.user.id)
    cells.push({
      activity_id: source.config.activity_id, user_id: item.user.id, attempt_count: item.attempt_number,
      latest_submission_uuid: item.id, latest_submission_status: fileStatuses[item.status],
      state: fileStates[item.status], score: item.final_score ?? null, passed: null,
      due_at: unixToIso(source.config.due_at_unix), is_late: item.is_late,
      teacher_action_required: item.status === 'submitted' || item.status === 'graded',
    })
  }
  return cells
}

export function gradebookFromWire(
  pages: GradebookPage[],
  course: Course,
  assessments: Assessment[],
  curriculum?: Curriculum,
  fileSources: FileGradebookSource[] = [],
): CourseGradebookResponse {
  const assessmentMap = new Map(assessments.map(a => [a.id, a]))
  // Columns are activities, so they carry the activity's name, not the assessment title.
  const activityNames = new Map(curriculum?.chapters.flatMap(ch => ch.activities.map(a => [a.id, a.name] as const)))
  const users = new Map(pages.flatMap(p => p.users).map(u => [u.id, { ...u, first_name: u.display_name }]))
  const assessmentCells: ActivityProgressCell[] = pages.flatMap(p => p.cells).map(c => {
    const assessment = assessmentMap.get(c.assessment_id)
    if (!assessment) throw new Error('Gradebook assessment is missing from the course')
    const passed = c.final_score == null ? null : c.final_score >= assessment.policy.passing_score
    const states: Record<SubmissionStatus, ActivityProgressCell['state']> = {
      DRAFT: 'IN_PROGRESS', PENDING: 'NEEDS_GRADING', GRADED: 'GRADED', RETURNED: 'RETURNED',
      PUBLISHED: passed === false ? 'FAILED' : passed === true ? 'PASSED' : 'SUBMITTED',
    }
    return {
      activity_id: assessment.activity_id, user_id: c.user_id, attempt_count: c.attempts,
      latest_submission_uuid: c.submission_id, latest_submission_status: statuses[c.status],
      state: states[statuses[c.status]], score: c.final_score ?? null, passed,
      due_at: unixToIso(assessment.policy.due_at_unix), is_late: c.is_late,
      // `graded` = scored but unreleased (batch release mode): the teacher still owes a publish.
      teacher_action_required: c.status === 'pending' || c.status === 'graded',
    }
  })
  const cells = [...assessmentCells, ...fileSources.flatMap(fileCellsFromWire)]
  const graded = assessments.map(a => ({ id: a.activity_id, activity_uuid: a.activity_id, name: activityNames.get(a.activity_id) ?? a.title, activity_type: `TYPE_${a.kind.toUpperCase()}`, assessment_type: a.kind }))
  // File-submission columns come from the curriculum; their cells from `fileSources`.
  const files = (curriculum?.chapters ?? []).flatMap(ch => ch.activities)
    .filter(a => a.activity_type === 'file_submission')
    .map(a => ({ id: a.id, activity_uuid: a.id, name: a.name, activity_type: 'TYPE_FILE_SUBMISSION', assessment_type: 'file_submission' }))
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
