'use client'

import { ActivityIcon, CheckCircle2Icon, CircleSlashIcon, Clock3Icon, XCircleIcon } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

import type { AIEvalDashboard } from '../api/use-ai-usage'

interface AIEvalDashboardProps {
  dashboard?: AIEvalDashboard | undefined
  loading?: boolean | undefined
}

export function AIEvalDashboardPanel({ dashboard, loading }: AIEvalDashboardProps) {
  const t = useTranslations('AiExperience.evalDashboard')

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t('title')}</CardTitle>
          <CardDescription>{t('description')}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-40 w-full" />
        </CardContent>
      </Card>
    )
  }

  if (!dashboard) return null

  const runMetrics = [
    { key: 'queued', value: dashboard.runs.queued, icon: Clock3Icon },
    { key: 'running', value: dashboard.runs.running, icon: ActivityIcon },
    { key: 'finished', value: dashboard.runs.finished, icon: CheckCircle2Icon },
    { key: 'error', value: dashboard.runs.error, icon: XCircleIcon },
    { key: 'aborted', value: dashboard.runs.aborted, icon: CircleSlashIcon },
  ] as const

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
        <CardDescription>{t('description')}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {runMetrics.map(metric => {
            const Icon = metric.icon
            return (
              <div key={metric.key} className="flex min-h-24 flex-col justify-between rounded-lg border p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground text-xs font-medium">{t(`runs.${metric.key}`)}</span>
                  <Icon aria-hidden="true" />
                </div>
                <span className="text-2xl font-semibold tabular-nums">{metric.value.toLocaleString()}</span>
              </div>
            )
          })}
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <Metric label={t('evals.total')} value={dashboard.evals.total.toLocaleString()} />
          <Metric label={t('evals.passRate')} value={formatPassRate(dashboard.evals)} />
          <Metric
            label={t('evals.averageScore')}
            value={dashboard.evals.average_score === null ? t('notAvailable') : dashboard.evals.average_score.toFixed(2)}
          />
        </div>
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-medium">{t('recentTitle')}</h3>
            <Badge variant="outline">{t('recentCount', { count: dashboard.recent_evals.length })}</Badge>
          </div>
          {dashboard.recent_evals.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('table.dataset')}</TableHead>
                  <TableHead>{t('table.evaluator')}</TableHead>
                  <TableHead>{t('table.score')}</TableHead>
                  <TableHead>{t('table.status')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dashboard.recent_evals.map(result => (
                  <TableRow key={result.eval_uuid}>
                    <TableCell>{result.dataset}</TableCell>
                    <TableCell>{result.evaluator}</TableCell>
                    <TableCell className="tabular-nums">
                      {result.score === null ? t('notAvailable') : result.score.toFixed(2)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={result.passed === false ? 'destructive' : result.passed ? 'secondary' : 'outline'}>
                        {result.passed === null ? t('pending') : result.passed ? t('passed') : t('failed')}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-muted-foreground text-sm">{t('empty')}</p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
    </div>
  )
}

function formatPassRate(evals: AIEvalDashboard['evals']) {
  if (evals.total === 0) return '0%'
  return `${Math.round((evals.passed / evals.total) * 100)}%`
}
