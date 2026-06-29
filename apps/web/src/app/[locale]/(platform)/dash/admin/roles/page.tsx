import RBACAdminClient from '@/app/_shared/dash/admin/roles/client'
import { getTranslations } from 'next-intl/server'
import type { Metadata } from 'next'

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Components.Roles')

  return {
    title: t('title'),
    description: t('cardDescription'),
  }
}

export default function PlatformAdminRolesPage() {
  return <RBACAdminClient />
}
