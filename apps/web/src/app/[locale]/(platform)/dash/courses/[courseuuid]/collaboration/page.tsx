import EditCourseContributors from '@components/Dashboard/Pages/Course/EditCourseContributors/EditCourseContributors'
import { renderCourseWorkspacePage } from '@components/Dashboard/Courses/renderCourseWorkspacePage'
import { courseWorkspaceMetadata } from '@components/Dashboard/Courses/courseWorkspaceMetadata'
import { Suspense } from 'react'

interface PlatformCourseCollaborationPageProps {
  params: Promise<{ courseuuid: string }>
}

export async function generateMetadata({ params }: PlatformCourseCollaborationPageProps) {
  return courseWorkspaceMetadata((await params).courseuuid, 'collaboration')
}

export default function PlatformCourseCollaborationPage(props: PlatformCourseCollaborationPageProps) {
  return (
    <Suspense fallback={<div className="bg-background min-h-screen" />}>
      <PlatformCourseCollaborationContent params={props.params} />
    </Suspense>
  )
}

async function PlatformCourseCollaborationContent({ params }: PlatformCourseCollaborationPageProps) {
  const { courseuuid } = await params
  return renderCourseWorkspacePage({
    courseuuid,
    activeStage: 'collaboration',
    children: <EditCourseContributors />,
  })
}
