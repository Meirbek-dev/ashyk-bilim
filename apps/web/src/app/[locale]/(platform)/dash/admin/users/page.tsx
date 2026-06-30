import UserRolesClient from '@/app/_shared/dash/admin/users/client'
import { Actions, Resources, Scopes } from '@/types/permissions'
import { requirePermission } from '@/lib/auth/permissions'
import { getStaticMetadataMessages } from '@/lib/localized-metadata'
import type { Metadata } from 'next'
import { Suspense } from 'react'

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  'use cache'

  const { locale } = await params
  const { Components } = getStaticMetadataMessages(locale)

  return {
    title: Components.Roles.userRolesTitle,
    description: Components.Roles.userRolesDescription,
  }
}

function AdminUsersFallback() {
  return <div className="bg-background min-h-screen" />
}

export default function PlatformAdminUsersPage() {
  return (
    <Suspense fallback={<AdminUsersFallback />}>
      <PlatformAdminUsersContent />
    </Suspense>
  )
}

async function PlatformAdminUsersContent() {
  await requirePermission(Actions.MANAGE, Resources.ROLE, Scopes.APP)
  return <UserRolesClient />
}
