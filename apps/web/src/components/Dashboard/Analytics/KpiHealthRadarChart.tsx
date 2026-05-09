'use client';

import { ChartContainer, ChartLegendContent, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Legend, PolarAngleAxis, PolarGrid, Radar, RadarChart } from 'recharts';
import { useTranslations } from 'next-intl';

interface KpiHealthRadarChartProps {
  data: { subject: string; current: number; previous: number }[];
}

export default function KpiHealthRadarChart({ data }: KpiHealthRadarChartProps) {
  const t = useTranslations('TeacherAnalytics');
  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle>{t('kpiCharts.healthRadarTitle')}</CardTitle>
        <CardDescription>{t('kpiCharts.healthRadarDesc')}</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer
          className="h-[300px] w-full"
          config={{
            current: {
              label: t('kpiCharts.currentPeriod'),
              color: 'var(--chart-1)',
              valueFormatter: (value) => `${Math.round(Number(value ?? 0))} / 100`,
            },
            previous: {
              label: t('kpiCharts.previousPeriod'),
              color: 'var(--chart-4)',
              valueFormatter: (value) => `${Math.round(Number(value ?? 0))} / 100`,
            },
          }}
        >
          <RadarChart
            data={data}
            cx="50%"
            cy="50%"
          >
            <ChartTooltip content={<ChartTooltipContent formatter={(v) => [`${Math.round(Number(v))} / 100`, '']} />} />
            <PolarGrid gridType="polygon" />
            <PolarAngleAxis
              dataKey="subject"
              tick={{ fontSize: 11 }}
            />
            <Legend content={<ChartLegendContent />} />
            <Radar
              dataKey="previous"
              stroke="var(--color-previous)"
              fill="var(--color-previous)"
              fillOpacity={0.12}
              strokeWidth={1.5}
              strokeDasharray="4 2"
            />
            <Radar
              dataKey="current"
              stroke="var(--color-current)"
              fill="var(--color-current)"
              fillOpacity={0.22}
              strokeWidth={2}
            />
          </RadarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
