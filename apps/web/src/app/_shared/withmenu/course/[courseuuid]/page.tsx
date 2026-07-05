import { getCourseThumbnailMediaDirectory } from '@services/media/media'
import { getCourseMetadata } from '@services/courses/courses'
import { getSession } from '@/lib/auth/session'
import { APP_NAME } from '@/lib/constants'
import { cache } from 'react'
import type { Metadata } from 'next'
import { HydrationBoundary, QueryClient, dehydrate } from '@tanstack/react-query'
import { courseDiscussionsQueryOptions, trailCurrentQueryOptions } from '@/features/courses/queries/course.query'

import CourseClient from './course'

interface MetadataProps {
  params: Promise<{ courseuuid: string }>
}

const fetchCourseMetadata = cache(async (courseuuid: string) => {
  const session = await getSession()
  return await getCourseMetadata(courseuuid, undefined, !!session)
})

export async function generateMetadata(props: MetadataProps): Promise<Metadata> {
  const params = await props.params
  const course_meta = await fetchCourseMetadata(params.courseuuid)
  const courseName = course_meta?.name ?? ''
  const courseDescription = course_meta?.description ?? ''
  const courseKeywords = Array.isArray(course_meta?.learnings)
    ? course_meta.learnings.filter((value): value is string => typeof value === 'string')
    : typeof course_meta?.learnings === 'string'
      ? [course_meta.learnings]
      : []

  // SEO
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
      publishedTime: course_meta?.creation_date || '',
      tags: courseKeywords,
    },
  }
}

const CoursePage = async (params: { params: Promise<{ courseuuid: string }> }) => {
  const { courseuuid } = await params.params

  const [course_meta, session] = await Promise.all([fetchCourseMetadata(courseuuid), getSession()])

  const queryClient = new QueryClient()
  let trailData: AppTrailData | null = null

  if (session?.user && course_meta?.course_uuid) {
    // Prefetch data that CourseClient fetches client-side so the page renders
    // without loading spinners and avoids a client-side waterfall.
    await Promise.all([
      queryClient.prefetchQuery(
        courseDiscussionsQueryOptions(course_meta.course_uuid, {
          includeReplies: true,
          limit: 50,
          offset: 0,
        }),
      ),
      queryClient.prefetchQuery(trailCurrentQueryOptions()),
    ])
    trailData = queryClient.getQueryData<AppTrailData>(trailCurrentQueryOptions().queryKey) ?? null
  }

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <CourseClient courseuuid={courseuuid} course={course_meta} trailData={trailData} />
    </HydrationBoundary>
  )
}

export default CoursePage
