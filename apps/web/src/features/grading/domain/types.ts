import type { components } from '@/lib/api/generated/schema';

export type SubmissionStatus = components['schemas']['SubmissionStatus'];
export type AssessmentType = components['schemas']['AssessmentType'];
export type GradedItem = components['schemas']['GradedItem'];
export type GradingBreakdown = components['schemas']['GradingBreakdown'];
export type Submission = components['schemas']['SubmissionRead'] | components['schemas']['TeacherSubmissionRead'];
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

export interface CodeRunRecord {
  run_id: string;
  language_id: number;
  status?: string;
  passed?: number;
  total?: number;
  score?: number | null;
  stdout?: string | null;
  stderr?: string | null;
  time?: number | null;
  memory?: number | null;
  details?: unknown[];
  created_at?: string | null;
}

export interface AntiCheatViolation {
  kind: string;
  occurred_at: string;
  count?: number;
}

export interface PlagiarismScore {
  score: number;
  checked_at: string;
  flagged?: boolean;
  details?: Record<string, unknown>;
}

export type PlagiarismCheckStatus = 'pending' | 'checking' | 'complete' | 'failed';

export interface PlagiarismState {
  status: PlagiarismCheckStatus;
  score: number | null;
  flagged: boolean;
  error: string | null;
}

export interface SubmissionMetadata {
  latest_run?: CodeRunRecord | null;
  runs?: CodeRunRecord[];
  violations?: AntiCheatViolation[];
  plagiarism?: PlagiarismScore | null;
  plagiarism_status?: PlagiarismCheckStatus | string | null;
  plagiarism_error?: string | null;
  [key: string]: unknown;
}

export function getSubmissionMetadata(submission: Pick<Submission, 'metadata_json'>): SubmissionMetadata {
  const raw = submission.metadata_json;
  return raw && typeof raw === 'object' ? raw : {};
}

export function getSubmissionViolations(submission: Pick<Submission, 'metadata_json'>): AntiCheatViolation[] {
  const { violations } = getSubmissionMetadata(submission);
  return Array.isArray(violations) ? violations : [];
}

export function getSubmissionPlagiarismState(submission: Pick<Submission, 'metadata_json'>): PlagiarismState {
  const metadata = getSubmissionMetadata(submission);
  const status = metadata.plagiarism_status;
  const plagiarism = metadata.plagiarism ?? null;

  if (status === 'failed') {
    return {
      status: 'failed',
      score: plagiarism?.score ?? null,
      flagged: Boolean(plagiarism?.flagged),
      error: metadata.plagiarism_error ?? 'Plagiarism check failed',
    };
  }

  if (status === 'checking') {
    return {
      status: 'checking',
      score: plagiarism?.score ?? null,
      flagged: Boolean(plagiarism?.flagged),
      error: null,
    };
  }

  if (plagiarism) {
    return {
      status: 'complete',
      score: plagiarism.score,
      flagged: Boolean(plagiarism.flagged),
      error: null,
    };
  }

  return {
    status: 'pending',
    score: null,
    flagged: false,
    error: null,
  };
}

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
