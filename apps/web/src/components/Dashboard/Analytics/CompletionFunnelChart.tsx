'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import type { FunnelStep } from '@/types/analytics';
import { useTranslations } from 'next-intl';

interface CompletionFunnelChartProps {
  title: string;
  description: string;
  data: FunnelStep[];
}

export default function CompletionFunnelChart({ title, description, data }: CompletionFunnelChartProps) {
  const t = useTranslations('TeacherAnalytics');
  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer
          className="h-[280px] w-full"
          config={{
            count: {
              label: t('funnel.learners'),
              color: 'var(--chart-2)',
              valueFormatter: (value) => `${value ?? 0} ${t('funnel.learners')}`,
            },
          }}
        >
          <BarChart
            data={data}
            layout="vertical"
            margin={{ left: 18 }}
          >
            <CartesianGrid
              horizontal={false}
              strokeDasharray="3 3"
            />
            <XAxis
              type="number"
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => String(v)}
            />
            <YAxis
              dataKey="label"
              type="category"
              width={140}
              tickLine={false}
              axisLine={false}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  nameKey="label"
                  formatter={(v) => [`${v} ${t('funnel.learners')}`, '']}
                />
              }
            />
            <Bar
              dataKey="count"
              fill="var(--color-count)"
              radius={8}
            />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
