import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { Suspense } from 'react'

import { requireSession } from '@/lib/auth/session'
import UserSecuritySettings from '@components/Dashboard/Pages/UserAccount/UserSecuritySettings/UserSecuritySettings'

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'DashPage.UserAccountSettings' })
  return { title: `${t('security')} · ${t('title')}` }
}

// The session read is request-bound: it needs a Suspense boundary under
// cache components.
export default function UserAccountSecurityPage() {
  return (
    <Suspense fallback={<div className="min-h-64" />}>
      <SecurityContent />
    </Suspense>
  )
}

async function SecurityContent() {
  const session = await requireSession()
  // UX-188 flags; optional until the generated profile type carries them.
  const user: { mfa_enabled: boolean; has_password?: boolean; google_linked?: boolean } = session.user
  return (
    <UserSecuritySettings
      mfaEnabled={user.mfa_enabled}
      hasPassword={user.has_password ?? true}
      googleLinked={user.google_linked ?? false}
    />
  )
}
