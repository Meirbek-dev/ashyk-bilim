/**
 * TYPE_ASSIGNMENT kind module registration.
 *
 * Replaces the old assignment-author.tsx passthrough.
 * All three studio slots (Outline, Author, Inspector) are provided,
 * and a Provider wraps them to share state via AssignmentStudioContext.
 *
 * Shell contract: docs/ASSESSMENT_SHELL_CONTRACT.md
 */

import type { ComponentType, ReactNode } from 'react';
import { registerKind } from '../index';
import type { KindAuthorProps, KindAttemptProps, KindReviewProps } from '../index';

registerKind('TYPE_ASSIGNMENT', async () => {
  const [
    { AssignmentStudioProvider },
    { default: AssignmentTaskOutline },
    { default: AssignmentTaskEditor },
    { default: AssignmentInspector },
    { default: AssignmentAttemptContent },
    { default: GradingReviewWorkspace },
  ] = await Promise.all([
    import('./AssignmentStudioContext'),
    import('./AssignmentTaskOutline'),
    import('./AssignmentTaskEditor'),
    import('./AssignmentInspector'),
    import('./AssignmentAttemptContent'),
    import('@/features/grading/review/GradingReviewWorkspace'),
  ]);

  const Provider: ComponentType<KindAuthorProps & { children: ReactNode }> = ({
    activityUuid,
    courseUuid,
    children,
  }) => (
    <AssignmentStudioProvider
      activityUuid={activityUuid}
      courseUuid={courseUuid}
    >
      {children}
    </AssignmentStudioProvider>
  );

  const ReviewPassthrough: ComponentType<KindReviewProps> = ({ activityId, submissionUuid, title }) =>
    GradingReviewWorkspace({ activityId, initialSubmissionUuid: submissionUuid ?? null, title });

  return {
    label: 'Assignment',
    iconName: 'ClipboardList',
    Provider,
    Outline: AssignmentTaskOutline,
    Author: AssignmentTaskEditor,
    Inspector: AssignmentInspector,
    Attempt: AssignmentAttemptContent as ComponentType<KindAttemptProps>,
    Review: ReviewPassthrough,
  };
});
