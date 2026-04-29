/**
 * Phase 1 passthrough registration for TYPE_ASSIGNMENT.
 *
 * Author → wraps existing AssignmentStudioRoute
 * Attempt → wraps existing StudentAssignmentActivity
 * Review → wraps existing GradingReviewWorkspace
 *
 * Phase 3 will replace Author with the shared StudioShell + assignment content panel.
 * Phase 4 will replace Attempt with the shared AttemptShell + assignment content panel.
 */

import type { ComponentType } from 'react';
import { registerKind, type KindAuthorProps, type KindAttemptProps, type KindReviewProps } from './index';

registerKind('TYPE_ASSIGNMENT', async () => {
  const [
    { default: AssignmentStudioRoute },
    { default: StudentAssignmentActivity },
    { default: GradingReviewWorkspace },
  ] = await Promise.all([
    import('@/features/assignments/studio/AssignmentStudioShell'),
    import('@/features/assignments/student/StudentAssignmentActivity'),
    import('@/features/grading/review/GradingReviewWorkspace'),
  ]);

  /**
   * Phase 1 shim: AssignmentStudioRoute expects `assignmentUuid` (without prefix),
   * but the registry passes `activityUuid`. We derive the assignment UUID from
   * the activity UUID by delegating to the existing route which internally
   * uses AssignmentProvider.
   *
   * Phase 3 will replace this with the shared StudioShell.
   */
  const AuthorPassthrough: ComponentType<KindAuthorProps> = ({ activityUuid }) => {
    // AssignmentStudioShell is currently mounted with an assignment_uuid that
    // already has the "assignment_" prefix — but we only have activityUuid here.
    // For now we render a placeholder; Phase 3 will wire this properly.
    // The existing route at /dash/assignments/[uuid] is still the live path.
    void activityUuid;
    return null;
  };

  const AttemptPassthrough: ComponentType<KindAttemptProps> = () => {
    // StudentAssignmentActivity is mounted by ActivityClient via AssignmentProvider.
    // This passthrough is a stub until Phase 4 migrates it to the unified Attempt shell.
    return StudentAssignmentActivity({});
  };

  const ReviewPassthrough: ComponentType<KindReviewProps> = ({ activityId, submissionUuid, title }) => {
    return GradingReviewWorkspace({ activityId, initialSubmissionUuid: submissionUuid ?? null, title });
  };

  return {
    label: 'Assignment',
    iconName: 'ClipboardList',
    Author: AuthorPassthrough,
    Attempt: AttemptPassthrough,
    Review: ReviewPassthrough,
  };
});
