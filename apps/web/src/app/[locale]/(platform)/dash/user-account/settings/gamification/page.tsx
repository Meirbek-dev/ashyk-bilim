import UserGamificationSettings from '@components/Dashboard/Pages/UserAccount/UserGamificationSettings/UserGamificationSettings'
import { getServerGamificationDashboard } from '@/services/gamification/server'
import { requireSession } from '@/lib/auth/session'
import { Suspense } from 'react'
import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'DashPage.UserAccountSettings' })
  return { title: `${t('gamification')} · ${t('title')}` }
}

export default function UserAccountGamificationPage() {
  return (
    <Suspense fallback={<UserGamificationSettings initialProfile={null} loading />}>
      <GamificationSettingsContent />
    </Suspense>
  )
}

// Fresh from the server on every visit: the client store is a per-tab cache
// that nothing in `/dash` refreshes, so it can lag behind what was last saved.
// UX-126: re-validate the session per tab (a revoked one must redirect, not
// render an empty profile).
async function GamificationSettingsContent() {
  await requireSession()
  const dashboard = await getServerGamificationDashboard().catch(() => null)
  return <UserGamificationSettings initialProfile={dashboard?.profile ?? null} />
}
