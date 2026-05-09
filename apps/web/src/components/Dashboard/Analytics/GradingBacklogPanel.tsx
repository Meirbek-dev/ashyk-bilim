'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { AlertItem } from '@/types/analytics';
import { Badge } from '@/components/ui/badge';
import { useTranslations } from 'next-intl';
import { Clock4 } from 'lucide-react';

interface GradingBacklogPanelProps {
  backlogCount: number;
  alerts: AlertItem[];
}

export default function GradingBacklogPanel({ backlogCount, alerts }: GradingBacklogPanelProps) {
  const t = useTranslations('TeacherAnalytics');
  const gradingAlerts = alerts.filter((alert) => alert.type === 'grading_backlog' || alert.type === 'grading_slo');
  return (
    <Card className="shadow-sm">
      <CardHeader>
        <div className="flex items-center gap-2 text-amber-700">
          <Clock4 className="h-5 w-5" />
          <CardTitle>{t('gradingBacklog.title')}</CardTitle>
        </div>
        <CardDescription>{t('gradingBacklog.description')}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="text-foreground text-4xl font-semibold">{backlogCount}</div>
        <div className="mt-4 flex flex-wrap gap-2">
          {gradingAlerts.length ? (
            gradingAlerts.map((alert) => (
              <Badge
                key={alert.id}
                variant={alert.severity === 'critical' ? 'destructive' : 'warning'}
              >
                {alert.title}
              </Badge>
            ))
          ) : (
            <Badge variant="outline">{t('gradingBacklog.noAlert')}</Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
