/**
 * Phase 1 passthrough registration for TYPE_EXAM.
 *
 * Author → wraps the existing in-activity manage tab (ExamActivity with manage phase).
 *          Phase 3 will move this to the shared StudioShell.
 * Attempt → renders the exam attempt content slot.
 * Review → wraps GradingReviewWorkspace (same as assignment kind).
 *          Phase 2 wires exam attempts into the Submission table so this works.
 *
 * Shell contract: docs/ASSESSMENT_SHELL_CONTRACT.md
 */

import type { ComponentType } from 'react';
import { registerKind } from './index';
import type { KindAttemptProps, KindReviewProps } from './index';

registerKind('TYPE_EXAM', async () => {
  const [
    { default: GradingReviewWorkspace },
    { default: ExamReviewDetail },
    { default: ExamAuthor },
    { default: ExamAttemptContent },
  ] = await Promise.all([
    import('@/features/grading/review/GradingReviewWorkspace'),
    import('./exam-review-detail'),
    import('./exam-author'),
    import('./exam/ExamAttemptContent'),
  ]);

  /**
   * Phase 2 target: once ExamAttempt rows are projected to Submission, this
   * will work identically to the assignment Review passthrough.
   * Phase 1: renders the workspace but exam submissions may not appear until
   * the backend projection lands.
   */
  const ReviewPassthrough: ComponentType<KindReviewProps> = ({ activityId, submissionUuid, title }) => {
    return GradingReviewWorkspace({ activityId, initialSubmissionUuid: submissionUuid ?? null, title });
  };

  return {
    label: 'Exam',
    iconName: 'GraduationCap',
    Author: ExamAuthor,
    Attempt: ExamAttemptContent as ComponentType<KindAttemptProps>,
    Review: ReviewPassthrough,
    ReviewDetail: ExamReviewDetail,
  };
});
