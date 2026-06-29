import { getTranslations } from 'next-intl/server'
import type { Metadata } from 'next'

import DashShell from './dash-shell'

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'DashPage' })

  return {
    title: t('DashboardTitle'),
  }
}

export default function PlatformDashLayout({ children }: { children: React.ReactNode }) {
  return <DashShell>{children}</DashShell>
}
