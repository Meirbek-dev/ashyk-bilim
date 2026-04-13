'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { PolarAngleAxis, PolarGrid, Radar, RadarChart } from 'recharts';
import type { QuestionDifficultyRow } from '@/types/analytics';
import { useTranslations } from 'next-intl';

interface QuestionDifficultyRadarProps {
  title: string;
  description: string;
  data: QuestionDifficultyRow[];
}

export default function QuestionDifficultyRadar({ title, description, data }: QuestionDifficultyRadarProps) {
  const t = useTranslations('TeacherAnalytics');
  const MAX = 8;
  const radarData = data.slice(0, MAX).map((row) => ({
    label: row.question_label,
    accuracy: row.accuracy_pct ?? 0,
  }));

  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {data.length > MAX && (
          <p className="text-muted-foreground mb-2 text-xs">{t('radar.showing', { shown: MAX, total: data.length })}</p>
        )}
        <ChartContainer
          className="h-[320px] w-full"
          config={{
            accuracy: {
              label: t('radar.accuracy'),
              color: 'var(--chart-2)',
              valueFormatter: (value) => `${Math.round(Number(value ?? 0))}%`,
            },
          }}
        >
          <RadarChart data={radarData}>
            <ChartTooltip content={<ChartTooltipContent />} />
            <PolarGrid />
            <PolarAngleAxis
              dataKey="label"
              tick={{ fontSize: 11 }}
            />
            <Radar
              dataKey="accuracy"
              fill="var(--color-accuracy)"
              fillOpacity={0.25}
              stroke="var(--color-accuracy)"
              strokeWidth={2}
            />
          </RadarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
