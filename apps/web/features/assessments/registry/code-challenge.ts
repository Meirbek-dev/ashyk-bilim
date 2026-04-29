/**
 * Phase 1 passthrough registration for TYPE_CODE_CHALLENGE.
 *
 * Author → wraps CodeChallengeConfigEditor (currently mounted inline by ActivityClient).
 *          Phase 3 will move it to the shared StudioShell.
 * Attempt → wraps CodeChallengeActivity.
 *           Phase 4 will move it to the shared AttemptShell.
 * Review → wraps GradingReviewWorkspace.
 *          Phase 2 ensures code challenge submissions route through Submission.
 */

import type { ComponentType } from 'react';
import { registerKind, type KindAuthorProps, type KindAttemptProps, type KindReviewProps } from './index';

registerKind('TYPE_CODE_CHALLENGE', async () => {
  const [{ default: GradingReviewWorkspace }] = await Promise.all([
    import('@/features/grading/review/GradingReviewWorkspace'),
  ]);

  /**
   * Phase 1 stub. Code-challenge configuration is currently done via inline
   * settings panels rendered by ActivityClient. Until Phase 3, the teacher
   * edits settings within the student-facing activity URL.
   */
  const AuthorPassthrough: ComponentType<KindAuthorProps> = () => null;

  /**
   * Phase 1 stub. CodeChallengeActivity is mounted by ActivityClient directly.
   */
  const AttemptPassthrough: ComponentType<KindAttemptProps> = () => null;

  const ReviewPassthrough: ComponentType<KindReviewProps> = ({ activityId, submissionUuid, title }) => {
    return GradingReviewWorkspace({ activityId, initialSubmissionUuid: submissionUuid ?? null, title });
  };

  return {
    label: 'Code Challenge',
    iconName: 'Code2',
    Author: AuthorPassthrough,
    Attempt: AttemptPassthrough,
    Review: ReviewPassthrough,
  };
});
