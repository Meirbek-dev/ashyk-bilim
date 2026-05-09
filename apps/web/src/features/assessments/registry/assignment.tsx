/**
 * Registry module for TYPE_ASSIGNMENT.
 *
 * Studio uses the shared NativeItemStudio surface (unified item-registry-based
 * approach); per-kind variation comes from the items registry, not a bespoke
 * kind-specific shell.
 */

import type { ComponentType } from 'react';
import { registerKind } from './index';
import type { KindAttemptProps, KindAuthorProps, KindReviewProps } from './index';

registerKind('TYPE_ASSIGNMENT', async () => {
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
      allowedKinds={['CHOICE', 'OPEN_TEXT', 'FILE_UPLOAD', 'FORM', 'MATCHING']}
      itemNoun="Task"
    />
  );

  const AuthorSlot: ComponentType<KindAuthorProps> = (_props) => (
    <NativeItemAuthor
      mode="assignment"
      itemNoun="Task"
    />
  );

  const ReviewPassthrough: ComponentType<KindReviewProps> = ({ activityId, submissionUuid, title }) =>
    GradingReviewWorkspace({ activityId, initialSubmissionUuid: submissionUuid ?? null, title });

  return {
    label: 'Assignment',
    iconName: 'BookOpen',
    Provider: NativeItemStudioProvider,
    Outline: OutlineSlot,
    Author: AuthorSlot,
    Attempt: AssignmentAttemptContent as ComponentType<KindAttemptProps>,
    Review: ReviewPassthrough,
  };
});
