'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useMemo } from 'react';
import type { MetricCard } from '@/types/analytics';

interface TeacherKpiCardsProps {
  cards: { metric: MetricCard; sparkline: number[]; definition?: string }[];
}

const iconForDirection = (direction: MetricCard['direction']) => {
  if (direction === 'up') return <ArrowUpRight className="h-4 w-4" />;
  if (direction === 'down') return <ArrowDownRight className="h-4 w-4" />;
  return <Minus className="h-4 w-4" />;
};

/**
 * For metrics where "up is bad" (at_risk_learners, ungraded_submissions,
 * negative_engagement_courses), reverse the success/warning mapping so that
 * an increase shows as a warning badge and a decrease as a success badge.
 */
const badgeVariant = (direction: MetricCard['direction'], isHigherBetter: boolean) => {
  const isPositiveChange = direction === 'up' ? isHigherBetter : direction === 'down' ? !isHigherBetter : null;
  if (isPositiveChange === true) return 'success';
  if (isPositiveChange === false) return 'warning';
  return 'outline';
};

function Sparkline({ values, positive }: { values: number[]; positive: boolean }) {
  const path = useMemo(() => {
    if (!values.length) return '';
    const max = Math.max(...values, 1);
    const min = Math.min(...values, 0);
    const range = Math.max(1, max - min);
    return values
      .map((value, index) => {
        const x = (index / Math.max(1, values.length - 1)) * 100;
        const y = 32 - (((value - min) / range) * 28 + 2);
        return `${index === 0 ? 'M' : 'L'} ${x} ${y}`;
      })
      .join(' ');
  }, [values]);

  return (
    <svg
      viewBox="0 0 100 32"
      className="mt-3 h-8 w-full overflow-visible"
    >
      <path
        d={path}
        fill="none"
        stroke={positive ? 'var(--chart-2)' : 'var(--chart-4)'}
        strokeWidth="2.25"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default function TeacherKpiCards({ cards }: TeacherKpiCardsProps) {
  const t = useTranslations('TeacherAnalytics');
  const locale = useLocale();
  const numberFormatter = useMemo(() => new Intl.NumberFormat(locale), [locale]);

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {cards.map(({ metric, sparkline, definition }) => {
        const displayValue =
          metric.unit === '%' ? `${numberFormatter.format(metric.value)}%` : numberFormatter.format(metric.value);

        let deltaLabel: string;
        if (metric.delta_pct === null && metric.delta_value === null) {
          deltaLabel = t('kpi.noComparison');
        } else if (metric.delta_pct === null && metric.delta_value !== null) {
          deltaLabel = `${metric.delta_value > 0 ? '+' : ''}${numberFormatter.format(metric.delta_value)}`;
        } else if (metric.delta_pct !== null) {
          deltaLabel = `${metric.delta_pct > 0 ? '+' : ''}${numberFormatter.format(metric.delta_pct)}%`;
        } else {
          deltaLabel = t('kpi.stable');
        }

        const badgeLabel =
          metric.delta_value === null
            ? t('kpi.noComparison')
            : metric.delta_pct === null && metric.delta_value === 0
              ? t('kpi.stable')
              : metric.delta_pct === null
                ? t('kpi.noData')
                : deltaLabel;

        return (
          <Card
            key={metric.label}
            className="shadow-sm"
          >
            <CardHeader className="flex-row items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
                  {metric.label}
                </div>
                <CardTitle className="text-foreground mt-3 text-3xl font-semibold">{displayValue}</CardTitle>
                {metric.benchmark !== null && metric.benchmark !== undefined && (
                  <div className="text-muted-foreground mt-1 text-xs">
                    {metric.benchmark_label}:{' '}
                    {metric.unit === '%'
                      ? `${numberFormatter.format(metric.benchmark)}%`
                      : numberFormatter.format(metric.benchmark)}
                  </div>
                )}
                <Sparkline
                  values={sparkline}
                  positive={metric.is_higher_better ?? true}
                />
              </div>
              {metric.delta_value !== null && (
                <Badge variant={badgeVariant(metric.direction, metric.is_higher_better ?? true)}>
                  {iconForDirection(metric.direction)}
                  {badgeLabel}
                </Badge>
              )}
            </CardHeader>
            <CardContent className="space-y-1">
              <div className="text-muted-foreground text-sm">
                {metric.delta_value === null
                  ? t('kpi.noComparison')
                  : t('kpi.changePeriod', {
                      delta: `${metric.delta_value > 0 ? '+' : ''}${numberFormatter.format(metric.delta_value)}${metric.unit ?? ''}`,
                    })}
              </div>
              {definition && <div className="text-muted-foreground text-xs leading-4">{definition}</div>}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
