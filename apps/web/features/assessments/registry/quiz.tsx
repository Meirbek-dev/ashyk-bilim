/**
 * Phase 2 registration for TYPE_QUIZ.
 *
 * Quiz attempts already project to Submission; until the quiz author/attempt
 * surfaces move into the shared shells, review uses the generic submitted
 * answer panel from GradingReviewWorkspace.
 *
 * Shell contract: docs/ASSESSMENT_SHELL_CONTRACT.md
 */

import type { ComponentType } from 'react';
import { registerKind } from './index';
import type { KindAuthorProps, KindAttemptProps, KindReviewProps } from './index';

registerKind('TYPE_QUIZ', async () => {
  const [{ default: GradingReviewWorkspace }] = await Promise.all([
    import('@/features/grading/review/GradingReviewWorkspace'),
  ]);

  const AuthorPassthrough: ComponentType<KindAuthorProps> = () => null;
  const AttemptPassthrough: ComponentType<KindAttemptProps> = () => null;

  const ReviewPassthrough: ComponentType<KindReviewProps> = ({ activityId, submissionUuid, title }) => {
    return (
      <GradingReviewWorkspace
        activityId={activityId}
        initialSubmissionUuid={submissionUuid ?? null}
        title={title}
      />
    );
  };

  return {
    label: 'Quiz',
    iconName: 'ListChecks',
    Author: AuthorPassthrough,
    Attempt: AttemptPassthrough,
    Review: ReviewPassthrough,
  };
});
