'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import type { HistogramBucket } from '@/types/analytics';
import { useTranslations } from 'next-intl';

interface ScoreDistributionChartProps {
  title: string;
  description: string;
  data: HistogramBucket[];
}

export default function ScoreDistributionChart({ title, description, data }: ScoreDistributionChartProps) {
  const t = useTranslations('TeacherAnalytics');
  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer
          className="h-[260px] w-full"
          config={{
            count: {
              label: t('scoreChart.learners'),
              color: 'var(--chart-1)',
              valueFormatter: (value) => `${value ?? 0} ${t('scoreChart.learners')}`,
            },
          }}
        >
          <BarChart data={data}>
            <CartesianGrid
              vertical={false}
              strokeDasharray="3 3"
            />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  nameKey="label"
                  formatter={(v) => [`${v} ${t('scoreChart.learners')}`, '']}
                />
              }
            />
            <Bar
              dataKey="count"
              radius={8}
              fill="var(--color-count)"
            />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
