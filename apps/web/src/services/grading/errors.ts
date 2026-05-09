import type { Submission } from '@/features/grading/domain/types';

export class StaleGradeError extends Error {
  public override readonly name = 'StaleGradeError';
  public readonly serverSubmission: Submission;

  public constructor(serverSubmission: Submission) {
    super('Grade was updated by another session. Review the latest values before saving.');
    this.serverSubmission = serverSubmission;
  }
}
