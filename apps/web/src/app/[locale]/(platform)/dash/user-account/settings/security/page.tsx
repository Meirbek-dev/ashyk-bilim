import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import UserSecuritySettings from '@components/Dashboard/Pages/UserAccount/UserSecuritySettings/UserSecuritySettings'

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'DashPage.UserAccountSettings' })
  return { title: `${t('security')} · ${t('title')}` }
}

export default function UserAccountSecurityPage() {
  return <UserSecuritySettings />
}
