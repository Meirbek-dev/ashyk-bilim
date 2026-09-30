import { APP_NAME } from '@/lib/constants'
import { getPlatformThumbnailImage } from '@services/media/media'
import { getCourses } from '@services/courses/courses'
import { getCurrentTrail } from '@services/courses/activity'
import { getSession } from '@/lib/auth/session'
import { getPageParam } from '@/lib/search-params'
import type { PageSearchParams } from '@/lib/search-params'
import { getTranslations } from 'next-intl/server'
import { Actions, Resources, Scopes, perm } from '@/types/permissions'
import { AUTH_PERMISSION_WILDCARD } from '@/lib/auth/types'
import type { Metadata } from 'next'
import { Suspense } from 'react'

import Courses from '@/app/_shared/withmenu/courses/courses'
import CoursesLoading from './loading'

interface MetadataProps {
  params: Promise<{ locale: string }>
  searchParams: Promise<PageSearchParams>
}

export async function generateMetadata(props: MetadataProps): Promise<Metadata> {
  const { locale } = await props.params
  const t = await getTranslations({ locale, namespace: 'General' })

  return {
    title: `${t('courses')} - ${APP_NAME}`,
    description: t('appDescription'),
    keywords: `${APP_NAME}, ${t('appDescription')}, ${t('courses')}, ${t('learning')}, ${t('education')}, ${t('onlineLearning')}, ${t('edu')}, ${t('onlineCourses')}, ${APP_NAME} ${t('courses')}`,
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
      description: t('appDescription'),
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

async function CoursesContent({ searchParams }: CoursesContentProps) {
  const page = getPageParam(await searchParams)

  const session = await getSession()
  // UX-274: the server orders the caller's in-progress courses first across pages.
  const [coursesData, trailData] = await Promise.all([
    getCourses(undefined, page, 20, 'progress'),
    session ? getCurrentTrail() : Promise.resolve(null),
  ])

  // Calculate permissions server-side
  const permissionsSet = new Set<string>(session?.permissions)
  const canManagePlatform =
    permissionsSet.has(AUTH_PERMISSION_WILDCARD) || permissionsSet.has(perm(Resources.APP, Actions.MANAGE, Scopes.OWN))

  return (
    <Courses
      courses={coursesData.courses}
      hasNextPage={Boolean(coursesData.next_cursor)}
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
