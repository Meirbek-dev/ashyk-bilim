import EditCourseCertification from '@components/Dashboard/Pages/Course/EditCourseCertification/EditCourseCertification'
import { renderCourseWorkspacePage } from '@components/Dashboard/Courses/renderCourseWorkspacePage'

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false

export default async function PlatformCourseCertificatePage(props: { params: Promise<{ courseuuid: string }> }) {
  const { courseuuid } = await props.params

  return renderCourseWorkspacePage({
    courseuuid,
    activeStage: 'certificate',
    children: <EditCourseCertification />,
  })
}
