import CurriculumEditor from '@components/Dashboard/Pages/Course/EditCourseStructure/CurriculumEditor'
import { renderCourseWorkspacePage } from '@components/Dashboard/Courses/renderCourseWorkspacePage'
import { setRequestLocale } from 'next-intl/server'
import { Suspense } from 'react'

interface PlatformCourseCurriculumPageProps {
  params: Promise<{ locale: string; courseuuid: string }>
}

function CourseCurriculumFallback() {
  return <div className="bg-background min-h-screen" />
}

export default function PlatformCourseCurriculumPage(props: PlatformCourseCurriculumPageProps) {
  return (
    <Suspense fallback={<CourseCurriculumFallback />}>
      <PlatformCourseCurriculumContent params={props.params} />
    </Suspense>
  )
}

async function PlatformCourseCurriculumContent({ params }: PlatformCourseCurriculumPageProps) {
  const { locale, courseuuid } = await params
  setRequestLocale(locale)

  return renderCourseWorkspacePage({
    courseuuid,
    activeStage: 'curriculum',
    children: <CurriculumEditor />,
  })
}
