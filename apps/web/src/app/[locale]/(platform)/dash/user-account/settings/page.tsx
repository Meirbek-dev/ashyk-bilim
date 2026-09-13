import { redirect } from '@/i18n/navigation'

export default async function UserAccountSettingsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  redirect({ href: '/dash/user-account/settings/general', locale })
}
