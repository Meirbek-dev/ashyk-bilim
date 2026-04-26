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
    discrimination: (row as QuestionDifficultyRow & { discrimination_index?: number | null }).discrimination_index ?? 0,
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
            discrimination: {
              label: t('radar.discrimination'),
              color: 'var(--chart-4)',
              valueFormatter: (value) => Number(value ?? 0).toFixed(2),
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
            <Radar
              dataKey="discrimination"
              fill="var(--color-discrimination)"
              fillOpacity={0.15}
              stroke="var(--color-discrimination)"
              strokeWidth={2}
            />
          </RadarChart>
        </ChartContainer>
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          {data.slice(0, MAX).map((row) => {
            const quality = row as QuestionDifficultyRow & {
              strong_miss_pct?: number | null;
              weak_correct_pct?: number | null;
              distractor_issue_count?: number | null;
            };
            return (
              <div
                key={row.question_id}
                className="bg-muted rounded-md border p-3 text-xs"
              >
                <div className="font-medium">{row.question_label}</div>
                <div className="text-muted-foreground mt-1">
                  {t('radar.qualitySummary', {
                    strongMiss: t('radar.strongMiss'),
                    strongMissPct: quality.strong_miss_pct ?? 0,
                    weakCorrect: t('radar.weakCorrect'),
                    weakCorrectPct: quality.weak_correct_pct ?? 0,
                    distractorIssues: t('radar.distractorIssues'),
                    distractorIssueCount: quality.distractor_issue_count ?? 0,
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
