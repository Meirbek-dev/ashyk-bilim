import { getTranslations } from 'next-intl/server'
import type { Metadata } from 'next'

import { APP_NAME } from '@/lib/constants'
import LoginClient from './login'

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Auth.Login')

  return {
    title: t('title', { platformName: APP_NAME }),
  }
}

const Login = async () => <LoginClient />

export default Login
