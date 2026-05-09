'use client';

import {
  ChartContainer,
  ChartEmptyState,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Area, AreaChart, CartesianGrid, Legend, XAxis, YAxis } from 'recharts';
import { useTranslations } from 'next-intl';

interface KpiSubmissionAreaChartProps {
  data: { bucket: string; submissions: number; grading: number }[];
}

export default function KpiSubmissionAreaChart({ data }: KpiSubmissionAreaChartProps) {
  const t = useTranslations('TeacherAnalytics');
  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle>{t('kpiCharts.submissionTrendTitle')}</CardTitle>
        <CardDescription>{t('kpiCharts.submissionTrendDesc')}</CardDescription>
      </CardHeader>
      <CardContent>
        {data.length ? (
          <ChartContainer
            className="h-[240px] w-full"
            config={{
              submissions: {
                label: t('kpiCharts.submissions'),
                color: 'var(--chart-1)',
                valueFormatter: (value) => `${value ?? 0} ${t('scoreChart.learners')}`,
              },
              grading: {
                label: t('kpiCharts.gradingCompleted'),
                color: 'var(--chart-2)',
                valueFormatter: (value) => `${value ?? 0} ${t('scoreChart.learners')}`,
              },
            }}
          >
            <AreaChart data={data}>
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
              <Legend content={<ChartLegendContent />} />
              <Area
                type="monotone"
                dataKey="submissions"
                stroke="var(--color-submissions)"
                fill="var(--color-submissions)"
                fillOpacity={0.15}
                strokeWidth={2.5}
              />
              <Area
                type="monotone"
                dataKey="grading"
                stroke="var(--color-grading)"
                fill="var(--color-grading)"
                fillOpacity={0.1}
                strokeWidth={2}
              />
            </AreaChart>
          </ChartContainer>
        ) : (
          <ChartEmptyState description={t('trend.emptyState')} />
        )}
      </CardContent>
    </Card>
  );
}
