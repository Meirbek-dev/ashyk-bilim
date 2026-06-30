'use client'

import type { Column, RowData } from '@tanstack/react-table'
import { ArrowDown, ArrowUp, ArrowUpDown, EyeOff, X } from 'lucide-react'
import type * as React from 'react'

import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { DataTableFeatures } from '../data-table'

interface DataTableColumnHeaderProps<TData extends RowData, TValue> extends React.ComponentProps<'div'> {
  column: Column<DataTableFeatures, TData, TValue>
  label: string
}

export function DataTableColumnHeader<TData extends RowData, TValue>({
  column,
  label,
  className,
  ...props
}: DataTableColumnHeaderProps<TData, TValue>) {
  if (!column.getCanSort() && !column.getCanHide()) {
    return (
      <div className={cn('text-sm font-medium', className)} {...props}>
        {label}
      </div>
    )
  }

  return (
    <div className={cn('flex items-center space-x-2', className)} {...props}>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="sm"
              className="data-[state=open]:bg-accent -ml-3 h-8 text-left text-xs font-medium md:text-sm"
            >
              <span>{label}</span>
              {column.getCanSort() &&
                (column.getIsSorted() === 'desc' ? (
                  <ArrowDown className="ml-2 h-3.5 w-3.5" />
                ) : column.getIsSorted() === 'asc' ? (
                  <ArrowUp className="ml-2 h-3.5 w-3.5" />
                ) : (
                  <ArrowUpDown className="text-muted-foreground ml-2 h-3.5 w-3.5" />
                ))}
            </Button>
          }
        />
        <DropdownMenuContent align="start" className="min-w-[120px]">
          {column.getCanSort() && (
            <>
              <DropdownMenuCheckboxItem
                checked={column.getIsSorted() === 'asc'}
                onClick={() => column.toggleSorting(false)}
              >
                <ArrowUp className="text-muted-foreground mr-2 h-3.5 w-3.5" />
                Asc
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={column.getIsSorted() === 'desc'}
                onClick={() => column.toggleSorting(true)}
              >
                <ArrowDown className="text-muted-foreground mr-2 h-3.5 w-3.5" />
                Desc
              </DropdownMenuCheckboxItem>
              {column.getIsSorted() && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => column.clearSorting()}>
                    <X className="text-muted-foreground mr-2 h-3.5 w-3.5" />
                    Reset
                  </DropdownMenuItem>
                </>
              )}
            </>
          )}
          {column.getCanSort() && column.getCanHide() && <DropdownMenuSeparator />}
          {column.getCanHide() && (
            <DropdownMenuItem onClick={() => column.toggleVisibility(false)}>
              <EyeOff className="text-muted-foreground mr-2 h-3.5 w-3.5" />
              Hide
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
