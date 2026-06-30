import EditCourseContributors from '@components/Dashboard/Pages/Course/EditCourseContributors/EditCourseContributors'
import EditCourseAccess from '@components/Dashboard/Pages/Course/EditCourseAccess/EditCourseAccess'
import { renderCourseWorkspacePage } from '@components/Dashboard/Courses/renderCourseWorkspacePage'
import { requireCourseWorkspaceStageAccess } from '@/lib/course-management-server'
import { Suspense } from 'react'

interface PlatformCourseAccessPageProps {
  params: Promise<{ courseuuid: string }>
}

export default function PlatformCourseAccessPage(props: PlatformCourseAccessPageProps) {
  return (
    <Suspense fallback={<div className="bg-background min-h-screen" />}>
      <PlatformCourseAccessContent params={props.params} />
    </Suspense>
  )
}

async function PlatformCourseAccessContent({ params }: PlatformCourseAccessPageProps) {
  const { courseuuid } = await params
  const capabilities = await requireCourseWorkspaceStageAccess(courseuuid, 'access')

  return renderCourseWorkspacePage({
    courseuuid,
    activeStage: 'access',
    capabilities,
    children: (
      <div className="space-y-8">
        {capabilities.canManageAccess ? <EditCourseAccess /> : null}
        {capabilities.canManageCollaboration ? <EditCourseContributors /> : null}
      </div>
    ),
  })
}
