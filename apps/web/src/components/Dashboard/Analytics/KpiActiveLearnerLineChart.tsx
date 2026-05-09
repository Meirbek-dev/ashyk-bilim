'use client';

import { ChartContainer, ChartEmptyState, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts';
import { useTranslations } from 'next-intl';

interface KpiActiveLearnerLineChartProps {
  data: { bucket: string; active: number }[];
}

export default function KpiActiveLearnerLineChart({ data }: KpiActiveLearnerLineChartProps) {
  const t = useTranslations('TeacherAnalytics');
  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle>{t('kpiCharts.activeTrendTitle')}</CardTitle>
        <CardDescription>{t('kpiCharts.activeTrendDesc')}</CardDescription>
      </CardHeader>
      <CardContent>
        {data.length ? (
          <ChartContainer
            className="h-[240px] w-full"
            config={{
              active: {
                label: t('kpiCharts.activeLearners'),
                color: 'var(--chart-3)',
                valueFormatter: (value) => `${value ?? 0} ${t('scoreChart.learners')}`,
              },
            }}
          >
            <LineChart data={data}>
              <CartesianGrid
                vertical={false}
                strokeDasharray="3 3"
              />
              <XAxis
                dataKey="bucket"
                tickLine={false}
                axisLine={false}
                minTickGap={20}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
              />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Line
                type="monotone"
                dataKey="active"
                stroke="var(--color-active)"
                strokeWidth={2.5}
                dot={false}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ChartContainer>
        ) : (
          <ChartEmptyState description={t('trend.emptyState')} />
        )}
      </CardContent>
    </Card>
  );
}
