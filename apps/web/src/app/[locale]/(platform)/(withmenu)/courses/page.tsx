import { APP_DESCRIPTION, APP_NAME } from '@/lib/constants'
import { getPlatformThumbnailImage } from '@services/media/media'
import { getCourses } from '@services/courses/courses'
import { getCurrentTrail } from '@services/courses/activity'
import { getSession } from '@/lib/auth/session'
import { getSearchParam } from '@/lib/search-params'
import type { PageSearchParams } from '@/lib/search-params'
import { getTranslations } from 'next-intl/server'
import { Actions, Resources, Scopes, perm } from '@/types/permissions'
import { AUTH_PERMISSION_WILDCARD } from '@/lib/auth/types'
import type { Metadata } from 'next'
import { Suspense } from 'react'

import Courses from '@/app/_shared/withmenu/courses/courses'
import CoursesLoading from './loading'

interface MetadataProps {
  searchParams: Promise<PageSearchParams>
}

export async function generateMetadata(_props: MetadataProps): Promise<Metadata> {
  const t = await getTranslations('General')

  return {
    title: `${t('courses')} - ${APP_NAME}`,
    description: APP_DESCRIPTION,
    keywords: `${APP_NAME}, ${APP_DESCRIPTION}, ${t('courses')}, ${t('learning')}, ${t('education')}, ${t('onlineLearning')}, ${t('edu')}, ${t('onlineCourses')}, ${APP_NAME} ${t('courses')}`,
    robots: {
      index: true,
      follow: true,
      nocache: true,
      googleBot: {
        index: true,
        follow: true,
        'max-image-preview': 'large',
      },
    },
    openGraph: {
      title: `${t('courses')} - ${APP_NAME}`,
      description: APP_DESCRIPTION,
      type: 'website',
      images: [
        {
          url: getPlatformThumbnailImage(),
          width: 800,
          height: 600,
          alt: APP_NAME,
        },
      ],
    },
  }
}

interface CoursesContentProps {
  searchParams: Promise<PageSearchParams>
}

function sortCoursesByProgress(courses: AppCourse[], trailData: AppTrailData | null) {
  if (!trailData?.runs) return courses

  return [...courses].toSorted((a, b) => {
    const aCleanUuid = a.course_uuid?.replace('course_', '')
    const bCleanUuid = b.course_uuid?.replace('course_', '')

    const aRun = trailData.runs?.find(r => r.course?.course_uuid?.replace('course_', '') === aCleanUuid)
    const bRun = trailData.runs?.find(r => r.course?.course_uuid?.replace('course_', '') === bCleanUuid)

    const getProgress = (run: AppTrailRun | undefined, course: AppCourse) => {
      if (!run) return 0
      const total =
        run.course_total_steps ||
        course.chapters?.reduce((acc: number, chap: AppChapter) => acc + (chap.activities?.length || 0), 0) ||
        0
      const completed = run.steps?.filter((s: AppTrailStep) => s.complete === true)?.length || 0
      return total > 0 ? Math.round((completed / total) * 100) : 0
    }

    const aProgress = getProgress(aRun, a)
    const bProgress = getProgress(bRun, b)

    const aInProgress = aProgress > 0 && aProgress < 100
    const bInProgress = bProgress > 0 && bProgress < 100

    // 1. In-progress courses first
    if (aInProgress !== bInProgress) return bInProgress ? 1 : -1

    // 2. Higher progress first
    if (aProgress !== bProgress) return bProgress - aProgress

    // 3. Fallback to newest
    const aDate = new Date(a.creation_date || a.created_at || a.update_date || 0).getTime()
    const bDate = new Date(b.creation_date || b.created_at || b.update_date || 0).getTime()
    return bDate - aDate
  })
}

async function CoursesContent({ searchParams }: CoursesContentProps) {
  const params = await searchParams
  const pageStr = getSearchParam(params, 'page')
  const page = pageStr ? Number.parseInt(pageStr, 10) : 1

  const session = await getSession()
  const [coursesData, trailData] = await Promise.all([
    getCourses(undefined, page, 20),
    session ? getCurrentTrail() : Promise.resolve(null),
  ])

  // Pre-sort courses on the server
  const sortedCourses = sortCoursesByProgress(coursesData.courses, trailData)

  // Calculate permissions server-side
  const permissionsSet = new Set<string>(session?.permissions)
  const canManagePlatform =
    permissionsSet.has(AUTH_PERMISSION_WILDCARD) || permissionsSet.has(perm(Resources.APP, Actions.MANAGE, Scopes.OWN))

  return (
    <Courses
      courses={sortedCourses}
      totalCourses={coursesData.total}
      trailData={trailData}
      currentPage={page}
      isAuthenticated={Boolean(session)}
      canManagePlatform={canManagePlatform}
    />
  )
}

export default async function PlatformCoursesPage(props: { searchParams: Promise<PageSearchParams> }) {
  return (
    <Suspense fallback={<CoursesLoading />}>
      <CoursesContent searchParams={props.searchParams} />
    </Suspense>
  )
}
