'use client'

import { BookOpenCheck, Clock4, TrendingUp, Users } from 'lucide-react'
import { useFormatter, useTranslations } from 'next-intl'
import type { ReactNode } from 'react'

import type { Submission, SubmissionStats } from '@/features/grading/domain'
import { cn } from '@/lib/utils'
import { usePercentFormat } from '@/features/assessments/shared/usePercentFormat'
import ReviewBulkActionBar from './ReviewBulkActionBar'

interface ReviewQueueSummary {
  awaitingRelease: number
  slaBreaches: number
  slaHours: number
}

export default function ReviewLayout({
  activityId,
  assessmentUuid,
  title,
  total,
  hasMore = false,
  stats,
  reviewQueueSummary,
  selectedSubmissions,
  children,
  onBulkRefresh,
}: {
  activityId: number
  assessmentUuid?: string
  title?: string
  total: number
  /** `total` is the queue's lower bound (more pages remain). */
  hasMore?: boolean
  stats?: SubmissionStats | null
  reviewQueueSummary: ReviewQueueSummary
  selectedSubmissions: Submission[]
  children: ReactNode
  onBulkRefresh: () => Promise<void>
}) {
  const t = useTranslations('Features.Grading.Review')
  const pageTitle = title ?? t('layout.title')

  return (
    <div className="flex min-h-[calc(100vh-96px)] flex-col">
      <div className="border-b px-4 py-4 lg:px-6">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="min-w-0">
              <h1 className="text-2xl font-semibold break-words">{pageTitle}</h1>
              <p className="text-muted-foreground text-sm">
                {t('layout.queueDescription', {
                  count: stats?.needs_grading_count ?? 0,
                  // Both figures are the assessment's (stats); until they
                  // load, the queue's own count — «20+» while more pages remain.
                  total: stats ? stats.total : hasMore ? `${total}+` : total,
                })}
              </p>
            </div>
            <ReviewBulkActionBar
              activityId={activityId}
              submissions={selectedSubmissions}
              disabled={selectedSubmissions.length === 0}
              onRefresh={onBulkRefresh}
              {...(assessmentUuid !== undefined ? { assessmentUuid } : {})}
            />
          </div>
          <StatsGrid {...(stats === undefined ? {} : { stats })} reviewQueueSummary={reviewQueueSummary} />
        </div>
      </div>

      <div className="grid flex-1 grid-cols-1 lg:grid-cols-[20rem_minmax(0,1fr)] xl:grid-cols-[20rem_minmax(0,1fr)_24rem]">
        {children}
      </div>
    </div>
  )
}

function StatsGrid({
  stats,
  reviewQueueSummary,
}: {
  stats?: SubmissionStats | null
  reviewQueueSummary: ReviewQueueSummary
}) {
  const t = useTranslations('Features.Grading.Review')
  const format = useFormatter()
  const formatPercent = usePercentFormat()
  if (!stats) return null

  return (
    <div className="flex flex-wrap gap-2">
      <StatTile label={t('layout.stats.total')} value={stats.total} icon={Users} />
      <StatTile label={t('layout.stats.needsGrading')} value={stats.needs_grading_count} icon={Clock4} accent="amber" />
      <StatTile label={t('layout.stats.awaitingRelease')} value={reviewQueueSummary.awaitingRelease} icon={Clock4} />
      <StatTile
        label={t('layout.stats.slaBreaches')}
        value={reviewQueueSummary.slaBreaches}
        icon={Clock4}
        detail={t('layout.stats.slaTarget', { hours: reviewQueueSummary.slaHours })}
        accent="amber"
      />
      <StatTile
        label={t('layout.stats.avgScore')}
        value={stats.avg_score != null ? formatPercent(stats.avg_score) : '--'}
        icon={TrendingUp}
        accent="blue"
      />
      <StatTile
        label={t('layout.stats.passRate')}
        value={stats.pass_rate != null ? `${format.number(stats.pass_rate, { maximumFractionDigits: 0 })}%` : '--'}
        icon={BookOpenCheck}
        accent="lime"
      />
    </div>
  )
}

function StatTile({
  label,
  value,
  icon: Icon,
  detail,
  accent = 'default',
}: {
  label: string
  value: string | number
  icon: React.ElementType
  detail?: string
  accent?: 'amber' | 'lime' | 'blue' | 'default'
}) {
  const colorMap = {
    default: 'text-muted-foreground',
    amber: 'text-amber-600',
    lime: 'text-lime-600',
    blue: 'text-blue-600',
  }

  return (
    <div className="bg-card flex items-center gap-2 rounded-md border px-3 py-1.5" title={detail}>
      <Icon className={cn('size-4 shrink-0', colorMap[accent])} />
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className="text-sm font-semibold tabular-nums">{value}</span>
    </div>
  )
}
