import EditCourseGeneral from '@components/Dashboard/Pages/Course/EditCourseGeneral/EditCourseGeneral'
import { renderCourseWorkspacePage } from '@components/Dashboard/Courses/renderCourseWorkspacePage'

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false

export default async function PlatformCourseDetailsPage(props: { params: Promise<{ courseuuid: string }> }) {
  const { courseuuid } = await props.params

  return renderCourseWorkspacePage({
    courseuuid,
    activeStage: 'details',
    children: <EditCourseGeneral />,
  })
}
