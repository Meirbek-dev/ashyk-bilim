'use client';

import { useParams } from 'next/navigation';

import AssignmentStudioRoute from '@/features/assignments/studio/AssignmentStudioShell';

const PlatformAssignmentPage = () => {
  const params = useParams<{ assignmentuuid: string }>();
  return <AssignmentStudioRoute assignmentUuid={params.assignmentuuid} />;
};

export default PlatformAssignmentPage;
