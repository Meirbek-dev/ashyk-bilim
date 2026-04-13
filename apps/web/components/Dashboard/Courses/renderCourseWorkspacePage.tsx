import { requireCourseWorkspaceStageAccess } from '@/lib/course-management-server';
import type { CourseWorkspaceStage } from '@/lib/course-management';
import CourseWorkspacePageShell from './CourseWorkspacePageShell';
import { getCourseMetadata } from '@services/courses/courses';
import type { ReactNode } from 'react';

interface RenderCourseWorkspacePageOptions {
  courseuuid: string;
  activeStage: CourseWorkspaceStage;
  children: ReactNode;
  capabilities?: Awaited<ReturnType<typeof requireCourseWorkspaceStageAccess>>;
}

export async function renderCourseWorkspacePage({
  courseuuid,
  activeStage,
  children,
  capabilities,
}: RenderCourseWorkspacePageOptions) {
  const [initialCourse, resolvedCapabilities] = await Promise.all([
    getCourseMetadata(courseuuid, undefined, true),
    capabilities ? Promise.resolve(capabilities) : requireCourseWorkspaceStageAccess(courseuuid, activeStage),
  ]);

  return (
    <CourseWorkspacePageShell
      courseuuid={courseuuid}
      activeStage={activeStage}
      initialCourse={initialCourse}
      capabilities={resolvedCapabilities}
    >
      {children}
    </CourseWorkspacePageShell>
  );
}
