'use client'

import type { Column, ReactTable, RowData } from '@tanstack/react-table'
import { X } from 'lucide-react'
import * as React from 'react'

import '@/lib/data-table'
import type { DataTableFeatures } from '../data-table'

import { DataTableDateFilter } from './data-table-date-filter'
import { DataTableFacetedFilter } from './data-table-faceted-filter'
import { DataTableSliderFilter } from './data-table-slider-filter'
import { DataTableViewOptions } from './data-table-view-options'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

interface DataTableToolbarProps<TData extends RowData> extends React.ComponentProps<'div'> {
  table: ReactTable<DataTableFeatures, TData>
  enableViewOptions?: boolean
}

export function DataTableToolbar<TData extends RowData>({
  table,
  enableViewOptions = true,
  children,
  className,
  ...props
}: DataTableToolbarProps<TData>) {
  const isFiltered = table.state.columnFilters.length > 0

  const columns = React.useMemo(() => table.getAllColumns().filter(column => column.getCanFilter()), [table])

  const onReset = React.useCallback(() => {
    table.resetColumnFilters()
  }, [table])

  return (
    <div
      role="toolbar"
      aria-orientation="horizontal"
      className={cn('flex w-full items-center justify-between gap-2 p-1 flex-wrap', className)}
      {...props}
    >
      <div className="flex flex-1 flex-wrap items-center gap-2">
        {columns.map(column => (
          <DataTableToolbarFilter key={column.id} column={column} />
        ))}
        {isFiltered && (
          <Button
            aria-label="Reset filters"
            variant="outline"
            size="sm"
            className="h-8 border-dashed"
            onClick={onReset}
          >
            <X className="mr-2 h-4 w-4" />
            Reset
          </Button>
        )}
      </div>
      <div className="flex items-center gap-2">
        {children}
        {enableViewOptions && <DataTableViewOptions table={table} />}
      </div>
    </div>
  )
}

interface DataTableToolbarFilterProps<TData extends RowData, TValue> {
  column: Column<DataTableFeatures, TData, TValue>
}

function DataTableToolbarFilter<TData extends RowData, TValue>({ column }: DataTableToolbarFilterProps<TData, TValue>) {
  const columnMeta = column.columnDef.meta
  if (!columnMeta?.variant) return null

  switch (columnMeta.variant) {
    case 'text': {
      return (
        <Input
          placeholder={columnMeta.placeholder ?? columnMeta.label ?? column.id}
          value={(column.getFilterValue() as string) ?? ''}
          onChange={event => column.setFilterValue(event.target.value)}
          className="h-8 w-40 lg:w-56"
        />
      )
    }

    case 'number': {
      return (
        <div className="relative">
          <Input
            type="number"
            inputMode="numeric"
            placeholder={columnMeta.placeholder ?? columnMeta.label ?? column.id}
            value={(column.getFilterValue() as string) ?? ''}
            onChange={event => column.setFilterValue(event.target.value)}
            className={cn('h-8 w-28', columnMeta.unit && 'pr-8')}
          />
          {columnMeta.unit && (
            <span className="bg-accent text-muted-foreground absolute top-0 right-0 bottom-0 flex items-center rounded-r-md px-2 text-xs">
              {columnMeta.unit}
            </span>
          )}
        </div>
      )
    }

    case 'range': {
      return <DataTableSliderFilter column={column} title={columnMeta.label ?? column.id} />
    }

    case 'date':
    case 'dateRange': {
      return (
        <DataTableDateFilter
          column={column}
          title={columnMeta.label ?? column.id}
          multiple={columnMeta.variant === 'dateRange'}
        />
      )
    }

    case 'select':
    case 'multiSelect': {
      return (
        <DataTableFacetedFilter
          column={column}
          title={columnMeta.label ?? column.id}
          options={columnMeta.options ?? []}
          multiple={columnMeta.variant === 'multiSelect'}
        />
      )
    }

    default: {
      return null
    }
  }
}
