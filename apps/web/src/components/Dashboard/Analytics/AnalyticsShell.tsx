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
import { Link } from '@/i18n/navigation'
import {
  LayoutDashboard,
  Users,
  Award,
  Clock,
  ShieldCheck,
} from 'lucide-react'
import SavedViewsBar from './SavedViewsBar'
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

  const tabItemClass = (tabId: string) => {
    const isActive = activeTab === tabId
    return cn(
      'relative flex h-full shrink-0 items-center gap-2 border-b-2 border-transparent px-4 py-3 text-sm font-medium transition-all duration-200 rounded-none bg-transparent hover:text-foreground shadow-none after:hidden',
      isActive
        ? 'border-primary text-foreground bg-transparent dark:bg-transparent dark:border-primary'
        : 'text-muted-foreground'
    )
  }

  return (
    <div className="bg-background flex min-h-screen min-w-0 flex-1 flex-col">
      {/* Sleek, Premium Sticky Page Header (matching courses layout) */}
      <header className="border-border bg-background sticky top-0 z-20 border-b shadow-sm">
        {/* Title row */}
        <div className="flex h-16 items-center gap-4 px-4 lg:px-8">
          <div className="min-w-0 flex-1 flex flex-col justify-center">
            {/* Scoped badge */}
            <div className="flex items-center gap-2 text-xs">
              <Badge variant="outline" className="border-primary/20 bg-primary/5 text-primary text-[10px] h-4.5 px-1.5 py-0 font-semibold uppercase tracking-wider scale-95 origin-left">
                {t('overview.label')}
              </Badge>
              <span className="text-muted-foreground/60 text-xs font-medium">
                • {t('overview.labelScopedCourses')}: {overview.scope.course_ids.length}
              </span>
            </div>
            <h1 className="text-foreground min-w-0 truncate text-lg font-bold leading-tight mt-0.5">
              Teacher Analytics &amp; Operations
            </h1>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <AnalyticsExportButton href={getAnalyticsExportUrl('at-risk', query)} label={t('overview.exportAtRisk')} />
            <AnalyticsExportButton
              href={getAnalyticsExportUrl('grading-backlog', query)}
              label={t('overview.exportGradingBacklog')}
            />
          </div>
        </div>

        {/* Tab nav row using standard anchor Links inside a layout */}
        <div className="border-border/50 flex h-12 items-end justify-start gap-0 overflow-x-auto border-t bg-transparent p-0 px-4 lg:px-8">
          <Link href={getTabHref('overview')} className={tabItemClass('overview')}>
            <LayoutDashboard className="h-4 w-4 shrink-0" />
            <span>{t('tabs.overview')}</span>
            {overview.alerts.length > 0 && (
              <span className="ml-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive/10 text-destructive border border-destructive/20 text-[10px] font-bold px-1.5 py-0.5">
                {overview.alerts.length}
              </span>
            )}
          </Link>
          <Link href={getTabHref('watchlist')} className={tabItemClass('watchlist')}>
            <Users className="h-4 w-4 shrink-0" />
            <span>{t('tabs.watchlist')}</span>
            {overview.summary.at_risk_learners.value > 0 && (
              <span className="ml-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 text-[10px] font-bold px-1.5 py-0.5">
                {overview.summary.at_risk_learners.value}
              </span>
            )}
          </Link>
          <Link href={getTabHref('performance')} className={tabItemClass('performance')}>
            <Award className="h-4 w-4 shrink-0" />
            <span>{t('tabs.performance')}</span>
          </Link>
          <Link href={getTabHref('operations')} className={tabItemClass('operations')}>
            <Clock className="h-4 w-4 shrink-0" />
            <span>{t('tabs.operations')}</span>
          </Link>
          {adminData && (
            <Link href={getTabHref('admin')} className={tabItemClass('admin')}>
              <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-500" />
              <span>{t('tabs.admin')}</span>
            </Link>
          )}
        </div>
      </header>

      {/* Main Content Area - Full width with padding */}
      <main className="min-w-0 flex-1 px-4 py-6 lg:px-8 space-y-6">
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
        <div className="space-y-6">
          {children}
        </div>
      </main>
    </div>
  )
}
