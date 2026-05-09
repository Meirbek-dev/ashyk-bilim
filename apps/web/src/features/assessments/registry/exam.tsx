/**
 * Registry module for TYPE_EXAM.
 */

import type { ComponentType } from 'react';
import { registerKind } from './index';
import type { KindAttemptProps, KindAuthorProps, KindReviewProps } from './index';

registerKind('TYPE_EXAM', async () => {
  const [
    { NativeItemStudioProvider, NativeItemOutline, NativeItemAuthor },
    { default: GradingReviewWorkspace },
    { default: ExamReviewDetail },
    { default: ExamAttemptContent },
  ] = await Promise.all([
    import('@/features/assessments/studio/NativeItemStudio'),
    import('@/features/grading/review/GradingReviewWorkspace'),
    import('./exam-review-detail'),
    import('./exam/ExamAttemptContent'),
  ]);

  const OutlineSlot: ComponentType<KindAuthorProps> = (_props) => (
    <NativeItemOutline
      allowedKinds={['CHOICE', 'MATCHING']}
      itemNoun="Question"
    />
  );

  const AuthorSlot: ComponentType<KindAuthorProps> = (_props) => (
    <NativeItemAuthor
      mode="exam"
      itemNoun="Question"
    />
  );

  const ReviewPassthrough: ComponentType<KindReviewProps> = ({ activityId, submissionUuid, title }) => {
    return GradingReviewWorkspace({ activityId, initialSubmissionUuid: submissionUuid ?? null, title });
  };

  return {
    label: 'Exam',
    iconName: 'GraduationCap',
    Provider: NativeItemStudioProvider,
    Outline: OutlineSlot,
    Author: AuthorSlot,
    Attempt: ExamAttemptContent as ComponentType<KindAttemptProps>,
    Review: ReviewPassthrough,
    ReviewDetail: ExamReviewDetail,
  };
});
