/**
 * Phase 1 passthrough registration for TYPE_CODE_CHALLENGE.
 *
 * Author → renders registry/code-challenge/CodeChallengeStudio inside the shared Studio shell.
 * Attempt → renders the code challenge attempt content slot.
 * Review → wraps GradingReviewWorkspace.
 *          Phase 2 ensures code challenge submissions route through Submission.
 *
 * Shell contract: docs/ASSESSMENT_SHELL_CONTRACT.md
 */

import type { ComponentType } from 'react';
import { registerKind } from './index';
import type { KindAttemptProps, KindReviewProps } from './index';

registerKind('TYPE_CODE_CHALLENGE', async () => {
  const [
    { default: GradingReviewWorkspace },
    { default: CodeChallengeAuthor },
    { default: CodeChallengeAttemptContent },
  ] = await Promise.all([
    import('@/features/grading/review/GradingReviewWorkspace'),
    import('./code-challenge-author'),
    import('./code-challenge/CodeChallengeAttemptContent'),
  ]);

  const ReviewPassthrough: ComponentType<KindReviewProps> = ({ activityId, submissionUuid, title }) => {
    return GradingReviewWorkspace({ activityId, initialSubmissionUuid: submissionUuid ?? null, title });
  };

  return {
    label: 'Code Challenge',
    iconName: 'Code2',
    Author: CodeChallengeAuthor,
    Attempt: CodeChallengeAttemptContent as ComponentType<KindAttemptProps>,
    Review: ReviewPassthrough,
  };
});
