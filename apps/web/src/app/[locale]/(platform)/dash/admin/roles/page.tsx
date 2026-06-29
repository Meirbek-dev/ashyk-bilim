import RBACAdminClient from '@/app/_shared/dash/admin/roles/client'
import { getTranslations } from 'next-intl/server'
import type { Metadata } from 'next'

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'Components.Roles' })

  return {
    title: t('title'),
    description: t('cardDescription'),
  }
}

export default function PlatformAdminRolesPage() {
  return <RBACAdminClient />
}
