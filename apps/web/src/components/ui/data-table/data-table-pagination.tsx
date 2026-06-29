'use client'

import type { PaginationState, ReactTable, RowData } from '@tanstack/react-table'
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react'
import * as React from 'react'
import { useTranslations } from 'next-intl'

import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import type { DataTableFeatures } from '../data-table'

interface DataTablePaginationProps<TData extends RowData, TSelected = unknown> extends React.ComponentProps<'div'> {
  table: ReactTable<DataTableFeatures, TData, TSelected>
  pagination?: PaginationState
  pageCount?: number
  onPaginationChange?: (updater: PaginationState | ((old: PaginationState) => PaginationState)) => void
  pageSizeOptions?: number[]
  labels?: {
    rowsPerPage?: string
    prev?: string
    next?: string
    page?: (args: { current: number; total: number }) => string
  }
}

const DEFAULT_PAGE_SIZE_OPTIONS = [10, 20, 50, 100]

export function DataTablePagination<TData extends RowData, TSelected = unknown>({
  table,
  pagination,
  pageCount: controlledPageCount,
  onPaginationChange,
  pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS,
  labels,
  className,
  ...props
}: DataTablePaginationProps<TData, TSelected>) {
  const t = useTranslations('Common.DataTable')

  const rowsPerPageLabel = labels?.rowsPerPage ?? t('rowsPerPage')
  const prevLabel = labels?.prev ?? t('prev')
  const nextLabel = labels?.next ?? t('next')
  const pageLabel = labels?.page ?? (args => t('page', args))

  const selectedCount = table.getFilteredSelectedRowModel().rows.length
  const totalCount = table.getFilteredRowModel().rows.length
  const paginationState = pagination ?? (table.state as unknown as { pagination: PaginationState }).pagination
  const pageCount = controlledPageCount ?? table.getPageCount()
  const canPreviousPage = paginationState.pageIndex > 0
  const canNextPage = pageCount < 0 || paginationState.pageIndex < pageCount - 1

  const setPagination = React.useCallback(
    (updater: PaginationState | ((old: PaginationState) => PaginationState)) => {
      if (onPaginationChange) {
        onPaginationChange(updater)
        return
      }

      table.setPagination(updater)
    },
    [onPaginationChange, table],
  )

  return (
    <div
      className={cn(
        'flex w-full flex-col-reverse items-center justify-between gap-4 overflow-auto p-1 sm:flex-row sm:gap-8',
        className,
      )}
      {...props}
    >
      <div className="text-muted-foreground flex-1 text-sm whitespace-nowrap">
        {selectedCount > 0 ? (
          <>
            {selectedCount} of {totalCount} row(s) selected.
          </>
        ) : (
          <span className="opacity-0">-</span>
        )}
      </div>
      <div className="flex flex-col-reverse items-center gap-4 sm:flex-row sm:gap-6 lg:gap-8">
        <div className="flex items-center space-x-2">
          <p className="text-sm font-medium whitespace-nowrap">{rowsPerPageLabel}</p>
          <Select
            value={`${paginationState.pageSize}`}
            onValueChange={value => {
              setPagination({ pageIndex: 0, pageSize: Number(value) })
            }}
          >
            <SelectTrigger size="sm" className="h-8 min-w-16">
              <SelectValue placeholder={paginationState.pageSize} />
            </SelectTrigger>
            <SelectContent className="min-w-16">
              <SelectGroup>
                {pageSizeOptions.map(option => (
                  <SelectItem key={option} value={`${option}`}>
                    {option}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center justify-center text-sm font-medium">
          {pageLabel({
            current: paginationState.pageIndex + 1,
            total: Math.max(1, pageCount),
          })}
        </div>
        <div className="flex items-center space-x-2">
          <Button
            aria-label="Go to first page"
            variant="outline"
            size="icon"
            className="hidden h-8 w-8 lg:flex"
            onClick={() => setPagination(current => ({ ...current, pageIndex: 0 }))}
            disabled={!canPreviousPage}
          >
            <ChevronsLeft className="h-4 w-4" />
          </Button>
          <Button
            aria-label={prevLabel}
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => setPagination(current => ({ ...current, pageIndex: Math.max(current.pageIndex - 1, 0) }))}
            disabled={!canPreviousPage}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            aria-label={nextLabel}
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() =>
              setPagination(current => ({
                ...current,
                pageIndex: pageCount < 0 ? current.pageIndex + 1 : Math.min(current.pageIndex + 1, pageCount - 1),
              }))
            }
            disabled={!canNextPage}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            aria-label="Go to last page"
            variant="outline"
            size="icon"
            className="hidden h-8 w-8 lg:flex"
            onClick={() => setPagination(current => ({ ...current, pageIndex: Math.max(pageCount - 1, 0) }))}
            disabled={!canNextPage || pageCount < 0}
          >
            <ChevronsRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}
