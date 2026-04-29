import type { components } from '@/lib/api/generated/schema';

export type SubmissionStatus = components['schemas']['src__db__grading__submissions__SubmissionStatus'];
export type AssessmentType = components['schemas']['AssessmentType'];
export type GradedItem = components['schemas']['GradedItem'];
export type GradingBreakdown = components['schemas']['GradingBreakdown'];
export type Submission = components['schemas']['SubmissionRead'];
export type SubmissionUser = components['schemas']['SubmissionUser'];
export type SubmissionsPage = components['schemas']['SubmissionListResponse'];
export type SubmissionStats = components['schemas']['SubmissionStats'];
export type ItemFeedback = components['schemas']['ItemFeedback'];
export type TeacherGradeInput = components['schemas']['TeacherGradeInput'];
export type BatchGradeItem = components['schemas']['BatchGradeItem'];
export type BatchGradeRequest = components['schemas']['BatchGradeRequest'];
export type BatchGradeResultItem = components['schemas']['BatchGradeResultItem'];
export type BatchGradeResponse = components['schemas']['BatchGradeResponse'];
export type ActivityProgressState = components['schemas']['ActivityProgressState'];
export type ActivityProgressCell = components['schemas']['ActivityProgressCell'];
export type CourseGradebookResponse = components['schemas']['CourseGradebookResponse'];
export type GradebookActivity = components['schemas']['GradebookActivity'];
export type GradebookStudent = components['schemas']['GradebookStudent'];
export type GradebookSummary = components['schemas']['GradebookSummary'];
export type TeacherAction = components['schemas']['TeacherAction'];

export type ReleaseState = 'HIDDEN' | 'AWAITING_RELEASE' | 'VISIBLE' | 'RETURNED_FOR_REVISION';

export interface SubmissionReviewViewModel {
  surface: 'SUBMISSION_REVIEW';
  submission: Submission;
  displayName: string;
  releaseState: ReleaseState;
  scoreLabel: string;
  isLate: boolean;
  needsTeacherAction: boolean;
  canTeacherEdit: boolean;
  canPublish: boolean;
  canReturn: boolean;
}
