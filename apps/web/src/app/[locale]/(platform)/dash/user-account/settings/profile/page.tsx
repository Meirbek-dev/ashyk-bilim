import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { Suspense } from 'react'

import { requireSession } from '@/lib/auth/session'
import UserProfileBuilder from '@components/Dashboard/Pages/UserAccount/UserProfile/UserProfileBuilder'

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'DashPage.UserAccountSettings' })
  return { title: `${t('profile')} · ${t('title')}` }
}

// Re-validated per page like the general tab (UX-126).
export default function UserAccountProfilePage() {
  return (
    <Suspense fallback={<div className="min-h-64" />}>
      <ProfileContent />
    </Suspense>
  )
}

async function ProfileContent() {
  await requireSession()
  return <UserProfileBuilder />
}
