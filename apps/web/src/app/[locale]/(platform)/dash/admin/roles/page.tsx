import RBACAdminClient from '@/app/_shared/dash/admin/roles/client'
import { Actions, Resources, Scopes } from '@/types/permissions'
import { requireAnyPermission } from '@/lib/auth/permissions'
import { getStaticMetadataMessages } from '@/lib/localized-metadata'
import type { Metadata } from 'next'
import { Suspense } from 'react'

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  'use cache'

  const { locale } = await params
  const { Components } = getStaticMetadataMessages(locale)

  return {
    title: Components.Roles.title,
    description: Components.Roles.cardDescription,
  }
}

function AdminRolesFallback() {
  return <div className="bg-background min-h-screen" />
}

export default function PlatformAdminRolesPage() {
  return (
    <Suspense fallback={<AdminRolesFallback />}>
      <PlatformAdminRolesContent />
    </Suspense>
  )
}

async function PlatformAdminRolesContent() {
  await requireAnyPermission([
    { action: Actions.MANAGE, resource: Resources.APP, scope: Scopes.OWN },
    { action: Actions.UPDATE, resource: Resources.APP, scope: Scopes.OWN },
    { action: Actions.MANAGE, resource: Resources.APP, scope: Scopes.APP },
    { action: Actions.UPDATE, resource: Resources.APP, scope: Scopes.APP },
    { action: Actions.MANAGE, resource: Resources.ROLE, scope: Scopes.APP },
    { action: Actions.UPDATE, resource: Resources.ROLE, scope: Scopes.APP },
    { action: Actions.READ, resource: Resources.ROLE, scope: Scopes.APP },
  ])

  return <RBACAdminClient />
}
