/**
 * Registry module for TYPE_CUSTOM-backed quiz assessments.
 *
 * Quiz authoring uses the custom activity shell now that the legacy quiz
 * activity type has been removed.
 */

import type { ComponentType } from 'react';
import { registerKind } from './index';
import type { KindAuthorProps, KindAttemptProps, KindReviewProps } from './index';

registerKind('TYPE_CUSTOM', async () => {
  const [
    { NativeItemStudioProvider, NativeItemOutline, NativeItemAuthor },
    { default: FileSubmissionAttemptContent },
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
      itemNounKey="question"
    />
  );

  const AuthorSlot: ComponentType<KindAuthorProps> = (_props) => (
    <NativeItemAuthor
      mode="assignment"
      itemNoun="Question"
      itemNounKey="question"
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
    Attempt: FileSubmissionAttemptContent as ComponentType<KindAttemptProps>,
    Review: ReviewPassthrough,
  };
});