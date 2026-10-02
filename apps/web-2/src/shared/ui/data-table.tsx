import { rowSortingFeature, tableFeatures, useTable, type RowData } from '@tanstack/react-table'

import type { DataColumn, Sort } from './data-columns'
import { DataTableCards } from './data-table-cards'
import { SortHeader } from './sort-header'

type DataTableProps<T extends RowData> = {
  /** The table's caption (read by screen readers). */
  label: string
  rows: readonly T[]
  columns: readonly DataColumn<T>[]
  getKey: (row: T) => string
  /** From the route's search params; the table never sorts or holds sort state itself (spec 7.8). */
  sort?: Sort | undefined
  /** Writes the next sort to the URL: `navigate({ search: prev => ({ ...prev, sort }) })`. */
  onSortChange?: (sort: Sort | undefined) => void
}

const features = tableFeatures({ rowSortingFeature })

const ariaSort = (sort: Sort | undefined, id: string) =>
  sort?.id !== id ? undefined : sort.desc ? ('descending' as const) : ('ascending' as const)

/** A table that becomes cards when its container is narrow, using column priority (DESIGN 6). */
export function DataTable<T extends RowData>({ label, rows, columns, getKey, sort, onSortChange }: DataTableProps<T>) {
  const table = useTable({
    features,
    data: [...rows],
    columns: columns.map(column => ({ id: column.id, header: column.header })),
    getRowId: row => getKey(row),
    manualSorting: true,
    state: { sorting: sort ? [sort] : [] },
  })
  return (
    <div className="@container">
      <div className="hidden overflow-x-auto @2xl:block">
        <table className="w-full text-sm">
          <caption className="sr-only">{label}</caption>
          <thead className="bg-muted">
            {table.getHeaderGroups().map(group => (
              <tr key={group.id}>
                {columns.map(column => (
                  <th
                    key={column.id}
                    scope="col"
                    aria-sort={ariaSort(sort, column.id)}
                    className="h-row px-3 text-left font-medium text-muted-foreground"
                  >
                    {column.sortable && onSortChange ? (
                      <SortHeader id={column.id} label={column.header} sort={sort} onSortChange={onSortChange} />
                    ) : (
                      column.header
                    )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map(row => (
              <tr key={row.id} className="border-t">
                {columns.map(column => (
                  <td key={column.id} className="h-row px-3 py-2">
                    {column.cell(row.original)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="@2xl:hidden">
        <DataTableCards rows={rows} columns={columns} getKey={getKey} />
      </div>
    </div>
  )
}
