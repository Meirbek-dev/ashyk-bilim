import { useFormatter, useTranslations } from 'next-intl'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

import type { AIUsageSummary } from '../api/use-ai-usage'

export function TokenUsageChart({ usage }: { usage: AIUsageSummary }) {
  const t = useTranslations('AiExperience.tokenUsageChart')
  const format = useFormatter()
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
        <CardDescription>{t('description')}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-3">
        <Metric label={t('metricRuns')} value={format.number(usage.total_runs)} />
        <Metric label={t('metricInput')} value={format.number(usage.input_tokens)} />
        <Metric label={t('metricOutput')} value={format.number(usage.output_tokens)} />
      </CardContent>
    </Card>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  )
}
