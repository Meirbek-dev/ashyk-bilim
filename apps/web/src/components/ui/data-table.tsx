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
  createFilteredRowModel,
  createSortedRowModel,
  createPaginatedRowModel,
  filterFns,
  sortFns,
} from '@tanstack/react-table'
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronsLeft,
  ChevronsRight,
  ChevronLeft,
  ChevronRight,
  Download,
  Search,
  Settings2,
  X,
} from 'lucide-react'
import type {
  ColumnDef,
  PaginationState,
  RowData,
  SortingState,
  ColumnVisibilityState,
  Updater,
} from '@tanstack/react-table'

import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

declare module '@tanstack/react-table' {
  interface ColumnMeta<TFeatures, TData extends RowData, TValue> {
    label?: string
    exportable?: boolean
    exportValue?: (row: TData) => unknown
  }
}

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

interface DataTableProps<TData extends RowData> {
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

const DEFAULT_PAGE_SIZE_OPTIONS = [20, 50, 100, 250]
const EMPTY_SORTING: SortingState = []
const EMPTY_COLUMN_VISIBILITY: ColumnVisibilityState = {}
const EMPTY_DATA: RowData[] = []

const features = tableFeatures({
  columnVisibilityFeature,
  columnFilteringFeature,
  globalFilteringFeature,
  rowSortingFeature,
  rowPaginationFeature,
  filteredRowModel: createFilteredRowModel(),
  sortedRowModel: createSortedRowModel(),
  paginatedRowModel: createPaginatedRowModel(),
  filterFns,
  sortFns,
})

export type DataTableColumnDef<TData extends RowData> = ColumnDef<typeof features, TData>

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

  const [initialState] = React.useState(() => {
    const fallbackPagination = {
      pageIndex: 0,
      pageSize,
    }

    if (!storageKey || typeof globalThis.window === 'undefined') {
      return {
        sorting: [] as SortingState,
        globalFilter: '',
        columnVisibility: {} as ColumnVisibilityState,
        pagination: fallbackPagination,
      }
    }

    try {
      const raw = globalThis.sessionStorage.getItem(`data-table:${storageKey}`)
      if (!raw) {
        return {
          sorting: [] as SortingState,
          globalFilter: '',
          columnVisibility: {} as ColumnVisibilityState,
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
        columnVisibility: {} as ColumnVisibilityState,
        pagination: fallbackPagination,
      }
    }
  })

  const [sorting, setSorting] = React.useState<SortingState>(initialState.sorting)
  const [globalFilter, setGlobalFilter] = React.useState(initialState.globalFilter)
  const [columnVisibility, setColumnVisibility] = React.useState<ColumnVisibilityState>(initialState.columnVisibility)
  const [pagination, setPagination] = React.useState<PaginationState>(initialState.pagination)
  const didNotifySortingMountRef = React.useRef(false)
  const didNotifyGlobalFilterMountRef = React.useRef(false)
  const didNotifyPaginationMountRef = React.useRef(false)
  const onSortingChangeRef = React.useRef(onSortingChangeProp)
  const onGlobalFilterChangeRef = React.useRef(onGlobalFilterChangeProp)
  const onPaginationChangeRef = React.useRef(onPaginationChangeProp)

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

  const resolveUpdater = React.useCallback(<TValue,>(updater: Updater<TValue>, previous: TValue) => {
    return typeof updater === 'function' ? (updater as (old: TValue) => TValue)(previous) : updater
  }, [])

  const handleSortingChange = React.useCallback(
    (updater: Updater<SortingState>) => {
      setSorting(previous => resolveUpdater(updater, previous))
    },
    [resolveUpdater],
  )

  const handleGlobalFilterChange = React.useCallback(
    (updater: Updater<string>) => {
      setGlobalFilter(previous => resolveUpdater(updater, previous))
    },
    [resolveUpdater],
  )

  const handlePaginationChange = React.useCallback(
    (updater: Updater<PaginationState>) => {
      setPagination(previous => resolveUpdater(updater, previous))
    },
    [resolveUpdater],
  )

  const handleColumnVisibilityChange = React.useCallback(
    (updater: Updater<ColumnVisibilityState>) => {
      setColumnVisibility(previous => resolveUpdater(updater, previous))
    },
    [resolveUpdater],
  )

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

  const resolvedPageCount = controlledPageCount ?? Math.max(1, Math.ceil(data.length / pagination.pageSize))
  const tableData = data ?? (EMPTY_DATA as TData[])
  const tableColumns = columns as unknown as ColumnDef<typeof features, TData>[]
  const tableConfig = React.useMemo(
    () =>
      tableOptions({
        features,
        data: tableData,
        columns: tableColumns,
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
        manualPagination: isServerPaginated,
        manualSorting: isServerSorted,
        manualFiltering: isServerFiltered,
        pageCount: resolvedPageCount,
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
      globalFilterFn,
    ],
  )

  const table = useTable(tableConfig, state => ({
    sorting: state.sorting ?? EMPTY_SORTING,
    globalFilter: state.globalFilter ?? '',
    columnVisibility: state.columnVisibility ?? EMPTY_COLUMN_VISIBILITY,
    pagination: state.pagination,
  }))

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

  React.useEffect(() => {
    onSortingChangeRef.current = onSortingChangeProp
  }, [onSortingChangeProp])

  React.useEffect(() => {
    onGlobalFilterChangeRef.current = onGlobalFilterChangeProp
  }, [onGlobalFilterChangeProp])

  React.useEffect(() => {
    onPaginationChangeRef.current = onPaginationChangeProp
  }, [onPaginationChangeProp])

  React.useEffect(() => {
    if (!didNotifySortingMountRef.current) {
      didNotifySortingMountRef.current = true
      return
    }

    onSortingChangeRef.current?.(sorting)
  }, [sorting])

  React.useEffect(() => {
    if (!didNotifyGlobalFilterMountRef.current) {
      didNotifyGlobalFilterMountRef.current = true
      return
    }

    onGlobalFilterChangeRef.current?.(globalFilter)
  }, [globalFilter])

  React.useEffect(() => {
    if (!didNotifyPaginationMountRef.current) {
      didNotifyPaginationMountRef.current = true
      return
    }

    onPaginationChangeRef.current?.(pagination)
  }, [pagination])

  const { rows } = table.getRowModel()
  const totalFiltered = isServerPaginated ? (totalRows ?? data.length) : table.getFilteredRowModel().rows.length
  const { pageIndex, pageSize: currentPageSize } = table.state.pagination
  const tablePageCount = table.getPageCount()
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
    const sourceRows = serverPaginated ? table.getRowModel().rows : table.getSortedRowModel().rows
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
          ? column.columnDef.meta.exportValue(row.original)
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
                table.setPageIndex(0)
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
                table.setPageIndex(0)
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

      <Table>
        <TableHeader>
          {table.getHeaderGroups().map(headerGroup => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map(header => {
                const canSort = header.column.getCanSort()
                const sortState = header.column.getIsSorted()

                return (
                  <TableHead key={header.id} className="bg-secondary/40 dark:bg-secondary/20">
                    {header.isPlaceholder ? null : canSort ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="-ml-2 h-8 px-2 text-left font-medium"
                        onClick={header.column.getToggleSortingHandler()}
                      >
                        <table.FlexRender header={header} />
                        {sortState === 'asc' ? (
                          <ArrowUp className="h-3.5 w-3.5" />
                        ) : sortState === 'desc' ? (
                          <ArrowDown className="h-3.5 w-3.5" />
                        ) : (
                          <ArrowUpDown className="text-muted-foreground h-3.5 w-3.5" />
                        )}
                      </Button>
                    ) : (
                      <table.FlexRender header={header} />
                    )}
                  </TableHead>
                )
              })}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {rows.length ? (
            rows.map(row => (
              <TableRow key={row.id}>
                {row.getVisibleCells().map(cell => (
                  <TableCell key={cell.id} className="align-top whitespace-normal">
                    <table.FlexRender cell={cell} />
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={columns.length} className="text-muted-foreground h-28 text-center text-sm">
                {resolvedLabels.emptyMessage}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="text-muted-foreground flex items-center gap-2 text-sm">
          <span>{resolvedLabels.rowsPerPage}</span>
          <select
            value={currentPageSize}
            onChange={event => {
              table.setPageSize(Number(event.target.value))
              table.setPageIndex(0)
            }}
            className="bg-background rounded-md border px-2 py-1 text-sm"
          >
            {pageSizeOptions.map(option => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>
        {tablePageCount > 1 ? (
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.setPageIndex(0)}
              disabled={!table.getCanPreviousPage()}
            >
              <ChevronsLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
            >
              <ChevronLeft className="h-4 w-4" />
              {resolvedLabels.prev}
            </Button>
            <span className="text-muted-foreground min-w-24 text-center text-sm">
              {resolvedLabels.page({
                current: pageIndex + 1,
                total: tablePageCount,
              })}
            </span>
            <Button variant="outline" size="sm" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>
              {resolvedLabels.next}
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.setPageIndex(tablePageCount - 1)}
              disabled={!table.getCanNextPage()}
            >
              <ChevronsRight className="h-4 w-4" />
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  )
}
