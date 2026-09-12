import { Suspense } from 'react'
import { getTranslations } from 'next-intl/server'
import type { Metadata } from 'next'

import { APP_NAME } from '@/lib/constants'
import VerifyEmailClient from './verify-email'

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'Auth.VerifyEmail' })
  return { title: t('title', { platformName: APP_NAME }) }
}

// `useSearchParams` needs a Suspense boundary for the static shell.
export default function VerifyEmail() {
  return (
    <Suspense>
      <VerifyEmailClient />
    </Suspense>
  )
}
