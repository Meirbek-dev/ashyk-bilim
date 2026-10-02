import type { DataColumn } from './data-columns'
import { DataList } from './data-list'

type DataTableCardsProps<T> = { rows: readonly T[]; columns: readonly DataColumn<T>[]; getKey: (row: T) => string }

/** DataTable at narrow width: one card per row, priority 1 as the title, priority 2 as labelled lines. */
export function DataTableCards<T>({ rows, columns, getKey }: DataTableCardsProps<T>) {
  const title = columns.find(column => column.priority === 1)
  const lines = columns.filter(column => column.priority === 2)
  return (
    <DataList items={rows} getKey={getKey}>
      {row => (
        <>
          {title ? <h3 className="font-medium">{title.cell(row)}</h3> : null}
          {lines.length > 0 ? (
            <dl className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
              {lines.map(column => (
                <div key={column.id} className="flex gap-1">
                  <dt className="text-muted-foreground">{column.header}</dt>
                  <dd>{column.cell(row)}</dd>
                </div>
              ))}
            </dl>
          ) : null}
        </>
      )}
    </DataList>
  )
}
