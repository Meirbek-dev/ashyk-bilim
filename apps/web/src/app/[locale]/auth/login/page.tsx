import { getTranslations } from 'next-intl/server'
import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { Suspense } from 'react'

import { APP_NAME } from '@/lib/constants'
import { getPostAuthRedirect } from '@/lib/auth/redirect'
import { getSession } from '@/lib/auth/session'
import LoginClient from './login'

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'Auth.Login' })

  return {
    title: t('title', { platformName: APP_NAME }),
  }
}

type LoginProps = {
  params: Promise<{ locale: string }>
  searchParams: Promise<{ returnTo?: string | string[] }>
}

// The session probe is request-bound: under cache components it needs a
// Suspense boundary or Next reports a blocking prerender on every visit.
function Login(props: LoginProps) {
  return (
    <Suspense>
      <LoginGate {...props} />
    </Suspense>
  )
}

async function LoginGate({ params, searchParams }: LoginProps) {
  // Already signed in: the form is pointless — land where a fresh login would.
  if (await getSession()) {
    const [{ locale }, { returnTo }] = await Promise.all([params, searchParams])
    redirect(getPostAuthRedirect(Array.isArray(returnTo) ? returnTo[0] : returnTo, locale))
  }
  return <LoginClient />
}

export default Login
