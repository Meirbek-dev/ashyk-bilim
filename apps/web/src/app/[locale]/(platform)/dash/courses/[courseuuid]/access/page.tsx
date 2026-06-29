import EditCourseContributors from '@components/Dashboard/Pages/Course/EditCourseContributors/EditCourseContributors'
import EditCourseAccess from '@components/Dashboard/Pages/Course/EditCourseAccess/EditCourseAccess'
import { renderCourseWorkspacePage } from '@components/Dashboard/Courses/renderCourseWorkspacePage'
import { requireCourseWorkspaceStageAccess } from '@/lib/course-management-server'

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false

export default async function PlatformCourseAccessPage(props: { params: Promise<{ courseuuid: string }> }) {
  const { courseuuid } = await props.params
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
