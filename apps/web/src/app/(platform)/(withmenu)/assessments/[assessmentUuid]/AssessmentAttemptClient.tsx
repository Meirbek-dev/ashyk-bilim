'use client';

import { AttemptShell } from '@/features/assessments';

interface Props {
  activityUuid: string;
  courseUuid: string;
}

/**
 * Canonical assessment attempt client component.
 *
 * Receives the resolved activityUuid and courseUuid from the server page
 * and delegates to the unified AttemptShell / AssessmentLayout.
 */
export default function AssessmentAttemptClient({ activityUuid, courseUuid }: Props) {
  return (
    <AttemptShell
      activityUuid={activityUuid}
      courseUuid={courseUuid}
    />
  );
}
