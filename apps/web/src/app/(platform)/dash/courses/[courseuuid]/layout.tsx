import { getCourseWorkspaceCapabilitiesForCourse } from '@/lib/course-management-server';
import type { ReactNode } from 'react';

export default async function PlatformCourseWorkspaceLayout(props: {
  children: ReactNode;
  params: Promise<{ courseuuid: string }>;
}) {
  const { courseuuid } = await props.params;

  await getCourseWorkspaceCapabilitiesForCourse(courseuuid);

  return <>{props.children}</>;
}
