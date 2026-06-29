import { getTranslations } from 'next-intl/server'
import type { Metadata } from 'next'

import DashShell from './dash-shell'

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('DashPage')

  return {
    title: t('DashboardTitle'),
  }
}

export default function PlatformDashLayout({ children }: { children: React.ReactNode }) {
  return <DashShell>{children}</DashShell>
}
