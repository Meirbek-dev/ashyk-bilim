'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { RadialBar, RadialBarChart } from 'recharts';
import { useTranslations } from 'next-intl';

interface RadialDatum {
  name: string;
  label: string;
  value: number;
  fill: string;
}

interface KpiHealthRingsChartProps {
  data: RadialDatum[];
}

export default function KpiHealthRingsChart({ data }: KpiHealthRingsChartProps) {
  const t = useTranslations('TeacherAnalytics');
  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle>{t('kpiCharts.healthRingsTitle')}</CardTitle>
        <CardDescription>{t('kpiCharts.healthRingsDesc')}</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer
          className="h-[260px] w-full"
          config={Object.fromEntries(
            data.map((d) => [
              d.name,
              {
                label: d.label,
                color: d.fill,
                valueFormatter: (value: number | string | null | undefined) =>
                  `${Math.round(Number(value ?? 0))} / 100`,
              },
            ]),
          )}
        >
          <RadialBarChart
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={22}
            outerRadius={116}
            barSize={13}
            startAngle={90}
            endAngle={-270}
          >
            <ChartTooltip
              content={
                <ChartTooltipContent
                  nameKey="name"
                  formatter={(v) => [`${Math.round(Number(v))} / 100`, t('kpiCharts.healthScore')]}
                />
              }
            />
            <RadialBar
              dataKey="value"
              background={{ fill: 'var(--chart-5)' }}
              cornerRadius={4}
            />
          </RadialBarChart>
        </ChartContainer>
        <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5">
          {data.map((d) => (
            <div
              key={d.name}
              className="text-muted-foreground flex items-center gap-1.5 text-xs"
            >
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: d.fill }}
              />
              <span className="truncate">{d.label}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
