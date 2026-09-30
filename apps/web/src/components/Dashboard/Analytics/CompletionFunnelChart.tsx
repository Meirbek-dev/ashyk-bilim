'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import type { FunnelStep } from '@/types/analytics'
import { useFormatter, useTranslations } from 'next-intl'

interface CompletionFunnelChartProps {
  title: string
  description: string
  data: FunnelStep[]
}

export default function CompletionFunnelChart({ title, description, data }: CompletionFunnelChartProps) {
  const t = useTranslations('TeacherAnalytics')
  const format = useFormatter()
  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <p className="text-muted-foreground py-10 text-center text-sm">{t('funnel.empty')}</p>
        ) : (
          <ChartContainer
            className="h-[280px] w-full"
            config={{
              count: {
                label: t('funnel.learners'),
                color: 'var(--chart-2)',
                valueFormatter: value => `${value ?? 0} ${t('funnel.learners')}`,
              },
            }}
          >
            <BarChart data={data} layout="vertical" margin={{ left: 18 }}>
              <CartesianGrid horizontal={false} strokeDasharray="3 3" />
              <XAxis
                type="number"
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
                tickFormatter={(v: number) => format.number(v)}
              />
              <YAxis dataKey="label" type="category" width={170} tickLine={false} axisLine={false} />
              <ChartTooltip
                content={<ChartTooltipContent nameKey="label" formatter={v => [`${v} ${t('funnel.learners')}`, '']} />}
              />
              <Bar dataKey="count" fill="var(--color-count)" radius={8} />
            </BarChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  )
}
