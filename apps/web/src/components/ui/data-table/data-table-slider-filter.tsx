'use client'

import type { Column, RowData } from '@tanstack/react-table'
import { PlusCircle, X } from 'lucide-react'
import * as React from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Separator } from '@/components/ui/separator'
import { Slider } from '@/components/ui/slider'
import { cn } from '@/lib/utils'
import type { DataTableFeatures } from '../data-table'

interface Range {
  min: number
  max: number
}

type RangeValue = [number, number]

function getIsValidRange(value: unknown): value is RangeValue {
  return Array.isArray(value) && value.length === 2 && typeof value[0] === 'number' && typeof value[1] === 'number'
}

function parseValuesAsNumbers(value: unknown): RangeValue | undefined {
  if (
    Array.isArray(value) &&
    value.length === 2 &&
    value.every(v => (typeof v === 'string' || typeof v === 'number') && !Number.isNaN(Number(v)))
  ) {
    return [Number(value[0]), Number(value[1])]
  }

  return undefined
}

interface DataTableSliderFilterProps<TData extends RowData, TValue> {
  column: Column<DataTableFeatures, TData, TValue>
  title?: string
}

export function DataTableSliderFilter<TData extends RowData, TValue>({
  column,
  title,
}: DataTableSliderFilterProps<TData, TValue>) {
  const id = React.useId()
  const fromLabelText = 'From'
  const toLabelText = 'To'
  const toSeparatorText = 'to'
  const clearButtonText = 'Clear'
  const sliderLabelText = `${title} slider`

  const columnFilterValue = parseValuesAsNumbers(column.getFilterValue())

  const defaultRange = column.columnDef.meta?.range
  const unit = column.columnDef.meta?.unit

  const { min, max, step } = React.useMemo<Range & { step: number }>(() => {
    let minValue = 0
    let maxValue = 100

    if (defaultRange && getIsValidRange(defaultRange)) {
      ;[minValue, maxValue] = defaultRange
    } else {
      const values = column.getFacetedMinMaxValues()
      if (values && Array.isArray(values) && values.length === 2) {
        const [facetMinValue, facetMaxValue] = values
        if (typeof facetMinValue === 'number' && typeof facetMaxValue === 'number') {
          minValue = facetMinValue
          maxValue = facetMaxValue
        }
      }
    }

    const rangeSize = maxValue - minValue
    const calculatedStep =
      rangeSize <= 20 ? 1 : rangeSize <= 100 ? Math.ceil(rangeSize / 20) : Math.ceil(rangeSize / 50)

    return { min: minValue, max: maxValue, step: calculatedStep }
  }, [column, defaultRange])

  const range = React.useMemo((): RangeValue => {
    return columnFilterValue ?? [min, max]
  }, [columnFilterValue, min, max])

  const handleInputChange = React.useCallback(
    (index: 0 | 1, valueStr: string) => {
      const numValue = Number(valueStr)
      if (Number.isNaN(numValue)) return

      const nextRange: RangeValue = [...range]
      nextRange[index] = numValue

      if (index === 0) {
        if (numValue >= min && numValue <= range[1]) {
          column.setFilterValue(nextRange)
        }
      } else {
        if (numValue <= max && numValue >= range[0]) {
          column.setFilterValue(nextRange)
        }
      }
    },
    [column, min, max, range],
  )

  const onFromInputChange = React.useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      handleInputChange(0, event.target.value)
    },
    [handleInputChange],
  )

  const onToInputChange = React.useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      handleInputChange(1, event.target.value)
    },
    [handleInputChange],
  )

  const onSliderValueChange = React.useCallback(
    (value: number | readonly number[]) => {
      if (Array.isArray(value) && value.length === 2) {
        column.setFilterValue([value[0], value[1]])
      }
    },
    [column],
  )

  const onReset = React.useCallback(
    (event: React.MouseEvent) => {
      event.stopPropagation()
      column.setFilterValue(undefined)
    },
    [column],
  )

  const formatValue = React.useCallback((val: number) => {
    return val.toLocaleString()
  }, [])

  const label = React.useMemo(() => {
    if (!columnFilterValue) return title
    return (
      <span className="flex items-center gap-2">
        <span>{title}</span>
        {columnFilterValue ? (
          <>
            <Separator orientation="vertical" className="h-4" />
            <span className="font-normal">
              {formatValue(columnFilterValue[0])} - {formatValue(columnFilterValue[1])}
              {unit ? ` ${unit}` : ''}
            </span>
          </>
        ) : null}
      </span>
    )
  }, [columnFilterValue, title, formatValue, unit])

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button variant="outline" size="sm" className="h-8 border-dashed font-normal">
            {columnFilterValue ? (
              <div
                role="button"
                aria-label={`Clear ${title} filter`}
                tabIndex={0}
                className="focus-visible:ring-ring mr-2 rounded-sm opacity-70 transition-opacity hover:opacity-100 focus-visible:ring-1 focus-visible:outline-none"
                onClick={onReset}
              >
                <X className="h-4 w-4" />
              </div>
            ) : (
              <PlusCircle className="mr-2 h-4 w-4" />
            )}
            {label}
          </Button>
        }
      />
      <PopoverContent align="start" className="flex w-auto flex-col gap-4 p-4">
        <div className="flex flex-col gap-3">
          <p className="text-sm leading-none font-medium">{title}</p>
          <div className="flex items-center gap-4">
            <Label htmlFor={`${id}-from`} className="sr-only">
              {fromLabelText}
            </Label>
            <div className="relative">
              <Input
                id={`${id}-from`}
                type="number"
                aria-valuemin={min}
                aria-valuemax={max}
                inputMode="numeric"
                pattern="[0-9]*"
                placeholder={min.toString()}
                min={min}
                max={max}
                value={range[0]?.toString()}
                onChange={onFromInputChange}
                className={cn('h-8 w-24', unit && 'pr-8')}
              />
              {unit && (
                <span className="bg-accent text-muted-foreground absolute top-0 right-0 bottom-0 flex items-center rounded-r-md px-2 text-xs">
                  {unit}
                </span>
              )}
            </div>
            <span className="text-muted-foreground text-sm">{toSeparatorText}</span>
            <Label htmlFor={`${id}-to`} className="sr-only">
              {toLabelText}
            </Label>
            <div className="relative">
              <Input
                id={`${id}-to`}
                type="number"
                aria-valuemin={min}
                aria-valuemax={max}
                inputMode="numeric"
                pattern="[0-9]*"
                placeholder={max.toString()}
                min={min}
                max={max}
                value={range[1]?.toString()}
                onChange={onToInputChange}
                className={cn('h-8 w-24', unit && 'pr-8')}
              />
              {unit && (
                <span className="bg-accent text-muted-foreground absolute top-0 right-0 bottom-0 flex items-center rounded-r-md px-2 text-xs">
                  {unit}
                </span>
              )}
            </div>
          </div>
          <Label htmlFor={`${id}-slider`} className="sr-only">
            {sliderLabelText}
          </Label>
          <Slider
            id={`${id}-slider`}
            min={min}
            max={max}
            step={step}
            value={range}
            onValueChange={onSliderValueChange}
            className="my-2"
          />
        </div>
        <Button aria-label={`Clear ${title} filter`} variant="outline" size="sm" onClick={onReset}>
          {clearButtonText}
        </Button>
      </PopoverContent>
    </Popover>
  )
}
