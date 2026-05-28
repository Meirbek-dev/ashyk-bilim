'use client'

import { BarChart3, BookOpenCheck, ChevronDown, ChevronUp, Clock4, ExternalLink, TrendingUp, Users } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import { cn } from '@/lib/utils'
import { apiFetcher } from '@/lib/api-client'
import Link from '@components/ui/AppLink'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

interface ScoreDistributionBucket {
  range: string
  count: number
}

interface SubmissionStats {
  total: number
  needs_grading_count: number
  avg_score: number | null
  pass_rate: number | null
  score_distribution: ScoreDistributionBucket[]
}

interface ItemAnalytics {
  item_uuid: string
  title: string
  kind: string
  max_score: number
  response_count: number
  avg_score_pct: number | null
  correct_pct: number | null
  discrimination_index: number | null
}

interface ResultsReviewTabProps {
  assessmentUuid: string
  courseUuid?: string | null
  activityUuid: string
}

export default function ResultsReviewTab({ assessmentUuid, courseUuid, activityUuid }: ResultsReviewTabProps) {
  const t = useTranslations('Features.Assessments.Studio.ResultsReview')
  const [stats, setStats] = useState<SubmissionStats | null>(null)
  const [itemAnalytics, setItemAnalytics] = useState<ItemAnalytics[] | null>(null)
  const [analyticsExpanded, setAnalyticsExpanded] = useState(true)

  useEffect(() => {
    let cancelled = false
    apiFetcher<SubmissionStats>(`assessments/${assessmentUuid}/submissions/stats`)
      .then(data => {
        if (!cancelled) setStats(data)
      })
      .catch(() => {
        if (!cancelled) setStats(null)
      })
    return () => {
      cancelled = true
    }
  }, [assessmentUuid])

  useEffect(() => {
    let cancelled = false
    apiFetcher<ItemAnalytics[]>(`assessments/${assessmentUuid}/item-analytics`)
      .then(data => {
        if (!cancelled) setItemAnalytics(data)
      })
      .catch(() => {
        if (!cancelled) setItemAnalytics([])
      })
    return () => {
      cancelled = true
    }
  }, [assessmentUuid])

  const cleanCourseUuid = courseUuid?.replace(/^course_/, '') ?? ''
  const cleanActivityUuid = activityUuid.replace(/^activity_/, '')
  const reviewHref = cleanCourseUuid
    ? `/dash/courses/${cleanCourseUuid}/activity/${cleanActivityUuid}/review`
    : `/dash/courses/activity/${cleanActivityUuid}/review`

  return (
    <div className="mx-auto max-w-7xl space-y-5 px-4 py-6">
      <div className="bg-card flex flex-col gap-3 rounded-lg border p-5 md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-3">
          <div className="bg-muted rounded-md border p-2">
            <BarChart3 className="text-muted-foreground size-5" />
          </div>
          <div>
            <h2 className="text-base font-semibold">{t('title')}</h2>
            <p className="text-muted-foreground text-sm">{t('description')}</p>
          </div>
        </div>
        <Button nativeButton={false} render={<Link href={reviewHref} />}>
          <ExternalLink className="size-4" />
          {t('openReview')}
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <ResultMetric icon={Users} label={t('submissions')} value={stats?.total ?? 0} />
        <ResultMetric icon={Clock4} label={t('needsReview')} value={stats?.needs_grading_count ?? 0} accent="amber" />
        <ResultMetric
          icon={TrendingUp}
          label={t('averageScore')}
          value={stats?.avg_score !== null && stats?.avg_score !== undefined ? `${stats.avg_score.toFixed(1)}%` : '--'}
          accent="blue"
        />
        <ResultMetric
          icon={BookOpenCheck}
          label={t('passRate')}
          value={stats?.pass_rate !== null && stats?.pass_rate !== undefined ? `${stats.pass_rate.toFixed(0)}%` : '--'}
          accent="lime"
        />
      </div>

      {stats && stats.score_distribution.some(b => b.count > 0) && (
        <div className="bg-card rounded-lg border p-5">
          <h3 className="mb-4 text-sm font-semibold">{t('scoreDistributionTitle')}</h3>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={stats.score_distribution} margin={{ top: 0, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border" />
              <XAxis dataKey="range" tick={{ fontSize: 11 }} className="fill-muted-foreground" />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} className="fill-muted-foreground" />
              <Tooltip
                contentStyle={{ fontSize: 12 }}
                labelFormatter={label => `Score: ${label}`}
                formatter={value => [Number(value ?? 0), t('submissions')]}
              />
              <Bar dataKey="count" radius={[3, 3, 0, 0]} className="fill-primary" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Per-item analytics table */}
      {itemAnalytics !== null && (
        <div className="bg-card rounded-lg border">
          <Button
            type="button"
            variant="ghost"
            className="flex h-auto w-full items-center justify-between p-5 text-left hover:bg-transparent"
            onClick={() => setAnalyticsExpanded(v => !v)}
          >
            <h3 className="text-sm font-semibold">{t('itemAnalyticsTitle')}</h3>
            {analyticsExpanded ? (
              <ChevronUp className="text-muted-foreground size-4" />
            ) : (
              <ChevronDown className="text-muted-foreground size-4" />
            )}
          </Button>
          {analyticsExpanded && (
            <div className="border-t">
              {itemAnalytics.length === 0 ? (
                <p className="text-muted-foreground px-5 py-4 text-sm">{t('noAnalyticsData')}</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table className="text-sm">
                    <TableHeader>
                      <TableRow className="bg-muted/40 text-xs font-medium">
                        <TableHead className="px-4 py-2.5">#</TableHead>
                        <TableHead className="px-4 py-2.5">{t('colQuestion')}</TableHead>
                        <TableHead className="px-4 py-2.5">{t('colKind')}</TableHead>
                        <TableHead className="px-4 py-2.5 text-right">{t('colMaxScore')}</TableHead>
                        <TableHead className="px-4 py-2.5 text-right">{t('colResponses')}</TableHead>
                        <TableHead className="px-4 py-2.5 text-right">{t('colAvgScore')}</TableHead>
                        <TableHead className="px-4 py-2.5 text-right">{t('colCorrectPct')}</TableHead>
                        <TableHead className="px-4 py-2.5 text-right">{t('colDiscrimination')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody className="divide-y">
                      {itemAnalytics.map((item, idx) => (
                        <TableRow key={item.item_uuid} className="hover:bg-muted/20 transition-colors">
                          <TableCell className="text-muted-foreground px-4 py-2.5">{idx + 1}</TableCell>
                          <TableCell className="max-w-[280px] truncate px-4 py-2.5 font-medium" title={item.title}>
                            {item.title || `—`}
                          </TableCell>
                          <TableCell className="text-muted-foreground px-4 py-2.5 text-xs tracking-wide uppercase">
                            {item.kind.replace(/_/g, ' ')}
                          </TableCell>
                          <TableCell className="px-4 py-2.5 text-right tabular-nums">{item.max_score}</TableCell>
                          <TableCell className="px-4 py-2.5 text-right tabular-nums">{item.response_count}</TableCell>
                          <TableCell className="px-4 py-2.5 text-right tabular-nums">
                            {item.avg_score_pct !== null ? <PercentBadge value={item.avg_score_pct} /> : '—'}
                          </TableCell>
                          <TableCell className="px-4 py-2.5 text-right tabular-nums">
                            {item.correct_pct !== null ? <PercentBadge value={item.correct_pct} /> : '—'}
                          </TableCell>
                          <TableCell className="px-4 py-2.5 text-right tabular-nums">
                            {item.discrimination_index !== null ? (
                              <DiscriminationBadge value={item.discrimination_index} />
                            ) : (
                              '—'
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <section className="grid gap-4 lg:grid-cols-3">
        <InsightPanel title={t('queueTitle')} body={t('queueBody')} />
        <InsightPanel title={t('questionQualityTitle')} body={t('questionQualityBody')} />
        <InsightPanel title={t('releaseTitle')} body={t('releaseBody')} />
      </section>
    </div>
  )
}

function PercentBadge({ value }: { value: number }) {
  const color = value >= 70 ? 'text-lime-600' : value >= 40 ? 'text-amber-600' : 'text-red-600'
  return <span className={cn('font-medium', color)}>{value.toFixed(1)}%</span>
}

function DiscriminationBadge({ value }: { value: number }) {
  // discrimination index: ≥ 0.3 good (green), 0.1–0.3 fair (amber), < 0.1 poor (red)
  const color = value >= 0.3 ? 'text-lime-600' : value >= 0.1 ? 'text-amber-600' : 'text-red-600'
  return <span className={cn('font-medium', color)}>{value.toFixed(2)}</span>
}

function ResultMetric({
  icon: Icon,
  label,
  value,
  accent = 'default',
}: {
  icon: React.ElementType
  label: string
  value: string | number
  accent?: 'default' | 'amber' | 'blue' | 'lime'
}) {
  const color = {
    default: 'text-muted-foreground',
    amber: 'text-amber-600',
    blue: 'text-blue-600',
    lime: 'text-lime-600',
  }[accent]
  return (
    <div className="bg-card rounded-lg border p-4">
      <Icon className={`${color} size-5`} />
      <p className="text-muted-foreground mt-3 text-xs">{label}</p>
      <p className="text-2xl font-semibold">{value}</p>
    </div>
  )
}

function InsightPanel({ title, body }: { title: string; body: string }) {
  return (
    <div className="bg-card rounded-lg border p-4">
      <h3 className="text-sm font-semibold">{title}</h3>
      <p className="text-muted-foreground mt-2 text-sm">{body}</p>
    </div>
  )
}
