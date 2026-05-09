'use client';

import { ChartContainer, ChartLegendContent, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Bar, BarChart, CartesianGrid, Legend, XAxis, YAxis } from 'recharts';
import { useTranslations } from 'next-intl';

interface KpiPeriodCompBarChartProps {
  data: { metric: string; current: number; previous: number | null }[];
}

export default function KpiPeriodCompBarChart({ data }: KpiPeriodCompBarChartProps) {
  const t = useTranslations('TeacherAnalytics');
  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle>{t('kpiCharts.periodCompTitle')}</CardTitle>
        <CardDescription>{t('kpiCharts.periodCompDesc')}</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer
          className="h-[260px] w-full"
          config={{
            current: {
              label: t('kpiCharts.currentPeriod'),
              color: 'var(--chart-1)',
              valueFormatter: (value) => `${value ?? 0}`,
            },
            previous: {
              label: t('kpiCharts.previousPeriod'),
              color: 'var(--chart-4)',
              valueFormatter: (value) => `${value ?? 0}`,
            },
          }}
        >
          <BarChart
            data={data}
            barCategoryGap="28%"
          >
            <CartesianGrid
              vertical={false}
              strokeDasharray="3 3"
            />
            <XAxis
              dataKey="metric"
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 11 }}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              allowDecimals={false}
            />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Legend content={<ChartLegendContent />} />
            <Bar
              dataKey="current"
              radius={[6, 6, 0, 0]}
              fill="var(--color-current)"
            />
            <Bar
              dataKey="previous"
              radius={[6, 6, 0, 0]}
              fill="var(--color-previous)"
            />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
