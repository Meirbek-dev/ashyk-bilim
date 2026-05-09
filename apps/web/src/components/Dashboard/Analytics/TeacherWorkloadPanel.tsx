'use client';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { TeacherWorkloadSummary } from '@/types/analytics';
import { Clock4, Inbox, TimerReset } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';

interface TeacherWorkloadPanelProps {
  workload: TeacherWorkloadSummary;
}

export default function TeacherWorkloadPanel({ workload }: TeacherWorkloadPanelProps) {
  const locale = useLocale();
  const numberFormatter = new Intl.NumberFormat(locale);
  const t = useTranslations('Components.DashboardAnalytics');
  const hours = (value: number | null | undefined) =>
    value === null || value === undefined ? t('teacherWorkloadPanel.na') : `${numberFormatter.format(value)}h`;

  return (
    <Card className="shadow-sm">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Inbox className="h-5 w-5" />
          <CardTitle>{t('teacherWorkloadPanel.title')}</CardTitle>
        </div>
        <CardDescription>{t('teacherWorkloadPanel.description')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="bg-muted rounded-lg border p-4">
            <div className="text-muted-foreground flex items-center gap-2 text-xs tracking-wider uppercase">
              <Inbox className="h-3.5 w-3.5" />
              {t('teacherWorkloadPanel.backlog')}
            </div>
            <div className="text-foreground mt-2 text-2xl font-semibold">
              {numberFormatter.format(workload.backlog_total)}
            </div>
          </div>
          <div className="bg-muted rounded-lg border p-4">
            <div className="text-muted-foreground flex items-center gap-2 text-xs tracking-wider uppercase">
              <Clock4 className="h-3.5 w-3.5" />
              {t('teacherWorkloadPanel.slaBreaches')}
            </div>
            <div className="text-foreground mt-2 text-2xl font-semibold">
              {numberFormatter.format(workload.sla_breaches)}
            </div>
          </div>
          <div className="bg-muted rounded-lg border p-4">
            <div className="text-muted-foreground flex items-center gap-2 text-xs tracking-wider uppercase">
              <TimerReset className="h-3.5 w-3.5" />
              {t('teacherWorkloadPanel.forecast7d')}
            </div>
            <div className="text-foreground mt-2 text-2xl font-semibold">
              {numberFormatter.format(workload.forecast_backlog_7d)}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">
            {t('teacherWorkloadPanel.bucket0_24')} {workload.aging_buckets.h0_24}
          </Badge>
          <Badge variant="outline">
            {t('teacherWorkloadPanel.bucket1_3d')} {workload.aging_buckets.d1_3}
          </Badge>
          <Badge variant={workload.aging_buckets.d3_7 ? 'warning' : 'outline'}>
            {t('teacherWorkloadPanel.bucket3_7d')} {workload.aging_buckets.d3_7}
          </Badge>
          <Badge variant={workload.aging_buckets.d7_plus ? 'destructive' : 'outline'}>
            {t('teacherWorkloadPanel.bucket7dPlus')} {workload.aging_buckets.d7_plus}
          </Badge>
          <Badge variant="outline">
            {t('teacherWorkloadPanel.medianFeedback')} {hours(workload.median_feedback_latency_hours)}
          </Badge>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('teacherWorkloadPanel.assignment')}</TableHead>
              <TableHead>{t('teacherWorkloadPanel.course')}</TableHead>
              <TableHead>{t('teacherWorkloadPanel.waiting')}</TableHead>
              <TableHead>{t('teacherWorkloadPanel.oldest')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {workload.backlog_by_assignment.slice(0, 5).map((item) => (
              <TableRow key={`${item.assessment_id}-${item.course_id}`}>
                <TableCell className="max-w-[260px] font-medium whitespace-normal">{item.title}</TableCell>
                <TableCell className="max-w-[220px] whitespace-normal">{item.course_name}</TableCell>
                <TableCell>{item.awaiting_review}</TableCell>
                <TableCell>{hours(item.age_hours)}</TableCell>
              </TableRow>
            ))}
            {!workload.backlog_by_assignment.length ? (
              <TableRow>
                <TableCell
                  colSpan={4}
                  className="text-muted-foreground"
                >
                  {t('teacherWorkloadPanel.noSubmissions')}
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
