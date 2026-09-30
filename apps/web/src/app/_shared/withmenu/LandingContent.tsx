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

    // Only the platform and the course catalog are fatal; the side sections degrade on their own.
    const [resCoursesData, resCollections, resGamificationData, resTrailData] = await Promise.all([
      // UX-274: the server orders the caller's in-progress courses first across pages.
      getCourses(undefined, page, 20, 'progress'),
      getCollections().catch((error: unknown) => {
        logLandingFetchError('Collections fetch failed', error)
        return [] as AppCollection[]
      }),
      gamificationPromise,
      session
        ? getCurrentTrail().catch((error: unknown) => {
            logLandingFetchError('Trail fetch failed', error)
            return null
          })
        : Promise.resolve(null),
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

  return (
    <LandingClassic
      courses={coursesData.courses}
      hasNextPage={Boolean(coursesData.next_cursor)}
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
    <div className="mx-auto flex min-h-[60dvh] w-full max-w-4xl items-center px-4 py-12 sm:px-6">
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
    </div>
  )
}
