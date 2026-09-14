import { getCourseThumbnailMediaDirectory } from '@services/media/media'
import { getCourseMetadata } from '@services/courses/courses'
import { getCourseDiscussions } from '@services/courses/discussions'
import { getCurrentTrail } from '@services/courses/activity'
import { getSession } from '@/lib/auth/session'
import { APP_NAME } from '@/lib/constants'
import { cache } from 'react'
import type { Metadata } from 'next'
import { HydrationBoundary, QueryClient, dehydrate } from '@tanstack/react-query'
import { learnerCourseStateQueryOptions } from '@/features/learner-course/api'
import { redirect } from '@/i18n/navigation'
import { getLocale, setRequestLocale, getTranslations } from 'next-intl/server'
import AccessDenied from '@/components/Errors/AccessDenied'
import ResourceNotFound from '@/components/Errors/ResourceNotFound'

import CourseClient from '@/app/_shared/withmenu/course/[courseuuid]/course'

interface MetadataProps {
  params: Promise<{ courseuuid: string }>
}

// Learner surface: published activities only. Drafts are not in the
// learner-state outline, so listing them here only leads to a dead link.
const fetchCourseMetadata = cache(async (courseuuid: string) => getCourseMetadata(courseuuid))

export async function generateMetadata(props: MetadataProps): Promise<Metadata> {
  const params = await props.params
  try {
    const course_meta = await fetchCourseMetadata(params.courseuuid)
    const courseName = course_meta.name ?? ''
    const courseDescription = course_meta.description ?? ''
    const courseKeywords = Array.isArray(course_meta.learnings)
      ? course_meta.learnings.filter((value): value is string => typeof value === 'string')
      : typeof course_meta.learnings === 'string'
        ? [course_meta.learnings]
        : []

    return {
      title: `${courseName} - ${APP_NAME}`,
      description: courseDescription,
      keywords: courseKeywords,
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
        title: `${courseName} - ${APP_NAME}`,
        description: courseDescription,
        images: [
          {
            url: getCourseThumbnailMediaDirectory(course_meta?.course_uuid, course_meta?.thumbnail_image),
            width: 800,
            height: 600,
            alt: courseName,
          },
        ],
        type: 'article',
        publishedTime: course_meta.creation_date || '',
        tags: courseKeywords,
      },
    }
  } catch (error: unknown) {
    const apiError = error as AppApiError
    if (apiError.status === 401 || apiError.status === 403) {
      const tUnauthorized = await getTranslations('UnauthorizedPage')
      return { title: `${tUnauthorized('title')} - ${APP_NAME}`, robots: { index: false } }
    }
    if (apiError.status === 404 || apiError.status === 422) {
      const tErrors = await getTranslations('Errors')
      return { title: `${tErrors('courseNotFound')} - ${APP_NAME}`, robots: { index: false } }
    }
    throw error
  }
}

export default async function PlatformCoursePage(props: { params: Promise<{ locale: string; courseuuid: string }> }) {
  const { locale, courseuuid } = await props.params
  setRequestLocale(locale)

  let course_meta
  let session
  try {
    ;[course_meta, session] = await Promise.all([fetchCourseMetadata(courseuuid), getSession()])
  } catch (error: unknown) {
    const apiError = error as AppApiError
    if (apiError.status === 401) {
      const activeLocale = await getLocale()
      redirect({
        href: `/login?returnTo=${encodeURIComponent(`/course/${courseuuid}`)}`,
        locale: activeLocale,
      })
    }
    if (apiError.status === 403) {
      const activeSession = await getSession()
      return <AccessDenied courseuuid={courseuuid} session={activeSession} />
    }
    // A malformed id is a 422 that names nothing: not found, not an error (UX-078).
    if (apiError.status === 404 || apiError.status === 422) {
      const activeSession = await getSession()
      return <ResourceNotFound type="course" session={activeSession} />
    }
    throw error
  }

  // Learner state is prefetched here so the progress strip and card hydrate
  // with the page instead of popping in after a client fetch.
  const queryClient = new QueryClient()
  const [discussions, trailData] = await Promise.all([
    session?.user && course_meta?.course_uuid
      ? getCourseDiscussions(course_meta.course_uuid, true, 50)
      : Promise.resolve([]),
    session?.user ? getCurrentTrail() : Promise.resolve(null),
    session?.user ? queryClient.prefetchQuery(learnerCourseStateQueryOptions(courseuuid)) : Promise.resolve(),
  ])

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <CourseClient
        courseuuid={courseuuid}
        course={course_meta}
        initialDiscussions={discussions}
        trailData={trailData}
      />
    </HydrationBoundary>
  )
}
