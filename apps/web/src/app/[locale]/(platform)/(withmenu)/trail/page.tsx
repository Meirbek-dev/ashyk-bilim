import { getServerGamificationDashboard, getServerLeaderboard } from '@/services/gamification/server'
import { GamificationProvider } from '@/components/Contexts/GamificationContext'
import { requireSession } from '@/lib/auth/session'
import { APP_NAME } from '@/lib/constants'
import { getTranslations } from 'next-intl/server'
import type { Metadata } from 'next'
import { Suspense } from 'react'

import Trail from '@/app/_shared/withmenu/trail/trail'

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'TrailPage' })

  return {
    title: `${t('title')} - ${APP_NAME}`,
    description: t('metaDescription'),
  }
}

interface PageProps {
  params: Promise<{ locale: string }>
}

export default async function PlatformTrailPage(props: PageProps) {
  // Request-scoped locale, not `params`: reading params outside the boundary
  // logs the dev "URL data outside <Suspense>" notice on every visit.
  const t = await getTranslations('PageLoading')

  return (
    <Suspense
      fallback={
        <div className="text-muted-foreground flex h-[200px] w-full items-center justify-center text-sm">
          {t('loading')}
        </div>
      }
    >
      <TrailContent params={props.params} />
    </Suspense>
  )
}

async function TrailContent({ params }: PageProps) {
  await params
  // Anonymous → login before anything renders or fetches (UX-054).
  await requireSession()
  const content = (
    <div>
      <Trail />
    </div>
  )

  const [dashboardData, leaderboardData] = await Promise.all([
    getServerGamificationDashboard(),
    getServerLeaderboard(10),
  ])

  if (!dashboardData) {
    return content
  }

  return (
    <GamificationProvider
      initialData={{
        profile: dashboardData.profile,
        dashboard: dashboardData,
        leaderboard: leaderboardData ?? null,
      }}
    >
      {content}
    </GamificationProvider>
  )
}
