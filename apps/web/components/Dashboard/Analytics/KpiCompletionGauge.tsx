'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { Cell, Pie, PieChart } from 'recharts';
import { useLocale, useTranslations } from 'next-intl';
import { useMemo } from 'react';

interface KpiCompletionGaugeProps {
  completionPct: number;
  deltaPct: number | null;
  direction: 'up' | 'down' | 'flat';
}

export default function KpiCompletionGauge({ completionPct, deltaPct, direction }: KpiCompletionGaugeProps) {
  const t = useTranslations('TeacherAnalytics');
  const locale = useLocale();
  const numberFormatter = useMemo(() => new Intl.NumberFormat(locale), [locale]);

  const formatPercent = (value: string | number | null | undefined) =>
    `${numberFormatter.format(typeof value === 'number' ? value : Number(value ?? 0))}%`;

  const gaugeData = [
    { name: t('kpiCharts.completionRate'), value: completionPct },
    { name: t('kpiCharts.remaining'), value: Math.max(0, 100 - completionPct) },
  ];

  const deltaColor =
    direction === 'up' ? 'text-emerald-600' : direction === 'down' ? 'text-amber-600' : 'text-muted-foreground';

  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle>{t('kpiCharts.completionGaugeTitle')}</CardTitle>
        <CardDescription>{t('kpiCharts.completionGaugeDesc')}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="relative">
          <ChartContainer
            className="h-[220px] w-full"
            config={{
              completion: {
                label: t('kpiCharts.completionRate'),
                color: 'var(--chart-2)',
                valueFormatter: (value) => formatPercent(value),
              },
              remaining: {
                label: t('kpiCharts.remaining'),
                color: 'var(--chart-5)',
                valueFormatter: (value) => formatPercent(value),
              },
            }}
          >
            <PieChart>
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    nameKey="name"
                    formatter={(v) => [`${v}%`, '']}
                  />
                }
              />
              <Pie
                data={gaugeData}
                cx="50%"
                cy="80%"
                startAngle={180}
                endAngle={0}
                innerRadius={75}
                outerRadius={105}
                dataKey="value"
                paddingAngle={0}
                strokeWidth={0}
              >
                <Cell fill="var(--chart-2)" />
                <Cell fill="var(--chart-5)" />
              </Pie>
            </PieChart>
          </ChartContainer>
          <div className="pointer-events-none absolute inset-0 flex items-end justify-center pb-6">
            <div className="text-center">
              <div className="text-foreground text-4xl font-bold">{numberFormatter.format(completionPct)}%</div>
              {deltaPct !== null && (
                <div className={`mt-0.5 text-sm font-medium ${deltaColor}`}>
                  {deltaPct > 0 ? '+' : ''}
                  {numberFormatter.format(deltaPct)}% {t('kpiCharts.vsPrevPeriod')}
                </div>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
