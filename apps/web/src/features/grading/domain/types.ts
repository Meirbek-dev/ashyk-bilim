import type { components } from '@/lib/api/generated'

type GeneratedSubmission = components['schemas']['SubmissionRead']
type GeneratedGradedItem = components['schemas']['GradedItem']
type GeneratedGradingBreakdown = components['schemas']['GradingBreakdown']
type GeneratedActivityProgressCell = components['schemas']['ActivityProgressCell']
type GeneratedCourseGradebookResponse = components['schemas']['CourseGradebookResponse']
type GeneratedSubmissionListResponse = components['schemas']['SubmissionListResponse']

export type SubmissionStatus = components['schemas']['SubmissionStatus']
export type AssessmentType = components['schemas']['AssessmentType']
export interface GradedItem extends Omit<GeneratedGradedItem, 'max_score'> {
  max_score: number
}
export interface GradingBreakdown extends Omit<GeneratedGradingBreakdown, 'items'> {
  items?: GradedItem[]
}
export interface Submission extends Omit<
  GeneratedSubmission,
  'grading_json' | 'status' | 'is_late' | 'attempt_number'
> {
  grading_json?: GradingBreakdown
  status: SubmissionStatus
  is_late: boolean
  attempt_number: number
  user?: SubmissionUser | null
  user_id: number
}
export type SubmissionUser = components['schemas']['SubmissionUser']
export interface SubmissionsPage extends Omit<GeneratedSubmissionListResponse, 'items'> {
  items: Submission[]
}
export type SubmissionStats = components['schemas']['SubmissionStats']
export type ItemFeedback = components['schemas']['ItemFeedback']
export type TeacherGradeInput = components['schemas']['TeacherGradeInput']
export type BatchGradeItem = components['schemas']['BatchGradeItem']
export type BatchGradeRequest = components['schemas']['BatchGradeRequest']
export type BatchGradeResultItem = components['schemas']['BatchGradeResultItem']
export type BatchGradeResponse = components['schemas']['BatchGradeResponse']
export type ActivityProgressState = components['schemas']['ActivityProgressState']
export interface ActivityProgressCell extends Omit<
  GeneratedActivityProgressCell,
  'attempt_count' | 'is_late' | 'teacher_action_required'
> {
  attempt_count: number
  is_late: boolean
  teacher_action_required: boolean
}
export interface CourseGradebookResponse extends Omit<GeneratedCourseGradebookResponse, 'cells'> {
  cells: ActivityProgressCell[]
}
export type GradebookActivity = components['schemas']['GradebookActivity']
export type GradebookStudent = components['schemas']['GradebookStudent']
export type GradebookSummary = components['schemas']['GradebookSummary']
export type TeacherAction = components['schemas']['TeacherAction']

export function normalizeSubmission(
  submission: Partial<GeneratedSubmission> | Partial<Submission> | null | undefined,
): Submission {
  const normalized = submission ?? {
    activity_id: 0,
    assessment_type: 'manual_assessment' as AssessmentType,
    created_at: '',
    id: 0,
    submission_uuid: '',
    updated_at: '',
    user_id: 0,
  }

  const gradingJson = normalized.grading_json
    ? ({
        ...normalized.grading_json,
        ...(normalized.grading_json.items ? { items: normalized.grading_json.items.map(normalizeGradedItem) } : {}),
      } as GradingBreakdown)
    : undefined

  const normalizedSubmission: Submission = {
    ...(normalized as Partial<Submission>),
    ...(gradingJson !== undefined ? { grading_json: gradingJson } : {}),
    activity_id: normalized.activity_id ?? 0,
    assessment_type: normalized.assessment_type ?? ('manual_assessment' as AssessmentType),
    created_at: normalized.created_at ?? '',
    id: normalized.id ?? 0,
    submission_uuid: normalized.submission_uuid ?? '',
    updated_at: normalized.updated_at ?? '',
    user_id: normalized.user_id ?? 0,
    status: normalized.status ?? 'PENDING',
    is_late: normalized.is_late ?? false,
    attempt_number: normalized.attempt_number ?? 0,
  }

  return normalizedSubmission
}

export function normalizeActivityProgressCell(
  cell: Partial<GeneratedActivityProgressCell> | Partial<ActivityProgressCell> | null | undefined,
): ActivityProgressCell {
  const normalized = cell ?? {
    activity_id: 0,
    state: 'NOT_STARTED' as ActivityProgressState,
    user_id: 0,
  }

  const normalizedCell: ActivityProgressCell = {
    ...(normalized as Partial<ActivityProgressCell>),
    activity_id: normalized.activity_id ?? 0,
    state: normalized.state ?? 'NOT_STARTED',
    user_id: normalized.user_id ?? 0,
    attempt_count: normalized.attempt_count ?? 0,
    is_late: normalized.is_late ?? false,
    teacher_action_required: normalized.teacher_action_required ?? false,
  }

  return normalizedCell
}

export function normalizeGradedItem(item: GeneratedGradedItem | GradedItem | null | undefined): GradedItem {
  return {
    ...(item ?? { item_id: '', max_score: 0 }),
    max_score: item?.max_score ?? 0,
  }
}

export function normalizeCourseGradebookResponse(
  data: GeneratedCourseGradebookResponse | CourseGradebookResponse | null | undefined,
): CourseGradebookResponse {
  if (!data) {
    return {
      course_id: 0,
      course_name: '',
      course_uuid: '',
      cells: [],
      activities: [],
      students: [],
      summary: {
        activity_count: 0,
        completed_count: 0,
        needs_grading_count: 0,
        not_started_count: 0,
        overdue_count: 0,
        student_count: 0,
      },
      teacher_actions: [],
    }
  }

  return {
    ...data,
    cells: (data.cells ?? []).map(normalizeActivityProgressCell),
  }
}

export function normalizeSubmissionsPage(
  data: GeneratedSubmissionListResponse | SubmissionsPage | null | undefined,
): SubmissionsPage {
  if (!data) {
    return {
      items: [],
      page: 1,
      page_size: 25,
      pages: 1,
      total: 0,
    }
  }

  return {
    ...data,
    items: (data.items ?? []).map(normalizeSubmission),
    page: data.page ?? 1,
    page_size: data.page_size ?? 25,
    pages: data.pages ?? 1,
    total: data.total ?? 0,
  }
}

export type ReleaseState = 'HIDDEN' | 'AWAITING_RELEASE' | 'VISIBLE' | 'RETURNED_FOR_REVISION'

export interface CodeRunRecord {
  run_id: string
  language_id: number
  status?: string
  passed?: number
  total?: number
  score?: number | null
  stdout?: string | null
  stderr?: string | null
  time?: number | null
  memory?: number | null
  details?: unknown[]
  created_at?: string | null
}

export interface AntiCheatViolation {
  kind: string
  occurred_at: string
  count?: number
}

export interface PlagiarismScore {
  score: number
  checked_at: string
  flagged?: boolean
  details?: Record<string, unknown>
}

export type PlagiarismCheckStatus = 'pending' | 'checking' | 'complete' | 'failed'

export interface PlagiarismState {
  status: PlagiarismCheckStatus
  score: number | null
  flagged: boolean
  error: string | null
}

export interface SubmissionMetadata {
  latest_run?: CodeRunRecord | null
  runs?: CodeRunRecord[]
  violations?: AntiCheatViolation[]
  plagiarism?: PlagiarismScore | null
  plagiarism_status?: PlagiarismCheckStatus | string | null
  plagiarism_error?: string | null
  [key: string]: unknown
}

export function getSubmissionMetadata(submission: { metadata_json?: unknown }): SubmissionMetadata {
  const raw = submission.metadata_json
  return raw && typeof raw === 'object' ? (raw as SubmissionMetadata) : {}
}

export function getSubmissionViolations(submission: { metadata_json?: unknown }): AntiCheatViolation[] {
  const { violations } = getSubmissionMetadata(submission)
  return Array.isArray(violations) ? violations : []
}

export function getSubmissionPlagiarismState(submission: { metadata_json?: unknown }): PlagiarismState {
  const metadata = getSubmissionMetadata(submission)
  const status = metadata.plagiarism_status
  const plagiarism = metadata.plagiarism ?? null

  if (status === 'failed') {
    return {
      status: 'failed',
      score: plagiarism?.score ?? null,
      flagged: Boolean(plagiarism?.flagged),
      error: metadata.plagiarism_error ?? 'Plagiarism check failed',
    }
  }

  if (status === 'checking') {
    return {
      status: 'checking',
      score: plagiarism?.score ?? null,
      flagged: Boolean(plagiarism?.flagged),
      error: null,
    }
  }

  if (plagiarism) {
    return {
      status: 'complete',
      score: plagiarism.score,
      flagged: Boolean(plagiarism.flagged),
      error: null,
    }
  }

  return {
    status: 'pending',
    score: null,
    flagged: false,
    error: null,
  }
}

export interface SubmissionReviewViewModel {
  surface: 'SUBMISSION_REVIEW'
  submission: Submission
  displayName: string
  releaseState: ReleaseState
  scoreLabel: string
  isLate: boolean
  needsTeacherAction: boolean
  canTeacherEdit: boolean
  canPublish: boolean
  canReturn: boolean
}
