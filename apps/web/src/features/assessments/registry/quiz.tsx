/**
 * Registry module for TYPE_QUIZ.
 *
 * Quiz authoring is constrained to canonical auto-gradable item kinds so the
 * shared studio/attempt shells can run without dropping students into a null
 * route.
 */

import type { ComponentType } from 'react';
import { registerKind } from './index';
import type { KindAuthorProps, KindAttemptProps, KindReviewProps } from './index';

registerKind('TYPE_QUIZ', async () => {
  const [
    { NativeItemStudioProvider, NativeItemOutline, NativeItemAuthor },
    { default: AssignmentAttemptContent },
    { default: GradingReviewWorkspace },
  ] = await Promise.all([
    import('@/features/assessments/studio/NativeItemStudio'),
    import('./assignment-attempt'),
    import('@/features/grading/review/GradingReviewWorkspace'),
  ]);

  const OutlineSlot: ComponentType<KindAuthorProps> = (_props) => (
    <NativeItemOutline
      allowedKinds={['CHOICE', 'MATCHING']}
      itemNoun="Question"
    />
  );

  const AuthorSlot: ComponentType<KindAuthorProps> = (_props) => (
    <NativeItemAuthor
      mode="assignment"
      itemNoun="Question"
    />
  );

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
    Provider: NativeItemStudioProvider,
    Outline: OutlineSlot,
    Author: AuthorSlot,
    Attempt: AssignmentAttemptContent as ComponentType<KindAttemptProps>,
    Review: ReviewPassthrough,
  };
});
