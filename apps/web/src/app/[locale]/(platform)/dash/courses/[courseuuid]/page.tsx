import CourseOverview from '@components/Dashboard/Courses/CourseOverview'
import { renderCourseWorkspacePage } from '@components/Dashboard/Courses/renderCourseWorkspacePage'

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false

export default async function PlatformCourseWorkspacePage(props: { params: Promise<{ courseuuid: string }> }) {
  const { courseuuid } = await props.params

  return renderCourseWorkspacePage({
    courseuuid,
    activeStage: 'overview',
    children: <CourseOverview courseuuid={courseuuid} />,
  })
}
