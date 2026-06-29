import { getServerGamificationDashboard, getServerLeaderboard } from '@/services/gamification/server'
import { GamificationProvider } from '@/components/Contexts/GamificationContext'
import { getSession } from '@/lib/auth/session'
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

export default function PlatformTrailPage(props: PageProps) {
  return (
    <Suspense
      fallback={
        <div className="text-muted-foreground flex h-[200px] w-full items-center justify-center text-sm">
          Loading...
        </div>
      }
    >
      <TrailContent params={props.params} />
    </Suspense>
  )
}

async function TrailContent({ params }: PageProps) {
  await params
  const content = (
    <div>
      <Trail />
    </div>
  )

  const session = await getSession()
  if (!session) {
    return content
  }

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
