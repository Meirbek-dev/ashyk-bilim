'use client'

import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  BarChart3,
  BookOpenCheck,
  ChevronLeft,
  ChevronRight,
  Clock4,
  Download,
  ExternalLink,
  RotateCcw,
  Search,
  ShieldAlert,
  TrendingUp,
  Users,
} from 'lucide-react'
import { useState, useTransition } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { useQuery, queryOptions } from '@tanstack/react-query'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { toast } from 'sonner'

import ReviewBulkActionBar from '@/features/grading/review/components/ReviewBulkActionBar'
import SubmissionStatusBadge from '@/features/assessments/shared/components/SubmissionStatusBadge'
import { getReleaseState, getSubmissionDisplayName } from '@/features/grading/domain'
import { getSubmissionViolations } from '@/features/grading/domain/types'
import type { ReleaseState, Submission, SubmissionStatus } from '@/features/grading/domain'
import { cn } from '@/lib/utils'
import { apiFetch, apiFetcher } from '@/lib/api-client'
import { queryKeys } from '@/lib/react-query/queryKeys'
import Link from '@components/ui/AppLink'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  buildSubmissionQueuePath,
  countItemActionPrompts,
  getItemActionPrompt,
  summarizeIntegrityEvents,
} from './operateViewUtils'

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

interface ReviewQueueRead {
  items: Submission[]
  total: number
  page: number
  page_size: number
  pages: number
  contract_version?: number
}

const statsQueryOptions = (assessmentUuid: string) =>
  queryOptions({
    queryKey: queryKeys.assessments.stats(assessmentUuid),
    queryFn: () => apiFetcher<SubmissionStats>(`assessments/${assessmentUuid}/submissions/stats`),
    staleTime: 30_000,
  })

const itemAnalyticsQueryOptions = (assessmentUuid: string) =>
  queryOptions({
    queryKey: queryKeys.assessments.itemAnalytics(assessmentUuid),
    queryFn: () => apiFetcher<ItemAnalytics[]>(`assessments/${assessmentUuid}/item-analytics`),
    staleTime: 30_000,
  })

const queueQueryOptions = (assessmentUuid: string, queuePath: string) =>
  queryOptions({
    queryKey: ['assessments', assessmentUuid, 'operate-queue', queuePath],
    queryFn: () => apiFetcher<ReviewQueueRead>(queuePath),
    staleTime: 5_000,
  })

interface ResultsReviewTabProps {
  assessmentUuid: string
  courseUuid?: string | null
  activityUuid: string
}

type StatusFilter = SubmissionStatus | 'NEEDS_GRADING' | 'ALL'

export default function ResultsReviewTab({ assessmentUuid, courseUuid, activityUuid }: ResultsReviewTabProps) {
  const t = useTranslations('Features.Assessments.Studio.ResultsReview')
  const locale = useLocale()
  const [analyticsExpanded, setAnalyticsExpanded] = useState(true)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL')
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState('submitted_at')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [lateOnly, setLateOnly] = useState(false)
  const [page, setPage] = useState(1)
  const [selectedUuids, setSelectedUuids] = useState<Set<string>>(new Set())
  const [regradeCandidates, setRegradeCandidates] = useState<Set<string>>(new Set())
  const [isExporting, startExportTransition] = useTransition()

  const queuePath = buildSubmissionQueuePath(assessmentUuid, {
    status: statusFilter,
    search,
    sortBy,
    sortDir,
    page,
    pageSize: 10,
    lateOnly,
  })

  const statsQuery = useQuery(statsQueryOptions(assessmentUuid))
  const itemAnalyticsQuery = useQuery(itemAnalyticsQueryOptions(assessmentUuid))
  const queueQuery = useQuery(queueQueryOptions(assessmentUuid, queuePath))

  const stats = statsQuery.data ?? null
  const itemAnalytics = itemAnalyticsQuery.data ?? []
  const queue = queueQuery.data ?? { items: [], total: 0, page, page_size: 10, pages: 1 }
  const selectedSubmissions = queue.items.filter(submission => selectedUuids.has(submission.submission_uuid))
  const promptCounts = countItemActionPrompts(itemAnalytics)
  const integritySummary = summarizeIntegrityEvents(queue.items)

  const cleanCourseUuid = courseUuid?.replace(/^course_/, '') ?? ''
  const cleanActivityUuid = activityUuid.replace(/^activity_/, '')
  const reviewHref = cleanCourseUuid
    ? `/dash/courses/${cleanCourseUuid}/activity/${cleanActivityUuid}/review`
    : `/dash/courses/activity/${cleanActivityUuid}/review`

  const refreshOperations = async () => {
    await Promise.all([queueQuery.refetch(), statsQuery.refetch(), itemAnalyticsQuery.refetch()])
  }

  const toggleSelected = (submissionUuid: string, checked: boolean | string) => {
    setSelectedUuids(current => {
      const next = new Set(current)
      if (checked) next.add(submissionUuid)
      else next.delete(submissionUuid)
      return next
    })
  }

  const exportCsv = () => {
    startExportTransition(async () => {
      try {
        const response = await apiFetch(`assessments/${assessmentUuid}/submissions/export`)
        if (!response.ok) throw new Error(t('exportFailed'))
        const csv = await response.text()
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
        const url = URL.createObjectURL(blob)
        const anchor = document.createElement('a')
        anchor.href = url
        anchor.download = `assessment-${assessmentUuid}-results.csv`
        anchor.click()
        URL.revokeObjectURL(url)
      } catch (error) {
        toast.error(error instanceof Error ? error.message : t('exportFailed'))
      }
    })
  }

  return (
    <div className="mx-auto w-full max-w-[92rem] space-y-5 px-4 py-5 md:px-6">
      <div className="bg-card flex flex-col gap-3 rounded-lg border p-5 shadow-sm md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-3">
          <div className="bg-muted rounded-md border p-2">
            <BarChart3 className="text-muted-foreground size-5" />
          </div>
          <div>
            <h2 className="text-base font-semibold">{t('title')}</h2>
            <p className="text-muted-foreground text-sm">{t('description')}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={isExporting} onClick={exportCsv}>
            <Download className="size-4" />
            {t('export')}
          </Button>
          <Button nativeButton={false} render={<Link href={reviewHref} />}>
            <ExternalLink className="size-4" />
            {t('openReview')}
          </Button>
        </div>
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

      <section className="bg-card rounded-lg border">
        <div className="border-b p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h3 className="text-sm font-semibold">{t('queueTitle')}</h3>
              <p className="text-muted-foreground text-xs">{t('queueBody')}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">{t('queueTotal', { count: queue.total })}</Badge>
              <Badge variant="outline">{t('queueSelected', { count: selectedUuids.size })}</Badge>
            </div>
          </div>
          <div className="mt-4 grid gap-2 lg:grid-cols-[minmax(16rem,1fr)_12rem_12rem_10rem_auto]">
            <div className="relative">
              <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
              <Input
                value={search}
                onChange={event => {
                  setSearch(event.target.value)
                  setPage(1)
                }}
                placeholder={t('searchLearner')}
                className="pl-9"
              />
            </div>
            <NativeSelect
              value={statusFilter}
              onChange={event => {
                setStatusFilter(event.target.value as StatusFilter)
                setPage(1)
              }}
              aria-label={t('statusFilter')}
            >
              <NativeSelectOption value="ALL">{t('filterAll')}</NativeSelectOption>
              <NativeSelectOption value="NEEDS_GRADING">{t('filterNeedsGrading')}</NativeSelectOption>
              <NativeSelectOption value="PENDING">{t('filterPending')}</NativeSelectOption>
              <NativeSelectOption value="GRADED">{t('filterGraded')}</NativeSelectOption>
              <NativeSelectOption value="PUBLISHED">{t('filterPublished')}</NativeSelectOption>
              <NativeSelectOption value="RETURNED">{t('filterReturned')}</NativeSelectOption>
            </NativeSelect>
            <NativeSelect
              value={sortBy}
              onChange={event => {
                setSortBy(event.target.value)
                setPage(1)
              }}
              aria-label={t('sortBy')}
            >
              <NativeSelectOption value="submitted_at">{t('sortSubmitted')}</NativeSelectOption>
              <NativeSelectOption value="final_score">{t('sortScore')}</NativeSelectOption>
              <NativeSelectOption value="attempt_number">{t('sortAttempt')}</NativeSelectOption>
            </NativeSelect>
            <Button variant="outline" onClick={() => setSortDir(value => (value === 'asc' ? 'desc' : 'asc'))}>
              {sortDir === 'asc' ? <ArrowUp className="size-4" /> : <ArrowDown className="size-4" />}
              {sortDir === 'asc' ? t('sortAscending') : t('sortDescending')}
            </Button>
            <Button variant={lateOnly ? 'default' : 'outline'} onClick={() => setLateOnly(value => !value)}>
              {t('lateOnly')}
            </Button>
          </div>
        </div>

        {selectedSubmissions.length > 0 ? (
          <div className="border-b p-4">
            <ReviewBulkActionBar
              activityId={0}
              assessmentUuid={assessmentUuid}
              submissions={selectedSubmissions}
              disabled={false}
              onRefresh={refreshOperations}
            />
          </div>
        ) : null}

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10" />
                <TableHead>{t('colLearner')}</TableHead>
                <TableHead>{t('colStatus')}</TableHead>
                <TableHead>{t('colRelease')}</TableHead>
                <TableHead className="text-right">{t('colScore')}</TableHead>
                <TableHead>{t('colIntegrity')}</TableHead>
                <TableHead>{t('colSubmitted')}</TableHead>
                <TableHead className="text-right">{t('colAction')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {queue.items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-muted-foreground h-32 text-center">
                    {queueQuery.isLoading ? t('loadingQueue') : t('emptyQueue')}
                  </TableCell>
                </TableRow>
              ) : (
                queue.items.map(submission => {
                  const violations = getSubmissionViolations(submission)
                  return (
                    <TableRow key={submission.submission_uuid}>
                      <TableCell>
                        <Checkbox
                          checked={selectedUuids.has(submission.submission_uuid)}
                          aria-label={t('selectSubmission', { name: getSubmissionDisplayName(submission) })}
                          onCheckedChange={checked => toggleSelected(submission.submission_uuid, checked)}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">{getSubmissionDisplayName(submission)}</div>
                        <div className="text-muted-foreground text-xs">
                          {submission.user?.email ?? `#${submission.user_id}`}
                        </div>
                      </TableCell>
                      <TableCell>
                        <SubmissionStatusBadge status={submission.status} />
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{releaseStateLabel(readReleaseState(submission), t)}</Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {typeof submission.final_score === 'number' ? `${Math.round(submission.final_score)}%` : '--'}
                      </TableCell>
                      <TableCell>
                        {violations.length > 0 ? (
                          <Badge variant="warning">
                            <ShieldAlert className="size-3" />
                            {t('integrityEventsValue', { count: violations.length })}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground text-xs">{t('noIntegrityEvents')}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs">
                        {formatDate(submission.submitted_at ?? submission.updated_at, locale)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          nativeButton={false}
                          variant="ghost"
                          size="sm"
                          render={<Link href={`${reviewHref}?submission=${submission.submission_uuid}`} />}
                        >
                          {t('reviewSubmission')}
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>

        <div className="flex items-center justify-between border-t p-3">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage(value => Math.max(1, value - 1))}
          >
            <ChevronLeft className="size-4" />
            {t('previousPage')}
          </Button>
          <span className="text-muted-foreground text-xs">
            {t('pageCount', { page: queue.page, pages: queue.pages })}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= queue.pages}
            onClick={() => setPage(value => Math.min(queue.pages, value + 1))}
          >
            {t('nextPage')}
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <OperateInsight
          icon={RotateCcw}
          title={t('regradeTitle')}
          value={String(regradeCandidates.size)}
          body={t('regradeBody')}
        />
        <OperateInsight
          icon={ShieldAlert}
          title={t('integrityTitle')}
          value={String(integritySummary.totalEvents)}
          body={
            integritySummary.topKind ? t('integrityBody', { kind: integritySummary.topKind }) : t('integrityEmptyBody')
          }
        />
        <OperateInsight
          icon={AlertTriangle}
          title={t('questionActionTitle')}
          value={String(promptCounts.reviewContent + promptCounts.tooEasy + promptCounts.tooHard)}
          body={t('questionActionBody')}
        />
      </section>

      {stats && stats.score_distribution.some(bucket => bucket.count > 0) ? (
        <div className="bg-card rounded-lg border p-5 shadow-sm">
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
      ) : null}

      <div className="bg-card rounded-lg border shadow-sm">
        <Button
          type="button"
          variant="ghost"
          className="flex h-auto w-full items-center justify-between p-5 text-left hover:bg-transparent"
          onClick={() => setAnalyticsExpanded(value => !value)}
        >
          <h3 className="text-sm font-semibold">{t('itemAnalyticsTitle')}</h3>
          <Badge variant="outline">
            {t('analyticsPromptCount', {
              count: promptCounts.reviewContent + promptCounts.tooEasy + promptCounts.tooHard,
            })}
          </Badge>
        </Button>
        {analyticsExpanded ? (
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
                      <TableHead className="px-4 py-2.5 text-right">{t('colResponses')}</TableHead>
                      <TableHead className="px-4 py-2.5 text-right">{t('colCorrectPct')}</TableHead>
                      <TableHead className="px-4 py-2.5 text-right">{t('colDiscrimination')}</TableHead>
                      <TableHead className="px-4 py-2.5">{t('colPrompt')}</TableHead>
                      <TableHead className="px-4 py-2.5 text-right">{t('colAction')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="divide-y">
                    {itemAnalytics.map((item, index) => {
                      const prompt = getItemActionPrompt(item)
                      const marked = regradeCandidates.has(item.item_uuid)
                      return (
                        <TableRow key={item.item_uuid} className="hover:bg-muted/20 transition-colors">
                          <TableCell className="text-muted-foreground px-4 py-2.5">{index + 1}</TableCell>
                          <TableCell className="max-w-[280px] truncate px-4 py-2.5 font-medium" title={item.title}>
                            {item.title || '--'}
                          </TableCell>
                          <TableCell className="text-muted-foreground px-4 py-2.5 text-xs tracking-wide uppercase">
                            {item.kind.replace(/_/g, ' ')}
                          </TableCell>
                          <TableCell className="px-4 py-2.5 text-right tabular-nums">{item.response_count}</TableCell>
                          <TableCell className="px-4 py-2.5 text-right tabular-nums">
                            {item.correct_pct !== null ? <PercentBadge value={item.correct_pct} /> : '--'}
                          </TableCell>
                          <TableCell className="px-4 py-2.5 text-right tabular-nums">
                            {item.discrimination_index !== null ? (
                              <DiscriminationBadge value={item.discrimination_index} />
                            ) : (
                              '--'
                            )}
                          </TableCell>
                          <TableCell className="px-4 py-2.5">
                            <Badge variant={prompt === 'healthy' ? 'outline' : 'warning'}>
                              {t(`itemPrompt.${prompt}`)}
                            </Badge>
                          </TableCell>
                          <TableCell className="px-4 py-2.5 text-right">
                            <Button
                              variant={marked ? 'secondary' : 'outline'}
                              size="sm"
                              onClick={() => {
                                setRegradeCandidates(current => {
                                  const next = new Set(current)
                                  if (next.has(item.item_uuid)) next.delete(item.item_uuid)
                                  else next.add(item.item_uuid)
                                  return next
                                })
                              }}
                            >
                              {marked ? t('regradeQueued') : t('markForRegrade')}
                            </Button>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  )
}

function PercentBadge({ value }: { value: number }) {
  const color = value >= 70 ? 'text-lime-600' : value >= 40 ? 'text-amber-600' : 'text-red-600'
  return <span className={cn('font-medium', color)}>{value.toFixed(1)}%</span>
}

function DiscriminationBadge({ value }: { value: number }) {
  const color = value >= 0.3 ? 'text-lime-600' : value >= 0.1 ? 'text-amber-600' : 'text-red-600'
  return <span className={cn('font-medium', color)}>{value.toFixed(2)}</span>
}

function ResultMetric({
  icon: Icon,
  label,
  value,
  accent = 'default',
}: {
  icon: typeof Users
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
    <div className="bg-card rounded-lg border p-4 shadow-sm">
      <Icon className={`${color} size-5`} />
      <p className="text-muted-foreground mt-3 text-xs">{label}</p>
      <p className="text-2xl font-semibold">{value}</p>
    </div>
  )
}

function OperateInsight({
  icon: Icon,
  title,
  value,
  body,
}: {
  icon: typeof Users
  title: string
  value: string
  body: string
}) {
  return (
    <div className="bg-card rounded-lg border p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <Icon className="text-muted-foreground size-5" />
        <span className="text-xl font-semibold">{value}</span>
      </div>
      <h3 className="mt-3 text-sm font-semibold">{title}</h3>
      <p className="text-muted-foreground mt-2 text-sm">{body}</p>
    </div>
  )
}

function readReleaseState(submission: Submission): ReleaseState {
  return 'release_state' in submission && submission.release_state
    ? (submission.release_state)
    : getReleaseState(submission.status)
}

function releaseStateLabel(
  releaseState: ReleaseState,
  t: ReturnType<typeof useTranslations<'Features.Assessments.Studio.ResultsReview'>>,
) {
  if (releaseState === 'HIDDEN') return t('releaseHidden')
  if (releaseState === 'AWAITING_RELEASE') return t('releaseAwaiting')
  if (releaseState === 'VISIBLE') return t('releaseVisible')
  return t('releaseReturned')
}

function formatDate(value: string | null | undefined, locale: string) {
  if (!value) return '--'
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}
