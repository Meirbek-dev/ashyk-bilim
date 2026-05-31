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
      iconBg: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20 group-hover:bg-emerald-500 group-hover:text-white',
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
    { event: 'Создание новой политики доступа', user: 'manager@ashyq-bilim.kz', time: '1 час назад', status: 'success' },
    { event: 'Синхронизация базы пользователей', user: 'system', time: '3 часа назад', status: 'success' },
  ]

  return (
    <div className="bg-background flex min-h-screen w-full flex-col">
      {/* Standard Header */}
      <DashHeader
        breadcrumbType="admin"
        title={t('title')}
        description={t('description')}
      />

      <main className="container mx-auto px-4 py-8 lg:px-8 space-y-8 flex-1">
        {/* Core Administrative Sections */}
        <div className="space-y-4">
          <h2 className="text-muted-foreground text-xs font-semibold uppercase tracking-wider">
            Панели управления
          </h2>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {adminSections.map(section => (
              <Link key={section.href} href={section.href} className="group block">
                <Card className="relative bg-card hover:bg-accent/30 border-border/80 hover:border-border/100 h-full transition-all duration-300 hover:shadow-sm select-none overflow-hidden flex flex-col justify-between rounded-2xl">
                  <CardHeader className="pb-3 pt-5 px-5">
                    <div className="flex items-start justify-between">
                      <div className={`rounded-xl p-2.5 border transition-all duration-300 flex items-center justify-center ${section.iconBg}`}>
                        <section.icon className="h-5 w-5" />
                      </div>
                      <ChevronRight
                        size={16}
                        className="text-muted-foreground/60 group-hover:text-foreground translate-x-[-4px] opacity-0 transition-all duration-300 group-hover:translate-x-0 group-hover:opacity-100"
                      />
                    </div>
                  </CardHeader>
                  <CardContent className="pb-5 px-5 flex-1 flex flex-col justify-end">
                    <CardTitle className="mb-1.5 text-base font-bold tracking-tight text-foreground group-hover:text-primary transition-colors duration-300">
                      {section.title}
                    </CardTitle>
                    <CardDescription className="text-xs leading-relaxed text-muted-foreground/80 font-medium">
                      {section.description}
                    </CardDescription>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-3 pt-4">
          {/* Status Metrics */}
          <div className="md:col-span-1 space-y-4">
            <h2 className="text-muted-foreground text-xs font-semibold uppercase tracking-wider">
              Статус платформы
            </h2>
            <div className="space-y-3 bg-muted/40 border p-4 rounded-2xl">
              {stats.map(item => (
                <div key={item.label} className="flex items-center justify-between p-3 bg-card border rounded-xl shadow-2xs">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${item.color}`}>
                      <item.icon className="h-4 w-4" />
                    </div>
                    <span className="text-foreground text-sm font-semibold">{item.label}</span>
                  </div>
                  <span className="text-muted-foreground text-xs font-medium bg-muted px-2.5 py-1 rounded-md">{item.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Recent Operations */}
          <div className="md:col-span-2 space-y-4">
            <h2 className="text-muted-foreground text-xs font-semibold uppercase tracking-wider">
              Последние системные события
            </h2>
            <div className="bg-card border rounded-2xl overflow-hidden shadow-2xs divide-y divide-border/60">
              {recentLogs.map((log, index) => (
                <div key={index} className="flex items-center justify-between p-4 hover:bg-accent/15 transition-all">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="mt-0.5 text-emerald-500 shrink-0">
                      <CheckCircle className="h-4.5 w-4.5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-foreground text-sm font-semibold truncate">{log.event}</p>
                      <p className="text-muted-foreground text-xs font-medium mt-0.5">{log.user}</p>
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
