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

type VerifyEmailProps = {
  searchParams: Promise<{ email?: string | string[]; code?: string | string[] }>
}

// The `?email=&code=` prefill is request-bound: read it inside Suspense so
// the route streams instead of blocking on URL data.
export default function VerifyEmail(props: VerifyEmailProps) {
  return (
    <Suspense>
      <VerifyEmailPrefill searchParams={props.searchParams} />
    </Suspense>
  )
}

async function VerifyEmailPrefill({ searchParams }: VerifyEmailProps) {
  const { email, code } = await searchParams
  const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? ''
  return <VerifyEmailClient email={first(email)} code={first(code)} />
}
