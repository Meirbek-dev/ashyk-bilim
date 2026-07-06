'use client'

import type * as React from 'react'
import type { ReactTable, RowData } from '@tanstack/react-table'
import { FlexRender } from '@tanstack/react-table'

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { getColumnPinningStyle } from '@/lib/data-table'
import { DataTableColumnHeader } from './data-table-column-header'
import { cn } from '@/lib/utils'
import type { DataTableFeatures } from '../data-table'

interface DataTableProps<TData extends RowData, TSelected = unknown> extends React.ComponentProps<'div'> {
  table: ReactTable<DataTableFeatures, TData, TSelected>
  actionBar?: React.ReactNode
  emptyMessage?: string
  showPagination?: boolean
  paginationComponent?: React.ReactNode
}

export function DataTable<TData extends RowData, TSelected = unknown>({
  table,
  actionBar,
  emptyMessage = 'No results.',
  showPagination = true,
  paginationComponent,
  children,
  className,
  ...props
}: DataTableProps<TData, TSelected>) {
  return (
    <div className={cn('flex w-full flex-col gap-2.5 overflow-auto', className)} {...props}>
      {children}
      <div className="overflow-hidden rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map(headerGroup => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map(header => (
                  <TableHead
                    key={header.id}
                    colSpan={header.colSpan}
                    style={{
                      ...getColumnPinningStyle({ column: header.column }),
                    }}
                    className={cn(
                      'bg-secondary/40 dark:bg-secondary/20',
                      header.column.getIsPinned() && 'bg-background',
                    )}
                  >
                    {header.isPlaceholder ? null : header.column.getCanSort() ? (
                      <DataTableColumnHeader
                        column={header.column}
                        label={
                          typeof header.column.columnDef.header === 'string'
                            ? header.column.columnDef.header
                            : (header.column.columnDef.meta?.label ?? header.column.id)
                        }
                      />
                    ) : (
                      <FlexRender header={header} />
                    )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map(row => (
                <TableRow key={row.id} data-state={row.getIsSelected() ? 'selected' : undefined}>
                  {row.getVisibleCells().map(cell => (
                    <TableCell
                      key={cell.id}
                      style={{
                        ...getColumnPinningStyle({ column: cell.column }),
                      }}
                      className={cn('align-top whitespace-normal', cell.column.getIsPinned() && 'bg-background')}
                    >
                      <FlexRender cell={cell} />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={table.getVisibleLeafColumns().length}
                  className="text-muted-foreground h-24 text-center"
                >
                  {emptyMessage}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <div className="flex flex-col gap-2.5">
        {showPagination && paginationComponent}
        {actionBar && table.getFilteredSelectedRowModel().rows.length > 0 && actionBar}
      </div>
    </div>
  )
}
