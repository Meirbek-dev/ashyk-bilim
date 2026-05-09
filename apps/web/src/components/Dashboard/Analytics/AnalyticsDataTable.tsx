'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { useTranslations } from 'next-intl';

import DataTable from '@/components/ui/data-table';

interface AnalyticsDataTableProps<TData> {
  columns: ColumnDef<TData>[];
  data: TData[];
  searchPlaceholder?: string;
  emptyMessage?: string;
  className?: string;
  pageSize?: number;
  storageKey?: string;
  /**
   * When true the caller is handling pagination server-side. Client-side
   * pagination controls are hidden and all rows in `data` are rendered as one
   * page. Pagination state is excluded from sessionStorage persistence so it
   * does not conflict with the server page param.
   */
  serverPaginated?: boolean;
}

export default function AnalyticsDataTable<TData>({
  columns,
  data,
  searchPlaceholder,
  emptyMessage,
  className,
  pageSize = 20,
  storageKey,
  serverPaginated = false,
}: AnalyticsDataTableProps<TData>) {
  const t = useTranslations('TeacherAnalytics');
  return (
    <DataTable
      columns={columns}
      data={data}
      className={className}
      pageSize={pageSize}
      storageKey={storageKey ? `analytics-${storageKey}` : undefined}
      serverPaginated={serverPaginated}
      labels={{
        searchPlaceholder: searchPlaceholder ?? t('table.searchDefault'),
        emptyMessage: emptyMessage ?? t('table.emptyDefault'),
        visibleRows: (count) => t('table.visibleRows', { count }),
        showingRows: ({ from, to, total }) => t('table.showingRows', { from, to, total }),
        page: ({ current, total }) => t('table.page', { current, total }),
        prev: t('table.prev'),
        next: t('table.next'),
        rowsPerPage: t('table.rowsPerPage'),
        columns: t('table.columns'),
        exportCsv: t('table.exportCSV'),
        exportStarted: t('table.exportStarted'),
      }}
    />
  );
}
