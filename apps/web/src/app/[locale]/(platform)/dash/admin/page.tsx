import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import AdminHeaderClient from '@/app/_shared/dash/admin/AdminHeaderClient'
import { getTranslations } from 'next-intl/server'
import { ChevronRight, Shield, Users } from 'lucide-react'
import type { Metadata } from 'next'
import { Link } from '@/i18n/navigation'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('DashPage.Admin.Index')
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
      iconBg: 'bg-indigo-500/10 text-indigo-500 border-indigo-500/20 group-hover:bg-indigo-500 group-hover:text-white',
    },
    {
      title: t('userRolesTitle'),
      description: t('userRolesDescription'),
      href: '/dash/admin/users',
      icon: Users,
      iconBg: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20 group-hover:bg-emerald-500 group-hover:text-white',
    },
  ]

  return (
    <div className="container mx-auto space-y-8 p-4 lg:p-8">
      <div>
        <AdminHeaderClient />
      </div>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {adminSections.map(section => (
          <Link key={section.href} href={section.href} className="group block">
            <Card className="relative bg-card hover:bg-accent/40 border-border/80 hover:border-border/100 backdrop-blur-xs h-full transition-all duration-300 hover:shadow-md hover:-translate-y-1 select-none overflow-hidden flex flex-col justify-between">
              <CardHeader className="pb-3 pt-5">
                <div className="flex items-start justify-between">
                  <div className={`rounded-lg p-2 border transition-all duration-300 ${section.iconBg}`}>
                    <section.icon className="h-5 w-5" />
                  </div>
                  <ChevronRight
                    size={16}
                    className="text-muted-foreground/60 group-hover:text-foreground translate-x-[-4px] opacity-0 transition-all duration-300 group-hover:translate-x-0 group-hover:opacity-100"
                  />
                </div>
              </CardHeader>
              <CardContent className="pb-6">
                <CardTitle className="mb-2 text-base font-bold tracking-tight text-foreground group-hover:text-primary transition-colors duration-300">
                  {section.title}
                </CardTitle>
                <CardDescription className="text-xs leading-relaxed text-muted-foreground/90 font-medium">
                  {section.description}
                </CardDescription>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}
