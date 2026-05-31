import { BarChart2, BookCopy, ChevronRight, School, Settings, ShieldCheck, Users } from 'lucide-react'
import touEmblemLight from '@/app/_shared/dash/images/tou_emblem_light.webp'
import ServerLink from '@/components/ui/ServerLink'
import { getTranslations } from 'next-intl/server'
import type { ReactNode } from 'react'
import Image from 'next/image'

import { canSeeAdmin, canSeeAnalytics, canSeeCourses, canSeePlatform, canSeeUsers } from '@/lib/rbac/navigation-policy'
import { requireSession } from '@/lib/auth/session'
import { sessionCan } from '@/lib/auth/permissions'

import appLogoFull from '@public/app_logo_full.svg'
import appLogoLightFull from '@public/app_logo_light_full.svg'
import type { Action, Resource, Scope } from '@/types/permissions'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

export default async function PlatformDashHomePage() {
  const t = await getTranslations('DashPage.Card')
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
      icon: <BookCopy size={22} className="text-violet-500" />,
      iconBg: 'bg-violet-500/10 text-violet-500 border-violet-500/20 group-hover:bg-violet-500 group-hover:text-white',
      title: t('Courses.title'),
      description: t('Courses.description'),
    },
    {
      visible: hasAnalyticsAccess,
      href: '/dash/analytics',
      icon: <BarChart2 size={22} className="text-emerald-500" />,
      iconBg: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20 group-hover:bg-emerald-500 group-hover:text-white',
      title: t('Analytics.title'),
      description: t('Analytics.description'),
    },
    {
      visible: hasPlatformAccess,
      href: '/dash/platform/settings/landing',
      icon: <School size={22} className="text-amber-500" />,
      iconBg: 'bg-amber-500/10 text-amber-500 border-amber-500/20 group-hover:bg-amber-500 group-hover:text-white',
      title: t('Platform.title'),
      description: t('Platform.description'),
    },
    {
      visible: hasUsersAccess,
      href: '/dash/users/settings/users',
      icon: <Users size={22} className="text-sky-500" />,
      iconBg: 'bg-sky-500/10 text-sky-500 border-sky-500/20 group-hover:bg-sky-500 group-hover:text-white',
      title: t('Users.title'),
      description: t('Users.description'),
    },
    {
      visible: hasAdminAccess,
      href: '/dash/admin',
      icon: <ShieldCheck size={22} className="text-rose-500" />,
      iconBg: 'bg-rose-500/10 text-rose-500 border-rose-500/20 group-hover:bg-rose-500 group-hover:text-white',
      title: t('Admin.title'),
      description: t('Admin.description'),
      badge: t('Admin.badge'),
    },
  ].filter(card => card.visible)

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-radial from-background via-background to-muted/20 px-4 py-16">
      {/* Decorative Premium Glow Background elements */}
      <div className="absolute top-1/4 left-1/4 -z-10 h-72 w-72 rounded-full bg-primary/5 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 -z-10 h-96 w-96 rounded-full bg-violet-500/5 blur-[140px] pointer-events-none" />

      {/* Logo Wrapper */}
      <div className="mb-14 text-center">
        <div className="relative inline-block transition-transform hover:scale-102 duration-300">
          <Image
            alt={t('appLogo')}
            width={210}
            height={77}
            src={appLogoFull}
            className="theme-logo-dark w-44 sm:w-[210px]"
            style={{ height: 'auto' }}
            loading="eager"
          />
          <Image
            alt={t('appLogo')}
            width={210}
            height={77}
            src={appLogoLightFull}
            className="theme-logo-light w-44 sm:w-[210px]"
            style={{ height: 'auto' }}
            loading="eager"
          />
        </div>
      </div>

      {/* Nav Cards Grid */}
      {cards.length > 0 ? (
        <div className="grid w-full max-w-4xl grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
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

      {/* Bottom section with university and settings links */}
      <div className="mt-12 flex flex-col gap-6 sm:mt-16 sm:gap-8 items-center w-full max-w-md">
        <div className="h-[1px] w-24 bg-border/60" />
        
        <div className="flex flex-col sm:flex-row gap-4 items-center justify-center w-full">
          <ServerLink
            href="https://tou.edu.kz/ru/"
            target="_blank"
            className="flex w-full sm:w-auto items-center justify-center gap-2.5 rounded-xl border border-border bg-card/85 hover:bg-accent/50 px-6 py-2.5 shadow-sm hover:shadow transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 text-sm font-semibold"
          >
            <Image width={22} height={22} src={touEmblemLight} alt={t('touUniversity')} className="object-contain" />
            <span className="text-foreground">{t('touUniversity')}</span>
          </ServerLink>

          <ServerLink
            href="/dash/user-account/settings/general"
            className="flex w-full sm:w-auto items-center justify-center gap-2.5 rounded-xl border border-border bg-card/85 hover:bg-accent/50 px-6 py-2.5 shadow-sm hover:shadow transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 text-sm font-semibold"
          >
            <Settings className="text-muted-foreground shrink-0" size={16} />
            <span className="text-foreground">{t('AccountSettings.title')}</span>
          </ServerLink>
        </div>
      </div>
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
      <Card className="relative bg-card/85 hover:bg-accent/40 border-border/80 hover:border-border/100 backdrop-blur-xs h-full transition-all duration-300 hover:shadow-md hover:-translate-y-1 select-none overflow-hidden flex flex-col justify-between">
        <CardHeader className="pb-3 pt-5">
          <div className="flex items-start justify-between">
            <div className={`rounded-lg p-2 border transition-all duration-300 ${iconBg}`}>
              {icon}
            </div>
            <div className="flex items-center gap-2">
              {badge && (
                <Badge variant="secondary" className="bg-primary/10 text-primary hover:bg-primary/15 border-transparent text-[10px] uppercase font-bold tracking-wider px-2 py-0.5">
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
        <CardContent className="pb-6">
          <CardTitle className="mb-2 text-base font-bold tracking-tight text-foreground group-hover:text-primary transition-colors duration-300">{title}</CardTitle>
          <CardDescription className="text-xs leading-relaxed text-muted-foreground/90 font-medium">{description}</CardDescription>
        </CardContent>
      </Card>
    </ServerLink>
  )
}
