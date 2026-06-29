import { getTranslations } from 'next-intl/server'
import type { Metadata } from 'next'

import ResetPasswordClient from './reset'

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'Auth.Reset' })
  return {
    title: t('title'),
  }
}

const ResetPasswordPage = () => {
  return <ResetPasswordClient />
}

export default ResetPasswordPage
