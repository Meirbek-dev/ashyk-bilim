import { getTranslations } from 'next-intl/server'
import { ChevronRight, Shield, Users } from 'lucide-react'
import { getStaticMetadataMessages } from '@/lib/localized-metadata'
import { Actions, Resources, Scopes } from '@/types/permissions'
import { requireAnyPermission } from '@/lib/auth/permissions'
import type { Metadata } from 'next'
import { Link } from '@/i18n/navigation'
import DashHeader from '@/components/Dashboard/Misc/DashHeader'
import { AIAdminPanel } from '@/features/ai-admin'
import { Suspense } from 'react'

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  'use cache'

  const { locale } = await params
  const { DashPage } = getStaticMetadataMessages(locale)

  return {
    title: DashPage.Admin.Index.title,
    description: DashPage.Admin.Index.description,
  }
}

function AdminPageFallback() {
  return <div className="bg-background min-h-screen" />
}

export default function PlatformAdminPage() {
  return (
    <Suspense fallback={<AdminPageFallback />}>
      <PlatformAdminContent />
    </Suspense>
  )
}

async function PlatformAdminContent() {
  await requireAnyPermission([
    { action: Actions.MANAGE, resource: Resources.APP, scope: Scopes.OWN },
    { action: Actions.UPDATE, resource: Resources.APP, scope: Scopes.OWN },
    { action: Actions.MANAGE, resource: Resources.APP, scope: Scopes.APP },
    { action: Actions.UPDATE, resource: Resources.APP, scope: Scopes.APP },
    { action: Actions.MANAGE, resource: Resources.ROLE, scope: Scopes.APP },
    { action: Actions.UPDATE, resource: Resources.ROLE, scope: Scopes.APP },
    { action: Actions.READ, resource: Resources.ROLE, scope: Scopes.APP },
  ])

  const t = await getTranslations('DashPage.Admin.Index')

  const adminSections = [
    {
      title: t('rolesTitle'),
      description: t('rolesDescription'),
      href: '/dash/admin/roles',
      icon: Shield,
    },
    {
      title: t('userRolesTitle'),
      description: t('userRolesDescription'),
      href: '/dash/admin/users',
      icon: Users,
    },
  ]

  return (
    <div className="bg-background flex min-h-screen w-full flex-col">
      {/* Standard Header */}
      <DashHeader breadcrumbType="admin" title={t('title')} description={t('description')} />

      <section className="container mx-auto flex-1 space-y-8 px-4 py-8 lg:px-8">
        {/* Core Administrative Sections */}
        <div className="space-y-4">
          <h2 className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">{t('panelsTitle')}</h2>
          <div className="grid gap-3 md:grid-cols-2">
            {adminSections.map(section => (
              <Link
                key={section.href}
                href={section.href}
                className="group bg-card hover:bg-muted/40 flex items-center gap-3 rounded-lg border p-4 transition-colors"
              >
                <section.icon className="text-muted-foreground size-5 shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="group-hover:text-primary block text-sm font-semibold">{section.title}</span>
                  <span className="text-muted-foreground block text-xs">{section.description}</span>
                </span>
                <ChevronRight className="text-muted-foreground size-4 shrink-0" />
              </Link>
            ))}
          </div>
        </div>
        <AIAdminPanel />
      </section>
    </div>
  )
}
