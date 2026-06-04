import { BarChart2, BookCopy, ChevronRight, Settings, ShieldCheck, Users } from 'lucide-react'
import touEmblemLight from '@/app/_shared/dash/images/tou_emblem_light.webp'
import ServerLink from '@/components/ui/ServerLink'
import { getTranslations } from 'next-intl/server'
import type { ReactNode } from 'react'
import Image from 'next/image'

import { canSeeAdmin, canSeeAnalytics, canSeeCourses, canSeeUsers } from '@/lib/rbac/navigation-policy'
import { requireSession } from '@/lib/auth/session'
import { sessionCan } from '@/lib/auth/permissions'

import type { Action, Resource, Scope } from '@/types/permissions'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import DashHeader from '@/components/Dashboard/Misc/DashHeader'

export default async function PlatformDashHomePage() {
  const t = await getTranslations('DashPage.Card')
  const tGeneral = await getTranslations('General')
  const session = await requireSession()
  const permsSet = new Set<string>(session.permissions)

  const can = (resource: Resource, action: Action, scope: Scope): boolean =>
    sessionCan(session, resource, action, scope, permsSet)

  const hasCoursesAccess = canSeeCourses(can)
  const hasAnalyticsAccess = canSeeAnalytics(can)
  const hasUsersAccess = canSeeUsers(can)
  const hasAdminAccess = canSeeAdmin(can)

  const cards = [
    {
      visible: hasCoursesAccess,
      href: '/dash/courses',
      icon: <BookCopy size={20} />,
      title: t('Courses.title'),
      description: t('Courses.description'),
    },
    {
      visible: hasAnalyticsAccess,
      href: '/dash/analytics',
      icon: <BarChart2 size={20} />,
      title: t('Analytics.title'),
      description: t('Analytics.description'),
    },
    {
      visible: hasUsersAccess,
      href: '/dash/users/settings/users',
      icon: <Users size={20} />,
      title: t('Users.title'),
      description: t('Users.description'),
    },
    {
      visible: hasAdminAccess,
      href: '/dash/admin',
      icon: <ShieldCheck size={20} />,
      title: t('Admin.title'),
      description: t('Admin.description'),
      badge: t('Admin.badge'),
    },
  ].filter(card => card.visible)

  return (
    <div className="bg-background flex min-h-screen w-full flex-col">
      {/* Standard Header */}
      <DashHeader title={tGeneral('dashboard')} description={tGeneral('dashboardWelcome')} />

      <main className="container mx-auto space-y-8 px-4 py-8 lg:px-8">
        {/* Dashboard Sections/Cards Grid */}
        <div className="space-y-4">
          <h3 className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
            {t('availableSections')}
          </h3>
          {cards.length > 0 ? (
            <div className="grid w-full grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {cards.map(card => (
                <DashboardCard
                  key={card.title}
                  href={card.href}
                  icon={card.icon}
                  title={card.title}
                  description={card.description}
                  {...(card.badge ? { badge: card.badge } : {})}
                />
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground text-sm font-medium">{t('noAccess')}</p>
          )}
        </div>

        {/* Platform Links / Quick Actions */}
        <div className="space-y-4 pt-4">
          <h3 className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">{t('quickLinks')}</h3>
          <div className="flex max-w-2xl flex-col gap-4 sm:flex-row">
            <ServerLink
              href="https://tou.edu.kz/ru/"
              target="_blank"
              className="border-border bg-card hover:bg-muted/40 flex flex-1 items-center justify-between gap-3 rounded-lg border p-4 transition-colors duration-200 active:translate-y-[1px]"
            >
              <div className="flex items-center gap-3">
                <div className="bg-background relative flex shrink-0 items-center justify-center rounded-md border p-1">
                  <Image
                    width={20}
                    height={20}
                    src={touEmblemLight}
                    alt={t('touUniversity')}
                    className="object-contain"
                  />
                </div>
                <span className="text-foreground text-sm font-semibold">{t('touUniversity')}</span>
              </div>
              <ChevronRight size={14} className="text-muted-foreground/40" />
            </ServerLink>

            <ServerLink
              href="/dash/user-account/settings/general"
              className="border-border bg-card hover:bg-muted/40 flex flex-1 items-center justify-between gap-3 rounded-lg border p-4 transition-colors duration-200 active:translate-y-[1px]"
            >
              <div className="flex items-center gap-3">
                <div className="bg-background text-muted-foreground flex shrink-0 items-center justify-center rounded-md border p-1">
                  <Settings size={20} className="size-5" />
                </div>
                <span className="text-foreground text-sm font-semibold">{t('AccountSettings.title')}</span>
              </div>
              <ChevronRight size={14} className="text-muted-foreground/40" />
            </ServerLink>
          </div>
        </div>
      </main>
    </div>
  )
}

const DashboardCard = ({
  href,
  icon,
  title,
  description,
  badge,
}: {
  href: string
  icon: ReactNode
  title: string
  description: string
  badge?: string
}) => {
  return (
    <ServerLink href={href} className="group block h-full">
      <Card className="bg-card hover:bg-muted/40 hover:border-foreground/20 border-border/80 relative flex h-full flex-col justify-between overflow-hidden rounded-lg transition-colors duration-200 select-none">
        <CardHeader className="px-5 pt-5 pb-3">
          <div className="flex items-start justify-between">
            <div className="bg-muted text-muted-foreground group-hover:bg-muted/70 flex items-center justify-center rounded-md border p-2 transition-colors duration-200">
              {icon}
            </div>
            <div className="flex items-center gap-2">
              {badge && (
                <Badge
                  variant="secondary"
                  className="border-transparent px-2 py-0.5 text-[10px] font-semibold tracking-wider uppercase"
                >
                  {badge}
                </Badge>
              )}
              <ChevronRight
                size={16}
                className="text-muted-foreground/40 group-hover:text-foreground/70 transition-colors duration-200"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex flex-1 flex-col justify-end px-5 pb-5">
          <CardTitle className="text-foreground mb-1 text-sm font-semibold tracking-tight">{title}</CardTitle>
          <CardDescription className="text-muted-foreground text-xs leading-relaxed">{description}</CardDescription>
        </CardContent>
      </Card>
    </ServerLink>
  )
}
