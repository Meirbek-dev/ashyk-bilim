import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { Suspense } from 'react'

import UserGroups from '@/components/Dashboard/Pages/Users/UserGroups/UserGroups'
import { requireAnyPermission } from '@/lib/auth/permissions'
import { Actions, Resources, Scopes } from '@/types/permissions'

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'DashPage.UserSettings' })
  return { title: t('usergroupsTitle') }
}

// Mirrors the server gate on `GET /usergroups` (`usergroup:read:platform`).
async function Gate() {
  await requireAnyPermission([
    { action: Actions.READ, resource: Resources.USERGROUP, scope: Scopes.APP },
    { action: Actions.MANAGE, resource: Resources.USERGROUP, scope: Scopes.APP },
  ])
  return <UserGroups />
}

// The session read is dynamic; a boundary keeps the dev "uncached data
// outside <Suspense>" notice (an error-level console entry) off the page.
export default function UserGroupsPage() {
  return (
    <Suspense fallback={null}>
      <Gate />
    </Suspense>
  )
}
