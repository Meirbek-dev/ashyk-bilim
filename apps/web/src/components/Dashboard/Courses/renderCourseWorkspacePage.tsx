import { requireCourseWorkspaceStageAccess } from '@/lib/course-management-server'
import type { CourseWorkspaceStage } from '@/lib/course-management'
import CourseWorkspacePageShell from './CourseWorkspacePageShell'
import { getCourseMetadata } from '@services/courses/courses'
import type { ReactNode } from 'react'
import AccessDenied from '@/components/Errors/AccessDenied'
import ResourceNotFound from '@/components/Errors/ResourceNotFound'
import { getSession } from '@/lib/auth/session'
import { getLocale } from 'next-intl/server'
import { redirect } from '@/i18n/navigation'

interface RenderCourseWorkspacePageOptions {
  courseuuid: string
  activeStage: CourseWorkspaceStage
  children: ReactNode
  capabilities?: Awaited<ReturnType<typeof requireCourseWorkspaceStageAccess>>
}

export async function renderCourseWorkspacePage({
  courseuuid,
  activeStage,
  children,
  capabilities,
}: RenderCourseWorkspacePageOptions) {
  try {
    const [initialCourse, resolvedCapabilities] = await Promise.all([
      getCourseMetadata(courseuuid, undefined, true),
      capabilities ? Promise.resolve(capabilities) : requireCourseWorkspaceStageAccess(courseuuid, activeStage),
    ])

    return (
      <CourseWorkspacePageShell
        courseuuid={courseuuid}
        activeStage={activeStage}
        initialCourse={initialCourse}
        capabilities={resolvedCapabilities}
      >
        {children}
      </CourseWorkspacePageShell>
    )
  } catch (error: unknown) {
    const apiError = error as AppApiError
    if (apiError.status === 401) {
      const locale = await getLocale()
      redirect({
        href: `/login?returnTo=${encodeURIComponent(`/dash/courses/${courseuuid}/${activeStage}`)}`,
        locale,
      })
    }
    if (apiError.status === 403) {
      const activeSession = await getSession()
      return <AccessDenied courseuuid={courseuuid} session={activeSession} />
    }
    if (apiError.status === 404) {
      const activeSession = await getSession()
      return <ResourceNotFound type="course" session={activeSession} />
    }
    throw error
  }
}
