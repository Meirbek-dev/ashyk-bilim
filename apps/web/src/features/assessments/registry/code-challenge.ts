/**
 * Registry module for TYPE_CODE_CHALLENGE.
 */

import type { ComponentType } from 'react'
import type { KindAttemptProps, KindReviewProps, KindModule } from './index'

export const codeChallengeModuleFactory = async (): Promise<KindModule> => {
  const [
    { default: GradingReviewWorkspace },
    { default: CodeChallengeAuthor },
    { default: CodeChallengeAttemptContent },
  ] = await Promise.all([
    import('@/features/grading/review/GradingReviewWorkspace'),
    import('./code-challenge-author'),
    import('./code-challenge/CodeChallengeAttemptContent'),
  ])

  const ReviewPassthrough: ComponentType<KindReviewProps> = ({ activityId, submissionUuid, title }) => {
    return GradingReviewWorkspace({
      activityId,
      initialSubmissionUuid: submissionUuid ?? null,
      ...(title !== undefined ? { title } : {}),
    })
  }

  return {
    label: 'Code Challenge',
    iconName: 'Code2',
    Author: CodeChallengeAuthor,
    Attempt: CodeChallengeAttemptContent as ComponentType<KindAttemptProps>,
    Review: ReviewPassthrough,
  }
}
