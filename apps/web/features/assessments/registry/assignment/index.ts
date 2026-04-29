/**
 * TYPE_ASSIGNMENT kind module registration.
 *
 * Replaces the old assignment-author.tsx passthrough.
 * All three studio slots (Outline, Author, Inspector) are provided,
 * and a Provider wraps them to share state via AssignmentStudioContext.
 */

import type { ComponentType, ReactNode } from 'react';
import { registerKind, type KindAuthorProps, type KindAttemptProps, type KindReviewProps } from '../index';

registerKind('TYPE_ASSIGNMENT', async () => {
  const [
    { AssignmentStudioProvider },
    { default: AssignmentTaskOutline },
    { default: AssignmentTaskEditor },
    { default: AssignmentInspector },
    { default: StudentAssignmentActivity },
    { default: GradingReviewWorkspace },
  ] = await Promise.all([
    import('./AssignmentStudioContext'),
    import('./AssignmentTaskOutline'),
    import('./AssignmentTaskEditor'),
    import('./AssignmentInspector'),
    import('@/features/assignments/student/StudentAssignmentActivity'),
    import('@/features/grading/review/GradingReviewWorkspace'),
  ]);

  const Provider: ComponentType<KindAuthorProps & { children: ReactNode }> = ({ activityUuid, courseUuid, children }) => (
    <AssignmentStudioProvider activityUuid={activityUuid} courseUuid={courseUuid}>
      {children}
    </AssignmentStudioProvider>
  );

  const AttemptPassthrough: ComponentType<KindAttemptProps> = ({ activityUuid }) => (
    <StudentAssignmentActivity activityUuid={activityUuid} />
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
    Attempt: AttemptPassthrough,
    Review: ReviewPassthrough,
  };
});
