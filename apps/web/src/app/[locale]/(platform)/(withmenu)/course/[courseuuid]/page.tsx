import { getCourseThumbnailMediaDirectory } from '@services/media/media'
import { getCourseMetadata } from '@services/courses/courses'
import { getCourseDiscussions } from '@services/courses/discussions'
import { getCurrentTrail } from '@services/courses/activity'
import { getSession } from '@/lib/auth/session'
import { APP_NAME } from '@/lib/constants'
import { cache } from 'react'
import type { Metadata } from 'next'
import { redirect } from '@/i18n/navigation'
import { getLocale, setRequestLocale } from 'next-intl/server'
import AccessDenied from '@/components/Errors/AccessDenied'
import ResourceNotFound from '@/components/Errors/ResourceNotFound'

import CourseClient from '@/app/_shared/withmenu/course/[courseuuid]/course'

interface MetadataProps {
  params: Promise<{ courseuuid: string }>
}

const fetchCourseMetadata = cache(async (courseuuid: string) => {
  const session = await getSession()
  return await getCourseMetadata(courseuuid, undefined, !!session)
})

export async function generateMetadata(props: MetadataProps): Promise<Metadata> {
  const params = await props.params
  try {
    const course_meta = await fetchCourseMetadata(params.courseuuid)

    return {
      title: `${course_meta.name} - ${APP_NAME}`,
      description: course_meta.description,
      keywords: course_meta.learnings,
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
        title: `${course_meta.name} - ${APP_NAME}`,
        description: course_meta.description || '',
        images: [
          {
            url: getCourseThumbnailMediaDirectory(course_meta?.course_uuid, course_meta?.thumbnail_image),
            width: 800,
            height: 600,
            alt: course_meta.name,
          },
        ],
        type: 'article',
        publishedTime: course_meta.creation_date || '',
        tags: course_meta.learnings || [],
      },
    }
  } catch (error: unknown) {
    const apiError = error as AppApiError
    if (apiError.status === 401 || apiError.status === 403) {
      return {
        title: `Access Denied - ${APP_NAME}`,
      }
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
      const locale = await getLocale()
      redirect({
        href: `/login?returnTo=${encodeURIComponent(`/course/${courseuuid}`)}`,
        locale,
      })
    }
    if (apiError.status === 403) {
      const activeSession = await getSession()
      return <AccessDenied courseuuid={courseuuid} session={activeSession} />
    }
    if (apiError.status === 404) {
      const activeSession = await getSession()
      return <ResourceNotFound type="course" session={activeSession} />
    }
    throw error
  }

  const [discussions, trailData] = await Promise.all([
    session?.user && course_meta?.course_uuid
      ? getCourseDiscussions(course_meta.course_uuid, true, 50, 0)
      : Promise.resolve([]),
    session?.user ? getCurrentTrail() : Promise.resolve(null),
  ])

  return (
    <CourseClient courseuuid={courseuuid} course={course_meta} initialDiscussions={discussions} trailData={trailData} />
  )
}
