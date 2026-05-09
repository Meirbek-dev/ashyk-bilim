'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { AdminAnalyticsResponse } from '@/types/analytics';
import { Building2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';

interface AdminAnalyticsPanelProps {
  data: AdminAnalyticsResponse;
}

export default function AdminAnalyticsPanel({ data }: AdminAnalyticsPanelProps) {
  const locale = useLocale();
  const numberFormatter = new Intl.NumberFormat(locale);
  const t = useTranslations('Components.DashboardAnalytics');

  return (
    <Card className="shadow-sm">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Building2 className="h-5 w-5" />
          <CardTitle>{t('adminAnalyticsPanel.title')}</CardTitle>
        </div>
        <CardDescription>{t('adminAnalyticsPanel.description')}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6 xl:grid-cols-2">
        <div>
          <div className="mb-2 text-sm font-medium">{t('adminAnalyticsPanel.teacherWorkloadComparison')}</div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('adminAnalyticsPanel.teacher')}</TableHead>
                <TableHead>{t('adminAnalyticsPanel.backlog')}</TableHead>
                <TableHead>{t('adminAnalyticsPanel.atRisk')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.teacher_workload_comparison.slice(0, 5).map((row) => (
                <TableRow key={row.teacher_user_id}>
                  <TableCell className="max-w-[220px] truncate">{row.teacher_display_name}</TableCell>
                  <TableCell>{row.workload_backlog}</TableCell>
                  <TableCell>{row.at_risk_learners}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <div>
          <div className="mb-2 text-sm font-medium">{t('adminAnalyticsPanel.courseHealthRanking')}</div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('adminAnalyticsPanel.course')}</TableHead>
                <TableHead>{t('adminAnalyticsPanel.health')}</TableHead>
                <TableHead>{t('adminAnalyticsPanel.completion')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.course_health_ranking.slice(0, 5).map((row) => (
                <TableRow key={row.course_id}>
                  <TableCell className="max-w-[260px] truncate">{row.course_name}</TableCell>
                  <TableCell>{numberFormatter.format(row.health_score)}</TableCell>
                  <TableCell>{`${numberFormatter.format(row.completion_rate)}%`}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <div>
          <div className="mb-2 text-sm font-medium">{t('adminAnalyticsPanel.cohortRetention')}</div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('adminAnalyticsPanel.cohort')}</TableHead>
                <TableHead>{t('adminAnalyticsPanel.retention')}</TableHead>
                <TableHead>{t('adminAnalyticsPanel.learners')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.cohort_retention.slice(0, 5).map((row) => (
                <TableRow key={row.cohort_id}>
                  <TableCell className="max-w-[220px] truncate">{row.cohort_name}</TableCell>
                  <TableCell>
                    {row.retention_rate === null || row.retention_rate === undefined
                      ? t('adminAnalyticsPanel.noData')
                      : `${numberFormatter.format(row.retention_rate)}%`}
                  </TableCell>
                  <TableCell>{row.learners}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <div>
          <div className="mb-2 text-sm font-medium">{t('adminAnalyticsPanel.contentROI')}</div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('adminAnalyticsPanel.course')}</TableHead>
                <TableHead>{t('adminAnalyticsPanel.roi')}</TableHead>
                <TableHead>{t('adminAnalyticsPanel.passCompletion')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.content_roi.slice(0, 5).map((row) => (
                <TableRow key={row.course_id}>
                  <TableCell className="max-w-[260px] truncate">{row.course_name}</TableCell>
                  <TableCell>
                    {row.content_roi_score === null || row.content_roi_score === undefined
                      ? t('adminAnalyticsPanel.noData')
                      : numberFormatter.format(row.content_roi_score)}
                  </TableCell>
                  <TableCell>{`${numberFormatter.format(row.completion_rate)}%`}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
