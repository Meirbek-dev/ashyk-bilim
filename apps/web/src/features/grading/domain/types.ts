import type { GradedItem as WireGradedItem, GradingBreakdown as WireGradingBreakdown, Stats, UserSummary } from '@/lib/api/generated/zod'
import type { ActivityProgressCell as ProgressCell, ActivityProgressState } from '@/features/assessments/domain/progress'
import type { SubmissionStatus } from '@/features/assessments/domain/submission-status'
export type { ActivityProgressState, SubmissionStatus }

// Display projections only. HTTP responses are parsed and converted in wire.ts.
export type AssessmentType = 'manual_assessment' | 'quiz' | 'exam' | 'code_challenge'
export type GradedItem = WireGradedItem
export type GradingBreakdown = WireGradingBreakdown
export interface SubmissionUser extends UserSummary {
  first_name?: string
  middle_name?: string
  last_name?: string
}
export interface Submission {
  id: string
  submission_uuid: string
  assessment_id?: string
  activity_id: string
  assessment_type: AssessmentType
  user_id: string
  user?: SubmissionUser | null
  status: SubmissionStatus
  release_state?: string
  grading_json?: GradingBreakdown
  answers_json?: unknown
  metadata_json?: unknown
  attempt_number: number
  is_late: boolean
  auto_score?: number | null
  final_score?: number | null
  version?: number
  started_at?: string | null
  submitted_at?: string | null
  graded_at?: string | null
  created_at: string
  updated_at: string
}
export interface SubmissionsPage {
  items: Submission[]
  page: number
  page_size: number
  pages: number
  total: number
}
export interface SubmissionStats extends Stats { needs_grading_count: number }
export interface TeacherItemGradeInput {
  item_id: string
  score?: number | null
  feedback?: string
}
export interface TeacherGradeInput {
  status: 'GRADED' | 'PUBLISHED' | 'RETURNED'
  final_score?: number | null
  feedback?: string
  /** Per-item scores, wired to `PATCH /submissions/{id}/grade`'s `item_grades`. */
  item_grades?: TeacherItemGradeInput[]
}
export interface ActivityProgressCell extends ProgressCell {
  attempt_count: number
  is_late: boolean
  teacher_action_required: boolean
}
export interface GradebookActivity {
  id: string
  activity_uuid: string
  name: string
  activity_type: string
  assessment_type?: string | null
}
export type GradebookStudent = SubmissionUser
export interface GradebookSummary {
  activity_count: number
  completed_count: number
  needs_grading_count: number
  not_started_count: number
  overdue_count: number
  student_count: number
}
export interface TeacherAction {
  activity_id: string
  activity_name: string
  user_id: string
  student_name: string
  submission_uuid: string
}
export interface CourseGradebookResponse {
  course_id: string
  course_uuid: string
  course_name: string
  cells: ActivityProgressCell[]
  activities: GradebookActivity[]
  students: GradebookStudent[]
  summary: GradebookSummary
  teacher_actions: TeacherAction[]
  page_info?: {
    page: number
    page_size: number
    total_students: number
    total_activities: number
    activity_types: string[]
    has_previous: boolean
    has_next: boolean
  }
}

export function normalizeSubmission(value: Partial<Submission> | null | undefined): Submission {
  return {
    activity_id: '', assessment_type: 'manual_assessment', created_at: '', id: '',
    submission_uuid: '', updated_at: '', user_id: '', status: 'PENDING',
    is_late: false, attempt_number: 0, ...value,
  }
}

export function normalizeActivityProgressCell(value: Partial<ActivityProgressCell> | null | undefined): ActivityProgressCell {
  return {
    activity_id: '', user_id: '', state: 'NOT_STARTED', attempt_count: 0,
    is_late: false, teacher_action_required: false, ...value,
  }
}

export function normalizeGradedItem(item: GradedItem | null | undefined): GradedItem {
  return item ?? { item_id: '', max_score: 0, score: 0 }
}

export function normalizeCourseGradebookResponse(data: CourseGradebookResponse): CourseGradebookResponse {
  return { ...data, cells: data.cells.map(normalizeActivityProgressCell) }
}

export function normalizeSubmissionsPage(data: SubmissionsPage): SubmissionsPage {
  return { ...data, items: data.items.map(normalizeSubmission) }
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
