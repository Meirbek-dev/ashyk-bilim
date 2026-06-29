import { getTranslations } from 'next-intl/server'
import type { Metadata } from 'next'

import { APP_NAME } from '@/lib/constants'
import LoginClient from './login'

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'Auth.Login' })

  return {
    title: t('title', { platformName: APP_NAME }),
  }
}

const Login = async () => <LoginClient />

export default Login
