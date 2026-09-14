import EditCourseAccess from '@components/Dashboard/Pages/Course/EditCourseAccess/EditCourseAccess'
import { renderCourseWorkspacePage } from '@components/Dashboard/Courses/renderCourseWorkspacePage'
import { courseWorkspaceMetadata } from '@components/Dashboard/Courses/courseWorkspaceMetadata'
import { Suspense } from 'react'

interface PlatformCourseAccessPageProps {
  params: Promise<{ courseuuid: string }>
}

export async function generateMetadata({ params }: PlatformCourseAccessPageProps) {
  return courseWorkspaceMetadata((await params).courseuuid, 'settings')
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
  return renderCourseWorkspacePage({
    courseuuid,
    activeStage: 'access',
    children: (
<EditCourseAccess />
    ),
  })
}
