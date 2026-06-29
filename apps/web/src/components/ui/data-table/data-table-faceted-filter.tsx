'use client'

import type { Column, RowData } from '@tanstack/react-table'
import { Check, PlusCircle } from 'lucide-react'
import * as React from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import type { Option } from '@/lib/data-table'
import type { DataTableFeatures } from '../data-table'

interface DataTableFacetedFilterProps<TData extends RowData, TValue> {
  column?: Column<DataTableFeatures, TData, TValue>
  title?: string
  options: Option[]
  multiple?: boolean
}

export function DataTableFacetedFilter<TData extends RowData, TValue>({
  column,
  title,
  options,
  multiple = true,
}: DataTableFacetedFilterProps<TData, TValue>) {
  const [open, setOpen] = React.useState(false)
  const noResultsText = 'No results found.'

  const columnFilterValue = column?.getFilterValue()
  const selectedValues = new Set(
    Array.isArray(columnFilterValue)
      ? columnFilterValue
      : columnFilterValue !== undefined && columnFilterValue !== null
        ? [columnFilterValue]
        : [],
  )

  const onItemSelect = React.useCallback(
    (optionValue: string, isSelected: boolean) => {
      if (!column) return

      if (multiple) {
        const currentFilterValue = column.getFilterValue()
        const currentSelectedValues = new Set(
          Array.isArray(currentFilterValue)
            ? currentFilterValue
            : currentFilterValue !== undefined && currentFilterValue !== null
              ? [currentFilterValue]
              : [],
        )
        if (isSelected) {
          currentSelectedValues.delete(optionValue)
        } else {
          currentSelectedValues.add(optionValue)
        }
        const filterValues = [...currentSelectedValues]
        column.setFilterValue(filterValues.length ? filterValues : undefined)
      } else {
        column.setFilterValue(isSelected ? undefined : optionValue)
        setOpen(false)
      }
    },
    [column, multiple],
  )

  const onReset = React.useCallback(
    (event?: React.MouseEvent) => {
      event?.stopPropagation()
      column?.setFilterValue(undefined)
    },
    [column],
  )

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button variant="outline" size="sm" className="h-8 border-dashed font-normal">
            <PlusCircle className="mr-2 h-4 w-4" />
            {title}
            {selectedValues?.size > 0 && (
              <>
                <Separator orientation="vertical" className="mx-2 h-4" />
                <Badge variant="secondary" className="rounded-sm px-1 font-normal lg:hidden">
                  {selectedValues.size}
                </Badge>
                <div className="hidden space-x-1 lg:flex">
                  {selectedValues.size > 2 ? (
                    <Badge variant="secondary" className="rounded-sm px-1 font-normal">
                      {selectedValues.size} selected
                    </Badge>
                  ) : (
                    options
                      .filter(option => selectedValues.has(option.value))
                      .map(option => (
                        <Badge variant="secondary" key={option.value} className="rounded-sm px-1 font-normal">
                          {option.label}
                        </Badge>
                      ))
                  )}
                </div>
              </>
            )}
          </Button>
        }
      />
      <PopoverContent className="w-[200px] p-0" align="start">
        <Command>
          <CommandInput placeholder={title} />
          <CommandList className="max-h-[300px] overflow-y-auto">
            <CommandEmpty>{noResultsText}</CommandEmpty>
            <CommandGroup>
              {options.map(option => {
                const isSelected = selectedValues.has(option.value)

                return (
                  <CommandItem
                    key={option.value}
                    className="flex items-center gap-2"
                    onSelect={() => onItemSelect(option.value, isSelected)}
                  >
                    <div
                      className={cn(
                        'flex h-4 w-4 items-center justify-center rounded-sm border border-primary',
                        isSelected ? 'bg-primary text-primary-foreground' : 'opacity-50 [&_svg]:invisible',
                      )}
                    >
                      <Check className="h-3 w-3" />
                    </div>
                    {option.icon && <option.icon className="text-muted-foreground h-4 w-4" />}
                    <span className="truncate">{option.label}</span>
                    {option.count && (
                      <span className="text-muted-foreground ml-auto font-mono text-xs">{option.count}</span>
                    )}
                  </CommandItem>
                )
              })}
            </CommandGroup>
            {selectedValues.size > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup>
                  <CommandItem onSelect={() => onReset()} className="justify-center text-center">
                    Clear filters
                  </CommandItem>
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
