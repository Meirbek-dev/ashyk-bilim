import { getTranslations } from 'next-intl/server'
import type { Metadata } from 'next'

import { SessionProvider } from '@/components/providers/session-provider'
import { requireSession } from '@/lib/auth/session'
import DashShell from './dash-shell'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('DashPage')

  return {
    title: t('DashboardTitle'),
  }
}

export default async function PlatformDashLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession()

  return (
    <SessionProvider initialSession={session}>
      <DashShell>{children}</DashShell>
    </SessionProvider>
  )
}
