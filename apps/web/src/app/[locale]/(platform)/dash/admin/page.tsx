import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { getTranslations } from 'next-intl/server'
import { ChevronRight, Shield, Users, Database, Activity, FileText, CheckCircle } from 'lucide-react'
import type { Metadata } from 'next'
import { Link } from '@/i18n/navigation'
import DashHeader from '@/components/Dashboard/Misc/DashHeader'

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
      iconBg:
        'bg-emerald-500/10 text-emerald-500 border-emerald-500/20 group-hover:bg-emerald-500 group-hover:text-white',
    },
  ]

  // Mock platform overview data to flesh out visual layout and avoid empty spaces
  const stats = [
    { label: 'База данных', value: 'Активна', icon: Database, color: 'text-emerald-500 bg-emerald-500/10' },
    { label: 'Системные логи', value: 'В норме', icon: FileText, color: 'text-sky-500 bg-sky-500/10' },
    { label: 'Нагрузка API', value: 'Низкая (0.2s)', icon: Activity, color: 'text-amber-500 bg-amber-500/10' },
  ]

  const recentLogs = [
    { event: 'Изменение роли пользователя', user: 'admin@ashyq-bilim.kz', time: '10 мин. назад', status: 'success' },
    {
      event: 'Создание новой политики доступа',
      user: 'manager@ashyq-bilim.kz',
      time: '1 час назад',
      status: 'success',
    },
    { event: 'Синхронизация базы пользователей', user: 'system', time: '3 часа назад', status: 'success' },
  ]

  return (
    <div className="bg-background flex min-h-screen w-full flex-col">
      {/* Standard Header */}
      <DashHeader breadcrumbType="admin" title={t('title')} description={t('description')} />

      <main className="container mx-auto flex-1 space-y-8 px-4 py-8 lg:px-8">
        {/* Core Administrative Sections */}
        <div className="space-y-4">
          <h2 className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">{t('panelsTitle')}</h2>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {adminSections.map(section => (
              <Link key={section.href} href={section.href} className="group block">
                <Card className="bg-card hover:bg-accent/30 border-border/80 hover:border-border/100 relative flex h-full flex-col justify-between overflow-hidden rounded-2xl transition-all duration-300 select-none hover:shadow-sm">
                  <CardHeader className="px-5 pt-5 pb-3">
                    <div className="flex items-start justify-between">
                      <div
                        className={`flex items-center justify-center rounded-xl border p-2.5 transition-all duration-300 ${section.iconBg}`}
                      >
                        <section.icon className="h-5 w-5" />
                      </div>
                      <ChevronRight
                        size={16}
                        className="text-muted-foreground/60 group-hover:text-foreground translate-x-[-4px] opacity-0 transition-all duration-300 group-hover:translate-x-0 group-hover:opacity-100"
                      />
                    </div>
                  </CardHeader>
                  <CardContent className="flex flex-1 flex-col justify-end px-5 pb-5">
                    <CardTitle className="text-foreground group-hover:text-primary mb-1.5 text-base font-bold tracking-tight transition-colors duration-300">
                      {section.title}
                    </CardTitle>
                    <CardDescription className="text-muted-foreground/80 text-xs leading-relaxed font-medium">
                      {section.description}
                    </CardDescription>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>

        <div className="grid gap-6 pt-4 md:grid-cols-3">
          {/* Status Metrics */}
          <div className="space-y-4 md:col-span-1">
            <h2 className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
              {t('platformStatus')}
            </h2>
            <div className="bg-muted/40 space-y-3 rounded-2xl border p-4">
              {stats.map(item => (
                <div
                  key={item.label}
                  className="bg-card flex items-center justify-between rounded-xl border p-3 shadow-2xs"
                >
                  <div className="flex items-center gap-3">
                    <div className={`rounded-lg p-2 ${item.color}`}>
                      <item.icon className="h-4 w-4" />
                    </div>
                    <span className="text-foreground text-sm font-semibold">{item.label}</span>
                  </div>
                  <span className="text-muted-foreground bg-muted rounded-md px-2.5 py-1 text-xs font-medium">
                    {item.value}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Recent Operations */}
          <div className="space-y-4 md:col-span-2">
            <h2 className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
              {t('recentEvents')}
            </h2>
            <div className="bg-card divide-border/60 divide-y overflow-hidden rounded-2xl border shadow-2xs">
              {recentLogs.map((log, index) => (
                <div key={index} className="hover:bg-accent/15 flex items-center justify-between p-4 transition-all">
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="mt-0.5 shrink-0 text-emerald-500">
                      <CheckCircle className="h-4.5 w-4.5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-foreground truncate text-sm font-semibold">{log.event}</p>
                      <p className="text-muted-foreground mt-0.5 text-xs font-medium">{log.user}</p>
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <span className="text-muted-foreground text-[11px] font-semibold">{log.time}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
