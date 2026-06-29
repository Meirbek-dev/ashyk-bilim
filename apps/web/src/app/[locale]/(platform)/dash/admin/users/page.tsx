import UserRolesClient from '@/app/_shared/dash/admin/users/client'
import { Actions, Resources, Scopes } from '@/types/permissions'
import { requirePermission } from '@/lib/auth/permissions'
import { getTranslations } from 'next-intl/server'
import type { Metadata } from 'next'

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'Components.Roles' })

  return {
    title: t('userRolesTitle'),
    description: t('userRolesDescription'),
  }
}

export default async function PlatformAdminUsersPage() {
  await requirePermission(Actions.MANAGE, Resources.ROLE, Scopes.APP)
  return <UserRolesClient />
}
