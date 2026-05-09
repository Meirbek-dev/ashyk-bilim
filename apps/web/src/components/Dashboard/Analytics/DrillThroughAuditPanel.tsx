'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { AnalyticsQuery, AssessmentOutlierRow, DrillThroughResponse } from '@/types/analytics';
import { getTeacherDrillThrough } from '@services/analytics/teacher';
import { ListFilter, Search } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';

interface DrillThroughAuditPanelProps {
  query: AnalyticsQuery;
  assessmentPreview: AssessmentOutlierRow[];
}

export default function DrillThroughAuditPanel({ query, assessmentPreview }: DrillThroughAuditPanelProps) {
  const t = useTranslations('Components.DashboardAnalytics');
  const [result, setResult] = useState<DrillThroughResponse | null>(null);
  const [loadingMetric, setLoadingMetric] = useState<DrillThroughResponse['metric'] | null>(null);
  const assessment = assessmentPreview.find((item) => item.pass_rate !== null) ?? assessmentPreview[0];

  const displayValue = (value: unknown) => {
    if (typeof value === 'boolean') return value ? t('drillThroughAuditPanel.yes') : t('drillThroughAuditPanel.no');
    if (value === null || value === undefined || value === '') return t('drillThroughAuditPanel.na');
    if (Array.isArray(value)) return value.join(', ');
    return String(value);
  };

  const metricLabel = (metric: string) => {
    const labels: Record<string, string> = {
      active_learners: t('drillThroughAuditPanel.metrics.active_learners'),
      completion_rate: t('drillThroughAuditPanel.metrics.completion_rate'),
      backlog: t('drillThroughAuditPanel.metrics.backlog'),
      pass_rate: t('drillThroughAuditPanel.metrics.pass_rate'),
    };

    return labels[metric] ?? metric.replaceAll('_', ' ');
  };

  const loadMetric = async (metric: DrillThroughResponse['metric']) => {
    setLoadingMetric(metric);
    try {
      const response = await getTeacherDrillThrough(
        metric,
        metric === 'pass_rate' && assessment
          ? {
              ...query,
              assessment_type: assessment.assessment_type,
              assessment_id: assessment.assessment_id,
            }
          : query,
      );
      setResult(response);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('drillThroughAuditPanel.couldNotLoadRows'));
    } finally {
      setLoadingMetric(null);
    }
  };

  const columns = result?.items[0] ? Object.keys(result.items[0]).slice(0, 6) : [];

  return (
    <Card className="shadow-sm">
      <CardHeader>
        <div className="flex items-center gap-2">
          <ListFilter className="h-5 w-5" />
          <CardTitle>{t('drillThroughAuditPanel.title')}</CardTitle>
        </div>
        <CardDescription>{t('drillThroughAuditPanel.description')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {(['active_learners', 'completion_rate', 'backlog'] as const).map((metric) => (
            <Button
              key={metric}
              type="button"
              variant="outline"
              size="sm"
              onClick={() => loadMetric(metric)}
              disabled={loadingMetric !== null}
            >
              <Search className="h-3.5 w-3.5" />
              {metricLabel(metric)}
            </Button>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => loadMetric('pass_rate')}
            disabled={loadingMetric !== null || !assessment}
          >
            <Search className="h-3.5 w-3.5" />
            {t('drillThroughAuditPanel.metrics.pass_rate')}
          </Button>
        </div>

        {result ? (
          <div className="space-y-2">
            <Badge variant="outline">
              {metricLabel(result.metric)}: {t('drillThroughAuditPanel.rows', { count: result.total })}
            </Badge>
            <Table>
              <TableHeader>
                <TableRow>
                  {columns.map((column) => (
                    <TableHead key={column}>{metricLabel(column)}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.items.slice(0, 8).map((item, index) => (
                  <TableRow key={`${result.metric}-${index}`}>
                    {columns.map((column) => (
                      <TableCell
                        key={column}
                        className="max-w-[220px] truncate"
                      >
                        {displayValue(item[column])}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
                {!result.items.length ? (
                  <TableRow>
                    <TableCell
                      colSpan={Math.max(columns.length, 1)}
                      className="text-muted-foreground"
                    >
                      {t('drillThroughAuditPanel.noSourceRows')}
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="text-muted-foreground text-sm">{t('drillThroughAuditPanel.chooseMetric')}</div>
        )}
      </CardContent>
    </Card>
  );
}
