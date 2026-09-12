import { getUserByUsername } from '@/lib/users/server'
import { getTranslations } from 'next-intl/server'
import ResourceNotFound from '@/components/Errors/ResourceNotFound'
import type { Metadata } from 'next'
import { Suspense } from 'react'
import { APP_NAME } from '@/lib/constants'

import UserProfileClient from '@/app/_shared/withmenu/user/[username]/UserProfileClient'

interface UserPageProps {
  params: Promise<{ locale: string; username: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export async function generateMetadata({ params }: UserPageProps): Promise<Metadata> {
  const resolvedParams = await params
  const t = await getTranslations({ locale: resolvedParams.locale, namespace: 'UserProfilePage' })

  try {
    const userData = await getUserByUsername(resolvedParams.username)
    if (!userData) {
      const tErrors = await getTranslations({ locale: resolvedParams.locale, namespace: 'Errors' })
      return { title: `${tErrors('userNotFound')} - ${APP_NAME}`, robots: { index: false } }
    }

    return {
      title: `${t('metaTitle', {
        firstName: userData.first_name ?? '',
        lastName: userData.last_name ?? '',
      })} - ${APP_NAME}`,
      description:
        userData.bio ||
        t('metaDescriptionFallback', {
          firstName: userData.first_name ?? '',
          lastName: userData.last_name ?? '',
        }),
    }
  } catch {
    return {
      title: `${t('metaTitleError')} - ${APP_NAME}`,
    }
  }
}

async function UserProfile({ params }: UserPageProps) {
  const t = await getTranslations('UserProfilePage')
  const resolvedParams = await params
  const { username } = resolvedParams

  let userData
  let profile
  let hasError = false

  try {
    userData = await getUserByUsername(username)
    if (!userData) return <ResourceNotFound type="user" />
    profile = userData.profile
      ? typeof userData.profile === 'string'
        ? JSON.parse(userData.profile)
        : userData.profile
      : { sections: [] }
  } catch (error) {
    console.error('Error fetching user data:', error)
    hasError = true
  }

  if (hasError || !userData) {
    return (
      <div className="container mx-auto py-8">
        <div className="soft-shadow border-border bg-card text-card-foreground rounded-xl border p-6 shadow-sm">
          <p className="text-destructive">{t('profileLoadError')}</p>
        </div>
      </div>
    )
  }

  return (
    <div>
      <UserProfileClient userData={userData} profile={profile} />
    </div>
  )
}

// The profile lookup is dynamic; the boundary keeps the dev "uncached data
// outside <Suspense>" notice (an error-level console entry) off the page.
export default function PlatformUserPage(props: UserPageProps) {
  return (
    <Suspense fallback={null}>
      <UserProfile {...props} />
    </Suspense>
  )
}
