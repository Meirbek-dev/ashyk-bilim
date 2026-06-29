'use client'

import type { ReactTable, RowData } from '@tanstack/react-table'
import { Settings2, Check } from 'lucide-react'
import * as React from 'react'
import { useTranslations } from 'next-intl'

import { Button } from '@/components/ui/button'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import type { DataTableFeatures } from '../data-table'

interface DataTableViewOptionsProps<TData extends RowData> extends React.ComponentProps<typeof PopoverContent> {
  table: ReactTable<DataTableFeatures, TData>
  disabled?: boolean
  label?: string
}

export function DataTableViewOptions<TData extends RowData>({
  table,
  disabled,
  label,
  className,
  ...props
}: DataTableViewOptionsProps<TData>) {
  const t = useTranslations('Common.DataTable')

  const columnsLabel = label ?? t('columns')
  const noColumnsText = 'No columns found.'

  const columns = React.useMemo(
    () =>
      table
        .getAllColumns()
        .filter(
          column =>
            (typeof column.accessorFn !== 'undefined' || 'accessorKey' in column.columnDef) && column.getCanHide(),
        ),
    [table],
  )

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button aria-label="Toggle columns" variant="outline" className="h-8 font-normal" disabled={disabled}>
            <Settings2 className="text-muted-foreground mr-2 h-4 w-4" />
            {columnsLabel}
          </Button>
        }
      />
      <PopoverContent className={cn('w-48 p-0', className)} align="end" {...props}>
        <Command>
          <CommandInput placeholder="Search columns..." />
          <CommandList className="max-h-60 overflow-y-auto">
            <CommandEmpty>{noColumnsText}</CommandEmpty>
            <CommandGroup>
              {columns.map(column => {
                const colLabel =
                  column.columnDef.meta?.label ??
                  (typeof column.columnDef.header === 'string' ? column.columnDef.header : column.id)

                return (
                  <CommandItem
                    key={column.id}
                    className="flex items-center gap-2"
                    onSelect={() => column.toggleVisibility(!column.getIsVisible())}
                  >
                    <div
                      className={cn(
                        'flex h-4 w-4 items-center justify-center rounded-sm border border-primary',
                        column.getIsVisible() ? 'bg-primary text-primary-foreground' : 'opacity-50 [&_svg]:invisible',
                      )}
                    >
                      <Check className="h-3 w-3" />
                    </div>
                    <span className="truncate">{colLabel}</span>
                  </CommandItem>
                )
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
