import { getTranslations } from 'next-intl/server'
import type { Metadata } from 'next'

import DashShell from './dash-shell'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('DashPage')

  return {
    title: t('DashboardTitle'),
  }
}

export default function PlatformDashLayout({ children }: { children: React.ReactNode }) {
  return <DashShell>{children}</DashShell>
}
