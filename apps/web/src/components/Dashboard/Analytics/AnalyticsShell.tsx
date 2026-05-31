'use client'

import type {
  AdminAnalyticsResponse,
  AnalyticsFilterOption,
  AnalyticsQuery,
  TeacherOverviewResponse,
} from '@/types/analytics'
import { getAnalyticsExportUrl } from '@services/analytics/teacher'
import AnalyticsExportButton from './AnalyticsExportButton'
import { useTranslations } from 'next-intl'
import TeacherFilterBar from './TeacherFilterBar'
import { Badge } from '@/components/ui/badge'
import { useSearchParams } from 'next/navigation'
import { LayoutDashboard, Users, Award, Clock, ShieldCheck } from 'lucide-react'
import SavedViewsBar from './SavedViewsBar'
import DashHeader from '@/components/Dashboard/Misc/DashHeader'
import SettingsTabs from '@/components/Dashboard/Misc/SettingsTabs'
import { cn } from '@/lib/utils'

interface AnalyticsShellProps {
  query: AnalyticsQuery
  overview: TeacherOverviewResponse
  adminData?: AdminAnalyticsResponse | null
  activeTab: 'overview' | 'watchlist' | 'performance' | 'operations' | 'admin'
  courseOptions?: AnalyticsFilterOption[]
  cohortOptions?: AnalyticsFilterOption[]
  children: React.ReactNode
}

const EMPTY_FILTER_OPTIONS: AnalyticsFilterOption[] = []

export default function AnalyticsShell({
  query,
  overview,
  adminData,
  activeTab,
  courseOptions = EMPTY_FILTER_OPTIONS,
  cohortOptions = EMPTY_FILTER_OPTIONS,
  children,
}: AnalyticsShellProps) {
  const t = useTranslations('TeacherAnalytics')
  const searchParams = useSearchParams()

  // Generate tab link preserving existing search params
  const getTabHref = (tabId: string) => {
    const params = new URLSearchParams(searchParams.toString())
    // Tab state is now encoded in the path, so remove the legacy query param if present
    params.delete('tab')
    const serialized = params.toString()
    return `/dash/analytics/${tabId}${serialized ? `?${serialized}` : ''}`
  }

  const tabs = [
    { id: 'overview', labelKey: 'tabs.overview', icon: LayoutDashboard },
    { id: 'watchlist', labelKey: 'tabs.watchlist', icon: Users },
    { id: 'performance', labelKey: 'tabs.performance', icon: Award },
    { id: 'operations', labelKey: 'tabs.operations', icon: Clock },
    ...(adminData ? [{ id: 'admin', labelKey: 'tabs.admin', icon: ShieldCheck }] : []),
  ]

  const renderAnalyticsTab = (tab: any, isActive: boolean) => {
    const Icon = tab.icon
    return (
      <div
        className={cn(
          'relative flex items-center gap-2 border-b-2 px-4 pt-3 pb-2 text-sm font-semibold transition-all hover:bg-muted/50 rounded-none shadow-none h-11',
          isActive ? 'border-primary text-foreground border-b-4' : 'border-transparent text-muted-foreground',
        )}
      >
        {Icon && (
          <Icon size={16} className={cn('transition-colors', isActive ? 'text-primary' : 'text-muted-foreground')} />
        )}
        <span>{t(tab.labelKey)}</span>
        {tab.id === 'overview' && overview.alerts.length > 0 && (
          <span className="bg-destructive/10 text-destructive border-destructive/20 ml-1 flex h-4.5 min-w-4.5 items-center justify-center rounded-full border px-1 py-0.5 text-[9px] leading-none font-bold">
            {overview.alerts.length}
          </span>
        )}
        {tab.id === 'watchlist' && overview.summary.at_risk_learners.value > 0 && (
          <span className="ml-1 flex h-4.5 min-w-4.5 items-center justify-center rounded-full border border-amber-500/20 bg-amber-500/10 px-1 py-0.5 text-[9px] leading-none font-bold text-amber-600 dark:text-amber-400">
            {overview.summary.at_risk_learners.value}
          </span>
        )}
      </div>
    )
  }

  return (
    <div className="bg-background flex min-h-screen min-w-0 flex-1 flex-col">
      <DashHeader
        breadcrumbType="analytics"
        title={t('pages.shellTitle')}
        badge={
          <div className="ml-2.5 flex items-center gap-2 text-xs">
            <Badge
              variant="outline"
              className="border-primary/20 bg-primary/5 text-primary h-4.5 px-1.5 py-0 text-[10px] font-semibold tracking-wider uppercase"
            >
              {t('overview.label')}
            </Badge>
            <span className="text-muted-foreground/60 text-xs font-semibold">
              • {t('overview.labelScopedCourses')}: {overview.scope.course_ids.length}
            </span>
          </div>
        }
        actions={
          <div className="flex shrink-0 items-center gap-2">
            <AnalyticsExportButton href={getAnalyticsExportUrl('at-risk', query)} label={t('overview.exportAtRisk')} />
            <AnalyticsExportButton
              href={getAnalyticsExportUrl('grading-backlog', query)}
              label={t('overview.exportGradingBacklog')}
            />
          </div>
        }
      >
        <SettingsTabs
          value={activeTab}
          tabs={tabs}
          getHref={tab => getTabHref(tab.id)}
          translationNamespace="TeacherAnalytics"
          renderTab={renderAnalyticsTab}
        />
      </DashHeader>

      {/* Main Content Area - Full width with padding */}
      <main className="min-w-0 flex-1 space-y-6 px-4 py-6 lg:px-8">
        {/* Global Filters Section (Above Tabs) */}
        <div className="w-full">
          <TeacherFilterBar
            path={`/dash/analytics/${activeTab}`}
            query={query}
            courseCount={overview.scope.course_ids.length}
            courseOptions={(courseOptions.length ? courseOptions : overview.course_options) ?? []}
            cohortOptions={(cohortOptions.length ? cohortOptions : overview.cohort_options) ?? []}
          />
          <SavedViewsBar query={query} />
        </div>

        {/* Tab Panel content */}
        <div className="space-y-6">{children}</div>
      </main>
    </div>
  )
}
