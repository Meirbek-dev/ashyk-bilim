'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { AdminAnalyticsResponse } from '@/types/analytics';
import { Building2 } from 'lucide-react';
import { useLocale } from 'next-intl';

interface AdminAnalyticsPanelProps {
  data: AdminAnalyticsResponse;
}

export default function AdminAnalyticsPanel({ data }: AdminAnalyticsPanelProps) {
  const locale = useLocale();
  const numberFormatter = new Intl.NumberFormat(locale);

  return (
    <Card className="shadow-sm">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Building2 className="h-5 w-5" />
          <CardTitle>Admin analytics</CardTitle>
        </div>
        <CardDescription>Platform-level workload, course health, cohort retention, program performance, and content ROI.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6 xl:grid-cols-2">
        <div>
          <div className="mb-2 text-sm font-medium">Teacher workload comparison</div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Teacher</TableHead>
                <TableHead>Backlog</TableHead>
                <TableHead>At risk</TableHead>
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
          <div className="mb-2 text-sm font-medium">Course health ranking</div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Course</TableHead>
                <TableHead>Health</TableHead>
                <TableHead>Completion</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.course_health_ranking.slice(0, 5).map((row) => (
                <TableRow key={row.course_id}>
                  <TableCell className="max-w-[260px] truncate">{row.course_name}</TableCell>
                  <TableCell>{numberFormatter.format(row.health_score)}</TableCell>
                  <TableCell>{numberFormatter.format(row.completion_rate)}%</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <div>
          <div className="mb-2 text-sm font-medium">Cohort retention</div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cohort</TableHead>
                <TableHead>Retention</TableHead>
                <TableHead>Learners</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.cohort_retention.slice(0, 5).map((row) => (
                <TableRow key={row.cohort_id}>
                  <TableCell className="max-w-[220px] truncate">{row.cohort_name}</TableCell>
                  <TableCell>
                    {row.retention_rate === null || row.retention_rate === undefined
                      ? 'n/a'
                      : `${numberFormatter.format(row.retention_rate)}%`}
                  </TableCell>
                  <TableCell>{row.learners}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <div>
          <div className="mb-2 text-sm font-medium">Content ROI</div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Course</TableHead>
                <TableHead>ROI</TableHead>
                <TableHead>Pass/completion</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.content_roi.slice(0, 5).map((row) => (
                <TableRow key={row.course_id}>
                  <TableCell className="max-w-[260px] truncate">{row.course_name}</TableCell>
                  <TableCell>
                    {row.content_roi_score === null || row.content_roi_score === undefined
                      ? 'n/a'
                      : numberFormatter.format(row.content_roi_score)}
                  </TableCell>
                  <TableCell>{numberFormatter.format(row.completion_rate)}%</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
