import { getTranslations } from 'next-intl/server'
import type { Metadata } from 'next'

import ForgotPasswordClient from './forgot'

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'Auth.Forgot' })
  return {
    title: t('title'),
  }
}

const ForgotPasswordPage = () => {
  return <ForgotPasswordClient />
}

export default ForgotPasswordPage
