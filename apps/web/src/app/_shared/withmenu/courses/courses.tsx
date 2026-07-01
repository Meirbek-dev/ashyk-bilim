import TypeOfContentTitle from '@/components/Objects/Elements/Titles/TypeOfContentTitle'
import GeneralWrapper from '@/components/Objects/Elements/Wrappers/GeneralWrapper'
import CreateCourseTrigger from '@/components/Landings/CreateCourseTrigger'
import CourseGridClient from '@components/Landings/CourseGridClient'
import { useTranslations } from 'next-intl'
import type { ReactNode } from 'react'

interface CourseProps {
  courses: AppCourse[]
  totalCourses: number
  trailData: AppTrailData | null
  currentPage: number
  isAuthenticated: boolean
  canManagePlatform: boolean
}

const EmptyStateMessage = ({
  canManagePlatform,
  createCourseTrigger,
  t,
}: {
  canManagePlatform: boolean
  createCourseTrigger: ReactNode
  t: AppTranslator
}) => (
  <div className="col-span-full flex items-center justify-center py-12">
    <div className="max-w-md text-center">
      <div className="mb-6">
        <div className="bg-muted mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full">
          <svg className="text-muted-foreground h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.746 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
            />
          </svg>
        </div>
      </div>
      <h1 className="text-foreground mb-3 text-2xl font-bold">{t('noCourses')}</h1>
      <p className="text-muted-foreground mb-6 text-base">
        {canManagePlatform ? t('createACourse') : t('noCoursesAvailable')}
      </p>
      {canManagePlatform ? <div className="flex justify-center">{createCourseTrigger}</div> : null}
    </div>
  </div>
)

const Courses = (props: CourseProps) => {
  const t = useTranslations('CoursesPage')
  const { courses, totalCourses, trailData, currentPage, isAuthenticated, canManagePlatform } = props

  const createCourseTrigger = <CreateCourseTrigger />
  const hasCourses = courses.length > 0 || totalCourses > 0

  return (
    <div className="w-full">
      <GeneralWrapper>
        <div className="mb-2 flex flex-col space-y-2">
          <div className="flex items-center justify-between">
            <TypeOfContentTitle title={t('title')} type="cou" as="h1" />
            {createCourseTrigger}
          </div>

          {!hasCourses ? (
            <EmptyStateMessage canManagePlatform={canManagePlatform} t={t} createCourseTrigger={createCourseTrigger} />
          ) : (
            <CourseGridClient
              initialCourses={courses}
              initialTotal={totalCourses}
              trailData={trailData}
              currentPage={currentPage}
              isAuthenticated={isAuthenticated}
            />
          )}
        </div>
      </GeneralWrapper>
    </div>
  )
}

export default Courses
