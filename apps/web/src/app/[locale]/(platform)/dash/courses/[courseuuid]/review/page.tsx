import { renderCourseWorkspacePage } from '@components/Dashboard/Courses/renderCourseWorkspacePage'
import CourseReviewPublish from '@components/Dashboard/Courses/CourseReviewPublish'
import { requireCourseWorkspaceStageAccess } from '@/lib/course-management-server'
import { Suspense } from 'react'

interface PlatformCourseReviewPageProps {
  params: Promise<{ courseuuid: string }>
}

export default function PlatformCourseReviewPage(props: PlatformCourseReviewPageProps) {
  return (
    <Suspense fallback={<div className="bg-background min-h-screen" />}>
      <PlatformCourseReviewContent params={props.params} />
    </Suspense>
  )
}

async function PlatformCourseReviewContent({ params }: PlatformCourseReviewPageProps) {
  const { courseuuid } = await params
  const capabilities = await requireCourseWorkspaceStageAccess(courseuuid, 'review')

  return renderCourseWorkspacePage({
    courseuuid,
    activeStage: 'review',
    capabilities,
    children: <CourseReviewPublish courseuuid={courseuuid} capabilities={capabilities} />,
  })
}
