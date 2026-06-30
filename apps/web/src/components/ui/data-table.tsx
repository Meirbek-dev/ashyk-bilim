'use client'

import { useTranslations } from 'next-intl'
import * as React from 'react'

import {
  useTable,
  tableFeatures,
  tableOptions,
  columnVisibilityFeature,
  columnFilteringFeature,
  globalFilteringFeature,
  rowSortingFeature,
  rowPaginationFeature,
  columnPinningFeature,
  columnSizingFeature,
  rowSelectionFeature,
  columnFacetingFeature,
  createFilteredRowModel,
  createSortedRowModel,
  createPaginatedRowModel,
  filterFns,
  sortFns,
} from '@tanstack/react-table'
import { Download, Search, Settings2, X } from 'lucide-react'
import type { ColumnDef, PaginationState, RowData, SortingState, ColumnVisibilityState } from '@tanstack/react-table'

import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { DataTableColumnMeta } from '@/lib/data-table'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

// Import the new modular subcomponents
import { DataTable as DataTableView } from './data-table/data-table'
import { DataTablePagination } from './data-table/data-table-pagination'

interface DataTableLabels {
  searchPlaceholder?: string
  emptyMessage?: string
  visibleRows?: (count: number) => string
  showingRows?: (args: { from: number; to: number; total: number }) => string
  page?: (args: { current: number; total: number }) => string
  prev?: string
  next?: string
  rowsPerPage?: string
  columns?: string
  exportCsv?: string
  exportStarted?: string
}

export interface DataTableProps<TData extends RowData> {
  columns: DataTableColumnDef<TData>[]
  data: TData[]
  className?: string
  pageSize?: number
  pageSizeOptions?: number[]
  storageKey?: string
  /** Set when the server handles pagination. Disables client-side getPaginationRowModel. */
  serverPaginated?: boolean
  /**
   * Total page count when using server-side pagination.
   * When omitted, the table derives page count from `data.length`.
   */
  pageCount?: number
  /**
   * Total row count when the server handles pagination.
   * Used for accurate "showing x-y of z" copy.
   */
  totalRows?: number
  /**
   * Called when sort state changes (server-side sorting).
   * When provided, `manualSorting` is enabled automatically.
   */
  onSortingChange?: (sorting: SortingState) => void
  /**
   * Called when the search filter changes (server-side filtering).
   * When provided, `manualFiltering` is enabled automatically.
   */
  onGlobalFilterChange?: (filter: string) => void
  /**
   * Called when pagination state changes (server-side pagination).
   * Receives current `{ pageIndex, pageSize }`.
   */
  onPaginationChange?: (pagination: PaginationState) => void
  labels?: DataTableLabels
  toolbarContent?: React.ReactNode
  enableColumnVisibility?: boolean
  enableCsvExport?: boolean
  csvFileName?: string
}

interface StoredDataTableState {
  sorting?: SortingState
  globalFilter?: string
  columnVisibility?: ColumnVisibilityState
  pagination?: PaginationState
}

const escapeCsv = (value: unknown) => {
  const normalized = value === null || value === undefined ? '' : String(value)
  return `"${normalized.replace(/"/g, '""')}"`
}

const resolveUpdater = <TValue,>(updater: TValue | ((old: TValue) => TValue), old: TValue) =>
  typeof updater === 'function' ? (updater as (old: TValue) => TValue)(old) : updater

const isSamePagination = (left: PaginationState, right: PaginationState) =>
  left.pageIndex === right.pageIndex && left.pageSize === right.pageSize

const DEFAULT_PAGE_SIZE_OPTIONS = [20, 50, 100, 250]
const EMPTY_DATA: RowData[] = []

const features = tableFeatures({
  columnVisibilityFeature,
  columnFilteringFeature,
  globalFilteringFeature,
  rowSortingFeature,
  rowPaginationFeature,
  columnPinningFeature,
  columnSizingFeature,
  rowSelectionFeature,
  columnFacetingFeature,
  filteredRowModel: createFilteredRowModel(),
  sortedRowModel: createSortedRowModel(),
  paginatedRowModel: createPaginatedRowModel(),
  filterFns,
  sortFns,
  columnMeta: {} as DataTableColumnMeta,
})

export type DataTableFeatures = typeof features
export type DataTableColumnDef<TData extends RowData> = ColumnDef<DataTableFeatures, TData>

export default function DataTable<TData extends RowData>({
  columns,
  data,
  className,
  pageSize = 20,
  pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS,
  storageKey,
  serverPaginated = false,
  pageCount: controlledPageCount,
  totalRows,
  onSortingChange: onSortingChangeProp,
  onGlobalFilterChange: onGlobalFilterChangeProp,
  onPaginationChange: onPaginationChangeProp,
  labels,
  toolbarContent,
  enableColumnVisibility = false,
  enableCsvExport = false,
  csvFileName = `table-${new Date().toISOString()}.csv`,
}: DataTableProps<TData>) {
  const t = useTranslations('Common.DataTable')
  // Derive whether server-side modes are active from prop presence
  const isServerSorted = !!onSortingChangeProp
  const isServerFiltered = !!onGlobalFilterChangeProp
  const isServerPaginated = serverPaginated || !!onPaginationChangeProp
  const showPaginationControls = !serverPaginated || !!onPaginationChangeProp

  const [initialState] = React.useState(() => {
    const fallbackPagination = {
      pageIndex: 0,
      pageSize,
    }

    if (!storageKey || typeof globalThis.window === 'undefined') {
      return {
        sorting: [] as SortingState,
        globalFilter: '',
        columnVisibility: {},
        pagination: fallbackPagination,
      }
    }

    try {
      const raw = globalThis.sessionStorage.getItem(`data-table:${storageKey}`)
      if (!raw) {
        return {
          sorting: [] as SortingState,
          globalFilter: '',
          columnVisibility: {},
          pagination: fallbackPagination,
        }
      }

      const parsed = JSON.parse(raw) as StoredDataTableState
      return {
        sorting: parsed.sorting ?? [],
        globalFilter: parsed.globalFilter ?? '',
        columnVisibility: parsed.columnVisibility ?? {},
        pagination: isServerPaginated ? fallbackPagination : (parsed.pagination ?? fallbackPagination),
      }
    } catch {
      globalThis.sessionStorage.removeItem(`data-table:${storageKey}`)
      return {
        sorting: [] as SortingState,
        globalFilter: '',
        columnVisibility: {},
        pagination: fallbackPagination,
      }
    }
  })
  const [sorting, setSorting] = React.useState<SortingState>(initialState.sorting)
  const [globalFilter, setGlobalFilter] = React.useState(initialState.globalFilter)
  const [columnVisibility, setColumnVisibility] = React.useState<ColumnVisibilityState>(initialState.columnVisibility)
  const [pagination, setPagination] = React.useState<PaginationState>(initialState.pagination)

  const handleSortingChange = React.useCallback(
    (updater: SortingState | ((old: SortingState) => SortingState)) => {
      const nextSorting = resolveUpdater(updater, sorting)
      setSorting(nextSorting)
      onSortingChangeProp?.(nextSorting)

      if (pagination.pageIndex === 0) return
      const nextPagination = { ...pagination, pageIndex: 0 }
      setPagination(current => (isSamePagination(current, nextPagination) ? current : nextPagination))
      onPaginationChangeProp?.(nextPagination)
    },
    [onPaginationChangeProp, onSortingChangeProp, pagination, sorting],
  )

  const handleGlobalFilterChange = React.useCallback(
    (updater: string | ((old: string) => string)) => {
      const nextGlobalFilter = resolveUpdater(updater, globalFilter)
      if (nextGlobalFilter === globalFilter) return

      setGlobalFilter(nextGlobalFilter)
      onGlobalFilterChangeProp?.(nextGlobalFilter)

      if (pagination.pageIndex === 0) return
      const nextPagination = { ...pagination, pageIndex: 0 }
      setPagination(current => (isSamePagination(current, nextPagination) ? current : nextPagination))
      onPaginationChangeProp?.(nextPagination)
    },
    [globalFilter, onGlobalFilterChangeProp, onPaginationChangeProp, pagination],
  )

  const handleColumnVisibilityChange = React.useCallback(
    (updater: ColumnVisibilityState | ((old: ColumnVisibilityState) => ColumnVisibilityState)) => {
      setColumnVisibility(current => resolveUpdater(updater, current))
    },
    [],
  )

  const handlePaginationChange = React.useCallback(
    (updater: PaginationState | ((old: PaginationState) => PaginationState)) => {
      const nextPagination = resolveUpdater(updater, pagination)
      if (isSamePagination(nextPagination, pagination)) return

      setPagination(current => (isSamePagination(current, nextPagination) ? current : nextPagination))
      onPaginationChangeProp?.(nextPagination)
    },
    [onPaginationChangeProp, pagination],
  )

  const resolvedLabels: Required<DataTableLabels> = {
    searchPlaceholder: labels?.searchPlaceholder ?? t('searchPlaceholder'),
    emptyMessage: labels?.emptyMessage ?? t('emptyMessage'),
    visibleRows: labels?.visibleRows ?? (count => t('visibleRows', { count })),
    showingRows: labels?.showingRows ?? (args => t('showingRows', args)),
    page: labels?.page ?? (args => t('page', args)),
    prev: labels?.prev ?? t('prev'),
    next: labels?.next ?? t('next'),
    rowsPerPage: labels?.rowsPerPage ?? t('rowsPerPage'),
    columns: labels?.columns ?? t('columns'),
    exportCsv: labels?.exportCsv ?? t('exportCsv'),
    exportStarted: labels?.exportStarted ?? t('exportStarted'),
  }

  const globalFilterFn = React.useCallback(
    (row: { getVisibleCells: () => { getValue: () => unknown }[] }, _columnId: string, filterValue: unknown) => {
      const normalizedFilter = String(filterValue).toLowerCase()
      return row.getVisibleCells().some(cell =>
        String(cell.getValue() ?? '')
          .toLowerCase()
          .includes(normalizedFilter),
      )
    },
    [],
  )

  const resolvedPageCount =
    controlledPageCount ?? Math.max(1, Math.ceil((totalRows ?? data.length) / pagination.pageSize))
  const tableData = data ?? (EMPTY_DATA as TData[])
  const tableColumns = columns as unknown as ColumnDef<typeof features, TData>[]
  const tableConfig = React.useMemo(
    () =>
      tableOptions<typeof features, TData>({
        features,
        data: tableData,
        columns: tableColumns,
        initialState: {
          sorting: initialState.sorting,
          globalFilter: initialState.globalFilter,
          columnVisibility: initialState.columnVisibility,
          pagination: initialState.pagination,
        },
        state: {
          sorting,
          globalFilter,
          columnVisibility,
          pagination,
        },
        onSortingChange: handleSortingChange,
        onGlobalFilterChange: handleGlobalFilterChange,
        onColumnVisibilityChange: handleColumnVisibilityChange,
        onPaginationChange: handlePaginationChange,
        autoResetPageIndex: false,
        manualPagination: isServerPaginated,
        manualSorting: isServerSorted,
        manualFiltering: isServerFiltered,
        pageCount: resolvedPageCount,
        ...(typeof totalRows === 'number' ? { rowCount: totalRows } : {}),
        globalFilterFn,
      }),
    [
      tableData,
      tableColumns,
      sorting,
      globalFilter,
      columnVisibility,
      pagination,
      handleSortingChange,
      handleGlobalFilterChange,
      handleColumnVisibilityChange,
      handlePaginationChange,
      isServerPaginated,
      isServerSorted,
      isServerFiltered,
      resolvedPageCount,
      totalRows,
      globalFilterFn,
      initialState.sorting,
      initialState.globalFilter,
      initialState.columnVisibility,
      initialState.pagination,
    ],
  )

  const table = useTable(tableConfig, () => null)

  React.useEffect(() => {
    if (!storageKey || typeof globalThis.window === 'undefined') return

    globalThis.sessionStorage.setItem(
      `data-table:${storageKey}`,
      JSON.stringify(
        isServerPaginated
          ? { sorting, globalFilter, columnVisibility }
          : { sorting, globalFilter, columnVisibility, pagination },
      ),
    )
  }, [columnVisibility, globalFilter, pagination, sorting, storageKey, isServerPaginated])

  const { rows } = table.getRowModel()
  const totalFiltered = isServerPaginated ? (totalRows ?? data.length) : table.getFilteredRowModel().rows.length
  const { pageIndex, pageSize: currentPageSize } = pagination
  const from = totalFiltered > 0 ? pageIndex * currentPageSize + 1 : 0
  const to = totalFiltered > 0 ? Math.min(from + rows.length - 1, totalFiltered) : 0
  const canResetSearch = globalFilter.length > 0

  const exportableColumns = table.getAllLeafColumns().filter(column => {
    const hasAccessor = 'accessorKey' in column.columnDef || 'accessorFn' in column.columnDef
    return (
      column.getIsVisible() &&
      column.columnDef.meta?.exportable !== false &&
      (hasAccessor || typeof column.columnDef.meta?.exportValue === 'function')
    )
  })

  const handleExportCsv = () => {
    const sourceRows = isServerPaginated ? table.getRowModel().rows : table.getSortedRowModel().rows
    if (sourceRows.length === 0 || exportableColumns.length === 0) return

    const headerRow = exportableColumns.map(column => {
      const label =
        column.columnDef.meta?.label ??
        (typeof column.columnDef.header === 'string' ? column.columnDef.header : column.id)
      return escapeCsv(label)
    })

    const bodyRows = sourceRows.map(row =>
      exportableColumns.map(column => {
        const value = column.columnDef.meta?.exportValue
          ? column.columnDef.meta.exportValue(row.original as Record<string, unknown>)
          : row.getValue(column.id)
        return escapeCsv(value)
      }),
    )

    const csv = [headerRow.join(','), ...bodyRows.map(row => row.join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = csvFileName
    link.click()
    URL.revokeObjectURL(url)
    toast.success(resolvedLabels.exportStarted)
  }

  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative w-full max-w-md">
            <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
            <Input
              value={globalFilter}
              onChange={event => {
                table.setGlobalFilter(event.target.value)
              }}
              placeholder={resolvedLabels.searchPlaceholder}
              className="pl-9"
            />
          </div>
          {canResetSearch ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                table.setGlobalFilter('')
              }}
            >
              <X className="h-4 w-4" />
            </Button>
          ) : null}
          {enableColumnVisibility ? (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button variant="outline" size="sm">
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
                  .filter(column => column.getCanHide())
                  .map(column => {
                    const label =
                      column.columnDef.meta?.label ??
                      (typeof column.columnDef.header === 'string' ? column.columnDef.header : column.id)

                    return (
                      <DropdownMenuCheckboxItem
                        key={column.id}
                        checked={column.getIsVisible()}
                        onCheckedChange={checked => column.toggleVisibility(checked)}
                      >
                        {label}
                      </DropdownMenuCheckboxItem>
                    )
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

      <DataTableView
        table={table}
        emptyMessage={resolvedLabels.emptyMessage}
        showPagination={showPaginationControls}
        paginationComponent={
          <DataTablePagination
            table={table}
            pagination={pagination}
            pageCount={resolvedPageCount}
            onPaginationChange={handlePaginationChange}
            pageSizeOptions={pageSizeOptions}
            labels={resolvedLabels}
          />
        }
      />
    </div>
  )
}
