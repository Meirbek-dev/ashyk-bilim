import type { Metadata } from 'next'
import { Suspense } from 'react'
import { getTranslations } from 'next-intl/server'

import { APP_NAME } from '@/lib/constants'
import { requireSession } from '@/lib/auth/session'
import OrganizationPrompt from '@components/Dashboard/OrganizationPrompt'
import DashShell from './dash-shell'

// Pages under /dash set `title` to their section name; the template appends
// the app name. The default covers pages without one.
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'General' })
  return { title: { default: `${t('dashboard')} - ${APP_NAME}`, template: `%s - ${APP_NAME}` } }
}

// Every /dash page is for a signed-in user; one gate here instead of one per
// page (client-only pages otherwise sit on their loading state forever).
// The organization is required (registration asks for it); older accounts
// are asked here before they can use the dashboard.
async function SessionGate({ children }: { children: React.ReactNode }) {
  const session = await requireSession()
  return (
    <>
      {children}
      {session.user.organization ? null : <OrganizationPrompt />}
    </>
  )
}

export default function PlatformDashLayout({ children }: { children: React.ReactNode }) {
  return (
    <DashShell>
      <Suspense fallback={null}>
        <SessionGate>{children}</SessionGate>
      </Suspense>
    </DashShell>
  )
}
