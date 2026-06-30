import { requireCourseWorkspaceStageAccess } from '@/lib/course-management-server'
import type { CourseWorkspaceStage } from '@/lib/course-management'
import CourseWorkspacePageShell from './CourseWorkspacePageShell'
import { getCourseMetadata } from '@services/courses/courses'
import { Suspense } from 'react';
import type { ReactNode } from 'react';
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

function CourseWorkspacePageFallback() {
  return (
    <div className="bg-background flex min-h-screen min-w-0 flex-1 flex-col">
      <div className="border-border bg-background border-b px-4 py-4 lg:px-8">
        <div className="bg-muted h-6 w-56 animate-pulse rounded" />
        <div className="mt-4 flex gap-3">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="bg-muted h-8 w-24 animate-pulse rounded" />
          ))}
        </div>
      </div>
      <main className="min-w-0 flex-1 px-4 py-8 lg:px-8">
        <div className="bg-muted h-[420px] animate-pulse rounded-lg" />
      </main>
    </div>
  )
}

export function renderCourseWorkspacePage(options: RenderCourseWorkspacePageOptions) {
  return (
    <Suspense fallback={<CourseWorkspacePageFallback />}>
      <CourseWorkspacePageContent {...options} />
    </Suspense>
  )
}

async function CourseWorkspacePageContent({
  courseuuid,
  activeStage,
  children,
  capabilities,
}: RenderCourseWorkspacePageOptions) {
  const data = await (async () => {
    try {
      const [initialCourse, resolvedCapabilities] = await Promise.all([
        getCourseMetadata(courseuuid, undefined, true),
        capabilities ? Promise.resolve(capabilities) : requireCourseWorkspaceStageAccess(courseuuid, activeStage),
      ])
      return { initialCourse, resolvedCapabilities }
    } catch (error: unknown) {
      const apiError = error as AppApiError
      if (apiError.status === 401 || apiError.status === 403 || apiError.status === 404) {
        return { errorStatus: apiError.status }
      }
      throw error
    }
  })()

  if ('errorStatus' in data) {
    if (data.errorStatus === 401) {
      const locale = await getLocale()
      redirect({
        href: `/login?returnTo=${encodeURIComponent(`/dash/courses/${courseuuid}/${activeStage}`)}`,
        locale,
      })
    }
    if (data.errorStatus === 403) {
      const activeSession = await getSession()
      return <AccessDenied courseuuid={courseuuid} session={activeSession} />
    }
    if (data.errorStatus === 404) {
      const activeSession = await getSession()
      return <ResourceNotFound type="course" session={activeSession} />
    }
    return null
  }

  const { initialCourse, resolvedCapabilities } = data

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
}
