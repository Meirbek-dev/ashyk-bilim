import { BarChart2, BookCopy, ChevronRight, School, Settings, ShieldCheck, Users } from 'lucide-react'
import touEmblemLight from '@/app/_shared/dash/images/tou_emblem_light.webp'
import ServerLink from '@/components/ui/ServerLink'
import { getTranslations } from 'next-intl/server'
import type { ReactNode } from 'react'
import Image from 'next/image'

import { canSeeAdmin, canSeeAnalytics, canSeeCourses, canSeePlatform, canSeeUsers } from '@/lib/rbac/navigation-policy'
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
  const hasPlatformAccess = canSeePlatform(can)
  const hasUsersAccess = canSeeUsers(can)
  const hasAdminAccess = canSeeAdmin(can)

  const cards = [
    {
      visible: hasCoursesAccess,
      href: '/dash/courses',
      icon: <BookCopy size={20} className="text-primary" />,
      iconBg: 'bg-primary/10 text-primary border-primary/20 group-hover:bg-primary group-hover:text-white',
      title: t('Courses.title'),
      description: t('Courses.description'),
    },
    {
      visible: hasAnalyticsAccess,
      href: '/dash/analytics',
      icon: <BarChart2 size={20} className="text-emerald-500" />,
      iconBg:
        'bg-emerald-500/10 text-emerald-500 border-emerald-500/20 group-hover:bg-emerald-500 group-hover:text-white',
      title: t('Analytics.title'),
      description: t('Analytics.description'),
    },
    {
      visible: hasPlatformAccess,
      href: '/dash/platform/settings/landing',
      icon: <School size={20} className="text-amber-500" />,
      iconBg: 'bg-amber-500/10 text-amber-500 border-amber-500/20 group-hover:bg-amber-500 group-hover:text-white',
      title: t('Platform.title'),
      description: t('Platform.description'),
    },
    {
      visible: hasUsersAccess,
      href: '/dash/users/settings/users',
      icon: <Users size={20} className="text-sky-500" />,
      iconBg: 'bg-sky-500/10 text-sky-500 border-sky-500/20 group-hover:bg-sky-500 group-hover:text-white',
      title: t('Users.title'),
      description: t('Users.description'),
    },
    {
      visible: hasAdminAccess,
      href: '/dash/admin',
      icon: <ShieldCheck size={20} className="text-rose-500" />,
      iconBg: 'bg-rose-500/10 text-rose-500 border-rose-500/20 group-hover:bg-rose-500 group-hover:text-white',
      title: t('Admin.title'),
      description: t('Admin.description'),
      badge: t('Admin.badge'),
    },
  ].filter(card => card.visible)

  return (
    <div className="bg-background flex min-h-screen w-full flex-col">
      {/* Standard Header */}
      <DashHeader
        title={tGeneral('dashboard') || 'Главная панель'}
        description={
          tGeneral('dashboardWelcome') ||
          'Добро пожаловать в панель управления платформой. Быстрый переход к основным разделам.'
        }
      />

      <main className="container mx-auto space-y-8 px-4 py-8 lg:px-8">
        {/* Welcome and Status Banner Component */}
        <div className="bg-muted/40 border-border/60 flex flex-col justify-between gap-6 rounded-2xl border p-6 md:flex-row md:items-center">
          <div className="space-y-1">
            <h2 className="text-foreground text-xl font-bold">
              {t('welcomeUser', { name: session.user?.username || session.user?.email || t('defaultUser') })}
            </h2>
            <p className="text-muted-foreground text-xs sm:text-sm">{t('accountConnected')}</p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Badge variant="outline" className="bg-background border-border/80 px-3 py-1.5">
              <span className="mr-2 inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-emerald-500" />
              <span>{t('sessionActive')}</span>
            </Badge>
            <Badge
              variant="outline"
              className="bg-background border-border/80 text-muted-foreground px-3 py-1.5 text-[10px] font-semibold tracking-wider uppercase"
            >
              {session.roles?.map(r => r.role.name).join(', ') || 'User'}
            </Badge>
          </div>
        </div>

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
                  iconBg={card.iconBg}
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
              className="border-border bg-card hover:border-border-100 hover:bg-accent/35 flex flex-1 items-center justify-between gap-3 rounded-xl border p-4 shadow-2xs transition-all duration-200 hover:shadow-sm active:translate-y-[1px]"
            >
              <div className="flex items-center gap-3">
                <div className="bg-background relative flex shrink-0 items-center justify-center rounded-lg border p-1">
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
              <ChevronRight size={14} className="text-muted-foreground/60" />
            </ServerLink>

            <ServerLink
              href="/dash/user-account/settings/general"
              className="border-border bg-card hover:border-border-100 hover:bg-accent/35 flex flex-1 items-center justify-between gap-3 rounded-xl border p-4 shadow-2xs transition-all duration-200 hover:shadow-sm active:translate-y-[1px]"
            >
              <div className="flex items-center gap-3">
                <div className="bg-background text-muted-foreground rounded-lg border p-1">
                  <Settings size={20} />
                </div>
                <span className="text-foreground text-sm font-semibold">{t('AccountSettings.title')}</span>
              </div>
              <ChevronRight size={14} className="text-muted-foreground/60" />
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
  iconBg,
  title,
  description,
  badge,
}: {
  href: string
  icon: ReactNode
  iconBg: string
  title: string
  description: string
  badge?: string
}) => {
  return (
    <ServerLink href={href} className="group block h-full">
      <Card className="bg-card hover:bg-accent/30 border-border/80 hover:border-border/100 relative flex h-full flex-col justify-between overflow-hidden rounded-2xl transition-all duration-300 select-none hover:shadow-sm">
        <CardHeader className="px-5 pt-5 pb-3">
          <div className="flex items-start justify-between">
            <div
              className={`flex items-center justify-center rounded-xl border p-2.5 transition-all duration-300 ${iconBg}`}
            >
              {icon}
            </div>
            <div className="flex items-center gap-2">
              {badge && (
                <Badge
                  variant="secondary"
                  className="bg-primary/10 text-primary hover:bg-primary/15 border-transparent px-2.5 py-0.5 text-[10px] font-bold tracking-wider uppercase"
                >
                  {badge}
                </Badge>
              )}
              <ChevronRight
                size={16}
                className="text-muted-foreground/60 group-hover:text-foreground translate-x-[-4px] opacity-0 transition-all duration-300 group-hover:translate-x-0 group-hover:opacity-100"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex flex-1 flex-col justify-end px-5 pb-5">
          <CardTitle className="text-foreground group-hover:text-primary mb-1.5 text-base font-bold tracking-tight transition-colors duration-300">
            {title}
          </CardTitle>
          <CardDescription className="text-muted-foreground/80 text-xs leading-relaxed font-medium">
            {description}
          </CardDescription>
        </CardContent>
      </Card>
    </ServerLink>
  )
}
