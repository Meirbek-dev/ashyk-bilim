import { getTranslations } from 'next-intl/server'
import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { Suspense } from 'react'

import { APP_NAME } from '@/lib/constants'
import { getPostAuthRedirect } from '@/lib/auth/redirect'
import { getSession } from '@/lib/auth/session'
import SignupClient from './signup'

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'Auth.Signup' })
  return { title: t('title', { platformName: APP_NAME }) }
}

// The session probe is request-bound: under cache components it needs a
// Suspense boundary or Next reports a blocking prerender.
function Signup({ params }: { params: Promise<{ locale: string }> }) {
  return (
    <Suspense>
      <SignupGate params={params} />
    </Suspense>
  )
}

async function SignupGate({ params }: { params: Promise<{ locale: string }> }) {
  if (await getSession()) {
    const { locale } = await params
    redirect(getPostAuthRedirect(null, locale))
  }
  return <SignupClient />
}

export default Signup
