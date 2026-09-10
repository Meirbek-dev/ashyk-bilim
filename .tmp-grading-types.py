from pathlib import Path
p = Path('apps/web/src/features/grading/domain/types.ts')
s = p.read_text()
head = '''import type { GradedItem as WireGradedItem, GradingBreakdown as WireGradingBreakdown, Stats, UserSummary } from '@/lib/api/generated/zod'
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
export interface TeacherGradeInput {
  status: 'GRADED' | 'PUBLISHED' | 'RETURNED'
  final_score?: number | null
  feedback?: string
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

'''
p.write_text(head + s[s.index('export type ReleaseState'):])
for name in ['apps/web/src/features/grading/domain/gradebook.ts', 'apps/web/src/features/grading/gradebook/CourseGradebookCommandCenter.tsx']:
 p = Path(name); s = p.read_text().replace('userId: number', 'userId: string').replace('activityId: number', 'activityId: string').replace('Map<number,', 'Map<string,'); p.write_text(s)
p = Path('apps/web/src/types/grading.ts'); s=p.read_text()
for name in ['BatchGradeItem','BatchGradeRequest','BatchGradeResponse','ItemFeedback']:
 s=s.replace('  '+name+',\n','')
p.write_text(s)
