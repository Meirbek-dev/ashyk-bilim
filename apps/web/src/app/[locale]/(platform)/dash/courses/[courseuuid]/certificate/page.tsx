import EditCourseCertification from '@components/Dashboard/Pages/Course/EditCourseCertification/EditCourseCertification'
import { renderCourseWorkspacePage } from '@components/Dashboard/Courses/renderCourseWorkspacePage'
import { Suspense } from 'react'

interface PlatformCourseCertificatePageProps {
  params: Promise<{ courseuuid: string }>
}

export default function PlatformCourseCertificatePage(props: PlatformCourseCertificatePageProps) {
  return (
    <Suspense fallback={<div className="bg-background min-h-screen" />}>
      <PlatformCourseCertificateContent params={props.params} />
    </Suspense>
  )
}

async function PlatformCourseCertificateContent({ params }: PlatformCourseCertificatePageProps) {
  const { courseuuid } = await params

  return renderCourseWorkspacePage({
    courseuuid,
    activeStage: 'certificate',
    children: <EditCourseCertification />,
  })
}
