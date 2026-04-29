import type { components } from '@/lib/api/generated/schema';
import type { Submission } from '@/features/grading/domain';

export type AssignmentRead = components['schemas']['AssignmentRead'];
export type AssignmentStatus = components['schemas']['AssignmentStatus'];
export type AssignmentTaskType = components['schemas']['AssignmentTaskTypeEnum'];
export type AssignmentTaskAnswer = components['schemas']['AssignmentTaskAnswer'];
export type AssignmentDraftPatch = components['schemas']['AssignmentDraftPatch'];
export type AssignmentDraftRead = components['schemas']['AssignmentDraftRead'];
export type AssignmentCreateWithActivity = components['schemas']['AssignmentCreateWithActivity'];
export type AssignmentUpdate = components['schemas']['AssignmentUpdate'];

export type AssignmentSurface = 'ASSIGNMENT_STUDIO' | 'SUBMISSION_REVIEW' | 'STUDENT_ATTEMPT';

export interface AssignmentTaskRead {
  id: number;
  assignment_task_uuid: string;
  assignment_type: AssignmentTaskType;
  title: string;
  description: string;
  hint?: string | null;
  reference_file?: string | null;
  max_grade_value: number;
  contents?: Record<string, unknown> | null;
  order?: number | null;
}

export interface AssignmentStudioViewModel {
  surface: 'ASSIGNMENT_STUDIO';
  assignment: AssignmentRead;
  tasks: AssignmentTaskRead[];
  lifecycle: AssignmentStatus;
  totalPoints: number;
  isEditable: boolean;
  canPublish: boolean;
  canSchedule: boolean;
  canArchive: boolean;
  validationIssues: AssignmentValidationIssue[];
}

export interface StudentAttemptViewModel {
  surface: 'STUDENT_ATTEMPT';
  assignment: AssignmentRead;
  tasks: AssignmentTaskRead[];
  submission: Submission | null;
  totalPoints: number;
  canSaveDraft: boolean;
  canSubmit: boolean;
  canResubmit: boolean;
  resultVisible: boolean;
}

export interface AssignmentValidationIssue {
  code: 'MISSING_TITLE' | 'NO_TASKS' | 'TASK_MISSING_TITLE' | 'TASK_ZERO_POINTS' | 'TASK_MISSING_CONTENT';
  message: string;
  taskUuid?: string;
}
