import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { getTranslations } from 'next-intl/server'
import { ChevronRight, Shield, Users } from 'lucide-react'
import type { Metadata } from 'next'
import { Link } from '@/i18n/navigation'
import DashHeader from '@/components/Dashboard/Misc/DashHeader'
import { AIAdminPanel } from '@/features/ai-admin'

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'DashPage.Admin.Index' })
  return {
    title: t('title'),
    description: t('description'),
  }
}

export default async function PlatformAdminPage() {
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

      <main className="container mx-auto flex-1 space-y-8 px-4 py-8 lg:px-8">
        {/* Core Administrative Sections */}
        <div className="space-y-4">
          <h2 className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">{t('panelsTitle')}</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {adminSections.map(section => (
              <Link key={section.href} href={section.href} className="group block">
                <Card className="bg-card hover:bg-muted/30 border-border relative flex h-full flex-col justify-between transition-colors select-none">
                  <CardHeader className="px-5 pt-5 pb-3">
                    <div className="flex items-start justify-between">
                      <section.icon className="text-muted-foreground h-5 w-5" />
                      <ChevronRight
                        size={16}
                        className="text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
                      />
                    </div>
                  </CardHeader>
                  <CardContent className="flex flex-1 flex-col justify-end px-5 pb-5">
                    <CardTitle className="text-foreground group-hover:text-primary mb-1.5 text-sm font-semibold tracking-tight transition-colors">
                      {section.title}
                    </CardTitle>
                    <CardDescription className="text-muted-foreground text-xs leading-relaxed">
                      {section.description}
                    </CardDescription>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>
        <AIAdminPanel />
      </main>
    </div>
  )
}
