'use client';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { AnalyticsDataQuality } from '@/types/analytics';
import { DatabaseZap, ShieldCheck } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';

interface DataQualityPanelProps {
  quality: AnalyticsDataQuality;
}

export default function DataQualityPanel({ quality }: DataQualityPanelProps) {
  const locale = useLocale();
  const t = useTranslations('Components.DashboardAnalytics');
  const freshness =
    quality.freshness_seconds < 60
      ? `${quality.freshness_seconds}s`
      : quality.freshness_seconds < 3600
        ? `${Math.round(quality.freshness_seconds / 60)}m`
        : `${Math.round(quality.freshness_seconds / 3600)}h`;

  return (
    <Card className="shadow-sm">
      <CardHeader>
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5" />
          <CardTitle>{t('dataQualityPanel.title')}</CardTitle>
        </div>
        <CardDescription>{t('dataQualityPanel.description')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="bg-muted rounded-lg border p-4">
            <div className="text-muted-foreground text-xs tracking-wider uppercase">{t('dataQualityPanel.mode')}</div>
            <div className="mt-2 flex items-center gap-2 text-lg font-semibold">
              <DatabaseZap className="h-4 w-4" />
              {quality.mode}
            </div>
          </div>
          <div className="bg-muted rounded-lg border p-4">
            <div className="text-muted-foreground text-xs tracking-wider uppercase">
              {t('dataQualityPanel.lastRollup')}
            </div>
            <div className="mt-2 text-sm font-medium">
              {quality.last_rollup_time
                ? new Date(quality.last_rollup_time).toLocaleString(locale)
                : t('dataQualityPanel.liveQuery')}
            </div>
          </div>
          <div className="bg-muted rounded-lg border p-4">
            <div className="text-muted-foreground text-xs tracking-wider uppercase">
              {t('dataQualityPanel.confidence')}
            </div>
            <div className="mt-2">
              <Badge
                variant={
                  quality.confidence_level === 'high'
                    ? 'success'
                    : quality.confidence_level === 'medium'
                      ? 'warning'
                      : 'destructive'
                }
              >
                {t(`dataQualityPanel.confidenceLevels.${quality.confidence_level}`)}
              </Badge>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">
            {t('dataQualityPanel.freshness')} {freshness}
          </Badge>
          <Badge variant={quality.excluded_preview_attempts ? 'warning' : 'outline'}>
            {t('dataQualityPanel.previewAttemptsExcluded')} {quality.excluded_preview_attempts}
          </Badge>
          <Badge variant={quality.excluded_teacher_attempts ? 'warning' : 'outline'}>
            {t('dataQualityPanel.teacherAttemptsExcluded')} {quality.excluded_teacher_attempts}
          </Badge>
          <Badge variant={quality.courses_without_enough_data.length ? 'warning' : 'outline'}>
            {t('dataQualityPanel.thinCourses')} {quality.courses_without_enough_data.length}
          </Badge>
        </div>

        <div className="space-y-2">
          {quality.issues.length ? (
            quality.issues.map((issue) => (
              <div
                key={issue.id}
                className="bg-muted rounded-lg border p-3"
              >
                <Badge
                  variant={
                    issue.severity === 'critical' ? 'destructive' : issue.severity === 'warning' ? 'warning' : 'outline'
                  }
                >
                  {t(`dataQualityPanel.issueSeverity.${issue.severity}`)}
                </Badge>
                <div className="mt-2 text-sm font-medium">{issue.title}</div>
                <div className="text-muted-foreground text-sm">{issue.detail}</div>
              </div>
            ))
          ) : (
            <div className="text-muted-foreground text-sm">{t('dataQualityPanel.noIssues')}</div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
