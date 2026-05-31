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
      iconBg: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20 group-hover:bg-emerald-500 group-hover:text-white',
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
        description={tGeneral('dashboardWelcome') || 'Добро пожаловать в панель управления платформой. Быстрый переход к основным разделам.'}
      />

      <main className="container mx-auto px-4 py-8 lg:px-8 space-y-8">
        {/* Welcome and Status Banner Component */}
        <div className="bg-muted/40 border-border/60 rounded-2xl border p-6 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-1">
            <h2 className="text-foreground text-xl font-bold">
              Рады вас видеть, {session.user?.username || session.user?.email || 'Пользователь'}
            </h2>
            <p className="text-muted-foreground text-xs sm:text-sm">
              Ваш аккаунт подключен. Выполнен вход в систему управления Ashyq Bilim.
            </p>
          </div>
          
          <div className="flex flex-wrap items-center gap-3">
            <Badge variant="outline" className="bg-background py-1.5 px-3 border-border/80">
              <span className="bg-emerald-500 mr-2 h-2.5 w-2.5 rounded-full inline-block animate-pulse" />
              <span>Сессия активна</span>
            </Badge>
            <Badge variant="outline" className="bg-background py-1.5 px-3 border-border/80 text-muted-foreground uppercase font-semibold tracking-wider text-[10px]">
              {session.roles?.map(r => r.role.name).join(', ') || 'User'}
            </Badge>
          </div>
        </div>

        {/* Dashboard Sections/Cards Grid */}
        <div className="space-y-4">
          <h3 className="text-muted-foreground text-xs font-semibold uppercase tracking-wider">
            Доступные разделы
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
        <div className="pt-4 space-y-4">
          <h3 className="text-muted-foreground text-xs font-semibold uppercase tracking-wider">
            Быстрые ссылки
          </h3>
          <div className="flex flex-col sm:flex-row gap-4 max-w-2xl">
            <ServerLink
              href="https://tou.edu.kz/ru/"
              target="_blank"
              className="flex-1 flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-4 shadow-2xs hover:shadow-sm hover:border-border-100 hover:bg-accent/35 transition-all duration-200 active:translate-y-[1px]"
            >
              <div className="flex items-center gap-3">
                <div className="relative shrink-0 flex items-center justify-center p-1 rounded-lg border bg-background">
                  <Image width={20} height={20} src={touEmblemLight} alt={t('touUniversity')} className="object-contain" />
                </div>
                <span className="text-foreground text-sm font-semibold">{t('touUniversity')}</span>
              </div>
              <ChevronRight size={14} className="text-muted-foreground/60" />
            </ServerLink>

            <ServerLink
              href="/dash/user-account/settings/general"
              className="flex-1 flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-4 shadow-2xs hover:shadow-sm hover:border-border-100 hover:bg-accent/35 transition-all duration-200 active:translate-y-[1px]"
            >
              <div className="flex items-center gap-3">
                <div className="p-1 rounded-lg border bg-background text-muted-foreground">
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
      <Card className="relative bg-card hover:bg-accent/30 border-border/80 hover:border-border/100 h-full transition-all duration-300 hover:shadow-sm select-none overflow-hidden flex flex-col justify-between rounded-2xl">
        <CardHeader className="pb-3 pt-5 px-5">
          <div className="flex items-start justify-between">
            <div className={`rounded-xl p-2.5 border transition-all duration-300 flex items-center justify-center ${iconBg}`}>
              {icon}
            </div>
            <div className="flex items-center gap-2">
              {badge && (
                <Badge variant="secondary" className="bg-primary/10 text-primary hover:bg-primary/15 border-transparent text-[10px] uppercase font-bold tracking-wider px-2.5 py-0.5">
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
        <CardContent className="pb-5 px-5 flex-1 flex flex-col justify-end">
          <CardTitle className="mb-1.5 text-base font-bold tracking-tight text-foreground group-hover:text-primary transition-colors duration-300">{title}</CardTitle>
          <CardDescription className="text-xs leading-relaxed text-muted-foreground/80 font-medium">{description}</CardDescription>
        </CardContent>
      </Card>
    </ServerLink>
  )
}
