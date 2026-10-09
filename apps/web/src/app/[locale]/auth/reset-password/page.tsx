import { Suspense } from 'react'
import { getTranslations } from 'next-intl/server'
import type { Metadata } from 'next'

import { APP_NAME } from '@/lib/constants'
import ResetPasswordClient from './reset-password'

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'Auth.ResetPassword' })
  return { title: t('title', { platformName: APP_NAME }) }
}

type ResetPasswordProps = {
  searchParams: Promise<{ email?: string | string[]; code?: string | string[] }>
}

// The `?email=&code=` prefill (the reset email's link) is request-bound: read it inside Suspense.
export default function ResetPassword(props: ResetPasswordProps) {
  return (
    <Suspense>
      <ResetPasswordPrefill searchParams={props.searchParams} />
    </Suspense>
  )
}

async function ResetPasswordPrefill({ searchParams }: ResetPasswordProps) {
  const { email, code } = await searchParams
  const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? ''
  return <ResetPasswordClient email={first(email)} code={first(code)} />
}
