import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import { APP_NAME } from '@/lib/constants'
import DashShell from './dash-shell'

// Pages under /dash set `title` to their section name; the template appends
// the app name. The default covers pages without one.
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'General' })
  return { title: { default: `${t('dashboard')} - ${APP_NAME}`, template: `%s - ${APP_NAME}` } }
}

export default function PlatformDashLayout({ children }: { children: React.ReactNode }) {
  return <DashShell>{children}</DashShell>
}
