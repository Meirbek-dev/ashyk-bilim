import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { Suspense } from 'react'

import { requireSession } from '@/lib/auth/session'
import UserEditGeneral from '@components/Dashboard/Pages/UserAccount/UserEditGeneral/UserEditGeneral'

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'DashPage.UserAccountSettings' })
  return { title: `${t('general')} · ${t('title')}` }
}

// UX-126: the dash-layout gate does not re-run on a sibling-tab nav, so a
// session revoked elsewhere would otherwise render the client-cached profile.
// Re-validate per page (same as the security tab).
export default function UserAccountGeneralPage() {
  return (
    <Suspense fallback={<div className="min-h-64" />}>
      <GeneralContent />
    </Suspense>
  )
}

async function GeneralContent() {
  await requireSession()
  return <UserEditGeneral />
}
