import CurriculumEditor from '@components/Dashboard/Pages/Course/EditCourseStructure/CurriculumEditor'
import { renderCourseWorkspacePage } from '@components/Dashboard/Courses/renderCourseWorkspacePage'
import { setRequestLocale } from 'next-intl/server'

export default async function PlatformCourseCurriculumPage(props: {
  params: Promise<{ locale: string; courseuuid: string }>
}) {
  const { locale, courseuuid } = await props.params
  setRequestLocale(locale)

  return renderCourseWorkspacePage({
    courseuuid,
    activeStage: 'curriculum',
    children: <CurriculumEditor />,
  })
}
