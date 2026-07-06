import type * as React from 'react'
import type { CellData, RowData, TableFeatures } from '@tanstack/react-table'

export const dataTableConfig = {
  textOperators: [
    { label: 'Contains', value: 'iLike' as const },
    { label: 'Does not contain', value: 'notILike' as const },
    { label: 'Is', value: 'eq' as const },
    { label: 'Is not', value: 'ne' as const },
    { label: 'Is empty', value: 'isEmpty' as const },
    { label: 'Is not empty', value: 'isNotEmpty' as const },
  ],
  numericOperators: [
    { label: 'Is', value: 'eq' as const },
    { label: 'Is not', value: 'ne' as const },
    { label: 'Is less than', value: 'lt' as const },
    { label: 'Is less than or equal', value: 'lte' as const },
    { label: 'Is greater than', value: 'gt' as const },
    { label: 'Is greater than or equal', value: 'gte' as const },
    { label: 'Is empty', value: 'isEmpty' as const },
    { label: 'Is not empty', value: 'isNotEmpty' as const },
  ],
  dateOperators: [
    { label: 'Is', value: 'eq' as const },
    { label: 'Is not', value: 'ne' as const },
    { label: 'Is before', value: 'lt' as const },
    { label: 'Is after', value: 'gt' as const },
    { label: 'Is on or before', value: 'lte' as const },
    { label: 'Is on or after', value: 'gte' as const },
    { label: 'Is empty', value: 'isEmpty' as const },
    { label: 'Is not empty', value: 'isNotEmpty' as const },
  ],
  booleanOperators: [
    { label: 'Is', value: 'eq' as const },
    { label: 'Is empty', value: 'isEmpty' as const },
    { label: 'Is not empty', value: 'isNotEmpty' as const },
  ],
  selectOperators: [
    { label: 'Is', value: 'eq' as const },
    { label: 'Is not', value: 'ne' as const },
    { label: 'Is empty', value: 'isEmpty' as const },
    { label: 'Is not empty', value: 'isNotEmpty' as const },
  ],
  multiSelectOperators: [
    { label: 'Contains any', value: 'inArray' as const },
    { label: 'Does not contain any', value: 'notInArray' as const },
    { label: 'Is empty', value: 'isEmpty' as const },
    { label: 'Is not empty', value: 'isNotEmpty' as const },
  ],
} as const

export type FilterOperator =
  | 'eq'
  | 'ne'
  | 'lt'
  | 'lte'
  | 'gt'
  | 'gte'
  | 'iLike'
  | 'notILike'
  | 'inArray'
  | 'notInArray'
  | 'isEmpty'
  | 'isNotEmpty'

export type FilterVariant = 'text' | 'number' | 'range' | 'date' | 'dateRange' | 'boolean' | 'select' | 'multiSelect'

export interface Option {
  label: string
  value: string
  count?: number
  icon?: React.ComponentType<React.ComponentProps<'svg'>>
}

export interface DataTableColumnMeta<TData = unknown> {
  label?: string
  placeholder?: string
  variant?: FilterVariant
  options?: Option[]
  range?: [number, number]
  unit?: string
  icon?: React.ComponentType<React.ComponentProps<'svg'>>
  exportable?: boolean
  exportValue?: (row: TData) => unknown
}

declare module '@tanstack/react-table' {
  interface ColumnMeta<TFeatures extends TableFeatures, TData extends RowData, TValue extends CellData = CellData> {
    label?: DataTableColumnMeta<TData>['label']
    placeholder?: DataTableColumnMeta<TData>['placeholder']
    variant?: DataTableColumnMeta<TData>['variant']
    options?: DataTableColumnMeta<TData>['options']
    range?: DataTableColumnMeta<TData>['range']
    unit?: DataTableColumnMeta<TData>['unit']
    icon?: DataTableColumnMeta<TData>['icon']
    exportable?: DataTableColumnMeta<TData>['exportable']
    exportValue?: DataTableColumnMeta<TData>['exportValue']
  }
}

type ColumnPinningPosition = false | 'left' | 'right'

interface PinnableColumn {
  getAfter?: (position?: ColumnPinningPosition | 'center') => number
  getIsFirstColumn?: (position?: ColumnPinningPosition | 'center') => boolean
  getIsLastColumn?: (position?: ColumnPinningPosition | 'center') => boolean
  getIsPinned?: () => ColumnPinningPosition
  getSize?: () => number
  getStart?: (position?: ColumnPinningPosition | 'center') => number
}

export function getColumnPinningStyle({
  column,
  withBorder = false,
}: {
  column: PinnableColumn
  withBorder?: boolean
}): React.CSSProperties {
  const isPinned = column.getIsPinned?.() ?? false
  const isLastLeftPinnedColumn = isPinned === 'left' && column.getIsLastColumn?.('left')
  const isFirstRightPinnedColumn = isPinned === 'right' && column.getIsFirstColumn?.('right')

  return {
    boxShadow: withBorder
      ? isLastLeftPinnedColumn
        ? '-4px 0 4px -4px var(--border) inset'
        : isFirstRightPinnedColumn
          ? '4px 0 4px -4px var(--border) inset'
          : undefined
      : undefined,
    left: isPinned === 'left' ? `${column.getStart?.('left') ?? 0}px` : undefined,
    right: isPinned === 'right' ? `${column.getAfter?.('right') ?? 0}px` : undefined,
    opacity: isPinned ? 0.97 : 1,
    position: isPinned ? 'sticky' : 'relative',
    background: isPinned ? 'var(--background)' : undefined,
    width: column.getSize?.(),
    zIndex: isPinned ? 1 : undefined,
  }
}

export function getFilterOperators(filterVariant: FilterVariant) {
  const operatorMap: Record<FilterVariant, readonly { label: string; value: FilterOperator }[]> = {
    text: dataTableConfig.textOperators,
    number: dataTableConfig.numericOperators,
    range: dataTableConfig.numericOperators,
    date: dataTableConfig.dateOperators,
    dateRange: dataTableConfig.dateOperators,
    boolean: dataTableConfig.booleanOperators,
    select: dataTableConfig.selectOperators,
    multiSelect: dataTableConfig.multiSelectOperators,
  }

  return operatorMap[filterVariant] ?? dataTableConfig.textOperators
}

export function getDefaultFilterOperator(filterVariant: FilterVariant) {
  const operators = getFilterOperators(filterVariant)
  return operators[0]?.value ?? (filterVariant === 'text' ? 'iLike' : 'eq')
}
