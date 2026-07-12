import { getServerGamificationDashboard } from '@/services/gamification/server'
import { getSession } from '@/lib/auth/session'
import LandingClassic from '@components/Landings/LandingClassic'
import { getCollections } from '@services/courses/collections'
import { getPlatform } from '@/services/platform/platform'
import { getCourses } from '@services/courses/courses'
import { getCurrentTrail } from '@services/courses/activity'
import { Link } from '@/i18n/navigation'
import { getTranslations } from 'next-intl/server'
import { AlertTriangle } from 'lucide-react'

function isExpectedPrerenderCancellation(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false
  }

  const message = error.message.toLowerCase()
  const isNextError =
    message.includes('prerender') ||
    message.includes('cookies()') ||
    message.includes('dynamic server usage') ||
    Boolean((error as { digest?: string }).digest?.startsWith('NEXT_'))

  return (
    error.name === 'AbortError' ||
    message.includes('connection closed') ||
    message.includes('aborted') ||
    message.includes('cancelled') ||
    message.includes('canceled') ||
    isNextError
  )
}

function logLandingFetchError(scope: string, error: unknown) {
  if (isExpectedPrerenderCancellation(error)) {
    return
  }

  console.error(`[LandingContent] ${scope}:`, {
    message: error instanceof Error ? error.message : 'Unknown error',
    cause: error instanceof Error ? error.cause : undefined,
  })
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

export async function LandingContent({ page = 1 }: { page?: number }) {
  const tDegraded = await getTranslations('LandingDegraded')
  let coursesData, collections, gamificationData, trailData, session
  try {
    // Fetch platform info with detailed error handling
    try {
      await getPlatform()
    } catch (error) {
      console.error('[LandingContent] Failed to fetch platform info:', {
        message: error instanceof Error ? error.message : 'Unknown error',
        cause: error instanceof Error ? error.cause : undefined,
      })
      throw new Error('Unable to load the platform. Please check your network connection and try again.', {
        cause: error,
      })
    }

    // Only fetch gamification data if user is authenticated
    session = await getSession()
    const gamificationPromise = session
      ? getServerGamificationDashboard().catch((error: unknown) => {
          logLandingFetchError('Gamification fetch failed', error)
          return null
        })
      : Promise.resolve(null)

    const [resCoursesData, resCollections, resGamificationData, resTrailData] = await Promise.all([
      getCourses(undefined, page, 20),
      getCollections(),
      gamificationPromise,
      session ? getCurrentTrail().catch(() => null) : Promise.resolve(null),
    ])

    coursesData = resCoursesData
    collections = resCollections
    gamificationData = resGamificationData
    trailData = resTrailData
  } catch (error) {
    if (isExpectedPrerenderCancellation(error)) {
      throw error
    }

    console.error('[LandingContent] Critical error:', {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      cause: error instanceof Error ? error.cause : undefined,
    })
    return <LandingDegradedState isAuthenticated={Boolean(session)} t={tDegraded} />
  }

  const { courses } = coursesData
  const totalCourses = coursesData.total
  const sortedCourses = sortCoursesByProgress(courses, trailData)

  return (
    <LandingClassic
      courses={sortedCourses}
      totalCourses={totalCourses}
      collections={collections}
      gamificationData={gamificationData}
      trailData={trailData}
      isAuthenticated={Boolean(session)}
      currentPage={page}
    />
  )
}

function LandingDegradedState({
  isAuthenticated,
  t,
}: {
  isAuthenticated: boolean
  t: Awaited<ReturnType<typeof getTranslations<'LandingDegraded'>>>
}) {
  return (
    <main className="mx-auto flex min-h-[60dvh] w-full max-w-4xl items-center px-4 py-12 sm:px-6">
      <section aria-labelledby="landing-unavailable-title" className="w-full border-y py-10 sm:py-14">
        <AlertTriangle className="size-8 text-amber-600" aria-hidden />
        <h1 id="landing-unavailable-title" className="mt-5 max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">
          {t('title')}
        </h1>
        <p className="text-muted-foreground mt-3 max-w-2xl text-base leading-7">{t('description')}</p>
        <p className="mt-5 text-sm" role="status">
          {t('safeState')}
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/"
            className="bg-primary text-primary-foreground hover:bg-primary/90 focus-visible:ring-ring inline-flex min-h-11 items-center rounded-lg px-4 text-sm font-medium outline-none focus-visible:ring-3"
          >
            {t('retry')}
          </Link>
          <Link
            href={isAuthenticated ? '/dash' : '/login'}
            className="border-border bg-background hover:bg-muted focus-visible:ring-ring inline-flex min-h-11 items-center rounded-lg border px-4 text-sm font-medium outline-none focus-visible:ring-3"
          >
            {isAuthenticated ? t('openDashboard') : t('signIn')}
          </Link>
        </div>
      </section>
    </main>
  )
}
