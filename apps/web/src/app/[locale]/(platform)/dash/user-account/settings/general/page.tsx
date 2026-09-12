import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import UserEditGeneral from '@components/Dashboard/Pages/UserAccount/UserEditGeneral/UserEditGeneral'

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'DashPage.UserAccountSettings' })
  return { title: `${t('general')} · ${t('title')}` }
}

export default function UserAccountGeneralPage() {
  return <UserEditGeneral />
}
