import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { Suspense } from 'react'

import Users from '@/components/Dashboard/Pages/Users/Users/Users'
import { requireAnyPermission } from '@/lib/auth/permissions'
import { Actions, Resources, Scopes } from '@/types/permissions'

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'DashPage.UserSettings' })
  return { title: t('usersTitle') }
}

// Mirrors the server gate on `GET /users` (`platform:read:platform`); see
// `canSeeUsers` in lib/rbac/navigation-policy.ts.
async function Gate() {
  await requireAnyPermission([
    { action: Actions.READ, resource: Resources.APP, scope: Scopes.APP },
    { action: Actions.UPDATE, resource: Resources.USER, scope: Scopes.APP },
  ])
  return <Users />
}

// The session read is dynamic; a boundary keeps the dev "uncached data
// outside <Suspense>" notice off the page (UX-241, as /usergroups).
export default function UsersPage() {
  return (
    <Suspense fallback={null}>
      <Gate />
    </Suspense>
  )
}
