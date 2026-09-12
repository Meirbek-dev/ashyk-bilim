import { APP_NAME } from '@/lib/constants'
import { getStaticMetadataMessages } from '@/lib/localized-metadata'
import { getEditableCourses } from '@services/courses/editable'
import type { PageSearchParams } from '@/lib/search-params'
import type { Action, Resource, Scope } from '@/types/permissions'
import { requireSession } from '@/lib/auth/session'
import { sessionCan } from '@/lib/auth/permissions'
import { canSeeCourses } from '@/lib/rbac/navigation-policy'
import { redirect } from '@/i18n/navigation'
import { getLocale } from 'next-intl/server'
import type { Metadata } from 'next'
import { Suspense } from 'react'

import CoursesHome from '@/app/_shared/dash/courses/client'
import CoursesLoading from './loading'

const COURSES_PER_PAGE = 24

function parsePage(value: string | string[] | undefined): number {
  const raw = Array.isArray(value) ? value[0] : value
  const parsed = Number.parseInt(raw ?? '1', 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1
}

function parseQuery(value: string | string[] | undefined): string {
  const raw = Array.isArray(value) ? value[0] : value
  return raw?.trim() ?? ''
}

function parseSort(value: string | string[] | undefined): 'updated' | 'name' {
  const raw = Array.isArray(value) ? value[0] : value
  return raw === 'name' ? 'name' : 'updated'
}

function parsePreset(value: string | string[] | undefined): string {
  const raw = Array.isArray(value) ? value[0] : value
  const valid = ['all', 'drafts', 'published', 'private', 'recent', 'attention']
  return valid.includes(raw ?? '') ? (raw ?? 'all') : 'all'
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  'use cache'

  const { locale } = await params
  const { General } = getStaticMetadataMessages(locale)

  return {
    title: General.courses,
    description: General.appDescription,
    keywords: `${APP_NAME}, ${General.appDescription}, ${General.courses}, ${General.learning}, ${General.education}, ${General.onlineLearning}, edu, ${General.onlineCourses}, ${APP_NAME} ${General.courses}`,
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
      title: General.courses,
      description: General.appDescription,
      type: 'website',
    },
  }
}

export default function PlatformDashCoursesPage(props: { searchParams: Promise<PageSearchParams> }) {
  return (
    <Suspense fallback={<CoursesLoading />}>
      <PlatformDashCoursesPageInner searchParams={props.searchParams} />
    </Suspense>
  )
}

async function PlatformDashCoursesPageInner(props: { searchParams: Promise<PageSearchParams> }) {
  const session = await requireSession()
  const permsSet = new Set<string>(session.permissions)
  const can = (resource: Resource, action: Action, scope: Scope): boolean =>
    sessionCan(session, resource, action, scope, permsSet)

  const searchParams = await props.searchParams
  const currentPage = parsePage(searchParams.page)
  const query = parseQuery(searchParams.q)
  const sortBy = parseSort(searchParams.sort)
  const preset = parsePreset(searchParams.preset)

  const { courses, total, summary } = await getEditableCourses(currentPage, COURSES_PER_PAGE, query, sortBy, preset)

  // Authorship is the `:own` scope: a `user`-role co-author has no course
  // grant but a non-empty `mine` set (the summary counts the whole editable
  // set regardless of the filters).
  if (!canSeeCourses(can) && summary.total === 0) {
    redirect({ href: '/unauthorized', locale: await getLocale() })
  }

  return (
    <CoursesHome
      courses={courses.map(course => ({ ...course, name: course.name ?? '' }))}
      totalCourses={total}
      currentPage={currentPage}
      searchQuery={query}
      sortBy={sortBy}
      pageSize={COURSES_PER_PAGE}
      preset={preset}
      summaryCounts={summary}
    />
  )
}
