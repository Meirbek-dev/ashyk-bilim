import { activityProgressNeedsTeacherAction, isActivityProgressComplete, isActivityProgressOverdue } from './status'
import type {
  ActivityProgressCell,
  ActivityProgressState,
  CourseGradebookResponse,
  GradebookActivity,
  GradebookStudent,
} from './types'

export type GradebookSavedFilterId = 'all' | 'needs_grading' | 'overdue' | 'returned' | 'failed' | 'not_started'
export type GradebookRollupKind = 'activity_category' | 'cohort' | 'learner' | 'activity'

export interface GradebookFilters {
  savedFilter: GradebookSavedFilterId
  search: string
  activityType: string
}

export interface GradebookRollupRow {
  id: string
  label: string
  completed: number
  needsGrading: number
  overdue: number
  returned: number
  failed: number
  notStarted: number
  averageScore: number | null
  total: number
}

type GradebookStudentWithCohort = GradebookStudent & {
  cohort?: string | null
  cohort_name?: string | null
}

export const GRADEBOOK_SAVED_FILTERS: GradebookSavedFilterId[] = [
  'all',
  'needs_grading',
  'overdue',
  'returned',
  'failed',
  'not_started',
]

export function gradebookCellKey(userId: string, activityId: string) {
  return `${userId}:${activityId}`
}

export function gradebookLearnerName(student: GradebookStudent) {
  return `${student.first_name ?? ''} ${student.last_name ?? ''}`.trim() || student.username
}

export function gradebookActivityKind(activity: GradebookActivity) {
  return activity.assessment_type ?? activity.activity_type.replace('TYPE_', '').replaceAll('_', ' ')
}

/** Columns the gradebook wire does not cover (file submissions) — rendered as "n/a". */
export function isGradebookActivityTracked(activity: GradebookActivity) {
  return activity.assessment_type != null
}

/** The loaded gradebook as CSV (learner rows × activity columns) — v2 has no course-level export route. */
export function gradebookToCsv(
  data: CourseGradebookResponse,
  activities: GradebookActivity[],
  students: GradebookStudent[],
  labels: { learner: string; email: string; state: (state: ActivityProgressCell['state']) => string; untracked: string },
) {
  const cellMap = new Map(data.cells.map(cell => [gradebookCellKey(cell.user_id, cell.activity_id), cell]))
  const header = [labels.learner, labels.email, ...activities.map(activity => activity.name)]
  const rows = students.map(student => [
    gradebookLearnerName(student),
    student.email,
    ...activities.map(activity => {
      if (!isGradebookActivityTracked(activity)) return labels.untracked
      const cell = cellMap.get(gradebookCellKey(student.id, activity.id)) ?? emptyGradebookCell(student.id, activity.id)
      return cell.score == null ? labels.state(cell.state) : `${Math.round(cell.score * 100) / 100}`
    }),
  ])
  const escape = (value: string) => (/[",\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value)
  return [header, ...rows].map(row => row.map(escape).join(',')).join('\r\n')
}

export function emptyGradebookCell(userId: string, activityId: string): ActivityProgressCell {
  return {
    user_id: userId,
    activity_id: activityId,
    state: 'NOT_STARTED',
    is_late: false,
    teacher_action_required: false,
    attempt_count: 0,
  }
}

export function matchesGradebookSavedFilter(
  cell: ActivityProgressCell,
  filter: GradebookSavedFilterId,
  now = Date.now(),
) {
  if (filter === 'all') return true
  if (filter === 'needs_grading') return activityProgressNeedsTeacherAction(cell)
  if (filter === 'overdue') return isActivityProgressOverdue(cell, now)
  if (filter === 'returned') return cell.state === 'RETURNED'
  if (filter === 'failed') return cell.state === 'FAILED' || cell.passed === false
  if (filter === 'not_started') return cell.state === 'NOT_STARTED'
  return true
}

export function filterGradebookStudents(
  data: CourseGradebookResponse,
  visibleActivities: GradebookActivity[],
  cellMap: Map<string, ActivityProgressCell>,
  filters: GradebookFilters,
) {
  const normalizedSearch = filters.search.trim().toLowerCase()
  return data.students.filter(student => {
    const searchable = `${gradebookLearnerName(student)} ${student.username} ${student.email}`.toLowerCase()
    if (normalizedSearch && !searchable.includes(normalizedSearch)) return false
    return visibleActivities.filter(isGradebookActivityTracked).some(activity => {
      const cell = cellMap.get(gradebookCellKey(student.id, activity.id)) ?? emptyGradebookCell(student.id, activity.id)
      return matchesGradebookSavedFilter(cell, filters.savedFilter)
    })
  })
}

export function buildGradebookRollups(data: CourseGradebookResponse, kind: GradebookRollupKind): GradebookRollupRow[] {
  const cellsByActivity = new Map<string, ActivityProgressCell[]>()
  const cellsByStudent = new Map<string, ActivityProgressCell[]>()

  for (const cell of data.cells) {
    cellsByActivity.set(cell.activity_id, [...(cellsByActivity.get(cell.activity_id) ?? []), cell])
    cellsByStudent.set(cell.user_id, [...(cellsByStudent.get(cell.user_id) ?? []), cell])
  }

  if (kind === 'activity') {
    return data.activities.map(activity =>
      buildRollupRow(String(activity.id), activity.name, cellsByActivity.get(activity.id) ?? []),
    )
  }

  if (kind === 'learner') {
    return data.students.map(student =>
      buildRollupRow(String(student.id), gradebookLearnerName(student), cellsByStudent.get(student.id) ?? []),
    )
  }

  if (kind === 'activity_category') {
    const groups = new Map<string, ActivityProgressCell[]>()
    for (const activity of data.activities) {
      const group = gradebookActivityKind(activity)
      groups.set(group, [...(groups.get(group) ?? []), ...(cellsByActivity.get(activity.id) ?? [])])
    }
    return [...groups.entries()].map(([group, cells]) => buildRollupRow(group, group, cells))
  }

  const cohorts = new Map<string, ActivityProgressCell[]>()
  for (const student of data.students) {
    const cohortStudent = student as GradebookStudentWithCohort
    const cohort = cohortStudent.cohort_name ?? cohortStudent.cohort ?? '__default_cohort__'
    cohorts.set(cohort, [...(cohorts.get(cohort) ?? []), ...(cellsByStudent.get(student.id) ?? [])])
  }
  return [...cohorts.entries()].map(([cohort, cells]) => buildRollupRow(cohort, cohort, cells))
}

function buildRollupRow(id: string, label: string, cells: ActivityProgressCell[]): GradebookRollupRow {
  const scoredCells = cells.filter(cell => typeof cell.score === 'number')
  const averageScore =
    scoredCells.length === 0 ? null : scoredCells.reduce((sum, cell) => sum + (cell.score ?? 0), 0) / scoredCells.length

  return {
    id,
    label,
    completed: cells.filter(cell => isActivityProgressComplete(cell.state)).length,
    needsGrading: cells.filter(activityProgressNeedsTeacherAction).length,
    overdue: cells.filter(cell => isActivityProgressOverdue(cell)).length,
    returned: cells.filter(cell => cell.state === 'RETURNED').length,
    failed: cells.filter(cell => cell.state === 'FAILED' || cell.passed === false).length,
    notStarted: cells.filter(cell => cell.state === 'NOT_STARTED').length,
    averageScore,
    total: cells.length,
  }
}

export function formatGradebookStateKey(state: ActivityProgressState) {
  return state.toLowerCase()
}
