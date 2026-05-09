'use client';

import { useTranslations } from 'next-intl';
import * as React from 'react';

import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Download, Search, Settings2 } from 'lucide-react';
import type { ColumnDef, PaginationState, RowData, SortingState, VisibilityState } from '@tanstack/react-table';

import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

declare module '@tanstack/react-table' {
  interface ColumnMeta<TData extends RowData, TValue> {
    label?: string;
    exportable?: boolean;
    exportValue?: (row: TData) => unknown;
  }
}

interface DataTableLabels {
  searchPlaceholder?: string;
  emptyMessage?: string;
  visibleRows?: (count: number) => string;
  showingRows?: (args: { from: number; to: number; total: number }) => string;
  page?: (args: { current: number; total: number }) => string;
  prev?: string;
  next?: string;
  rowsPerPage?: string;
  columns?: string;
  exportCsv?: string;
  exportStarted?: string;
}

interface DataTableProps<TData> {
  columns: ColumnDef<TData>[];
  data: TData[];
  className?: string;
  pageSize?: number;
  pageSizeOptions?: number[];
  storageKey?: string;
  serverPaginated?: boolean;
  labels?: DataTableLabels;
  toolbarContent?: React.ReactNode;
  enableColumnVisibility?: boolean;
  enableCsvExport?: boolean;
  csvFileName?: string;
}

const escapeCsv = (value: unknown) => {
  const normalized = value === null || value === undefined ? '' : String(value);
  return `"${normalized.replace(/"/g, '""')}"`;
};

export default function DataTable<TData>({
  columns,
  data,
  className,
  pageSize = 20,
  pageSizeOptions = [10, 20, 50, 100],
  storageKey,
  serverPaginated = false,
  labels,
  toolbarContent,
  enableColumnVisibility = false,
  enableCsvExport = false,
  csvFileName = `table-${new Date().toISOString()}.csv`,
}: DataTableProps<TData>) {
  const t = useTranslations('Common.DataTable');
  const defaultLabels: Required<DataTableLabels> = {
    searchPlaceholder: t('searchPlaceholder'),
    emptyMessage: t('emptyMessage'),
    visibleRows: (count) => t('visibleRows', { count }),
    showingRows: ({ from, to, total }) => t('showingRows', { from, to, total }),
    page: ({ current, total }) => t('page', { current, total }),
    prev: t('prev'),
    next: t('next'),
    rowsPerPage: t('rowsPerPage'),
    columns: t('columns'),
    exportCsv: t('exportCsv'),
    exportStarted: t('exportStarted'),
  };
  const resolvedLabels = { ...defaultLabels, ...labels };
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = React.useState('');
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({});
  const [pagination, setPagination] = React.useState({
    pageIndex: 0,
    pageSize: serverPaginated ? data.length || pageSize : pageSize,
  });

  React.useEffect(() => {
    if (!storageKey || typeof globalThis.window === 'undefined') return;
    const raw = globalThis.sessionStorage.getItem(`data-table:${storageKey}`);
    if (!raw) return;

    try {
      const parsed = JSON.parse(raw) as {
        sorting?: SortingState;
        globalFilter?: string;
        columnVisibility?: VisibilityState;
        pagination?: PaginationState;
      };

      if (parsed.sorting) setSorting(parsed.sorting);
      if (typeof parsed.globalFilter === 'string') setGlobalFilter(parsed.globalFilter);
      if (parsed.columnVisibility) setColumnVisibility(parsed.columnVisibility);
      if (!serverPaginated && parsed.pagination) setPagination(parsed.pagination);
    } catch {
      globalThis.sessionStorage.removeItem(`data-table:${storageKey}`);
    }
  }, [storageKey, serverPaginated]);

  React.useEffect(() => {
    if (serverPaginated) {
      setPagination((current) => ({
        pageIndex: 0,
        pageSize: data.length || pageSize,
      }));
    }
  }, [data.length, pageSize, serverPaginated]);

  React.useEffect(() => {
    if (!storageKey || typeof globalThis.window === 'undefined') return;

    globalThis.sessionStorage.setItem(
      `data-table:${storageKey}`,
      JSON.stringify(
        serverPaginated
          ? { sorting, globalFilter, columnVisibility }
          : { sorting, globalFilter, columnVisibility, pagination },
      ),
    );
  }, [columnVisibility, globalFilter, pagination, sorting, storageKey, serverPaginated]);

  const table = useReactTable({
    data,
    columns,
    state: { sorting, globalFilter, pagination, columnVisibility },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    onPaginationChange: setPagination,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    ...(serverPaginated ? {} : { getPaginationRowModel: getPaginationRowModel() }),
    manualPagination: serverPaginated,
    globalFilterFn: (row, _columnId, filterValue) => {
      const normalizedFilter = String(filterValue).toLowerCase();
      return row.getVisibleCells().some((cell) =>
        String(cell.getValue() ?? '')
          .toLowerCase()
          .includes(normalizedFilter),
      );
    },
  });

  const { rows } = table.getRowModel();
  const totalFiltered = table.getFilteredRowModel().rows.length;
  const { pageIndex, pageSize: currentPageSize } = table.getState().pagination;
  const pageCount = table.getPageCount();
  const from = totalFiltered > 0 ? pageIndex * currentPageSize + 1 : 0;
  const to = totalFiltered > 0 ? Math.min(from + rows.length - 1, totalFiltered) : 0;

  const exportableColumns = table.getAllLeafColumns().filter((column) => {
    const hasAccessor = 'accessorKey' in column.columnDef || 'accessorFn' in column.columnDef;
    return (
      column.getIsVisible() &&
      column.columnDef.meta?.exportable !== false &&
      (hasAccessor || typeof column.columnDef.meta?.exportValue === 'function')
    );
  });

  const handleExportCsv = () => {
    const sourceRows = serverPaginated ? table.getRowModel().rows : table.getSortedRowModel().rows;
    if (sourceRows.length === 0 || exportableColumns.length === 0) return;

    const headerRow = exportableColumns.map((column) => {
      const label =
        column.columnDef.meta?.label ??
        (typeof column.columnDef.header === 'string' ? column.columnDef.header : column.id);
      return escapeCsv(label);
    });

    const bodyRows = sourceRows.map((row) =>
      exportableColumns.map((column) => {
        const value = column.columnDef.meta?.exportValue
          ? column.columnDef.meta.exportValue(row.original)
          : row.getValue(column.id);
        return escapeCsv(value);
      }),
    );

    const csv = [headerRow.join(','), ...bodyRows.map((row) => row.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = csvFileName;
    link.click();
    URL.revokeObjectURL(url);
    toast.success(resolvedLabels.exportStarted);
  };

  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative w-full max-w-md">
            <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
            <Input
              value={globalFilter}
              onChange={(event) => {
                setGlobalFilter(event.target.value);
                setPagination((current) => ({ ...current, pageIndex: 0 }));
              }}
              placeholder={resolvedLabels.searchPlaceholder}
              className="pl-9"
            />
          </div>
          {enableColumnVisibility ? (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="outline"
                    size="sm"
                  >
                    <Settings2 className="h-4 w-4" />
                    {resolvedLabels.columns}
                  </Button>
                }
              />
              <DropdownMenuContent align="end">
                <DropdownMenuGroup>
                  <DropdownMenuLabel>{resolvedLabels.columns}</DropdownMenuLabel>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                {table
                  .getAllLeafColumns()
                  .filter((column) => column.getCanHide())
                  .map((column) => {
                    const label =
                      column.columnDef.meta?.label ??
                      (typeof column.columnDef.header === 'string' ? column.columnDef.header : column.id);

                    return (
                      <DropdownMenuCheckboxItem
                        key={column.id}
                        checked={column.getIsVisible()}
                        onCheckedChange={(checked) => column.toggleVisibility(checked)}
                      >
                        {label}
                      </DropdownMenuCheckboxItem>
                    );
                  })}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
          {enableCsvExport ? (
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportCsv}
              disabled={rows.length === 0 || exportableColumns.length === 0}
            >
              <Download className="h-4 w-4" />
              {resolvedLabels.exportCsv}
            </Button>
          ) : null}
          {toolbarContent}
        </div>
        <div className="text-muted-foreground text-sm">
          {totalFiltered > 0
            ? resolvedLabels.showingRows({ from, to, total: totalFiltered })
            : resolvedLabels.visibleRows(0)}
        </div>
      </div>

      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => {
                const canSort = header.column.getCanSort();
                const sortState = header.column.getIsSorted();

                return (
                  <TableHead
                    key={header.id}
                    className="bg-secondary/40 dark:bg-secondary/20"
                  >
                    {header.isPlaceholder ? null : canSort ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="-ml-2 h-8 px-2 text-left font-medium"
                        onClick={header.column.getToggleSortingHandler()}
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {sortState === 'asc' ? (
                          <ArrowUp className="h-3.5 w-3.5" />
                        ) : sortState === 'desc' ? (
                          <ArrowDown className="h-3.5 w-3.5" />
                        ) : (
                          <ArrowUpDown className="text-muted-foreground h-3.5 w-3.5" />
                        )}
                      </Button>
                    ) : (
                      flexRender(header.column.columnDef.header, header.getContext())
                    )}
                  </TableHead>
                );
              })}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {rows.length ? (
            rows.map((row) => (
              <TableRow key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <TableCell
                    key={cell.id}
                    className="align-top whitespace-normal"
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell
                colSpan={columns.length}
                className="text-muted-foreground h-28 text-center text-sm"
              >
                {resolvedLabels.emptyMessage}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      {!serverPaginated && (
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="text-muted-foreground flex items-center gap-2 text-sm">
            <span>{resolvedLabels.rowsPerPage}</span>
            <select
              value={currentPageSize}
              onChange={(event) => table.setPageSize(Number(event.target.value))}
              className="bg-background rounded-md border px-2 py-1 text-sm"
            >
              {pageSizeOptions.map((option) => (
                <option
                  key={option}
                  value={option}
                >
                  {option}
                </option>
              ))}
            </select>
          </div>
          {pageCount > 1 ? (
            <div className="flex items-center justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => table.previousPage()}
                disabled={!table.getCanPreviousPage()}
              >
                <ChevronLeft className="h-4 w-4" />
                {resolvedLabels.prev}
              </Button>
              <span className="text-muted-foreground text-sm">
                {resolvedLabels.page({ current: pageIndex + 1, total: pageCount })}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => table.nextPage()}
                disabled={!table.getCanNextPage()}
              >
                {resolvedLabels.next}
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
