import { BarChart2, BookCopy, ChevronRight, Settings, ShieldCheck, Users } from 'lucide-react'
import ServerLink from '@/components/ui/ServerLink'
import { getTranslations } from 'next-intl/server'
import type { ReactNode } from 'react'

import { canSeeAdmin, canSeeAnalytics, canSeeCourses, canSeeUsers } from '@/lib/rbac/navigation-policy'
import { requireSession } from '@/lib/auth/session'
import { sessionCan } from '@/lib/auth/permissions'

import type { Action, Resource, Scope } from '@/types/permissions'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import DashHeader from '@/components/Dashboard/Misc/DashHeader'

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false

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
    {
      visible: true,
      href: '/dash/user-account/settings/general',
      icon: <Settings size={20} />,
      title: t('AccountSettings.title'),
      description: t('AccountSettings.description'),
    },
  ].filter(card => card.visible)

  return (
    <div className="bg-background flex min-h-screen w-full flex-col">
      {/* Standard Header */}
      <DashHeader title={tGeneral('dashboard')} description={tGeneral('dashboardWelcome')} />

      <main className="container mx-auto space-y-6 px-4 py-8 md:space-y-8 md:py-12 lg:px-8">
        {/* Dashboard Sections/Cards Grid */}
        <div className="space-y-4">
          <h2 className="text-muted-foreground/60 text-[10px] font-medium tracking-wider uppercase select-none">
            {t('availableSections')}
          </h2>
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
      <Card className="border-border/50 bg-card hover:bg-muted/30 hover:border-border/80 flex h-full flex-col justify-between p-6 transition-all duration-200 select-none">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="text-muted-foreground group-hover:text-foreground size-5 transition-colors duration-200">
              {icon}
            </div>
            <div className="flex items-center gap-2">
              {badge && (
                <Badge
                  variant="outline"
                  className="border-border/85 text-muted-foreground/90 bg-transparent px-1.5 py-0.5 text-[9px] font-medium tracking-wide uppercase"
                >
                  {badge}
                </Badge>
              )}
              <ChevronRight
                size={14}
                className="text-muted-foreground/30 group-hover:text-foreground/70 transition-colors duration-200"
              />
            </div>
          </div>
          <div className="space-y-1">
            <h3 className="text-foreground text-sm font-semibold tracking-tight">{title}</h3>
            <p className="text-muted-foreground text-xs leading-normal">{description}</p>
          </div>
        </div>
      </Card>
    </ServerLink>
  )
}
