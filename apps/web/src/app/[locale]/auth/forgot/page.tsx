import { getTranslations } from 'next-intl/server'
import type { Metadata } from 'next'

import ForgotPasswordClient from './forgot'

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Auth.Forgot')
  return {
    title: t('title'),
  }
}

const ForgotPasswordPage = () => {
  return <ForgotPasswordClient />
}

export default ForgotPasswordPage
