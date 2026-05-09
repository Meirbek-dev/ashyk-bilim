'use client';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { ContentBottleneckRow } from '@/types/analytics';
import { RouteOff } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';

interface ContentBottlenecksTableProps {
  rows: ContentBottleneckRow[];
}

export default function ContentBottlenecksTable({ rows }: ContentBottlenecksTableProps) {
  const locale = useLocale();
  const t = useTranslations('Components.DashboardAnalytics');
  const numberFormatter = new Intl.NumberFormat(locale);
  const signalLabel = (signal: ContentBottleneckRow['signal']) => t(`contentBottlenecksTable.signals.${signal}`);

  return (
    <Card className="shadow-sm">
      <CardHeader>
        <div className="flex items-center gap-2">
          <RouteOff className="h-5 w-5" />
          <CardTitle>{t('contentBottlenecksTable.title')}</CardTitle>
        </div>
        <CardDescription>{t('contentBottlenecksTable.description')}</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('contentBottlenecksTable.activity')}</TableHead>
              <TableHead>{t('contentBottlenecksTable.signal')}</TableHead>
              <TableHead>{t('contentBottlenecksTable.completion')}</TableHead>
              <TableHead>{t('contentBottlenecksTable.exits')}</TableHead>
              <TableHead>{t('contentBottlenecksTable.evidence')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.slice(0, 8).map((row) => (
              <TableRow key={`${row.signal}-${row.activity_id}`}>
                <TableCell className="max-w-[260px] whitespace-normal">
                  <div className="font-medium">{row.activity_name}</div>
                  <div className="text-muted-foreground text-xs">{row.course_name}</div>
                </TableCell>
                <TableCell>
                  <Badge
                    variant={
                      row.severity === 'critical' ? 'destructive' : row.severity === 'warning' ? 'warning' : 'outline'
                    }
                  >
                    {signalLabel(row.signal)}
                  </Badge>
                </TableCell>
                <TableCell>
                  {row.completion_rate === null || row.completion_rate === undefined
                    ? t('contentBottlenecksTable.na')
                    : `${numberFormatter.format(row.completion_rate)}%`}
                </TableCell>
                <TableCell>{numberFormatter.format(row.exit_count)}</TableCell>
                <TableCell className="text-muted-foreground max-w-[360px] text-sm whitespace-normal">
                  {row.note}
                </TableCell>
              </TableRow>
            ))}
            {!rows.length ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="text-muted-foreground"
                >
                  {t('contentBottlenecksTable.noBottlenecks')}
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
