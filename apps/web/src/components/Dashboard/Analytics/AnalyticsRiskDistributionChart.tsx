'use client'

import { Bar, BarChart, CartesianGrid, Cell, XAxis, YAxis } from 'recharts'
import { getAnalyticsRiskLevelLabel } from '@/lib/analytics/labels'
import type { RiskDistributionCounts } from '@/types/analytics'
import { useTranslations } from 'next-intl'

import {
  ChartContainer,
  ChartEmptyState,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

interface AnalyticsRiskDistributionChartProps {
  counts: RiskDistributionCounts
  totalAtRisk?: number
}

type RiskLevel = 'high' | 'medium' | 'low'

// Fallback CSS values injected via style when ChartStyle variables are not yet applied.
const RISK_COLOR_FALLBACKS: Record<RiskLevel, string> = {
  high: 'hsl(0 72% 51%)', // red-600
  medium: 'hsl(38 92% 50%)', // amber-500
  low: 'hsl(215 16% 47%)', // slate-500
}

export default function AnalyticsRiskDistributionChart({
  counts,
  totalAtRisk,
}: AnalyticsRiskDistributionChartProps) {
  const t = useTranslations('TeacherAnalytics')
  const createEntry = (level: RiskLevel, count: number) => ({
    level,
    label: getAnalyticsRiskLevelLabel(t, level),
    count,
  })

  const entries = [
    createEntry('high', counts.high),
    createEntry('medium', counts.medium),
    createEntry('low', counts.low),
  ]

  const data = entries.filter(item => item.count > 0)

  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle>{t('riskDistribution.title')}</CardTitle>
        <CardDescription>
          {t('riskDistribution.description')}
          {typeof totalAtRisk === 'number'
            ? ` ${t('riskDistribution.preview', { shown: totalAtRisk, total: totalAtRisk })}`
            : ''}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {data.length ? (
          <ChartContainer
            className="h-[280px] w-full"
            config={{
              count: { label: t('riskDistribution.learners') },
              'risk-high': { color: RISK_COLOR_FALLBACKS['high'] },
              'risk-medium': { color: RISK_COLOR_FALLBACKS['medium'] },
              'risk-low': { color: RISK_COLOR_FALLBACKS['low'] },
            }}
          >
            <BarChart data={data}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis dataKey="label" tickLine={false} axisLine={false} />
              <YAxis tickLine={false} axisLine={false} allowDecimals={false} />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    nameKey="label"
                    formatter={v => [`${v} ${t('riskDistribution.learners')}`, '']}
                  />
                }
              />
              <Bar dataKey="count" radius={10}>
                {data.map(entry => (
                  <Cell
                    key={entry.level}
                    fill={`var(--color-risk-${entry.level}, ${RISK_COLOR_FALLBACKS[entry.level]})`}
                  />
                ))}
              </Bar>
            </BarChart>
          </ChartContainer>
        ) : (
          <ChartEmptyState description={t('riskDistribution.emptyState')} />
        )}
      </CardContent>
    </Card>
  )
}
