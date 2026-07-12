'use client'

import { useMemo, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useCancelAIRun } from '@/features/ai-experience/api/use-cancel-ai-run'

import { useAIOperationRunDetail, useAIOperationRuns } from '../api/use-ai-usage'
import type { AIOperationFilters, AIOperationRun } from '../api/use-ai-usage'

const STATUS_OPTIONS = ['all', 'queued', 'running', 'finished', 'error', 'aborted'] as const

function percentile(values: number[], position: number) {
  if (!values.length) return null
  const sorted = values.toSorted((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * position))] ?? null
}

export function AIOperationsConsole() {
  const t = useTranslations('AiExperience.operationsConsole')
  const locale = useLocale()
  const [filters, setFilters] = useState<AIOperationFilters>({ days: 7 })
  const [selectedRun, setSelectedRun] = useState<string | null>(null)
  const runs = useAIOperationRuns(filters)
  const detail = useAIOperationRunDetail(selectedRun)
  const cancelRun = useCancelAIRun()
  const number = useMemo(() => new Intl.NumberFormat(locale), [locale])
  const date = useMemo(() => new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'short' }), [locale])
  const metrics = useMemo(() => summarizeRuns(runs.data ?? []), [runs.data])

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
        <CardDescription>{t('description')}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <Select
            value={String(filters.days)}
            onValueChange={value => value && setFilters(current => ({ ...current, days: Number(value) }))}
          >
            <SelectTrigger aria-label={t('timeRange')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">{t('days', { count: 1 })}</SelectItem>
              <SelectItem value="7">{t('days', { count: 7 })}</SelectItem>
              <SelectItem value="30">{t('days', { count: 30 })}</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={filters.status ?? 'all'}
            onValueChange={value => {
              if (value) setFilters(current => ({ ...current, status: value === 'all' ? undefined : value }))
            }}
          >
            <SelectTrigger aria-label={t('statusFilter')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map(option => (
                <SelectItem key={option} value={option}>
                  {t(`statuses.${option}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            aria-label={t('featureFilter')}
            placeholder={t('featureFilter')}
            value={filters.feature ?? ''}
            onChange={event => setFilters(current => ({ ...current, feature: event.target.value || undefined }))}
          />
          <Input
            aria-label={t('providerFilter')}
            placeholder={t('providerFilter')}
            value={filters.provider ?? ''}
            onChange={event => setFilters(current => ({ ...current, provider: event.target.value || undefined }))}
          />
          <Input
            aria-label={t('courseFilter')}
            placeholder={t('courseFilter')}
            value={filters.courseUuid ?? ''}
            onChange={event => setFilters(current => ({ ...current, courseUuid: event.target.value || undefined }))}
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5 2xl:grid-cols-10">
          <Metric label={t('metrics.requests')} value={number.format(metrics.total)} />
          <Metric label={t('metrics.success')} value={`${metrics.successRate}%`} />
          <Metric label={t('metrics.cancelled')} value={`${metrics.cancelRate}%`} />
          <Metric label={t('metrics.retried')} value={`${metrics.retryRate}%`} />
          <Metric
            label={t('metrics.p50')}
            value={metrics.p50 === null ? t('notAvailable') : `${number.format(metrics.p50)} ms`}
          />
          <Metric
            label={t('metrics.p95')}
            value={metrics.p95 === null ? t('notAvailable') : `${number.format(metrics.p95)} ms`}
          />
          <Metric
            label={t('metrics.ttft50')}
            value={metrics.ttft50 === null ? t('notAvailable') : `${number.format(metrics.ttft50)} ms`}
          />
          <Metric
            label={t('metrics.ttft95')}
            value={metrics.ttft95 === null ? t('notAvailable') : `${number.format(metrics.ttft95)} ms`}
          />
          <Metric label={t('metrics.tokens')} value={number.format(metrics.tokens)} />
          <Metric
            label={t('metrics.cost')}
            value={
              metrics.cost === null
                ? t('notAvailable')
                : metrics.cost.toLocaleString(locale, {
                    style: 'currency',
                    currency: 'USD',
                    maximumFractionDigits: 4,
                  })
            }
          />
        </div>

        {runs.isLoading ? (
          <Skeleton className="h-48 w-full" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('table.feature')}</TableHead>
                <TableHead>{t('table.status')}</TableHead>
                <TableHead>{t('table.started')}</TableHead>
                <TableHead>{t('table.model')}</TableHead>
                <TableHead>{t('table.error')}</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {(runs.data ?? []).map(run => (
                <TableRow key={run.run_uuid}>
                  <TableCell>{run.feature}</TableCell>
                  <TableCell>
                    <Badge variant={run.status === 'error' ? 'destructive' : run.stuck ? 'warning' : 'outline'}>
                      {run.stuck ? t('stuck') : run.status}
                    </Badge>
                  </TableCell>
                  <TableCell>{date.format(new Date(run.started_at))}</TableCell>
                  <TableCell className="max-w-48 truncate">{run.model_name ?? t('notAvailable')}</TableCell>
                  <TableCell>{run.error_code ?? t('notAvailable')}</TableCell>
                  <TableCell>
                    <Button type="button" size="sm" variant="ghost" onClick={() => setSelectedRun(run.run_uuid)}>
                      {t('inspect')}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        {selectedRun ? (
          <section className="rounded-lg border p-4" aria-label={t('detailTitle')}>
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-medium">{t('detailTitle')}</h3>
              <div className="flex gap-2">
                {detail.data && ['queued', 'running'].includes(detail.data.run.status) ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    disabled={cancelRun.isPending}
                    onClick={() =>
                      cancelRun.mutate(detail.data.run.run_uuid, {
                        onSuccess: () => {
                          void detail.refetch()
                          void runs.refetch()
                        },
                      })
                    }
                  >
                    {t('cancelRun')}
                  </Button>
                ) : null}
                <Button type="button" size="sm" variant="ghost" onClick={() => setSelectedRun(null)}>
                  {t('close')}
                </Button>
              </div>
            </div>
            {detail.isLoading ? (
              <Skeleton className="mt-3 h-32 w-full" />
            ) : detail.data ? (
              <div className="mt-3 flex flex-col gap-3 text-sm">
                <code className="break-all">{detail.data.run.run_uuid}</code>
                <dl className="grid gap-2 sm:grid-cols-3">
                  <Metric label={t('table.feature')} value={detail.data.run.feature} />
                  <Metric label={t('table.model')} value={detail.data.run.model_name ?? t('notAvailable')} />
                  <Metric label={t('artifacts')} value={number.format(detail.data.artifact_uuids.length)} />
                </dl>
                <ol className="flex flex-col gap-2">
                  {detail.data.events.map(event => (
                    <li key={event.event_id} className="flex gap-3 border-s-2 ps-3">
                      <span className="text-muted-foreground tabular-nums">{event.sequence}</span>
                      <span>{event.event_type}</span>
                    </li>
                  ))}
                </ol>
              </div>
            ) : null}
          </section>
        ) : null}
      </CardContent>
    </Card>
  )
}

function summarizeRuns(runs: AIOperationRun[]) {
  const terminal = runs.filter(run => ['finished', 'error', 'aborted'].includes(run.status))
  const durations = terminal.flatMap(run => (run.duration_ms === null ? [] : [run.duration_ms]))
  const firstTextTimes = runs.flatMap(run => (run.time_to_first_text_ms === null ? [] : [run.time_to_first_text_ms]))
  const costs = runs.flatMap(run => (run.cost_estimate === null ? [] : [run.cost_estimate]))
  return {
    total: runs.length,
    successRate: terminal.length
      ? Math.round((terminal.filter(run => run.status === 'finished').length / terminal.length) * 100)
      : 0,
    cancelRate: terminal.length
      ? Math.round((terminal.filter(run => run.status === 'aborted').length / terminal.length) * 100)
      : 0,
    retryRate: runs.length ? Math.round((runs.filter(run => run.retry_count > 0).length / runs.length) * 100) : 0,
    p50: percentile(durations, 0.5),
    p95: percentile(durations, 0.95),
    ttft50: percentile(firstTextTimes, 0.5),
    ttft95: percentile(firstTextTimes, 0.95),
    tokens: runs.reduce((sum, run) => sum + (run.input_tokens ?? 0) + (run.output_tokens ?? 0), 0),
    cost: costs.length ? costs.reduce((sum, cost) => sum + cost, 0) : null,
  }
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="mt-1 font-medium tabular-nums">{value}</p>
    </div>
  )
}
